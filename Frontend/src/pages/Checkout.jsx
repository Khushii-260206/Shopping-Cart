import { useState, useEffect, useContext, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import CartContext from "../context/CartContext";
import Field from "../components/Field";
import PageHeader from "../components/PageHeader";
import ProductImage from "../components/ProductImage";
import { EmptyState } from "../components/States";
import api from "../services/api";
import { formatPrice } from "../utils/format";

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

function Checkout() {
  const navigate = useNavigate();
  const {
    cartItems = [],
    loading = false,
    getCart,
    clearCart,
  } = useContext(CartContext) || {};

  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  // Set only when the server runs the development-only mock payment mode.
  const [mockCheckout, setMockCheckout] = useState(null);
  const dialogRef = useRef(null);
  const placeOrderRef = useRef(null);

  useEffect(() => {
    if (getCart) {
      getCart();
    }
  }, [getCart]);

  const totalAmount = cartItems.reduce(
    (total, item) =>
      total +
      Number(item?.product?.price ?? item?.price ?? 0) *
        Number(item?.quantity ?? 1),
    0
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = "Full Name is required.";
    }

    let cleanPhone = "";
    for (let i = 0; i < formData.phone.length; i++) {
      const char = formData.phone[i];
      if (char !== " " && char !== "-") {
        cleanPhone += char;
      }
    }

    if (!formData.phone.trim()) {
      newErrors.phone = "Phone is required.";
    } else if (
      cleanPhone.length !== 10 ||
      !cleanPhone.split("").every((ch) => ch >= "0" && ch <= "9")
    ) {
      newErrors.phone = "Phone must contain a valid 10-digit number.";
    }

    if (!formData.address.trim()) {
      newErrors.address = "Address is required.";
    }

    if (!formData.city.trim()) {
      newErrors.city = "City is required.";
    }

    if (!formData.state.trim()) {
      newErrors.state = "State is required.";
    }

    const trimmedPincode = formData.pincode.trim();
    if (
      trimmedPincode.length !== 6 ||
      !trimmedPincode.split("").every((ch) => ch >= "0" && ch <= "9")
    ) {
      newErrors.pincode = "Pincode must contain 6 digits.";
    }

    return newErrors;
  };

  const completeOrder = (order) => {
    if (clearCart) clearCart();
    if (getCart) getCart();
    setConfirmedOrder(order);
    setOrderPlaced(true);
    if (order?._id) {
      navigate(`/order-success/${order._id}`);
    }
  };

  const confirmMockPayment = async () => {
    try {
      setIsSubmitting(true);
      setSubmitError("");
      const res = await api.post(`/orders/${mockCheckout.orderId}/mock-pay`);
      setMockCheckout(null);
      completeOrder(res.data.order);
    } catch (err) {
      setMockCheckout(null);
      setSubmitError(
        err.response?.data?.error || "The test payment could not be recorded."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelMockPayment = () => {
    setMockCheckout(null);
    setIsSubmitting(false);
    setTimeout(() => placeOrderRef.current?.focus(), 0);
  };

  // Keyboard support for the test-payment dialog: Escape closes it, Tab stays inside it,
  // and focus returns to the "Place order" button afterwards.
  useEffect(() => {
    if (!mockCheckout) return undefined;

    const closeAndRestoreFocus = () => {
      setMockCheckout(null);
      setIsSubmitting(false);
      setTimeout(() => placeOrderRef.current?.focus(), 0);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeAndRestoreFocus();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled])")];
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mockCheckout]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!cartItems || cartItems.length === 0) {
      setSubmitError("Your cart is empty. Please add items before placing an order.");
      return;
    }

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    setSubmitError("");

    let cleanPhone = "";
    for (let i = 0; i < formData.phone.length; i++) {
      const char = formData.phone[i];
      if (char !== " " && char !== "-") {
        cleanPhone += char;
      }
    }

    const payload = {
      shippingAddress: {
        fullName: formData.fullName.trim(),
        phone: cleanPhone,
        address: formData.address.trim(),
        addressLine1: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        pincode: formData.pincode.trim(),
      },
    };

    try {
      const response = await api.post("/orders/create-payment-order", payload);
      const data = response.data;

      // Development-only mock mode: no payment provider is involved.
      if (data.mock) {
        setMockCheckout({ orderId: data.shopKartOrderId, amount: data.amount });
        setIsSubmitting(false);
        return;
      }

      if (!data.key) {
        setSubmitError("Payments are not available right now. Please try again later.");
        setIsSubmitting(false);
        return;
      }

      // Load Razorpay script
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        setSubmitError(
          "Unable to load Razorpay payment SDK. Please verify your connection."
        );
        setIsSubmitting(false);
        return;
      }

      // Step 10: Open Razorpay Checkout
      const options = {
        key: data.key,
        amount: data.amount,
        currency: data.currency || "INR",
        name: "ShopKart",
        description: "ShopKart Order",
        order_id: data.razorpayOrderId,

        handler: async function (paymentResponse) {
          try {
            setIsSubmitting(true);
            setSubmitError("");

            // Step 11: Call Payment Verification API
            const verifyRes = await api.post("/orders/verify-payment", {
              shopKartOrderId: data.shopKartOrderId,
              razorpay_order_id: paymentResponse.razorpay_order_id,
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_signature: paymentResponse.razorpay_signature,
            });

            if (verifyRes.data?.success) {
              completeOrder(verifyRes.data.order || data.order);
            } else {
              setSubmitError(
                verifyRes.data?.message || "Payment verification failed."
              );
            }
          } catch (verifyErr) {
            const errMessage =
              verifyErr.response?.data?.message ||
              verifyErr.response?.data?.error ||
              "Payment verification failed.";
            const serverOrNetworkProblem =
              !verifyErr.response || verifyErr.response.status >= 500;
            setSubmitError(
              serverOrNetworkProblem
                ? `${errMessage} If you were charged, your order will be confirmed automatically. Please check My orders in a few minutes before paying again.`
                : errMessage
            );
          } finally {
            setIsSubmitting(false);
          }
        },

        prefill: {
          name: formData.fullName.trim(),
          contact: cleanPhone,
        },

        theme: {
          color: "#343238",
        },

        modal: {
          // Closing the Razorpay window without paying must re-enable the form.
          ondismiss: function () {
            setIsSubmitting(false);
          },
        },
      };

      const paymentObject = new window.Razorpay(options);

      paymentObject.on("payment.failed", function (failResponse) {
        console.error("Payment failed", failResponse.error);
        setSubmitError(
          failResponse.error?.description ||
            "Payment failed. Please try again."
        );
        setIsSubmitting(false);
      });

      paymentObject.open();
    } catch (err) {
      const errorMsg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to initiate order.";
      setSubmitError(errorMsg);
      setIsSubmitting(false);
    }
  };

  const fields = [
    { id: "fullName", label: "Full name", type: "text", autoComplete: "name" },
    { id: "phone", label: "Phone", type: "tel", autoComplete: "tel", placeholder: "10-digit number" },
    { id: "address", label: "Address", type: "text", autoComplete: "street-address", wide: true },
    { id: "city", label: "City", type: "text", autoComplete: "address-level2" },
    { id: "state", label: "State", type: "text", autoComplete: "address-level1" },
    { id: "pincode", label: "Pincode", type: "text", autoComplete: "postal-code", inputMode: "numeric", placeholder: "6 digits" },
  ];

  if (orderPlaced) {
    return (
      <div className="page">
        <div className="card mx-auto max-w-xl p-8 text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sage text-3xl text-success"
          >
            ✓
          </div>
          <h1 className="text-3xl">Order placed</h1>
          <p className="mt-2 text-muted">
            Your payment was verified and your order has been saved.
          </p>
          <dl className="mx-auto mt-6 max-w-sm space-y-2 rounded-2xl bg-cream-deep p-4 text-left text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Order ID</dt>
              <dd className="break-all font-mono">
                {confirmedOrder?._id || "Confirmed"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Total</dt>
              <dd className="font-semibold">
                {formatPrice(confirmedOrder?.totalAmount || totalAmount)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Status</dt>
              <dd className="font-semibold text-success">
                {confirmedOrder?.status || "PLACED"}
              </dd>
            </div>
          </dl>
          <Link to="/products" className="btn-primary btn-lg mt-8">
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  if (!loading && cartItems.length === 0) {
    return (
      <div className="page">
        <EmptyState
          icon="🛍️"
          title="Nothing to check out yet"
          message="Your cart is empty. Add a few items to continue."
          actionLabel="Browse products"
          actionTo="/products"
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Almost there" title="Checkout" />

      {mockCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mock-title"
            className="card w-full max-w-md p-7"
          >
            <span className="chip bg-warning-bg text-warning">Development test payment</span>
            <h2 id="mock-title" className="mt-4 text-2xl">
              Pay {formatPrice(mockCheckout.amount / 100)}
            </h2>
            <p className="mt-2 text-sm text-muted">
              The server is in mock-payment mode. No real money is charged and
              no payment provider is contacted. This only simulates a successful
              payment so you can test the order flow.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                autoFocus
                onClick={confirmMockPayment}
                disabled={isSubmitting}
                className="btn-primary btn-lg flex-1"
              >
                {isSubmitting ? "Recording…" : "Simulate successful payment"}
              </button>
              <button
                type="button"
                onClick={cancelMockPayment}
                disabled={isSubmitting}
                className="btn-secondary btn-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start"
      >
        {/* Shipping */}
        <section aria-labelledby="shipping-heading" className="card p-6 sm:p-8">
          <h2 id="shipping-heading" className="text-2xl">
            Shipping details
          </h2>

          {submitError && (
            <div role="alert" className="alert alert-warning mt-5">
              {submitError}
            </div>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {fields.map(({ wide, ...field }) => (
              <Field
                key={field.id}
                {...field}
                value={formData[field.id]}
                onChange={handleChange}
                error={errors[field.id]}
                className={wide ? "sm:col-span-2" : ""}
              />
            ))}
          </div>
        </section>

        {/* Summary */}
        <aside
          aria-labelledby="order-summary-heading"
          className="card gradient-lavender p-6 lg:sticky lg:top-24"
        >
          <h2 id="order-summary-heading" className="text-xl">
            Order summary
          </h2>

          <ul className="mt-5 space-y-4">
            {cartItems.map((item) => {
              const product = item?.product || {};
              const name = product.name || item?.name || "Product";
              const price = Number(product.price ?? item?.price ?? 0);
              const quantity = Number(item?.quantity ?? 1);

              return (
                <li
                  key={product._id || item?._id || name}
                  className="flex items-center gap-3"
                >
                  <ProductImage
                    src={product.image}
                    alt={name}
                    className="h-14 w-14 shrink-0 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted">Qty {quantity}</p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatPrice(price * quantity)}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex justify-between border-t border-lavender-deep pt-4 text-lg font-semibold">
            <span>Total</span>
            <span>{formatPrice(totalAmount)}</span>
          </div>

          <button
            ref={placeOrderRef}
            type="submit"
            disabled={isSubmitting || cartItems.length === 0}
            className="btn-primary btn-lg mt-6 w-full"
          >
            {isSubmitting ? "Processing…" : "Place order & pay"}
          </button>
          <p className="mt-3 text-center text-xs text-muted">
            You&apos;ll complete payment securely with Razorpay.
          </p>
          <Link
            to="/cart"
            className="mt-3 block text-center text-sm font-medium underline-offset-4 hover:underline"
          >
            Back to cart
          </Link>
        </aside>
      </form>
    </div>
  );
}

export default Checkout;
