import { requireUser } from '@/lib/auth';
import { ok, paginated, parsePagination, withErrorHandling } from '@/lib/http';
import { customerSchema, normalizeCustomerInput } from '@/lib/schemas/customer';
import { logAudit } from '@/lib/audit';
import db from '@/lib/db';

export const GET = withErrorHandling(async (req) => {
  await requireUser();

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const { page, pageSize, offset } = parsePagination(req.nextUrl.searchParams);

  const where = q
    ? `WHERE customers.name ILIKE ? OR customers.phone ILIKE ?
         OR customers.id IN (SELECT customer_id FROM vehicles WHERE vehicle_number ILIKE ? OR vehicle_model ILIKE ?)`
    : '';
  const whereParams = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : [];

  const { total } = (await db
    .prepare(`SELECT COUNT(*)::int AS total FROM customers ${where}`)
    .get(...whereParams)) as { total: number };

  // Subqueries for vehicles and invoices avoid cartesian multiplication of spend/balance.
  const customers = await db
    .prepare(
      `SELECT
         customers.id,
         customers.name,
         customers.phone,
         customers.address,
         customers.created_at,
         COALESCE(veh.vehicle_numbers, '') AS vehicle_numbers,
         COALESCE(inv.total_invoices, 0) AS total_invoices,
         COALESCE(inv.total_spent, 0) AS total_spent,
         COALESCE(inv.balance_due, 0) AS balance_due
       FROM customers
       LEFT JOIN (
         SELECT
           customer_id,
           STRING_AGG(
             CASE
               WHEN vehicle_number IS NOT NULL AND vehicle_number != '' AND vehicle_model IS NOT NULL AND vehicle_model != ''
                 THEN vehicle_number || ' (' || vehicle_model || ')'
               WHEN vehicle_number IS NOT NULL AND vehicle_number != ''
                 THEN vehicle_number
               WHEN vehicle_model IS NOT NULL AND vehicle_model != ''
                 THEN vehicle_model
               ELSE NULL
             END,
             ', '
           ) AS vehicle_numbers
         FROM vehicles
         GROUP BY customer_id
       ) veh ON veh.customer_id = customers.id
       LEFT JOIN (
         SELECT
           customer_id,
           COUNT(*)::int AS total_invoices,
           COALESCE(SUM(total_amount), 0)::float AS total_spent,
           COALESCE(SUM(GREATEST(0, total_amount - paid_amount)), 0)::float AS balance_due
         FROM invoices
         GROUP BY customer_id
       ) inv ON inv.customer_id = customers.id
       ${where}
       ORDER BY customers.created_at DESC, customers.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...whereParams, pageSize, offset);

  return paginated(customers, page, pageSize, total);
});

export const POST = withErrorHandling(async (req) => {
  const user = await requireUser();

  const body = await req.json();
  const { name, phone, address, vehicles } = customerSchema.parse(normalizeCustomerInput(body));

  const createCustomer = db.transaction(async () => {
    const info = await db
      .prepare(`INSERT INTO customers (name, phone, address) VALUES (?, ?, ?) RETURNING id`)
      .run(name, phone || null, address || null);

    const customerId = info.lastInsertRowid as number;

    if (vehicles && vehicles.length > 0) {
      const insertVehicle = db.prepare(
        'INSERT INTO vehicles (customer_id, vehicle_number, vehicle_model) VALUES (?, ?, ?)'
      );
      for (const v of vehicles) {
        if (v.vehicle_number || v.vehicle_model) {
          await insertVehicle.run(customerId, v.vehicle_number || null, v.vehicle_model || null);
        }
      }
    }

    return customerId;
  });

  const customerId = await createCustomer();

  logAudit(user, 'customer.created', `Created customer "${name}"`);
  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  return ok(customer, { status: 201 });
});
