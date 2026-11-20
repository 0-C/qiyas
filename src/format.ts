import type { HandoverStatus, MeasureMethod, PaymentStatus, ProductionStatus } from "./types";

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  part_paid: "Part-paid",
  paid: "Paid",
};

export const HANDOVER_LABEL: Record<HandoverStatus, string> = {
  awaiting_collection: "Awaiting collection",
  delivery_requested: "Delivery requested",
  with_driver: "With driver",
  delivered: "Delivered",
};

export const PRODUCTION_LABEL: Record<ProductionStatus, string> = {
  in_progress: "In progress",
  finished: "Finished",
};

export const METHOD_LABEL: Record<MeasureMethod, string> = {
  body: "Measured on body",
  flat: "Flat on garment",
  finished: "Finished garment",
};

export const TEMPLATE_LABEL: Record<string, string> = {
  order_created_unpaid: "Order created, unpaid",
  finished_paid: "Finished and paid",
  finished_unpaid: "Finished and unpaid",
};

export const BAND_HINT: Record<string, string> = {
  Recent: "Check that the customer is comfortable reusing these.",
  "Check fit": "Ask whether the fit has changed and verify key measurements.",
  Retake: "Consider taking a new set before cutting the fabric.",
};

export function formatKd(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value);
  return `KD ${amount.toFixed(3)}`;
}

export function formatLong(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kuwait",
  }).format(new Date(iso));
}

export function formatWeekday(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function duePhrase(expected: string, today: string): string {
  const diff = daysBetween(today, expected);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "1 day overdue";
  if (diff < 0) return `${-diff} days overdue`;
  return `In ${diff} days`;
}

export function piecesLabel(count: number): string {
  return count === 1 ? "1 piece" : `${count} pieces`;
}

export function formatMeasure(value: number | undefined, unit: string): string {
  if (value == null || Number.isNaN(value)) return "—";
  const text = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return `${text} ${unit}`;
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
