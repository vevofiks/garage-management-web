"use client";

import { forwardRef } from "react";
import Image from "next/image";
import { formatCurrency, formatDate } from "@/lib/format";

export type StatementData = {
  customer: {
    id: number;
    name: string;
    phone: string | null;
    address: string | null;
    vehicles: Array<{ id: number; vehicle_number: string | null; vehicle_model: string | null }>;
  };
  period: {
    month: string;
    label: string;
    fromDate: string;
    toDate: string;
  };
  availableMonths: string[];
  summary: {
    invoiced_amount: number;
    paid_amount: number;
    balance_due: number;
    invoice_count: number;
    opening_balance?: number;
    closing_balance?: number;
  };
  invoices: Array<{
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
    items: Array<{
      id: number;
      description: string;
      type: "part" | "labor" | "discount";
      amount: number;
    }>;
  }>;
};

export const MonthlyStatementDocument = forwardRef<
  HTMLDivElement,
  { statement: StatementData }
>(function MonthlyStatementDocument({ statement }, ref) {
  const { customer, period, summary, invoices } = statement;

  const todayFormatted = new Intl.DateTimeFormat("en-QA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date());

  const balanceDue =
    summary.balance_due ?? summary.invoiced_amount - summary.paid_amount;

  return (
    <div
      ref={ref}
      id="monthly-statement-document"
      className="flex flex-col space-y-6 rounded-md border bg-white p-8 text-neutral-900 shadow-sm print:m-0 print:box-border print:w-[210mm] print:min-h-[273mm] print:border-0 print:p-[12mm] print:shadow-none text-sm"
    >
      {/* Header with Garage Logo and Branding */}
      <div className="flex items-start justify-between border-b border-neutral-200 pb-5">
        <div className="flex items-start gap-4">
          <Image
            src="/app-logo.png"
            alt="Babu Awamir Auto Garage"
            width={1294}
            height={556}
            className="h-16 w-auto shrink-0 object-contain"
            priority
            unoptimized
          />
          <div>
            <h2 className="text-lg font-bold tracking-tight text-neutral-900">
              BABU AWAMIR AUTO GARAGE
            </h2>
            <p className="text-xs text-neutral-600">Mechanical, Electrical, AC, Computer</p>
            <p className="text-xs text-neutral-600">Diesel and Petrol</p>
            <p className="text-xs font-semibold text-neutral-700">CR No. 218623</p>
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold tracking-tight text-[#9f1616]">
            MONTHLY STATEMENT
          </h1>
          <p className="text-sm font-semibold text-neutral-800">{period.label}</p>
          <p className="text-xs text-neutral-500">Date Issued: {todayFormatted}</p>
        </div>
      </div>

      {/* Addresses & Client Details */}
      <div className="grid grid-cols-2 gap-6 border-b border-neutral-200 pb-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-[#9f1616]">
            Office Address
          </div>
          <div className="font-medium text-neutral-800">Al jazeera complex</div>
          <div className="text-neutral-600">Birkath al Awamer</div>
          <div className="text-xs text-neutral-500 mt-1">Mobile: 70524528, 30233733</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-[#9f1616]">
            Statement For
          </div>
          <div className="text-base font-bold text-neutral-900">{customer.name}</div>
          {customer.phone && <div className="text-neutral-600">Tel: {customer.phone}</div>}
          {customer.address && <div className="text-neutral-600">{customer.address}</div>}
        </div>
      </div>

      {/* Financial Summary KPI Cards - strictly for this month */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <div className="text-xs text-neutral-500">Invoices</div>
          <div className="text-lg font-bold text-neutral-800">
            {summary.invoice_count}
          </div>
          <div className="text-[11px] text-neutral-400">Total this month</div>
        </div>

        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <div className="text-xs text-neutral-500">Total Billed</div>
          <div className="text-lg font-bold text-neutral-800">
            {formatCurrency(summary.invoiced_amount)}
          </div>
          <div className="text-[11px] text-neutral-400">Charges for {period.label}</div>
        </div>

        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <div className="text-xs text-neutral-500">Total Paid</div>
          <div className="text-lg font-bold text-emerald-700">
            {formatCurrency(summary.paid_amount)}
          </div>
          <div className="text-[11px] text-neutral-400">Paid for {period.label}</div>
        </div>

        <div className="rounded-md border border-[#9f1616] bg-[#9f1616] p-3 text-white">
          <div className="text-xs text-white/80">Balance Due</div>
          <div className="text-lg font-bold text-white">
            {formatCurrency(balanceDue)}
          </div>
          <div className="text-[11px] text-white/80">Remaining for {period.label}</div>
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#9f1616]">
            Itemized Invoices &amp; Activity
          </h3>
          <span className="text-xs text-neutral-500">
            Period: {formatDate(period.fromDate)} – {formatDate(period.toDate)}
          </span>
        </div>

        <table className="w-full text-left text-xs border border-neutral-200">
          <thead>
            <tr className="bg-[#9f1616] text-white">
              <th className="py-2.5 pl-3 font-semibold w-8">#</th>
              <th className="py-2.5 px-2 font-semibold w-24">Date</th>
              <th className="py-2.5 px-2 font-semibold w-20">Invoice</th>
              <th className="py-2.5 px-2 font-semibold">Vehicle</th>
              <th className="py-2.5 px-2 font-semibold">Services &amp; Parts</th>
              <th className="py-2.5 px-2 text-right font-semibold w-24">Total</th>
              <th className="py-2.5 px-2 text-right font-semibold w-24">Paid</th>
              <th className="py-2.5 pr-3 text-right font-semibold w-24">Balance</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-neutral-500 italic">
                  No invoices recorded for this customer in {period.label}.
                </td>
              </tr>
            ) : (
              invoices.map((inv, index) => {
                const vehicleLabel = [inv.vehicle_number, inv.vehicle_model]
                  .filter(Boolean)
                  .join(" — ");

                const itemsSummary = inv.items?.length
                  ? inv.items.map((it) => it.description).join(", ")
                  : inv.notes || "General service";

                return (
                  <tr
                    key={inv.id}
                    className="border-b border-neutral-200 even:bg-neutral-50/50 break-inside-avoid"
                  >
                    <td className="py-2.5 pl-3 font-medium text-neutral-500">{index + 1}</td>
                    <td className="py-2.5 px-2 whitespace-nowrap text-neutral-700">
                      {formatDate(inv.created_at)}
                    </td>
                    <td className="py-2.5 px-2 font-semibold text-neutral-900">
                      INV-{inv.id}
                    </td>
                    <td className="py-2.5 px-2 text-neutral-700">
                      {vehicleLabel || "—"}
                    </td>
                    <td className="py-2.5 px-2 text-neutral-600 max-w-xs truncate" title={itemsSummary}>
                      {itemsSummary}
                    </td>
                    <td className="py-2.5 px-2 text-right font-medium text-neutral-900">
                      {formatCurrency(inv.total_amount)}
                    </td>
                    <td className="py-2.5 px-2 text-right text-emerald-700">
                      {formatCurrency(inv.paid_amount)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-neutral-900">
                      {formatCurrency(inv.balance_due)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Statement Financial Reconciliation */}
      <div className="flex items-start justify-between gap-8 pt-2 break-inside-avoid">
        <div className="max-w-xs space-y-1.5 text-xs text-neutral-500">
          <div className="font-semibold text-[#9f1616]">Statement Notes</div>
          <p>
            This statement reflects all billed work and payments recorded for{" "}
            <strong>{customer.name}</strong> during <strong>{period.label}</strong>.
          </p>
          {customer.phone && <p>Registered contact: {customer.phone}</p>}
        </div>

        <div className="ml-auto w-72 space-y-1.5 text-xs">
          <div className="flex justify-between py-1 border-b border-neutral-100">
            <span className="text-neutral-600">Total Billed ({summary.invoice_count} invoices)</span>
            <span className="font-medium text-neutral-800">
              {formatCurrency(summary.invoiced_amount)}
            </span>
          </div>

          <div className="flex justify-between py-1 border-b border-neutral-200">
            <span className="text-neutral-600">Less: Payments Received</span>
            <span className="font-medium text-emerald-700">
              -{formatCurrency(summary.paid_amount)}
            </span>
          </div>

          <div className="flex items-center justify-between bg-[#9f1616] px-3 py-2 text-sm font-bold text-white rounded">
            <span>Balance Due</span>
            <span>{formatCurrency(balanceDue)}</span>
          </div>
        </div>
      </div>

      {/* Terms & Footer */}
      <div className="space-y-3 border-t border-neutral-200 pt-5 text-xs text-neutral-500 break-inside-avoid">
        <p className="text-center font-semibold text-[#9f1616] text-sm">
          Thank you for choosing Babu Awamir Auto Garage
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="font-semibold text-[#9f1616]">Payment &amp; Inquiries</div>
            <div>Mobile: 70524528 / 30233733</div>
            <div>Location: Al jazeera complex, Birkath al Awamer, Qatar</div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-[#9f1616]">Terms</div>
            <div>All amounts are in QAR. Please settle outstanding balances promptly.</div>
          </div>
        </div>
      </div>
    </div>
  );
});
