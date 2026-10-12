import { useContext, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { notifyWishlistChanged } from "../services/events";
import CartContext from "../context/CartContext";
import { formatPrice } from "../utils/format";
import ProductImage from "./ProductImage";

function ProductCard({ product }) {
  const { addCart } = useContext(CartContext);
  const [saving, setSaving] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartAdded, setCartAdded] = useState(false);
  const [cartError, setCartError] = useState("");
  const [wishlistAdded, setWishlistAdded] = useState(false);
  const [wishlistError, setWishlistError] = useState("");

  const soldOut = !(product.stock > 0);

  const handleAddCart = async () => {
    try {
      setAddingToCart(true);
      setCartError("");
      const result = await addCart(product._id);
      if (result?.success === false) {
        setCartError(result.error);
      } else {
        setCartAdded(true);
        setTimeout(() => setCartAdded(false), 2500);
      }
    } finally {
      setAddingToCart(false);
    }
  };

  const handleAddWishlist = async () => {
    try {
      setSaving(true);
      setWishlistError("");

      await api.post(`/wishlist/${product._id}`);

      setWishlistAdded(true);
      notifyWishlistChanged();
    } catch (err) {
      if (err.response?.status === 409) {
        setWishlistAdded(true);
        setWishlistError("Product is already in your wishlist.");
      } else {
        setWishlistError("Unable to save product. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="card group flex flex-col overflow-hidden transition duration-200 hover:-translate-y-1 hover:shadow-lift">
      <div className="relative">
        <Link
          to={`/products/${product._id}`}
          aria-label={`View details for ${product.name}`}
        >
          <ProductImage
            src={product.image}
            alt={product.name}
            className="aspect-4/5 w-full transition duration-500 group-hover:scale-[1.03]"
          />
        </Link>

        <button
          type="button"
          onClick={handleAddWishlist}
          disabled={saving || wishlistAdded}
          aria-label={
            wishlistAdded
              ? `${product.name} is in your wishlist`
              : `Add ${product.name} to wishlist`
          }
          aria-pressed={wishlistAdded}
          className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-lg shadow-soft transition hover:bg-blush disabled:cursor-default ${wishlistAdded ? "gradient-selected" : "bg-white/90"}`}
        >
          <span aria-hidden="true">{wishlistAdded ? "♥" : "♡"}</span>
        </button>

        {soldOut && (
          <span className="chip absolute left-3 top-3 bg-white/90 text-muted">
            Sold out
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="eyebrow">{product.category}</p>
        <h2 className="mt-1 text-lg leading-snug">
          <Link to={`/products/${product._id}`} className="hover:underline">
            {product.name}
          </Link>
        </h2>

        <div className="mt-2 flex items-baseline justify-between gap-2">
          <p className="text-lg font-semibold">{formatPrice(product.price)}</p>
          {!soldOut && product.stock <= 5 && (
            <p className="text-xs font-medium text-warning">
              Only {product.stock} left
            </p>
          )}
        </div>

        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={handleAddCart}
            disabled={addingToCart || soldOut}
            className="btn-primary w-full"
          >
            {soldOut
              ? "Out of stock"
              : addingToCart
              ? "Adding…"
              : cartAdded
              ? "✓ Added to cart"
              : "Add to cart"}
          </button>
        </div>

        <div aria-live="polite">
          {(cartError || wishlistError) && (
            <p className="mt-3 text-sm text-danger">{cartError || wishlistError}</p>
          )}
        </div>
      </div>
    </article>
  );
}

export default ProductCard;
