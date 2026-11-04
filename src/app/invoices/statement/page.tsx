"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  PrinterIcon,
  DownloadIcon,
  Loader2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarIcon,
  UsersIcon,
  FileTextIcon,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { exportElementToPdf } from "@/lib/pdf-export";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerPicker, type SelectedCustomer } from "@/components/customer-picker";
import {
  MonthlyStatementDocument,
  type StatementData,
} from "../_components/monthly-statement-document";

function formatMonthValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getStatementFilename(statement: StatementData): string {
  const safeName = statement.customer.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeMonth = statement.period.month;
  return `Statement_${safeName}_${safeMonth}.pdf`;
}

export default function MonthlyStatementPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const customerIdParam = searchParams.get("customer_id");
  const monthParam = searchParams.get("month");

  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      return monthParam;
    }
    return formatMonthValue(new Date());
  });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const statementRef = useRef<HTMLDivElement>(null);

  // If customer_id is provided in URL, pre-fetch customer details
  const customerIdNumber = customerIdParam ? parseInt(customerIdParam, 10) : null;
  const { data: customerDetails } = useQuery<{ id: number; name: string }>({
    queryKey: queryKeys.customers.detail(customerIdNumber || 0),
    queryFn: () => apiClient.get<{ id: number; name: string }>(`/api/customers/${customerIdNumber}`),
    enabled: !!customerIdNumber && !selectedCustomer,
  });

  useEffect(() => {
    if (customerDetails && !selectedCustomer) {
      setSelectedCustomer({ id: customerDetails.id, name: customerDetails.name });
    }
  }, [customerDetails, selectedCustomer]);

  // Sync URL when customer or month changes
  const handleSelectCustomer = (customer: SelectedCustomer | null) => {
    setSelectedCustomer(customer);
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      if (customer) {
        params.set("customer_id", String(customer.id));
      } else {
        params.delete("customer_id");
      }
      params.set("month", selectedMonth);
      router.replace(`/invoices/statement?${params.toString()}`);
    });
  };

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      if (selectedCustomer) {
        params.set("customer_id", String(selectedCustomer.id));
      }
      params.set("month", newMonth);
      router.replace(`/invoices/statement?${params.toString()}`);
    });
  };

  const handleStepMonth = (direction: -1 | 1) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const date = new Date(y, m - 1 + direction, 1);
    handleMonthChange(formatMonthValue(date));
  };

  // Fetch statement data when customer is selected
  const activeCustomerId = selectedCustomer?.id || customerIdNumber;
  const { data: statement, isLoading, isError } = useQuery<StatementData>({
    queryKey: queryKeys.invoices.statement(activeCustomerId || 0, selectedMonth),
    queryFn: () =>
      apiClient.get<StatementData>(
        `/api/invoices/statement?customer_id=${activeCustomerId}&month=${selectedMonth}`
      ),
    enabled: !!activeCustomerId,
  });

  // Direct High-Resolution PDF Download
  const handleDownloadPdf = async () => {
    if (!statement || !statementRef.current) return;
    setIsGeneratingPdf(true);
    const filename = getStatementFilename(statement);

    try {
      await exportElementToPdf(statementRef.current, filename);
      toast.success(`Downloaded ${filename}`);
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast.error("Failed to generate PDF. You can also use the Print button.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Browser Print / Save as PDF (sets proper filename for Save as PDF dialog)
  const handlePrint = () => {
    if (statement) {
      const originalTitle = document.title;
      document.title = getStatementFilename(statement).replace(/\.pdf$/i, "");
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    } else {
      window.print();
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header (hidden when printing) */}
      <div className="print:hidden">
        <PageHeader
          title="Monthly Customer Statement"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <Link href="/invoices">
                    <ArrowLeftIcon className="size-4" /> Back to Invoices
                  </Link>
                }
              />
              {statement && (
                <>
                  <Button
                    variant="outline"
                    onClick={handlePrint}
                    title="Print directly or use browser print dialog"
                  >
                    <PrinterIcon className="size-4" /> Print
                  </Button>
                  <Button
                    onClick={handleDownloadPdf}
                    disabled={isGeneratingPdf}
                    title="Generate and download a high-quality PDF file directly"
                  >
                    {isGeneratingPdf ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" /> Saving PDF…
                      </>
                    ) : (
                      <>
                        <DownloadIcon className="size-4" /> Download PDF
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          }
        />
      </div>

      {/* Filter and Selection Controls (hidden when printing) */}
      <div className="print:hidden grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UsersIcon className="size-4 text-muted-foreground" />
              1. Select Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerPicker selected={selectedCustomer} onSelect={handleSelectCustomer} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarIcon className="size-4 text-muted-foreground" />
              2. Billing Month
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => handleStepMonth(-1)}
                title="Previous Month"
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => e.target.value && handleMonthChange(e.target.value)}
                className="text-center font-medium"
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => handleStepMonth(1)}
                title="Next Month"
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>

            {/* Quick selector for months with invoices */}
            {statement?.availableMonths && statement.availableMonths.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Months with invoices:
                </span>
                <div className="flex flex-wrap gap-1">
                  {statement.availableMonths.slice(0, 5).map((m) => {
                    const [y, mn] = m.split("-").map(Number);
                    const label = new Date(y, mn - 1, 1).toLocaleDateString("en-US", {
                      month: "short",
                      year: "2-digit",
                    });
                    const isSelected = m === selectedMonth;
                    return (
                      <Button
                        key={m}
                        type="button"
                        variant={isSelected ? "default" : "secondary"}
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => handleMonthChange(m)}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Banner (hidden when printing) */}
      {statement && (
        <div className="print:hidden flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-700">
          <div className="flex items-center gap-2">
            <FileTextIcon className="size-4 text-[#9f1616]" />
            <span>
              Statement for <strong>{statement.customer.name}</strong> ({statement.period.label})
              &bull; <strong>{statement.summary.invoice_count}</strong> invoice(s) &bull; Total Billed:{" "}
              <strong>QAR {statement.summary.invoiced_amount.toFixed(2)}</strong> &bull; Balance Due:{" "}
              <strong>QAR {(statement.summary.balance_due ?? (statement.summary.invoiced_amount - statement.summary.paid_amount)).toFixed(2)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              className="h-8 text-xs bg-white"
            >
              <PrinterIcon className="size-3.5 mr-1.5" /> Print
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="h-8 text-xs bg-[#9f1616] hover:bg-[#851212] text-white"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2Icon className="size-3.5 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <DownloadIcon className="size-3.5 mr-1.5" /> Download PDF File
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Main Statement Preview Area */}
      {!activeCustomerId ? (
        <Card className="print:hidden border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 text-muted-foreground mb-4">
              <FileTextIcon className="size-8" />
            </div>
            <h3 className="text-base font-semibold">No Customer Selected</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Please choose a customer from the picker above to generate and download their
              itemized monthly statement PDF.
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-4 print:hidden">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError || !statement ? (
        <Card className="print:hidden border-destructive">
          <CardContent className="py-8 text-center text-sm text-destructive">
            Failed to load statement. Please verify the customer details and try again.
          </CardContent>
        </Card>
      ) : (
        <div className="mx-auto max-w-4xl print:mx-0 print:max-w-none">
          <MonthlyStatementDocument ref={statementRef} statement={statement} />
        </div>
      )}
    </div>
  );
}
