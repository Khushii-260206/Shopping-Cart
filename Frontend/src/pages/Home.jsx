import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { getProducts } from "../services/api";
import ProductCard from "../components/ProductCard";
import { ProductGridSkeleton } from "../components/States";

const CATEGORIES = [
  { name: "Fashion", tone: "gradient-blush", blurb: "Wardrobe pieces" },
  { name: "Home", tone: "gradient-sage", blurb: "Calm, cosy spaces" },
  { name: "Books", tone: "gradient-lavender", blurb: "Stories to keep" },
  { name: "Electronics", tone: "gradient-cream", blurb: "Everyday tech" },
];

function Home() {
  const user = useOutletContext();
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getProducts()
      .then((data) => {
        if (!cancelled) setFeatured((data.products || []).slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setError("We couldn't load featured products right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = user?.name?.split(" ")[0];

  return (
    <>
      {/* Hero */}
      <section className="gradient-hero relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -right-20 -top-24 h-96 w-96 rounded-full bg-white/30"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 right-1/3 h-80 w-80 rounded-full bg-white/25"
        />
        <div className="page relative py-16 sm:py-24">
          <p className="eyebrow mb-4">
            {firstName ? `Welcome back, ${firstName}` : "Welcome to ShopKart"}
          </p>
          <h1 className="max-w-2xl text-4xl leading-tight sm:text-6xl">
            Thoughtfully chosen things for everyday living.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Browse the collection, save your favourites and check out in a few
            taps.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/products" className="btn-primary btn-lg">
              Shop the collection
            </Link>
            <Link to="/wishlist" className="btn-secondary btn-lg">
              View wishlist
            </Link>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="page pb-0">
        <h2 className="mb-6 text-2xl sm:text-3xl">Shop by category</h2>
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {CATEGORIES.map((category) => (
            <li key={category.name}>
              <Link
                to={`/products?category=${encodeURIComponent(category.name)}`}
                className={`group flex h-full flex-col justify-between rounded-3xl border border-line p-5 transition duration-200 hover:-translate-y-1 hover:shadow-lift sm:p-6 ${category.tone}`}
              >
                <span className="font-display text-xl sm:text-2xl">
                  {category.name}
                </span>
                <span className="mt-8 flex items-center justify-between text-sm text-muted">
                  {category.blurb}
                  <span
                    aria-hidden="true"
                    className="transition group-hover:translate-x-1"
                  >
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Featured */}
      <section className="page">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-2xl sm:text-3xl">Featured picks</h2>
          <Link to="/products" className="text-sm font-semibold underline">
            See all
          </Link>
        </div>

        {loading && <ProductGridSkeleton count={4} />}

        {!loading && error && <p className="alert alert-error">{error}</p>}

        {!loading && !error && featured.length === 0 && (
          <p className="card px-6 py-10 text-center text-muted">
            New arrivals are on their way. Check back soon.
          </p>
        )}

        {!loading && featured.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* Account */}
      {user && (
        <section className="page pt-0">
          <div className="card gradient-lavender grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
            <div>
              <p className="eyebrow mb-2">Your account</p>
              <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted">Name</dt>
                  <dd className="font-medium">{user.name}</dd>
                </div>
                <div>
                  <dt className="text-muted">Email</dt>
                  <dd className="break-all font-medium">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-muted">Phone</dt>
                  <dd className="font-medium">{user.phone}</dd>
                </div>
              </dl>
            </div>
            <Link to="/orders" className="btn-secondary">
              View my orders
            </Link>
          </div>
        </section>
      )}
    </>
  );
}

export default Home;
