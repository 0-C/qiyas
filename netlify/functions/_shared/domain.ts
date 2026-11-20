export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const DEFAULT_FIELDS = [
  { key: "length", label: "Dishdasha length", labelAr: "طول الدشداشة" },
  { key: "shoulder", label: "Shoulder width", labelAr: "عرض الكتفين" },
  { key: "chest", label: "Chest circumference", labelAr: "محيط الصدر" },
  { key: "waist", label: "Waist circumference", labelAr: "محيط الخصر" },
  { key: "hip", label: "Hip circumference", labelAr: "محيط الورك" },
  { key: "sleeve", label: "Sleeve length", labelAr: "طول الكم" },
  { key: "wrist", label: "Wrist circumference", labelAr: "محيط المعصم" },
  { key: "neck", label: "Neck circumference", labelAr: "محيط الرقبة" },
] as const;

export type MeasureUnit = "cm" | "in";
export type MeasureMethod = "body" | "flat" | "finished";
export type PaymentStatus = "unpaid" | "part_paid" | "paid";
export type ProductionStatus = "in_progress" | "finished";
export type HandoverStatus =
  | "awaiting_collection"
  | "delivery_requested"
  | "with_driver"
  | "delivered";
export type DueGroup = "overdue" | "today" | "tomorrow" | "upcoming" | "past";
export type AgeTone = "green" | "orange" | "red";
export type TemplateId = "order_created_unpaid" | "finished_paid" | "finished_unpaid";

const KUWAIT = "Asia/Kuwait";

export function kuwaitToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KUWAIT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function kuwaitDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KUWAIT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
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

export function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

export function toFils(value: string | number): number {
  const raw = String(value).trim();
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  const fils = Number(whole || "0") * 1000 + Number((fraction + "000").slice(0, 3));
  if (!Number.isFinite(fils)) throw new HttpError(400, "Invalid amount.");
  return negative ? -fils : fils;
}

export function fromFils(fils: number): string {
  const negative = fils < 0;
  const absolute = Math.abs(Math.round(fils));
  const whole = Math.trunc(absolute / 1000);
  const fraction = String(absolute % 1000).padStart(3, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function formatKd(value: string): string {
  return `KD ${fromFils(toFils(value))}`;
}

export function parseKd(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return null;
    return fromFils(Math.round(value * 1000));
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) return null;
  const fils = toFils(trimmed);
  if (fils > 1_000_000_000) return null;
  return fromFils(fils);
}

export function paymentStatus(total: string, paid: string): PaymentStatus {
  const totalFils = toFils(total);
  const paidFils = toFils(paid);
  if (paidFils <= 0 && totalFils > 0) return "unpaid";
  if (paidFils < totalFils) return "part_paid";
  return "paid";
}

export function dueGroup(expected: string, today: string, production: ProductionStatus): DueGroup {
  if (production === "finished") return "past";
  const diff = daysBetween(today, expected);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return "upcoming";
}

export function measurementAge(takenAt: Date | string, greenDays: number, orangeDays: number, today: string) {
  const ageDays = Math.max(0, daysBetween(kuwaitDate(takenAt), today));
  let ageTone: AgeTone = "green";
  let ageBand = "Recent";
  if (ageDays >= orangeDays) {
    ageTone = "red";
    ageBand = "Retake";
  } else if (ageDays >= greenDays) {
    ageTone = "orange";
    ageBand = "Check fit";
  }
  const agePhrase =
    ageDays === 0 ? "Measured today" : ageDays === 1 ? "Measured 1 day ago" : `Measured ${ageDays} days ago`;
  return { ageDays, ageTone, ageBand, agePhrase };
}

export function whenPhrase(expected: string, today: string): string {
  const diff = daysBetween(today, expected);
  if (diff < 0) return `on ${formatLong(expected)}`;
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 14) return `in ${diff} days`;
  return `on ${formatLong(expected)}`;
}

export function normalizePhone(input: string): { phone: string; digits: string } | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!(digits.startsWith("965") && digits.length === 11) && digits.length === 8) {
    digits = `965${digits}`;
  }
  if (digits.startsWith("965") && digits.length === 11) {
    const local = digits.slice(3);
    return { phone: `+965 ${local.slice(0, 4)} ${local.slice(4)}`, digits };
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return { phone: `+${digits}`, digits };
  }
  return null;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function pieceLabelList(code: string, pieceCount: number, pieceLabel: string | null): string[] {
  if (pieceLabel) return [pieceLabel];
  return Array.from({ length: pieceCount }, (_, index) => `${code}-${index + 1}`);
}

export function asText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

export function trackingToken(): string {
  const bytes = new Uint8Array(18);
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.getRandomValues) {
    throw new HttpError(500, "Secure random numbers are unavailable.");
  }
  webCrypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
