import Customer from "../models/customer.model.js";
import bcrypt from "bcrypt";
import generateToken from "../utils/generateToken.js";
import { clearAuthCookie, setAuthCookie } from "../utils/cookie.js";
import { isAdminUser } from "../middlewares/admin.middleware.js";
import { isNonEmptyString } from "../utils/validate.js";

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const normalizeEmail = (email) => email.trim().toLowerCase();

// bcrypt only uses the first 72 bytes of a password.
const MAX_PASSWORD_LENGTH = 72;

const registerCustomer = async (req, res) => {
    try {
        const { fullName, email, password, phone } = req.body || {};

        if (!isNonEmptyString(fullName, 100) || !isNonEmptyString(email, 254)
            || typeof password !== "string" || !password || !isNonEmptyString(phone, 20)) {
            return res.status(400).json({ error: "Missing a required field" });
        }

        if (!isValidEmail(email.trim())) {
            return res.status(400).json({ error: "Invalid email format" });
        }

        if (password.length < 6) return res.status(400).json({ error: "Password too Short" });
        if (password.length > MAX_PASSWORD_LENGTH) {
            return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` });
        }

        const normalizedEmail = normalizeEmail(email);
        const existing = await Customer.findOne({ email: normalizedEmail });
        if (existing) return res.status(409).json({ error: "Email already in use" });

        const hashPass = await bcrypt.hash(password, 10);

        let customer;
        try {
            customer = await Customer.create({
                name: fullName.trim(),
                email: normalizedEmail,
                password: hashPass,
                phone: phone.trim()
            });
        } catch (err) {
            // Two simultaneous sign-ups with the same email.
            if (err?.code === 11000) return res.status(409).json({ error: "Email already in use" });
            throw err;
        }

        return res.status(201).json({
            success: true,
            message: "Customer registered successfully",
            customer: {
                id: customer._id,
                fullName: customer.name,
                email: customer.email,
                phone: customer.phone
            }
        });
    } catch (err) {
        console.error("Error registering customer:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const loginCustomer = async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (typeof email !== "string" || !isValidEmail(email.trim())) {
            return res.status(400).json({ error: "Invalid email format" });
        }

        if (!password || typeof password !== "string") {
            return res.status(400).json({ error: "Password is required" });
        }

        const normalizedEmail = normalizeEmail(email);
        // Accounts created before emails were lower-cased may be stored as typed.
        const user = await Customer.findOne({ email: { $in: [normalizedEmail, email.trim()] } });

        if (!user) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const validUser = await bcrypt.compare(password, user.password);
        if (!validUser) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const { config } = req.app.locals;
        setAuthCookie(res, config, generateToken(user._id, config));

        return res.status(200).json({
            success: true,
            message: "Login successful",
            customer: {
                _id: user._id,
                fullName: user.name,
                email: user.email,
                phone: user.phone
            }
        });
    } catch (err) {
        console.error("Error logging in:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const showCustomer = (req, res) => {
    return res.status(200).json({
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        isAdmin: isAdminUser(req.app.locals.config, req.user),
    });
};

const logoutCustomer = (req, res) => {
    clearAuthCookie(res, req.app.locals.config);
    return res.status(200).json({
        success: true,
        message: "Logout Successfull"
    });
};

export { registerCustomer, loginCustomer, showCustomer, logoutCustomer };
