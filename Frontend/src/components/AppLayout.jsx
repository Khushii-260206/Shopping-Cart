import { Link, Outlet, useOutletContext } from "react-router-dom";
import Navbar from "./Navbar";

function AppLayout() {
  const user = useOutletContext();

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-cream"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="flex-1">
        <Outlet context={user} />
      </main>
      <footer className="gradient-footer border-t border-line">
        <div className="page flex flex-col items-center justify-between gap-3 py-8 text-sm text-muted sm:flex-row">
          <p className="font-display text-lg text-ink">ShopKart</p>
          <nav aria-label="Footer" className="flex gap-5">
            <Link to="/products" className="hover:text-ink hover:underline">
              Shop
            </Link>
            <Link to="/wishlist" className="hover:text-ink hover:underline">
              Wishlist
            </Link>
            <Link to="/orders" className="hover:text-ink hover:underline">
              Orders
            </Link>
          </nav>
          <p>Payments secured by Razorpay</p>
        </div>
      </footer>
    </div>
  );
}

export default AppLayout;
