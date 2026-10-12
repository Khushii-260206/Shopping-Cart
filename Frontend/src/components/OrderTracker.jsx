import { STATUS_STEPS, statusLabel } from "../utils/orderStatus";

const BADGE_TONES = {
  PENDING_PAYMENT: "bg-warning-bg text-warning",
  PLACED: "bg-lavender text-ink",
  CONFIRMED: "bg-blush text-ink",
  SHIPPED: "bg-lavender text-ink",
  DELIVERED: "bg-sage text-success",
};

export function StatusBadge({ status }) {
  return (
    <span className={`chip ${BADGE_TONES[status] || "bg-lavender text-ink"}`}>
      {statusLabel(status)}
    </span>
  );
}

function OrderTracker({ status }) {
  const current = STATUS_STEPS.indexOf(status);

  // Unpaid orders have not entered the fulfilment flow yet.
  if (current < 0) return null;

  return (
    <ol className="flex items-start" aria-label="Order progress">
      {STATUS_STEPS.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;
        const isLast = idx === STATUS_STEPS.length - 1;

        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className={`flex items-start ${isLast ? "" : "flex-1"}`}
          >
            <div className="flex flex-col items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? "bg-sage-deep text-ink"
                    : active
                    ? "bg-ink text-cream ring-4 ring-lavender"
                    : "border border-line bg-white text-muted"
                }`}
              >
                {done ? "✓" : idx + 1}
              </span>
              <span
                className={`text-xs ${
                  active ? "font-semibold text-ink" : "text-muted"
                }`}
              >
                {statusLabel(step)}
              </span>
            </div>
            {!isLast && (
              <span
                aria-hidden="true"
                className={`mx-2 mt-4 h-0.5 flex-1 rounded-full ${
                  done ? "bg-sage-deep" : "bg-line"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default OrderTracker;
