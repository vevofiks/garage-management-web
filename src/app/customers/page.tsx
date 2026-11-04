"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FileTextIcon, PlusIcon, PhoneIcon } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency, formatDate } from "@/lib/format";
import { useHotkey } from "@/hooks/use-hotkey";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  vehicle_numbers: string | null;
  total_invoices: number;
  total_spent: number;
  balance_due: number;
  created_at: string;
};

type CustomerPage = {
  data: Customer[];
  page: number;
  totalPages: number;
  total: number;
};

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  // A new search term invalidates whatever page we were on. Reset during
  // render (React's documented pattern for derived state) rather than in a
  // useEffect, which would cause an extra render before the reset lands.
  const [prevSearch, setPrevSearch] = useState(debouncedSearch);
  if (debouncedSearch !== prevSearch) {
    setPrevSearch(debouncedSearch);
    setPage(1);
  }

  useHotkey("f", useCallback(() => searchRef.current?.focus(), []));

  const { data: result, isLoading } = useQuery<CustomerPage>({
    queryKey: queryKeys.customers.list(debouncedSearch, page),
    queryFn: () =>
      apiClient.get<CustomerPage>(
        `/api/customers?page=${page}${debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ""}`
      ),
  });
  const customers = result?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        actions={
          <Button nativeButton={false} render={<Link href="/customers/new">Add Customer</Link>} />
        }
      />

      <div className="flex items-center gap-3">
        <Input
          ref={searchRef}
          placeholder="Search by name, phone, vehicle number, or model… (Ctrl+F)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Vehicles</TableHead>
              <TableHead className="text-center">Invoices</TableHead>
              <TableHead>Total Spent</TableHead>
              <TableHead>Balance Due</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full max-w-28" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              customers?.map((customer, index) => {
                const balanceDue = Number(customer.balance_due) || 0;
                const totalSpent = Number(customer.total_spent) || 0;
                const totalInvoices = Number(customer.total_invoices) || 0;

                return (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/customers/${customer.id}`)}
                  >
                    <TableCell className="text-muted-foreground text-xs font-medium">
                      {(page - 1) * 10 + index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-foreground">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {customer.name}
                        </Link>
                      </div>
                      {customer.address && (
                        <div className="text-xs text-muted-foreground truncate max-w-xs">
                          {customer.address}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {customer.phone ? (
                        <a
                          href={`tel:${customer.phone}`}
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <PhoneIcon className="size-3 opacity-70" />
                          <span>{customer.phone}</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                      {customer.vehicle_numbers || "—"}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {totalInvoices > 0 ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          {totalInvoices}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">0</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {formatCurrency(totalSpent)}
                    </TableCell>
                    <TableCell>
                      {balanceDue > 0 ? (
                        <Badge variant="destructive" className="font-semibold">
                          {formatCurrency(balanceDue)}
                        </Badge>
                      ) : (
                        <span className="text-xs font-medium text-emerald-600">QAR 0.00</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(customer.created_at)}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                          nativeButton={false}
                          render={
                            <Link href={`/invoices/new?customerId=${customer.id}`}>
                              <PlusIcon className="size-3.5 mr-1" /> Invoice
                            </Link>
                          }
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                          nativeButton={false}
                          render={
                            <Link href={`/invoices/statement?customer_id=${customer.id}`}>
                              <FileTextIcon className="size-3.5 mr-1" /> Statement
                            </Link>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

            {!isLoading && customers?.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                  {debouncedSearch ? "No customers match your search." : "No customers yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {result && (
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
