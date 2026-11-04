import { requireUser } from '@/lib/auth';
import { ok, badRequest, notFound, withErrorHandling } from '@/lib/http';
import { updateInvoiceSchema } from '@/lib/schemas/invoice';
import { computeInvoiceTotal, derivePaymentStatus } from '@/lib/invoice-totals';
import { logAudit } from '@/lib/audit';
import db from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const invoice = await db
    .prepare(
      `SELECT
         invoices.*,
         customers.name AS customer_name, customers.phone AS customer_phone,
         customers.address AS customer_address,
         vehicles.vehicle_number, vehicles.vehicle_model
       FROM invoices
       JOIN customers ON customers.id = invoices.customer_id
       LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
       WHERE invoices.id = ?`
    )
    .get(id);
  if (!invoice) return notFound('Invoice not found');

  const items = await db
    .prepare('SELECT id, description, type, amount FROM invoice_items WHERE invoice_id = ? ORDER BY id')
    .all(id);

  return ok({ ...(invoice as object), items });
});

export const PATCH = withErrorHandling<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const body = await req.json();
  const { items, paid_amount, payment_method, payment_method_note, notes, created_at } =
    updateInvoiceSchema.parse(body);

  if (
    items === undefined &&
    paid_amount === undefined &&
    payment_method === undefined &&
    payment_method_note === undefined &&
    notes === undefined &&
    created_at === undefined
  ) {
    return badRequest('Nothing to update');
  }

  const current = (await db
    .prepare('SELECT total_amount, paid_amount, payment_method, payment_method_note FROM invoices WHERE id = ?')
    .get(id)) as
    | { total_amount: number; paid_amount: number; payment_method: string; payment_method_note: string | null }
    | undefined;
  if (!current) return notFound('Invoice not found');

  const resultingMethod = payment_method ?? current.payment_method;
  const resultingNote = payment_method_note ?? current.payment_method_note;
  if (resultingMethod === 'other' && !resultingNote) {
    return badRequest('Describe the payment method (e.g. "Half cash, half GPay")');
  }

  const resultingTotal = items ? computeInvoiceTotal(items) : current.total_amount;
  const resultingPaidAmount = paid_amount ?? current.paid_amount;
  if (resultingPaidAmount > resultingTotal) {
    return badRequest('Amount paid cannot be more than the invoice total');
  }

  const deleteItems = db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?');
  const insertItem = db.prepare(
    'INSERT INTO invoice_items (invoice_id, description, type, amount) VALUES (?, ?, ?, ?)'
  );

  const applyUpdate = db.transaction(async () => {
    let totalAmount = current.total_amount;
    if (items) {
      totalAmount = computeInvoiceTotal(items);
      await deleteItems.run(id);
      for (const item of items) await insertItem.run(id, item.description, item.type, item.amount);
    }
    const paidAmount = paid_amount ?? current.paid_amount;
    const status = derivePaymentStatus(totalAmount, paidAmount);

    const setClauses = ['total_amount = ?', 'paid_amount = ?', 'payment_status = ?'];
    const setParams: (string | number | null)[] = [totalAmount, paidAmount, status];

    if (payment_method !== undefined) {
      setClauses.push('payment_method = ?');
      setParams.push(payment_method);
    }
    if (payment_method_note !== undefined) {
      setClauses.push('payment_method_note = ?');
      setParams.push(payment_method_note || null);
    }
    if (notes !== undefined) {
      setClauses.push('notes = ?');
      setParams.push(notes || null);
    }
    if (created_at !== undefined) {
      const dateStr = created_at.includes('T') ? created_at : `${created_at}T12:00:00Z`;
      const parsed = new Date(dateStr);
      const newDate = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
      setClauses.push('created_at = ?');
      setParams.push(newDate);
    }

    await db.prepare(`UPDATE invoices SET ${setClauses.join(', ')} WHERE id = ?`).run(...setParams, id);
  });

  await applyUpdate();
  logAudit(user, 'invoice.updated', `Updated invoice INV-${id}`);
  const updated = await db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  return ok(updated);
});

export const DELETE = withErrorHandling<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest('Invalid ID');

  const invoice = await db.prepare('SELECT id FROM invoices WHERE id = ?').get(id);
  if (!invoice) return notFound('Invoice not found');

  const deleteItems = db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?');
  const deleteInv = db.prepare('DELETE FROM invoices WHERE id = ?');

  await db.transaction(async () => {
    await deleteItems.run(id);
    await deleteInv.run(id);
  })();

  logAudit(user, 'invoice.deleted', `Deleted INV-${id}`);
  return ok({ success: true });
});
