# ShopKart: Shopping Cart

A full-stack online store: browse products, save a wishlist, fill a cart, check out
with Razorpay, and track orders.

- **Frontend:** React 19, Vite, Tailwind CSS 4, React Router, Axios (`Frontend/`)
- **Backend:** Node.js, Express 5, MongoDB with Mongoose, JWT in an HttpOnly cookie (`Backend/`)
- **Payments:** Razorpay (test mode while developing)

## What you need first

| Requirement | Why |
|---|---|
| Node.js 20 or newer | runs both apps |
| MongoDB (local `mongod` or a free MongoDB Atlas cluster) | stores users, products, orders |
| Razorpay **test** keys (optional) | real checkout popup. Without them you can still browse, and checkout is disabled unless you turn on the development mock (see below) |

## 1. Configure the backend

```bash
cd Backend
cp .env.example .env      # then open .env and fill in the values
```

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | long random string (16+ chars) that signs login tokens |
| `NODE_ENV` | no | set to `production` only when deploying (Secure cookie, real Razorpay keys required, mock payments forbidden) |
| `PORT` | no | API port, default `8000` |
| `CLIENT_ORIGIN` | no | where the frontend runs (CORS), default `http://localhost:5173` |
| `COOKIE_SAMESITE` | no | `lax` (default) when frontend and API share a site (e.g. both on localhost). Use `none` only for different domains (HTTPS required) |
| `ADMIN_EMAILS` | no | comma-separated emails that may add products and move orders through shipping stages |
| `RAZORPAY_KEY_ID` | for payments | Razorpay **test** key id |
| `RAZORPAY_KEY_SECRET` | for payments | Razorpay **test** key secret (server only) |
| `RAZORPAY_WEBHOOK_SECRET` | optional | enables the payment webhook (see below) |
| `ALLOW_MOCK_PAYMENTS` | dev only | `true` lets you test checkout with no Razorpay account |

Generate a secret with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

If something required is missing, the server stops at startup and lists the variable **names** it needs.

## 2. Configure the frontend

`Frontend/.env` needs one line (it already exists in most setups):

```
VITE_API_URL=http://localhost:8000
```

Never put secrets in the frontend: everything starting with `VITE_` is visible in the browser.

## 3. Install and run

```bash
# Terminal 1: API
cd Backend
npm install
npm run seed      # one time: adds 12 sample products (safe to repeat)
npm run dev       # expect "MongoDB connected" and "Server running on port 8000"

# Terminal 2: website
cd Frontend
npm install
npm run dev       # open http://localhost:5173
```

Register an account at `/register`, then log in.

## Payments

| Mode | When | What happens |
|---|---|---|
| **Razorpay** | `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` set | Real Razorpay checkout popup. The server creates the order, prices it from the database, and only marks it paid after verifying Razorpay's signature. |
| **Mock (development only)** | `ALLOW_MOCK_PAYMENTS=true` and no Razorpay keys | A clearly labelled "Development test payment" dialog. No money or provider involved. Orders show a "Test payment" label. The server **refuses to start** with this flag in production. |
| **Disabled** | neither | Browsing works; checkout returns "Payments are not configured". |

How an order becomes paid:

1. `POST /orders/create-payment-order`: the server reads your cart, prices it from the database, creates a Razorpay order for that exact amount, and stores a `PENDING_PAYMENT` order. Repeating checkout for the same cart reuses the open order.
2. After the popup succeeds, the browser calls `POST /orders/verify-payment`. The server checks that the payment belongs to *that* order, verifies the HMAC signature with the key secret, and only then marks it `PAID`/`PLACED` (once, even if repeated), deducts stock, and clears the cart.
3. Optional webhook: `POST /webhooks/razorpay` (raw body, signature checked with `RAZORPAY_WEBHOOK_SECRET`) handles payments completed after the browser was closed. In the Razorpay dashboard add the webhook URL (needs a public URL, e.g. via a tunnel), set the same secret, and enable `payment.captured`, `payment.failed` and `order.paid`. **Not verified against real Razorpay** (see below).

Order states: `paymentStatus` `PENDING` → (`FAILED`) → `PAID` (final). `status` `PENDING_PAYMENT` → `PLACED` → `CONFIRMED` → `SHIPPED` → `DELIVERED` (administrators move paid orders forward only). There is no cancellation or refund feature.

## Administrators

List an email in `ADMIN_EMAILS` (the person must also register). Administrators can create products (`POST /products`) and see an "Admin: status" control on paid orders. Everyone else cannot.

## Tests and checks

```bash
cd Backend  && npm test        # config, payment signatures, auth, cart, orders, webhook, admin rules, seed script, startup failures
cd Frontend && npm run lint    # ESLint
cd Frontend && npm run build   # production build
node e2e/run.mjs               # browser end-to-end test (needs Chrome and `mongod`)
```

The backend tests start a temporary `mongod` automatically (or use `TEST_MONGODB_URI` if you set it) and never touch your real database or `.env`. If neither is available, the database tests are skipped and say so; they are not silently counted as passed. The end-to-end test runs both apps on random ports against a throwaway database. It also sends real keyboard input (Tab, Shift+Tab, Escape) to check focus order and focus indicators. Headless Chrome sometimes exits on its own during long runs; the test relaunches it and says so in its summary. To run only part of it while debugging: `E2E_JOURNEYS=mock node e2e/run.mjs` (or `fake-razorpay`, or empty for just the resilience and admin checks).

## Project layout

```
Backend/   index.js (starts the server), app.js (routes and middleware), config/env.js (validated settings),
           controllers/ routes/ models/ middlewares/ services/ (payments + order logic), scripts/seed.js, tests/
Frontend/  src/pages (screens), src/components, src/context (cart), src/services/api.js, src/index.css (design tokens)
e2e/       browser end-to-end test
```

## Known limitations

- Razorpay was **not** exercised against Razorpay's real servers in automated tests (a fake provider and signed fixtures were used). Verify once manually with test keys.
- No cancellation, refunds, password reset, email verification, or rate limiting on login.
- A paid order is not rolled back if stock ran out between checkout and payment (stock never goes negative; the server logs it).
- Product photos in the seed data are loaded from Unsplash, and fonts from Google Fonts.
