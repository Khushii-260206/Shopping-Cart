import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { getErrorMessage } from "../services/api";
import OrderTracker, { StatusBadge } from "../components/OrderTracker";
import { STATUS_STEPS, statusLabel } from "../utils/orderStatus";
import PageHeader from "../components/PageHeader";
import { EmptyState, ErrorState } from "../components/States";
import { formatDate, formatPrice } from "../utils/format";

function Orders() {
  const user = useOutletContext();
  const isAdmin = Boolean(user?.isAdmin);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchOrders = async () => {
      try {
        const res = await api.get("/orders");
        if (cancelled) return;
        if (res.data?.orders) {
          setOrders(res.data.orders);
        } else if (Array.isArray(res.data)) {
          setOrders(res.data);
        } else {
          setOrders([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Unable to load orders. Please try again."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOrders();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setLoading(true);
    setError("");
    setReloadKey((key) => key + 1);
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      setUpdatingId(orderId);
      setActionError("");
      await api.patch(`/orders/${orderId}/status`, { status: newStatus });
      setOrders((prev) =>
        prev.map((o) => (o._id === orderId ? { ...o, status: newStatus } : o))
      );
    } catch (err) {
      setActionError(
        "Failed to update status: " + getErrorMessage(err, err.message)
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="page max-w-4xl">
      <PageHeader
        eyebrow="Order history"
        title="My orders"
        subtitle={
          !loading && !error && orders.length > 0
            ? `${orders.length} ${orders.length === 1 ? "order" : "orders"}`
            : undefined
        }
      />

      {actionError && (
        <p role="alert" className="alert alert-error mb-6">
          {actionError}
        </p>
      )}

      {loading && (
        <div role="status" aria-label="Loading orders" className="space-y-6">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-56" />
          ))}
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={retry} />}

      {!loading && !error && orders.length === 0 && (
        <EmptyState
          icon="📦"
          title="No orders yet"
          message="Browse the collection and make your first purchase."
          actionLabel="Start shopping"
          actionTo="/products"
          tone="sage"
        />
      )}

      {!loading && !error && orders.length > 0 && (
        <ul className="space-y-6">
          {orders.map((order) => {
            const awaitingPayment = order.status === "PENDING_PAYMENT";

            return (
              <li key={order._id}>
                <article className="card overflow-hidden">
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-cream-deep/60 px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <p className="eyebrow">Order</p>
                      <h2 className="mt-0.5 break-all font-mono text-sm font-medium">
                        #{order._id}
                      </h2>
                      <p className="mt-0.5 text-sm text-muted">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.paymentMode === "MOCK" && (
                        <span className="chip bg-warning-bg text-warning">Test payment</span>
                      )}
                      <StatusBadge status={order.status || "PLACED"} />
                    </div>
                  </div>

                  {/* Progress */}
                  {!awaitingPayment && (
                    <div className="border-b border-line px-5 py-5 sm:px-8">
                      <OrderTracker status={order.status || "PLACED"} />
                    </div>
                  )}

                  {/* Items */}
                  <div className="p-5 sm:p-6">
                    <ul className="space-y-2 text-sm">
                      {order.items?.map((item, idx) => (
                        <li
                          key={item.product || idx}
                          className="flex justify-between gap-4"
                        >
                          <span>
                            {item.name}{" "}
                            <span className="text-muted">× {item.quantity}</span>
                          </span>
                          <span className="font-medium">
                            {formatPrice(item.price * item.quantity)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
                      <p className="text-lg font-semibold">
                        Total {formatPrice(order.totalAmount)}
                      </p>

                      <div className="flex flex-wrap items-center gap-3">
                        {/* Only administrators can move paid orders through fulfilment. */}
                        {isAdmin && !awaitingPayment && (
                          <div className="flex items-center gap-2 rounded-full bg-lavender/60 px-3 py-1 text-xs">
                            <label
                              htmlFor={`status-${order._id}`}
                              className="text-muted"
                            >
                              Admin: status
                            </label>
                            <select
                              id={`status-${order._id}`}
                              value={order.status || "PLACED"}
                              onChange={(e) =>
                                handleStatusUpdate(order._id, e.target.value)
                              }
                              disabled={updatingId === order._id}
                              className="cursor-pointer rounded-full border border-lavender-deep bg-white px-2 py-1 font-semibold disabled:opacity-50"
                            >
                              {STATUS_STEPS.map((s) => (
                                <option key={s} value={s}>
                                  {statusLabel(s)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {awaitingPayment && (
                          <Link to="/checkout" className="btn-secondary">
                            Complete payment
                          </Link>
                        )}
                        <Link to={`/orders/${order._id}`} className="btn-primary">
                          View details
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Orders;
