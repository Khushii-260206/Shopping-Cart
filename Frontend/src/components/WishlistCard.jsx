import { Link } from "react-router-dom";
import { formatPrice } from "../utils/format";
import ProductImage from "./ProductImage";

function WishlistCard({ product, onRemove, removing }) {
  const soldOut = !(product.stock > 0);

  return (
    <article className="card group flex flex-col overflow-hidden transition duration-200 hover:-translate-y-1 hover:shadow-lift">
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

      <div className="flex flex-1 flex-col p-5">
        <p className="eyebrow">{product.category}</p>
        <h2 className="mt-1 text-lg leading-snug">{product.name}</h2>

        <div className="mt-2 flex items-baseline justify-between gap-2">
          <p className="text-lg font-semibold">{formatPrice(product.price)}</p>
          <p className={`text-xs font-medium ${soldOut ? "text-danger" : "text-muted"}`}>
            {soldOut ? "Out of stock" : `${product.stock} in stock`}
          </p>
        </div>

        <div className="mt-auto flex gap-2 pt-4">
          <Link to={`/products/${product._id}`} className="btn-primary flex-1">
            View details
          </Link>
          <button
            type="button"
            onClick={() => onRemove(product._id)}
            disabled={removing}
            aria-label={`Remove ${product.name} from wishlist`}
            className="btn-secondary px-4"
          >
            {removing ? "…" : "Remove"}
          </button>
        </div>
      </div>
    </article>
  );
}

export default WishlistCard;
