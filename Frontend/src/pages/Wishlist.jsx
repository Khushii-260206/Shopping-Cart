import { useEffect, useState } from "react";
import api from "../services/api";
import { notifyWishlistChanged } from "../services/events";
import WishlistCard from "../components/WishlistCard";
import PageHeader from "../components/PageHeader";
import {
  EmptyState,
  ErrorState,
  ProductGridSkeleton,
} from "../components/States";

function Wishlist() {
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [removingId, setRemovingId] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchWishlist = async () => {
      try {
        const response = await api.get("/wishlist");
        if (!cancelled) setWishlist(response.data.wishlist);
      } catch {
        if (!cancelled) setError("Unable to load wishlist.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWishlist();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setLoading(true);
    setError("");
    setReloadKey((key) => key + 1);
  };

  const handleRemove = async (productId) => {
    try {
      setRemovingId(productId);
      setRemoveError("");

      await api.delete(`/wishlist/${productId}`);

      setWishlist((currentWishlist) =>
        currentWishlist.filter((product) => product._id !== productId)
      );
      notifyWishlistChanged();
    } catch {
      setRemoveError("Unable to remove product from wishlist.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Saved for later"
        title="My wishlist"
        subtitle={
          !loading && !error && wishlist.length > 0
            ? `${wishlist.length} ${wishlist.length === 1 ? "product" : "products"} saved`
            : undefined
        }
      />

      {removeError && (
        <p role="alert" className="alert alert-error mb-6">
          {removeError}
        </p>
      )}

      {loading && <ProductGridSkeleton count={4} />}

      {!loading && error && (
        <ErrorState message={error} onRetry={retry} />
      )}

      {!loading && !error && wishlist.length === 0 && (
        <EmptyState
          icon="♡"
          title="Your wishlist is empty"
          message="Save products you love and find them here later."
          actionLabel="Browse products"
          actionTo="/products"
        />
      )}

      {!loading && !error && wishlist.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {wishlist.map((product) => (
            <WishlistCard
              key={product._id}
              product={product}
              onRemove={handleRemove}
              removing={removingId === product._id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default Wishlist;
