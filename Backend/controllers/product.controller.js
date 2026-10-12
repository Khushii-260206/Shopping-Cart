import Product from "../models/product.model.js";
import { escapeRegExp, isNonEmptyString, isObjectId } from "../utils/validate.js";

const createProduct = async (req, res) => {
    try {
        const { name, description, price, category, image, stock } = req.body || {};

        if (!isNonEmptyString(name) || !isNonEmptyString(description, 2000)
            || !isNonEmptyString(category) || !isNonEmptyString(image, 2000)
            || price === undefined || stock === undefined) {
            return res.status(400).json({ error: "Missing required field" });
        }
        if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
            return res.status(400).json({ error: "Invalid price" });
        }
        if (!Number.isInteger(stock) || stock < 0) {
            return res.status(400).json({ error: "Invalid stock" });
        }

        const product = await Product.create({
            name: name.trim(),
            description: description.trim(),
            price,
            category: category.trim(),
            image: image.trim(),
            stock
        });

        return res.status(201).json(product);
    } catch (err) {
        console.error("Error creating product:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const getProducts = async (req, res) => {
    try {
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
        const sort = req.query.sort;

        const filter = {};
        if (search) filter.name = { $regex: escapeRegExp(search), $options: "i" };
        if (category) filter.category = { $regex: escapeRegExp(category), $options: "i" };

        let query = Product.find(filter).select("-createdAt");
        if (sort === "price_asc") query = query.sort({ price: 1 });
        else if (sort) query = query.sort({ price: -1 });

        const products = await query;

        return res.status(200).json({
            success: true,
            count: products.length,
            products
        });
    } catch (err) {
        console.error("Error listing products:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const getProduct = async (req, res) => {
    try {
        const id = req.params.id;
        if (!isObjectId(id)) {
            return res.status(400).json({ error: "Invalid product ID" });
        }
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        return res.status(200).json(product);
    } catch (err) {
        console.error("Error fetching product:", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export { createProduct, getProduct, getProducts };
