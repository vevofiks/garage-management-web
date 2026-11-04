import { requireUser } from "@/lib/auth";
import { ok, badRequest, notFound, withErrorHandling } from "@/lib/http";
import db from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling<Ctx>(async (req, { params }) => {
  await requireUser();

  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id)) return badRequest("Invalid customer ID");

  const customer = (await db
    .prepare("SELECT id, name, phone, address, created_at FROM customers WHERE id = ?")
    .get(id)) as
    | { id: number; name: string; phone: string | null; address: string | null; created_at: string }
    | undefined;

  if (!customer) return notFound("Customer not found");

  const vehicles = await db
    .prepare(
      "SELECT id, vehicle_number, vehicle_model, created_at FROM vehicles WHERE customer_id = ? ORDER BY created_at ASC"
    )
    .all(id);

  // Available months that have invoices for this customer
  const monthsResult = (await db
    .prepare(
      `SELECT DISTINCT TO_CHAR(created_at, 'YYYY-MM') AS month
       FROM invoices
       WHERE customer_id = ?
       ORDER BY month DESC`
    )
    .all(id)) as { month: string }[];

  const availableMonths = monthsResult.map((r) => r.month);

  // Determine requested month
  const monthParam = req.nextUrl.searchParams.get("month")?.trim();
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const selectedMonth =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : availableMonths.length > 0
        ? availableMonths[0]
        : currentMonthStr;

  const [yearStr, monthStr] = selectedMonth.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return badRequest("Invalid month format, expected YYYY-MM");
  }

  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const fromDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const toDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const monthDate = new Date(year, monthNum - 1, 1);
  const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Invoices for this customer strictly within the selected month
  const invoices = (await db
    .prepare(
      `SELECT invoices.id,
              invoices.total_amount,
              invoices.paid_amount,
              (invoices.total_amount - invoices.paid_amount) AS balance_due,
              invoices.payment_status,
              invoices.payment_method,
              invoices.payment_method_note,
              invoices.notes,
              invoices.created_at,
              vehicles.vehicle_number,
              vehicles.vehicle_model
       FROM invoices
       LEFT JOIN vehicles ON vehicles.id = invoices.vehicle_id
       WHERE invoices.customer_id = ?
         AND invoices.created_at::date >= ?::date
         AND invoices.created_at::date <= ?::date
       ORDER BY invoices.created_at ASC, invoices.id ASC`
    )
    .all(id, fromDate, toDate)) as Array<{
      id: number;
      total_amount: number;
      paid_amount: number;
      balance_due: number;
      payment_status: "unpaid" | "partial" | "paid";
      payment_method: string;
      payment_method_note: string | null;
      notes: string | null;
      created_at: string;
      vehicle_number: string | null;
      vehicle_model: string | null;
    }>;

  // Fetch invoice items for detailed breakdown
  const invoiceIds = invoices.map((inv) => inv.id);
  const itemsByInvoice: Record<
    number,
    Array<{ id: number; description: string; type: "part" | "labor" | "discount"; amount: number }>
  > = {};

  if (invoiceIds.length > 0) {
    const placeholders = invoiceIds.map(() => "?").join(",");
    const items = (await db
      .prepare(
        `SELECT id, invoice_id, description, type, amount
         FROM invoice_items
         WHERE invoice_id IN (${placeholders})
         ORDER BY id ASC`
      )
      .all(...invoiceIds)) as Array<{
        id: number;
        invoice_id: number;
        description: string;
        type: "part" | "labor" | "discount";
        amount: number;
      }>;

    for (const item of items) {
      if (!itemsByInvoice[item.invoice_id]) {
        itemsByInvoice[item.invoice_id] = [];
      }
      itemsByInvoice[item.invoice_id].push({
        id: item.id,
        description: item.description,
        type: item.type,
        amount: item.amount,
      });
    }
  }

  const enrichedInvoices = invoices.map((inv) => ({
    ...inv,
    items: itemsByInvoice[inv.id] || [],
  }));

  const invoiced_amount = enrichedInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
  const paid_amount = enrichedInvoices.reduce((sum, inv) => sum + inv.paid_amount, 0);
  const balance_due = invoiced_amount - paid_amount;

  return ok({
    customer: {
      ...customer,
      vehicles,
    },
    period: {
      month: selectedMonth,
      label: monthLabel,
      fromDate,
      toDate,
    },
    availableMonths,
    summary: {
      invoiced_amount: Math.round(invoiced_amount * 100) / 100,
      paid_amount: Math.round(paid_amount * 100) / 100,
      balance_due: Math.round(balance_due * 100) / 100,
      invoice_count: enrichedInvoices.length,
    },
    invoices: enrichedInvoices,
  });
});
