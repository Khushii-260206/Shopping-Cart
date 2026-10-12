import { useEffect, useState } from "react";
import { useParams, Link, useLocation, useOutletContext } from "react-router-dom";
import api, { getErrorMessage } from "../services/api";
import OrderTracker, { StatusBadge } from "../components/OrderTracker";
import { STATUS_STEPS, statusLabel } from "../utils/orderStatus";
import ProductImage from "../components/ProductImage";
import { ErrorState } from "../components/States";
import { formatDate, formatPrice } from "../utils/format";

function OrderConfirmation() {
  const user = useOutletContext();
  const isAdmin = Boolean(user?.isAdmin);
  const { id } = useParams();
  const { pathname } = useLocation();
  const justPlaced = pathname.startsWith("/order-success");

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");

  const handleStatusUpdate = async (newStatus) => {
    if (!order?._id) return;
    try {
      setUpdating(true);
      setUpdateError("");
      await api.patch(`/orders/${order._id}/status`, { status: newStatus });
      setOrder((prev) => (prev ? { ...prev, status: newStatus } : prev));
    } catch (err) {
      setUpdateError(
        "Failed to update status: " + getErrorMessage(err, err.message)
      );
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const fetchOrder = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await api.get(`/orders/${id}`);
        if (!cancelled) setOrder(res.data.order || res.data);
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Unable to load order details."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (id) {
      fetchOrder();
    }

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="page max-w-3xl">
        <div role="status" aria-label="Loading order" className="space-y-5">
          <div className="skeleton h-40" />
          <div className="skeleton h-64" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="page">
        <ErrorState
          title="Order not found"
          message={error || "Could not locate this order."}
        />
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/orders" className="btn-primary">
            View my orders
          </Link>
          <Link to="/products" className="btn-secondary">
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  const { shippingAddress, items = [], totalAmount, status, createdAt } = order;
  const awaitingPayment = status === "PENDING_PAYMENT";
  const paid = order.paymentStatus === "PAID";

  return (
    <div className="page max-w-3xl">
      {/* Banner */}
      <section
        className={`card mb-6 px-6 py-10 text-center ${
          awaitingPayment ? "bg-warning-bg" : "gradient-sage"
        }`}
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl text-success"
        >
          {awaitingPayment ? "…" : "✓"}
        </div>
        <h1 className="text-3xl sm:text-4xl">
          {awaitingPayment
            ? "Awaiting payment"
            : justPlaced
            ? "Thank you — your order is placed"
            : "Order details"}
        </h1>
        <p className="mt-2 text-muted">
          {awaitingPayment
            ? "This order has not been paid for yet."
            : justPlaced
            ? "Your payment was verified and your order has been saved."
            : "Here's everything about this order."}
        </p>
      </section>

      <div className="card divide-y divide-line">
        {/* Meta */}
        <section className="space-y-3 p-6 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-muted">Order ID</span>
            <span className="break-all font-mono">{order._id}</span>
          </div>
          {createdAt && (
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-muted">Placed on</span>
              <span>{formatDate(createdAt, true)}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted">Status</span>
            <StatusBadge status={status || "PLACED"} />
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-muted">Payment</span>
            <span className="font-medium">
              {paid ? "Paid" : order.paymentStatus === "FAILED" ? "Failed" : "Pending"}
              {order.paymentMode === "MOCK" && (
                <span className="chip ml-2 bg-warning-bg text-warning">Test payment</span>
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2 border-t border-line pt-3 text-base font-semibold">
            <span>Total</span>
            <span>{formatPrice(totalAmount)}</span>
          </div>
        </section>

        {awaitingPayment && (
          <section className="p-6 text-center">
            <p className="text-sm text-muted">
              Your items are still in your cart. Complete checkout to pay for this order.
            </p>
            <Link to="/checkout" className="btn-primary btn-lg mt-4">
              Complete payment
            </Link>
          </section>
        )}

        {/* Progress */}
        {!awaitingPayment && (
          <section className="p-6 sm:px-8">
            <h2 className="mb-5 text-lg">Order progress</h2>
            <OrderTracker status={status || "PLACED"} />

            {/* Only administrators can move paid orders through fulfilment. */}
            {isAdmin && (
            <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl bg-lavender/60 px-4 py-3 text-sm">
              <label htmlFor="demo-status" className="text-muted">
                Admin: update status
              </label>
              <select
                id="demo-status"
                value={status || "PLACED"}
                onChange={(e) => handleStatusUpdate(e.target.value)}
                disabled={updating}
                className="cursor-pointer rounded-full border border-lavender-deep bg-white px-3 py-1 text-xs font-semibold disabled:opacity-50"
              >
                {STATUS_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            )}
            {updateError && (
              <p role="alert" className="alert alert-error mt-3">
                {updateError}
              </p>
            )}
          </section>
        )}

        {/* Shipping */}
        {shippingAddress && (
          <section className="p-6">
            <h2 className="mb-3 text-lg">Shipping to</h2>
            <address className="space-y-0.5 text-sm not-italic text-muted">
              <p className="font-medium text-ink">{shippingAddress.fullName}</p>
              <p>{shippingAddress.phone}</p>
              <p>{shippingAddress.addressLine1 || shippingAddress.address}</p>
              <p>
                {shippingAddress.city}, {shippingAddress.state} –{" "}
                {shippingAddress.pincode}
              </p>
            </address>
          </section>
        )}

        {/* Items */}
        <section className="p-6">
          <h2 className="mb-4 text-lg">Items</h2>
          <ul className="space-y-4">
            {items.map((item, idx) => (
              <li key={item.product || idx} className="flex items-center gap-4">
                <ProductImage
                  src={item.image}
                  alt={item.name}
                  className="h-16 w-16 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-sm text-muted">
                    {formatPrice(item.price)} × {item.quantity}
                  </p>
                </div>
                <p className="font-semibold">
                  {formatPrice(item.price * item.quantity)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Actions */}
        <section className="flex flex-wrap justify-center gap-3 bg-cream-deep/60 p-6">
          <Link to="/orders" className="btn-primary">
            View my orders
          </Link>
          <Link to="/products" className="btn-secondary">
            Continue shopping
          </Link>
        </section>
      </div>
    </div>
  );
}

export default OrderConfirmation;
