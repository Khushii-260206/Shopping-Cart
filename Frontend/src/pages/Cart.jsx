import { useContext, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import CartContext from "../context/CartContext";
import PageHeader from "../components/PageHeader";
import ProductImage from "../components/ProductImage";
import { EmptyState, LoadingState } from "../components/States";
import { formatPrice } from "../utils/format";

function Cart() {
  const navigate = useNavigate();
  const {
    cartItems,
    loading,
    error,
    updateCart,
    deleteCart,
    getCart,
  } = useContext(CartContext);

  useEffect(() => {
    getCart();
  }, [getCart]);

  const itemCount = cartItems.reduce(
    (total, item) => total + item.quantity,
    0
  );
  const subtotal = cartItems.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0
  );

  const handleDecrease = (item) => {
    if (item.quantity === 1) {
      deleteCart(item.product._id);
      return;
    }

    updateCart(item.product._id, item.quantity - 1);
  };

  if (loading && cartItems.length === 0) {
    return (
      <div className="page">
        <LoadingState label="Loading your cart…" />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Your bag"
        title="Shopping cart"
        subtitle={
          cartItems.length > 0
            ? `${itemCount} ${itemCount === 1 ? "item" : "items"}`
            : undefined
        }
      />

      {error && (
        <p role="alert" className="alert alert-error mb-6">
          {error}
        </p>
      )}

      {cartItems.length === 0 ? (
        <EmptyState
          icon="🛍️"
          title="Your cart is empty"
          message="Add a few things you love and they'll show up here."
          actionLabel="Browse products"
          actionTo="/products"
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <ul className="card divide-y divide-line">
            {cartItems.map((item) => {
              const product = item.product;

              return (
                <li
                  key={product._id}
                  className="flex gap-4 p-4 sm:gap-6 sm:p-6"
                >
                  <Link
                    to={`/products/${product._id}`}
                    className="shrink-0"
                    aria-label={`View ${product.name}`}
                  >
                    <ProductImage
                      src={product.image}
                      alt={product.name}
                      className="h-24 w-24 rounded-2xl sm:h-32 sm:w-32"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/products/${product._id}`}
                          className="font-display text-lg leading-snug hover:underline"
                        >
                          {product.name}
                        </Link>
                        <p className="mt-1 text-sm text-muted">
                          {formatPrice(product.price)} each
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">
                        {formatPrice(product.price * item.quantity)}
                      </p>
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                      <div
                        role="group"
                        aria-label={`Quantity for ${product.name}`}
                        className="flex items-center rounded-full border border-line bg-cream"
                      >
                        <button
                          type="button"
                          onClick={() => handleDecrease(item)}
                          disabled={loading}
                          aria-label={`Decrease ${product.name} quantity`}
                          className="h-9 w-9 rounded-full text-lg transition hover:bg-blush disabled:opacity-50"
                        >
                          −
                        </button>
                        <span
                          className="min-w-8 text-center text-sm font-semibold"
                          aria-live="polite"
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCart(product._id, item.quantity + 1)}
                          disabled={loading || item.quantity >= product.stock}
                          aria-label={`Increase ${product.name} quantity`}
                          className="h-9 w-9 rounded-full text-lg transition hover:bg-lavender disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteCart(product._id)}
                        disabled={loading}
                        className="text-sm font-medium text-muted underline-offset-4 hover:text-danger hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <aside
            aria-labelledby="summary-heading"
            className="card gradient-lavender p-6 lg:sticky lg:top-24"
          >
            <h2 id="summary-heading" className="text-xl">
              Order summary
            </h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Items</dt>
                <dd>{itemCount}</dd>
              </div>
              <div className="flex justify-between border-t border-lavender-deep pt-4 text-lg font-semibold">
                <dt>Subtotal</dt>
                <dd>{formatPrice(subtotal)}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => navigate("/checkout")}
              disabled={loading}
              className="btn-primary btn-lg mt-6 w-full"
            >
              Proceed to checkout
            </button>
            <Link
              to="/products"
              className="mt-3 block text-center text-sm font-medium underline-offset-4 hover:underline"
            >
              Continue shopping
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}

export default Cart;
