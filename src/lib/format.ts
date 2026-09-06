/**
 * src/lib/format.ts
 *
 * Shared display formatting so every module renders money/dates the same way.
 */

const currencyFormatter = new Intl.NumberFormat("en-QA", {
  style: "currency",
  currency: "QAR",
});

export function formatCurrency(amount: number) {
  return currencyFormatter.format(amount);
}

const dateFormatter = new Intl.DateTimeFormat("en-QA", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatDate(value: string | Date) {
  return dateFormatter.format(new Date(value));
}
