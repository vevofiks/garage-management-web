"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PrinterIcon, CalendarIcon } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  invoiceItemsSchema,
  paymentSchema,
  PAYMENT_METHOD_LABELS,
  type InvoiceItemsFormData,
  type PaymentFormData,
  type PaymentMethod,
} from "@/lib/schemas/invoice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InvoiceItemsField } from "../_components/invoice-items-field";

type InvoiceDetail = {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string | null;
  vehicle_number: string | null;
  vehicle_model: string | null;
  notes: string | null;
  total_amount: number;
  paid_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  payment_method: PaymentMethod;
  payment_method_note: string | null;
  created_at: string;
  items: { id: number; description: string; type: "part" | "labor" | "discount"; amount: number }[];
};

const PAYMENT_BADGE: Record<InvoiceDetail["payment_status"], "default" | "secondary" | "destructive"> = {
  paid: "default",
  partial: "secondary",
  unpaid: "destructive",
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params);
  const id = Number(idParam);
  const queryClient = useQueryClient();

  const { data: invoice, isLoading } = useQuery<InvoiceDetail>({
    queryKey: queryKeys.invoices.detail(id),
    queryFn: () => apiClient.get<InvoiceDetail>(`/api/invoices/${id}`),
  });

  const [invoiceDate, setInvoiceDate] = useState("");

  useEffect(() => {
    if (invoice?.created_at) {
      setInvoiceDate(invoice.created_at.split("T")[0]);
    }
  }, [invoice?.created_at]);

  const {
    control: itemsControl,
    register: itemsRegister,
    handleSubmit: handleItemsSubmit,
    setValue: setItemsValue,
    formState: { errors: itemsErrors, isSubmitting: isSavingItems },
  } = useForm<InvoiceItemsFormData>({
    resolver: zodResolver(invoiceItemsSchema),
    values: invoice
      ? { items: invoice.items.map(({ description, type, amount }) => ({ description, type, amount })) }
      : undefined,
  });

  const {
    register: paymentRegister,
    handleSubmit: handlePaymentSubmit,
    watch: watchPayment,
    setValue: setPaymentValue,
    setError: setPaymentError,
    formState: { errors: paymentErrors, isSubmitting: isSavingPayment },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { paid_amount: 0, payment_method: "cash", payment_method_note: "" },
    values: invoice
      ? {
          paid_amount: invoice.paid_amount,
          payment_method: invoice.payment_method,
          payment_method_note: invoice.payment_method_note ?? "",
        }
      : undefined,
  });

  const selectedPaymentMethod = watchPayment("payment_method");
  const [paymentCashAmount, setPaymentCashAmount] = useState<number | "">("");
  const [paymentCardAmount, setPaymentCardAmount] = useState<number | "">("");

  const handlePaymentSplitChange = (cash: number | "", card: number | "") => {
    setPaymentCashAmount(cash);
    setPaymentCardAmount(card);
    const numCash = typeof cash === "number" ? cash : 0;
    const numCard = typeof card === "number" ? card : 0;
    const total = Math.round((numCash + numCard) * 100) / 100;
    setPaymentValue("paid_amount", total, { shouldValidate: true });
    setPaymentValue(
      "payment_method_note",
      `Cash: QAR ${numCash.toFixed(2)} | Card: QAR ${numCard.toFixed(2)}`,
      { shouldValidate: true }
    );
  };

  const invalidateInvoice = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
  };

  const saveItemsMutation = useMutation({
    mutationFn: (data: InvoiceItemsFormData) => apiClient.patch(`/api/invoices/${id}`, data),
    onSuccess: () => {
      invalidateInvoice();
      toast.success("Items updated");
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to update items"),
  });

  const recordPaymentMutation = useMutation({
    mutationFn: (data: PaymentFormData) => apiClient.patch(`/api/invoices/${id}`, data),
    onSuccess: () => {
      invalidateInvoice();
      toast.success("Payment recorded");
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to record payment"),
  });

  const updateDateMutation = useMutation({
    mutationFn: (newDate: string) => apiClient.patch(`/api/invoices/${id}`, { created_at: newDate }),
    onSuccess: () => {
      invalidateInvoice();
      toast.success("Invoice date updated");
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to update invoice date"),
  });

  if (isLoading || !invoice) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full max-w-4xl" />
      </div>
    );
  }

  const balanceDue = Math.max(0, invoice.total_amount - invoice.paid_amount);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={`INV-${invoice.id}`}
        description={`Created: ${formatDate(invoice.created_at)}`}
        backHref="/invoices"
        backLabel="Back to invoices"
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link href={`/invoices/${invoice.id}/print`}>
                <PrinterIcon className="size-4" /> Print
              </Link>
            }
          />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Customer, Vehicle &amp; Date</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
          <div>
            <div className="text-muted-foreground">Customer</div>
            <Link href={`/customers/${invoice.customer_id}`} className="hover:underline font-medium text-foreground">
              {invoice.customer_name}
            </Link>
          </div>
          <div>
            <div className="text-muted-foreground">Phone</div>
            <div>{invoice.customer_phone || "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Vehicle Number</div>
            <div>{invoice.vehicle_number || "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Vehicle Model</div>
            <div>{invoice.vehicle_model || "—"}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground flex items-center gap-1">
              <CalendarIcon className="size-3.5" />
              <span>Invoice Date</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="h-8 text-xs font-medium"
                disabled={updateDateMutation.isPending}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs shrink-0"
                disabled={
                  updateDateMutation.isPending ||
                  !invoiceDate ||
                  invoiceDate === invoice.created_at.split("T")[0]
                }
                onClick={() => updateDateMutation.mutate(invoiceDate)}
              >
                {updateDateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
          {invoice.notes && (
            <div className="col-span-2 sm:col-span-5 border-t pt-3 mt-1">
              <div className="text-muted-foreground text-xs font-medium">Notes</div>
              <div className="text-sm mt-0.5">{invoice.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice items</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleItemsSubmit((data) => saveItemsMutation.mutate(data))} className="space-y-4">
            <InvoiceItemsField
              control={itemsControl}
              register={itemsRegister}
              setValue={setItemsValue}
              errors={itemsErrors}
            />
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isSavingItems || saveItemsMutation.isPending}>
                {isSavingItems || saveItemsMutation.isPending ? "Saving…" : "Save Items"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Payment</CardTitle>
          <Badge variant={PAYMENT_BADGE[invoice.payment_status]} className="capitalize">
            {invoice.payment_status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium">{formatCurrency(invoice.total_amount)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="font-medium">{formatCurrency(invoice.paid_amount)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Balance Due</dt>
              <dd className="font-medium">{formatCurrency(balanceDue)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Payment Method</dt>
              <dd className="font-medium">
                {PAYMENT_METHOD_LABELS[invoice.payment_method]}
                {(invoice.payment_method === "other" || invoice.payment_method === "both") && invoice.payment_method_note && (
                  <span className="block font-normal text-muted-foreground">
                    {invoice.payment_method_note}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">Record a Payment</h3>
            <form
              onSubmit={handlePaymentSubmit((data) => {
                if (data.paid_amount > invoice.total_amount) {
                  setPaymentError("paid_amount", {
                    message: "Amount paid cannot be more than the invoice total",
                  });
                  return;
                }
                recordPaymentMutation.mutate(data);
              })}
              className="space-y-4 pb-4"
            >
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="payment_method">Payment Method</Label>
                  <Select
                    value={selectedPaymentMethod}
                    onValueChange={(val) => {
                      if (val) {
                        const method = val as PaymentMethod;
                        setPaymentValue("payment_method", method);
                        if (method === "both") {
                          const currentPaid = watchPayment("paid_amount") || 0;
                          const half = Math.round((currentPaid / 2) * 100) / 100;
                          const rest = Math.round((currentPaid - half) * 100) / 100;
                          handlePaymentSplitChange(half, rest);
                        } else if (method !== "other") {
                          setPaymentValue("payment_method_note", "");
                        }
                      }
                    }}
                    disabled={isSavingPayment || recordPaymentMutation.isPending}
                  >
                    <SelectTrigger id="payment_method" className="w-full">
                      <SelectValue>{PAYMENT_METHOD_LABELS[selectedPaymentMethod]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedPaymentMethod !== "both" && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="paid_amount">Amount Paid</Label>
                    <Input
                      id="paid_amount"
                      type="number"
                      step="0.01"
                      {...paymentRegister("paid_amount", {
                        setValueAs: (v) => (v === "" ? 0 : Number(v)),
                      })}
                      disabled={isSavingPayment || recordPaymentMutation.isPending}
                    />
                    {paymentErrors.paid_amount && (
                      <p className="text-sm text-destructive">{paymentErrors.paid_amount.message}</p>
                    )}
                  </div>
                )}

                {selectedPaymentMethod === "both" && (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="cash_amount">Cash Amount (QAR)</Label>
                      <Input
                        id="cash_amount"
                        type="number"
                        step="0.01"
                        placeholder="e.g. 50.00"
                        value={paymentCashAmount}
                        onChange={(e) =>
                          handlePaymentSplitChange(
                            e.target.value === "" ? "" : Number(e.target.value),
                            paymentCardAmount
                          )
                        }
                        disabled={isSavingPayment || recordPaymentMutation.isPending}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="card_amount">Card Amount (QAR)</Label>
                      <Input
                        id="card_amount"
                        type="number"
                        step="0.01"
                        placeholder="e.g. 50.00"
                        value={paymentCardAmount}
                        onChange={(e) =>
                          handlePaymentSplitChange(
                            paymentCashAmount,
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        disabled={isSavingPayment || recordPaymentMutation.isPending}
                      />
                    </div>
                  </>
                )}

                {selectedPaymentMethod === "other" && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="payment_method_note">Describe it</Label>
                    <Input
                      id="payment_method_note"
                      placeholder="e.g. Half cash, half GPay"
                      {...paymentRegister("payment_method_note")}
                      disabled={isSavingPayment || recordPaymentMutation.isPending}
                    />
                    {paymentErrors.payment_method_note && (
                      <p className="text-sm text-destructive">{paymentErrors.payment_method_note.message}</p>
                    )}
                  </div>
                )}
              </div>
              {selectedPaymentMethod === "both" && (
                <p className="text-xs text-muted-foreground">
                  Total Paid: <span className="font-semibold text-foreground">QAR {(watchPayment("paid_amount") || 0).toFixed(2)}</span> ({watchPayment("payment_method_note")})
                </p>
              )}
              <div className="flex justify-end">
                <Button type="submit" disabled={isSavingPayment || recordPaymentMutation.isPending}>
                  {isSavingPayment || recordPaymentMutation.isPending ? "Saving…" : "Save Payment"}
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
