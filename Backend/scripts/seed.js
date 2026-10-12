// Adds sample products so the storefront has something to show.
// Usage: npm run seed   (needs MONGODB_URI in .env)
// Safe to re-run: products that already exist (matched by name) are left untouched.
import dotenv from "dotenv";
import mongoose from "mongoose";
import Product from "../models/product.model.js";

dotenv.config({ quiet: true });

const photo = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=80`;

const products = [
  {
    name: "Over-Ear Wireless Headphones",
    description: "Comfortable padded headphones with a warm, balanced sound and a foldable design for travel.",
    price: 4999,
    category: "Electronics",
    image: photo("1505740420928-5e560c06d30e"),
    stock: 18,
  },
  {
    name: "Minimal Smartwatch",
    description: "A clean round-dial smartwatch with a soft silicone strap. Tracks steps, sleep and notifications.",
    price: 6499,
    category: "Electronics",
    image: photo("1523275335684-37898b6baf30"),
    stock: 4,
  },
  {
    name: "Instant Film Camera",
    description: "Point, shoot and watch your photo develop. A playful way to keep small moments on paper.",
    price: 8999,
    category: "Electronics",
    image: photo("1526170375885-4d8ecf77b99f"),
    stock: 9,
  },
  {
    name: "Knit Running Sneakers",
    description: "Lightweight breathable knit upper with a cushioned sole, made for everyday miles.",
    price: 3499,
    category: "Fashion",
    image: photo("1542291026-7eec264c27ff"),
    stock: 25,
  },
  {
    name: "Classic Black Sunglasses",
    description: "Timeless frames with polarised lenses and UV protection. Goes with everything.",
    price: 1899,
    category: "Fashion",
    image: photo("1572635196237-14b3f281503f"),
    stock: 30,
  },
  {
    name: "Soft Knit Cardigan",
    description: "A relaxed, cosy layer in a soft knit that works from morning coffee to evening walks.",
    price: 2799,
    category: "Fashion",
    image: photo("1512436991641-6745cdb1723f"),
    stock: 0,
  },
  {
    name: "Mustard Accent Armchair",
    description: "A sunny statement chair with slim wooden legs. Brightens a reading corner instantly.",
    price: 12999,
    category: "Home",
    image: photo("1586023492125-27b2c045efd7"),
    stock: 6,
  },
  {
    name: "Chunky Knit Throw",
    description: "A generously sized woven throw to drape over a sofa or the end of a bed.",
    price: 1999,
    category: "Home",
    image: photo("1583847268964-b28dc8f51f92"),
    stock: 40,
  },
  {
    name: "Amber Glow Soy Candle",
    description: "A hand-poured soy candle in a glass jar with a soft, warm scent for slow evenings.",
    price: 799,
    category: "Home",
    image: photo("1602874801007-bd458bb1b8b6"),
    stock: 60,
  },
  {
    name: "Poetry Collection",
    description: "A pocket-friendly paperback of short, honest poems that are easy to dip in and out of.",
    price: 499,
    category: "Books",
    image: photo("1544947950-fa07a98d237f"),
    stock: 35,
  },
  {
    name: "Library Classics Set",
    description: "A curated set of timeless reads for long weekends and rainy afternoons.",
    price: 2499,
    category: "Books",
    image: photo("1481627834876-b7833e8f5570"),
    stock: 12,
  },
  {
    name: "Vintage Paperback Bundle",
    description: "A mixed bundle of well-loved paperbacks. Great for gifting or starting a shelf.",
    price: 1299,
    category: "Books",
    image: photo("1495446815901-a7297e633e8d"),
    stock: 20,
  },
];

const run = async () => {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to Backend/.env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  let added = 0;
  for (const product of products) {
    const result = await Product.updateOne(
      { name: product.name },
      { $setOnInsert: product },
      { upsert: true }
    );
    if (result.upsertedCount) added += 1;
  }

  console.log(`Seed complete: ${added} added, ${products.length - added} already existed.`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("Seed failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
