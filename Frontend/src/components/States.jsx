import { Link } from "react-router-dom";

export function Spinner({ label = "Loading" }) {
  return (
    <span role="status" className="inline-flex items-center gap-3 text-muted">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-lavender-deep border-t-ink"
      />
      <span className="text-sm">{label}</span>
    </span>
  );
}

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }) {
  return (
    <div
      role="status"
      aria-label="Loading products"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card overflow-hidden p-0">
          <div className="skeleton aspect-4/5 rounded-none" />
          <div className="space-y-3 p-5">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-5 w-3/4" />
            <div className="skeleton h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

const TONES = {
  blush: "gradient-blush border border-blush-deep/40",
  lavender: "gradient-lavender border border-lavender-deep/50",
  sage: "gradient-sage border border-sage-deep/50",
};

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  actionTo,
  tone = "blush",
}) {
  return (
    <div className="card mx-auto max-w-xl px-6 py-14 text-center">
      <div
        aria-hidden="true"
        className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full text-3xl ${TONES[tone]}`}
      >
        {icon}
      </div>
      <h2 className="text-2xl">{title}</h2>
      {message && <p className="mt-2 text-muted">{message}</p>}
      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn-primary btn-lg mt-7">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }) {
  return (
    <div role="alert" className="card mx-auto max-w-xl px-6 py-12 text-center">
      <div
        aria-hidden="true"
        className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-danger-bg text-3xl"
      >
        !
      </div>
      <h2 className="text-2xl">{title}</h2>
      {message && <p className="mt-2 text-danger">{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-primary btn-lg mt-7">
          Try again
        </button>
      )}
    </div>
  );
}
