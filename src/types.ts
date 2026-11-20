export type PaymentStatus = "unpaid" | "part_paid" | "paid";
export type ProductionStatus = "in_progress" | "finished";
export type HandoverStatus =
  | "awaiting_collection"
  | "delivery_requested"
  | "with_driver"
  | "delivered";
export type MeasureMethod = "body" | "flat" | "finished";
export type MeasureUnit = "cm" | "in";
export type DueGroup = "overdue" | "today" | "tomorrow" | "upcoming" | "past";

export interface Shop {
  id: string;
  name: string;
  greenDays: number;
  orangeDays: number;
  deliveryFee: string;
  notificationsEnabled: boolean;
  createdAt: string;
}

export interface MeasurementField {
  id: string;
  key: string;
  label: string;
  labelAr: string | null;
  isCustom: boolean;
  sortOrder: number;
  active: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  createdOn: string;
  daysAsCustomer: number;
  isNew: boolean;
}

export interface MeasurementSet {
  id: string;
  takenAt: string;
  takenOn: string;
  unit: MeasureUnit;
  method: MeasureMethod;
  easeIncluded: boolean;
  values: Record<string, number>;
  ageDays: number;
  ageTone: "green" | "orange" | "red";
  ageBand: string;
  agePhrase: string;
}

export interface Payment {
  id: string;
  amount: string;
  source: "in_shop" | "link";
  note: string;
  createdAt: string;
}

export interface MessageLog {
  id: string;
  channel: string;
  template: string;
  text: string;
  status: string;
  provider: string;
  detail: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  measurementSetId: string | null;
  code: string;
  pieceCount: number;
  pieceLabels: string[];
  pieceLabel: string | null;
  originalDueDate: string;
  expectedDueDate: string;
  totalAmount: string;
  amountPaid: string;
  balance: string;
  deliveryFeeApplied: boolean;
  fabricNotes: string;
  styleNotes: string;
  productionStatus: ProductionStatus;
  finishedAt: string | null;
  handoverStatus: HandoverStatus;
  trackingPath: string;
  notificationsMuted: boolean;
  isAdjustment: boolean;
  parentOrderId: string | null;
  parentCode: string | null;
  adjustmentNote: string | null;
  paymentStatus: PaymentStatus;
  dueGroup: DueGroup;
  createdAt: string;
  payments?: Payment[];
  messages?: MessageLog[];
}

export interface CustomerProfile {
  today: string;
  suggestedDueDate: string;
  shop: Shop;
  fields: MeasurementField[];
  customer: Customer;
  measurements: MeasurementSet[];
  orders: Order[];
}

export interface DashboardData {
  shop: Shop;
  today: string;
  groups: Record<"overdue" | "today" | "tomorrow" | "upcoming", Order[]>;
}

export type SearchResult =
  | { result: "customer"; customerId: string }
  | { result: "order"; customerId: string; orderId: string }
  | { result: "create"; phone: string }
  | { result: "none"; message: string };

export interface Tracking {
  shopName: string;
  customerFirstName: string;
  code: string;
  pieceCount: number;
  pieceLabels: string[];
  isAdjustment: boolean;
  productionStatus: ProductionStatus;
  finishedAt: string | null;
  expectedDueDate: string;
  originalDueDate: string;
  expectedLabel: string;
  paymentStatus: PaymentStatus;
  totalAmount: string;
  amountPaid: string;
  balance: string;
  handoverStatus: HandoverStatus;
  deliveryFee: string;
  deliveryFeeApplied: boolean;
  today: string;
}
