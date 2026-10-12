import { useState } from "react";

// Soft placeholder shown when a product has no image or it fails to load.
function ProductImage({ src, alt, className = "" }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-linear-to-br from-blush via-lavender to-sage text-ink/50 ${className}`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-10 w-10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="m4 18 5-5 4 4 3-3 4 4" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}

export default ProductImage;
