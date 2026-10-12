import { Link } from "react-router-dom";

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="gradient-hero relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/30"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-white/25"
        />
        <Link to="/" className="relative font-display text-3xl font-semibold">
          ShopKart
        </Link>
        <div className="relative max-w-md">
          <p className="font-display text-4xl leading-tight">
            Thoughtfully chosen things for everyday living.
          </p>
          <p className="mt-4 text-muted">
            Save what you love, check out securely and follow every order.
          </p>
        </div>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="mb-8 block text-center font-display text-3xl font-semibold lg:hidden"
          >
            ShopKart
          </Link>
          <div className="card p-7 sm:p-9">
            <h1 className="text-3xl">{title}</h1>
            <p className="mt-2 text-muted">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>
          <p className="mt-6 text-center text-sm text-muted">{footer}</p>
        </div>
      </main>
    </div>
  );
}

export default AuthLayout;
