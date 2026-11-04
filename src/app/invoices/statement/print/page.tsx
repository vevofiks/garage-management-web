"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftIcon, PrinterIcon, DownloadIcon, Loader2Icon } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { exportElementToPdf } from "@/lib/pdf-export";
import { Button } from "@/components/ui/button";
import {
  MonthlyStatementDocument,
  type StatementData,
} from "../../_components/monthly-statement-document";

function getStatementFilename(statement: StatementData): string {
  const safeName = statement.customer.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeMonth = statement.period.month;
  return `Statement_${safeName}_${safeMonth}.pdf`;
}

export default function StatementPrintPage() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer_id");
  const month = searchParams.get("month") || "";

  const statementRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const { data: statement, isLoading, isError } = useQuery<StatementData>({
    queryKey: queryKeys.invoices.statement(Number(customerId), month),
    queryFn: () =>
      apiClient.get<StatementData>(
        `/api/invoices/statement?customer_id=${customerId}&month=${month}`
      ),
    enabled: !!customerId,
  });

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

  const handleDownloadPdf = async () => {
    if (!statement || !statementRef.current) return;
    setIsGeneratingPdf(true);
    const filename = getStatementFilename(statement);

    try {
      await exportElementToPdf(statementRef.current, filename);
      toast.success(`Downloaded ${filename}`);
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast.error("Failed to generate PDF file.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (!customerId) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No customer specified. Please provide a customer ID to view their statement.
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading statement…</div>;
  }

  if (isError || !statement) {
    return (
      <div className="p-8 text-center text-sm text-destructive">
        Failed to load statement. Please verify the customer ID and billing period.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8 text-sm text-foreground print:mx-0 print:max-w-none print:p-0">
      {/* Top action bar (hidden on print) */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={
              <Link
                href={`/invoices/statement?customer_id=${customerId}&month=${statement.period.month}`}
                aria-label="Back to statement"
              >
                <ArrowLeftIcon className="size-4" />
              </Link>
            }
          />
          <h1 className="text-lg font-semibold">
            Statement Preview — {statement.customer.name} ({statement.period.label})
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <PrinterIcon className="size-4" /> Print / System PDF
          </Button>
          <Button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="bg-[#9f1616] hover:bg-[#851212] text-white"
          >
            {isGeneratingPdf ? (
              <>
                <Loader2Icon className="size-4 mr-1.5 animate-spin" /> Saving PDF…
              </>
            ) : (
              <>
                <DownloadIcon className="size-4 mr-1.5" /> Download PDF File
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Render Document */}
      <MonthlyStatementDocument ref={statementRef} statement={statement} />
    </div>
  );
}
