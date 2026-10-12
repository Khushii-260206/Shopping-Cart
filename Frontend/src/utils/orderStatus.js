export const STATUS_STEPS = ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED"];

const LABELS = {
  PENDING_PAYMENT: "Awaiting payment",
  PLACED: "Placed",
  CONFIRMED: "Confirmed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

export const statusLabel = (status) => LABELS[status] || status || "Placed";
