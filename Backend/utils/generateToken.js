import jwt from "jsonwebtoken";

const generateToken = (customerId, config) =>
  jwt.sign({ id: String(customerId) }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtExpiresIn,
  });

export default generateToken;
