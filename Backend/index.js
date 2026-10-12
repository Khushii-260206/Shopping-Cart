import mongoose from "mongoose";
import { loadConfig, loadEnvFile } from "./config/env.js";
import { createRazorpayClient } from "./services/payment.service.js";
import { createApp } from "./app.js";

loadEnvFile();
const { config, errors, warnings } = loadConfig();

if (errors.length > 0) {
  console.error("\nThe server cannot start because of configuration problems:\n");
  errors.forEach((message) => console.error(`  - ${message}`));
  console.error("\nCreate Backend/.env (copy Backend/.env.example) and fill in the values above.\n");
  process.exit(1);
}
warnings.forEach((message) => console.warn(`Warning: ${message}`));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason?.message || reason);
});

try {
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 8000 });
  console.log("MongoDB connected");
} catch (error) {
  // error.message can echo the connection string, so only say what failed.
  console.error(
    "Could not connect to MongoDB. Check that the database is running and that MONGODB_URI is correct."
  );
  process.exit(1);
}

const app = createApp(config, { razorpay: createRazorpayClient(config) });

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port} (payments: ${config.payments.mode})`);
});
