import Product from "../models/product.model.js";
import mongoose from "mongoose";
import Customer from "../models/customer.model.js";


const addWishlist = async(req,res)=>{
    try{
        const userId = req.user._id;
        const productId = req.params.id;
        if(!mongoose.Types.ObjectId.isValid(productId)){
            return res.status(400).json({error:"Product Id Invalid"});
        }
        const exists = await Product.findById(productId);
        if(!exists){
            return res.status(404).json({error:"Product not found"});
        }

        const user = await Customer.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const alreadyExists = user.wishlist.some(
            id => id.toString() === productId
        );
        if (alreadyExists) {
            return res.status(409).json({
                error: "Product already in wishlist"
            });
        }
        user.wishlist.push(productId);

        await user.save();

        return res.status(200).json({
            "success": true,
            "message": "Product added to wishlist"
        });
    }catch(err){
        res.status(500).json({error:"Internal server error"});
    }


}

const getWishlist = async (req,res) => {
    try{
        const userid  = req.user._id;
        const user = await Customer.findById(userid).populate({
            path:"wishlist",
            select:"name price category image stock"
        })

        res.status(200).json({
            "success":true,
            "count":user.wishlist.length,
            "wishlist":user.wishlist
        })
    }catch(err){
        res.status(500).json({error:"Internal server error"});
    }
}

const deleteWishlist = async (req,res)=>{
    try{
        const userid  = req.user._id;
        const productId = req.params.id;
        if(!mongoose.Types.ObjectId.isValid(productId)){
            return res.status(400).json({error:"Product Id Invalid"});
        }

        const user = await Customer.findById(userid);
        const orig = user.wishlist.length;
        user.wishlist = user.wishlist.filter(product => product.toString()!=productId);
        if(orig===user.wishlist.length){
            return res.status(404).json({error:"Product not in wishlist"});
        }

        await user.save();

        return res.status(200).json({
            "success": true,
            "message": "Product removed from wishlist"
        })
    }catch(err){
        res.status(500).json({error:"Internal server error"});
    }
}

const countWishlist = async (req,res)=>{
    try{
        const userid = req.user._id;
        // Populate so products that no longer exist are not counted, matching getWishlist.
        const user = await Customer.findById(userid).populate({path:"wishlist",select:"_id"});
        return res.status(200).json({count:user.wishlist.length});
    }catch(err){
        res.status(500).json({error:"Internal server error"});
    }
}
export {addWishlist,getWishlist,deleteWishlist,countWishlist}