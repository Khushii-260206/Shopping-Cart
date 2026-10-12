import { useEffect, useState, useContext } from "react";
import { useParams, Link } from "react-router-dom";
import api, { getProduct } from "../services/api";
import { notifyWishlistChanged } from "../services/events";
import CartContext from "../context/CartContext";
import ProductImage from "../components/ProductImage";
import { ErrorState } from "../components/States";
import { formatPrice } from "../utils/format";

function ProductDetails() {
  const { id } = useParams();
  const { addCart } = useContext(CartContext);

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Cart action states
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartSuccess, setCartSuccess] = useState(false);
  const [cartError, setCartError] = useState("");

  // Wishlist action states
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [savingWishlist, setSavingWishlist] = useState(false);
  const [wishlistError, setWishlistError] = useState("");
  const [wishlistSuccess, setWishlistSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getProduct(id);
        if (!cancelled) setProduct(data);
      } catch {
        if (!cancelled) setError("Something went wrong while loading the product.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProduct();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Check if product is in user's wishlist
  useEffect(() => {
    let cancelled = false;

    const checkWishlistStatus = async () => {
      try {
        const response = await api.get("/wishlist");
        if (!cancelled && response.data?.wishlist) {
          const found = response.data.wishlist.some(
            (item) => (item._id || item) === id
          );
          setIsInWishlist(found);
        }
      } catch {
        // Unauthenticated or wishlist empty, ignore
      }
    };

    if (id) {
      checkWishlistStatus();
    }

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAddToCart = async () => {
    if (!product || product.stock === 0) return;

    try {
      setAddingToCart(true);
      setCartError("");
      setCartSuccess(false);

      const result = await addCart(product._id);

      if (result && result.success === false) {
        if (result.status === 401) {
          setCartError("Please log in to add items to your cart.");
        } else {
          setCartError(result.error || "Unable to add product to cart.");
        }
      } else {
        setCartSuccess(true);
        setTimeout(() => setCartSuccess(false), 4000);
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setCartError("Please log in to add items to your cart.");
      } else {
        setCartError(
          err.response?.data?.error || "Unable to add product to cart."
        );
      }
    } finally {
      setAddingToCart(false);
    }
  };

  const handleToggleWishlist = async () => {
    if (!product) return;

    try {
      setSavingWishlist(true);
      setWishlistError("");
      setWishlistSuccess("");

      if (isInWishlist) {
        await api.delete(`/wishlist/${product._id}`);
        setIsInWishlist(false);
        setWishlistSuccess("Removed from your wishlist.");
      } else {
        await api.post(`/wishlist/${product._id}`);
        setIsInWishlist(true);
        setWishlistSuccess("Added to your wishlist!");
      }
      notifyWishlistChanged();
      setTimeout(() => setWishlistSuccess(""), 3000);
    } catch (err) {
      if (err.response?.status === 401) {
        setWishlistError("Please log in to save items to your wishlist.");
      } else if (err.response?.status === 409) {
        setIsInWishlist(true);
        setWishlistError("Product is already in your wishlist.");
      } else {
        setWishlistError(
          err.response?.data?.error ||
            "Unable to update wishlist. Please try again."
        );
      }
    } finally {
      setSavingWishlist(false);
    }
  };

  const backLink = (
    <Link
      to="/products"
      className="mb-6 inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
    >
      <span aria-hidden="true">←</span> Back to products
    </Link>
  );

  if (loading) {
    return (
      <div className="page">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="skeleton aspect-square" role="status" aria-label="Loading product" />
          <div className="space-y-4 pt-4">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-10 w-3/4" />
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-12 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="page">
        {backLink}
        <ErrorState
          title={error ? "Something went wrong" : "Product not found"}
          message={error || "We couldn't find that product."}
        />
      </div>
    );
  }

  const soldOut = !(product.stock > 0);

  return (
    <div className="page">
      {backLink}

      <div className="grid gap-8 md:grid-cols-2 lg:gap-14">
        {/* Image */}
        <div className="card overflow-hidden p-0 md:sticky md:top-24 md:self-start">
          <ProductImage
            src={product.image}
            alt={product.name}
            className="aspect-square w-full"
          />
        </div>

        {/* Details */}
        <div className="flex flex-col">
          <p className="eyebrow">{product.category}</p>

          <h1 className="mt-2 text-3xl leading-tight sm:text-5xl">
            {product.name}
          </h1>

          <p className="mt-5 text-3xl font-semibold">
            {formatPrice(product.price)}
          </p>

          <p
            className={`chip mt-4 self-start ${
              soldOut ? "bg-danger-bg text-danger" : "bg-sage text-success"
            }`}
          >
            {soldOut ? "Out of stock" : `${product.stock} available`}
          </p>

          <p className="mt-6 leading-relaxed text-muted">
            {product.description}
          </p>

          {/* Feedback */}
          <div aria-live="polite" className="mt-6 space-y-3 empty:hidden">
            {cartSuccess && (
              <div className="alert alert-success flex items-center justify-between gap-3">
                <span>✓ Added to your cart.</span>
                <Link to="/cart" className="font-semibold underline">
                  View cart
                </Link>
              </div>
            )}
            {cartError && <div className="alert alert-error">{cartError}</div>}
            {wishlistSuccess && (
              <div className="alert alert-success">{wishlistSuccess}</div>
            )}
            {wishlistError && (
              <div className="alert alert-warning">{wishlistError}</div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={soldOut || addingToCart}
              className="btn-primary btn-lg flex-1"
            >
              {addingToCart
                ? "Adding to cart…"
                : soldOut
                ? "Out of stock"
                : "Add to cart"}
            </button>

            <button
              type="button"
              onClick={handleToggleWishlist}
              disabled={savingWishlist}
              aria-pressed={isInWishlist}
              className={`btn-lg ${
                isInWishlist ? "btn-secondary gradient-selected border-blush-deep" : "btn-secondary"
              }`}
            >
              <span aria-hidden="true">{isInWishlist ? "♥" : "♡"}</span>
              {savingWishlist
                ? "Updating…"
                : isInWishlist
                ? "Saved"
                : "Save to wishlist"}
            </button>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-line pt-5 text-sm">
            <Link to="/cart" className="font-medium underline-offset-4 hover:underline">
              Go to cart
            </Link>
            <Link to="/wishlist" className="font-medium underline-offset-4 hover:underline">
              View wishlist
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetails;
