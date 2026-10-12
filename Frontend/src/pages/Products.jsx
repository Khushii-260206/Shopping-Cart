import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { getProducts } from "../services/api";
import PageHeader from "../components/PageHeader";
import { EmptyState, ErrorState, ProductGridSkeleton } from "../components/States";

const CATEGORIES = ["Electronics", "Fashion", "Books", "Home"];

function Products() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [sort, setSort] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Wait for a pause in typing before hitting the API.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    const fetchProducts = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getProducts(search, category, sort);

        if (!cancelled) setProducts(data.products);
      } catch {
        if (!cancelled) setError("Something went wrong while loading products.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProducts();

    return () => {
      cancelled = true;
    };
  }, [search, category, sort, reloadKey]);

  const hasFilters = Boolean(search || category || sort);

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setCategory("");
    setSort("");
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="The collection"
        title="Shop all"
        subtitle={
          !loading && !error
            ? `${products.length} ${products.length === 1 ? "piece" : "pieces"}`
            : undefined
        }
      />

      {/* Search & filters */}
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="card mb-8 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_200px_200px_auto]"
      >
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="search" className="sr-only">
            Search products
          </label>
          <input
            id="search"
            type="search"
            placeholder="Search products…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="field-input"
          />
        </div>

        <div>
          <label htmlFor="category" className="sr-only">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="field-input"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="sort" className="sr-only">
            Sort by price
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="field-input"
          >
            <option value="">Sort: Default</option>
            <option value="price_asc">Price: Low to high</option>
            <option value="price_desc">Price: High to low</option>
          </select>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="btn-ghost sm:col-span-2 sm:justify-self-end lg:col-span-1"
          >
            Clear
          </button>
        )}
      </form>

      {loading && <ProductGridSkeleton />}

      {!loading && error && (
        <ErrorState
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      )}

      {!loading && !error && products.length === 0 && (
        <EmptyState
          icon="🔍"
          title="No products found"
          message="Try changing your search or category."
          tone="lavender"
        />
      )}

      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Products;
