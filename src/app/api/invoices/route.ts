import { requireUser } from '@/lib/auth';
import { ok, badRequest, paginated, parsePagination, withErrorHandling } from '@/lib/http';
import { createInvoiceSchema, normalizeCreateInvoiceInput } from '@/lib/schemas/invoice';
import { computeInvoiceTotal, derivePaymentStatus } from '@/lib/invoice-totals';
import { logAudit } from '@/lib/audit';
import db from '@/lib/db';

export const GET = withErrorHandling(async (req) => {
  await requireUser();

  const q = req.nextUrl.searchParams.get('q')?.trim();
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const customerId = req.nextUrl.searchParams.get('customer_id');
  const status = req.nextUrl.searchParams.get('status');
  const { page, pageSize, offset } = parsePagination(req.nextUrl.searchParams);

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (q) {
    const cleanQ = q.trim();
    // Check if user entered an invoice reference like "INV-73", "inv-073", or just "73"
    const idMatch = cleanQ.match(/^(?:inv-)?0*(\d+)$/i);
    const numericId = idMatch ? parseInt(idMatch[1], 10) : null;

    if (numericId !== null && numericId > 0) {
      conditions.push(
        '(invoices.id = ? OR customers.name ILIKE ? OR vehicles.vehicle_number ILIKE ? OR vehicles.vehicle_model ILIKE ?)'
      );
      params.push(numericId, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`);
    } else {
      conditions.push(
        '(customers.name ILIKE ? OR vehicles.vehicle_number ILIKE ? OR vehicles.vehicle_model ILIKE ? OR TO_CHAR(invoices.created_at, \'YYYY-MM-DD Mon Month\') ILIKE ?)'
      );
      params.push(`%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`);
    }
  }
  if (from) {
    conditions.push('invoices.created_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('invoices.created_at <= ?');
    params.push(`${to} 23:59:59`);
  }
  if (customerId) {
    conditions.push('invoices.customer_id = ?');
    params.push(Number(customerId));
  }
  if (status && status !== 'all') {
    conditions.push('invoices.payment_status = ?');
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { total } = (await db
    .prepare(
      `SELECT COUNT(*)::int AS total
       FROM invoices
       JOIN customers ON customers.id = invoices.customer_id
       LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
       ${where}`
    )
    .get(...params)) as { total: number };

  const invoices = await db
    .prepare(
      `SELECT
         invoices.id, invoices.customer_id, invoices.vehicle_id, invoices.total_amount, invoices.paid_amount,
         invoices.payment_status, invoices.created_at, customers.name AS customer_name,
         vehicles.vehicle_number, vehicles.vehicle_model
       FROM invoices
       JOIN customers ON customers.id = invoices.customer_id
       LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
       ${where}
       ORDER BY invoices.created_at DESC, invoices.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  return paginated(invoices, page, pageSize, total);
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();

  const body = await req.json();
  const { customer_id, vehicle_id, created_at, notes, items, paid_amount, payment_method, payment_method_note } =
    createInvoiceSchema.parse(normalizeCreateInvoiceInput(body));

  const customer = (await db.prepare('SELECT id, name FROM customers WHERE id = ?').get(customer_id)) as
    | { id: number; name: string }
    | undefined;
  if (!customer) return badRequest('Customer not found');

  if (vehicle_id !== null) {
    const vehicle = await db
      .prepare('SELECT id FROM vehicles WHERE id = ? AND customer_id = ?')
      .get(vehicle_id, customer_id);
    if (!vehicle) return badRequest('Vehicle not found for this customer');
  }

  const totalAmount = computeInvoiceTotal(items);
  const paymentStatus = derivePaymentStatus(totalAmount, paid_amount);

  // Prevent duplicate submissions if the button is clicked multiple times rapidly:
  // Check both updated_at and created_at within the last 5 seconds.
  const recentDuplicate = (await db
    .prepare(
      `SELECT id FROM invoices
       WHERE customer_id = ?
         AND (vehicle_id = ? OR (vehicle_id IS NULL AND ? IS NULL))
         AND total_amount = ?
         AND paid_amount = ?
         AND payment_method = ?
         AND (updated_at >= NOW() - INTERVAL '5 seconds' OR created_at >= NOW() - INTERVAL '5 seconds')
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(customer_id, vehicle_id, vehicle_id, totalAmount, paid_amount, payment_method)) as
    | { id: number }
    | undefined;

  if (recentDuplicate) {
    const existing = await db.prepare('SELECT * FROM invoices WHERE id = ?').get(recentDuplicate.id);
    return ok(existing, { status: 200 });
  }

  // Parse manual date if provided, or default to current timestamp
  let invoiceDate: string;
  if (created_at) {
    const dateStr = created_at.includes('T') ? created_at : `${created_at}T12:00:00Z`;
    const parsed = new Date(dateStr);
    invoiceDate = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  } else {
    invoiceDate = new Date().toISOString();
  }

  const insertInvoice = db.prepare(
    `INSERT INTO invoices
       (customer_id, vehicle_id, notes, total_amount, paid_amount, payment_status, payment_method, payment_method_note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`
  );
  const insertInvoiceItem = db.prepare(
    'INSERT INTO invoice_items (invoice_id, description, type, amount) VALUES (?, ?, ?, ?)'
  );

  const createInvoice = db.transaction(async () => {
    const info = await insertInvoice.run(
      customer_id,
      vehicle_id,
      notes || null,
      totalAmount,
      paid_amount,
      paymentStatus,
      payment_method,
      payment_method_note || null,
      invoiceDate
    );
    const invoiceId = info.lastInsertRowid as number;
    for (const item of items) await insertInvoiceItem.run(invoiceId, item.description, item.type, item.amount);
    return invoiceId;
  });

  const invoiceId = await createInvoice();
  logAudit(user, 'invoice.created', `Created INV-${invoiceId} for ${customer.name}`);
  const invoice = await db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  return ok(invoice, { status: 201 });
});
