import jwt from "jsonwebtoken";
import Customer from "../models/customer.model.js";

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { jwtSecret } = req.app.locals.config;
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });

    const customer = await Customer.findById(decoded.id);
    if (!customer) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = customer;
    next();
  } catch {
    // Missing/expired/tampered token, or an unreadable id inside it.
    return res.status(401).json({ error: "Unauthorized" });
  }
};

export default authMiddleware;
