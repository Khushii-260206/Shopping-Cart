import { useContext, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";
import { onWishlistChanged } from "../services/events";
import CartContext from "../context/CartContext";

const Icon = ({ children }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const HeartIcon = () => (
  <Icon>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
  </Icon>
);

const BagIcon = () => (
  <Icon>
    <path d="M6 8h12l-1 12H7L6 8Z" />
    <path d="M9 8V7a3 3 0 0 1 6 0v1" />
  </Icon>
);

const linkClass = ({ isActive }) =>
  `rounded-full px-4 py-2 text-sm font-medium transition ${
    isActive ? "gradient-selected text-ink" : "text-ink hover:bg-lavender"
  }`;

function CountBadge({ count }) {
  if (!count) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[11px] font-semibold text-cream"
    >
      {count}
    </span>
  );
}

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cartItems, getCart, clearCart } = useContext(CartContext);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);

  const handleLogout = async () => {
    try {
      await api.post("/customers/logout");
      clearCart();
      navigate("/login");
    } catch {
      console.log("Something went wrong while logging out.");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadWishlistCount = async () => {
      try {
        const res = await api.get("/wishlist/count");
        if (!cancelled) setWishlistCount(res.data.count);
      } catch (err) {
        console.log(err);
      }
    };

    loadWishlistCount();
    const stopListening = onWishlistChanged(loadWishlistCount);

    return () => {
      cancelled = true;
      stopListening();
    };
  }, []);

  useEffect(() => {
    if (location.pathname !== "/cart") {
      getCart();
    }
  }, [getCart, location.pathname]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-304 items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/"
          onClick={closeMenu}
          className="flex items-center gap-2 font-display text-2xl font-semibold"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-cream"
          >
            <BagIcon />
          </span>
          ShopKart
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <NavLink to="/" end className={linkClass}>
            Home
          </NavLink>
          <NavLink to="/products" className={linkClass}>
            Shop
          </NavLink>
          <NavLink to="/orders" className={linkClass}>
            Orders
          </NavLink>
        </nav>

        <div className="flex items-center gap-1">
          <Link
            to="/wishlist"
            aria-label={`Wishlist, ${wishlistCount} saved`}
            className="relative rounded-full p-2.5 transition hover:bg-blush"
          >
            <HeartIcon />
            <CountBadge count={wishlistCount} />
          </Link>
          <Link
            to="/cart"
            aria-label={`Cart, ${cartCount} items`}
            className="relative rounded-full p-2.5 transition hover:bg-lavender"
          >
            <BagIcon />
            <CountBadge count={cartCount} />
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="btn-ghost hidden md:inline-flex"
          >
            Log out
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label="Toggle menu"
            className="rounded-full p-2.5 transition hover:bg-lavender md:hidden"
          >
            <Icon>
              {menuOpen ? (
                <path d="M6 6l12 12M18 6 6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </Icon>
          </button>
        </div>
      </div>

      {/* Mobile navigation */}
      {menuOpen && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="flex flex-col gap-1 border-t border-line bg-cream px-4 py-3 md:hidden"
        >
          <NavLink to="/" end onClick={closeMenu} className={linkClass}>
            Home
          </NavLink>
          <NavLink to="/products" onClick={closeMenu} className={linkClass}>
            Shop
          </NavLink>
          <NavLink to="/wishlist" onClick={closeMenu} className={linkClass}>
            Wishlist
          </NavLink>
          <NavLink to="/cart" onClick={closeMenu} className={linkClass}>
            Cart
          </NavLink>
          <NavLink to="/orders" onClick={closeMenu} className={linkClass}>
            Orders
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full px-4 py-2 text-left text-sm font-medium transition hover:bg-lavender"
          >
            Log out
          </button>
        </nav>
      )}
    </header>
  );
}

export default Navbar;
