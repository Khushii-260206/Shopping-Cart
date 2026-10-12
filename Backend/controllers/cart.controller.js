import mongoose from "mongoose";
import Customer from "../models/customer.model.js";
import Product from "../models/product.model.js";

// product is populated (a document) or null when the product no longer exists.
const lineProductId = (line) => String(line.product?._id ?? line.product ?? "");
const liveLines = (cart) => cart.filter((line) => line.product);


const addCart =async (req,res)=>{
    try{
        const id = req.params.productId;
        if(!id || !mongoose.Types.ObjectId.isValid(id)){
            return res.status(404).json({error:"Product not found"});
        }
        const userId = req.user.id;

        const user = await Customer.findById(userId).populate("cart.product");
        if (!user) {
            return res.status(404).json({error:'Customer not found'});
        }

        const item  = user.cart.find(item => item.product && lineProductId(item)===id);

        if(item){
            if(item.product.stock>item.quantity){
                item.quantity++;
            }else{
                return res.status(400).json({error:'Stock limit reached'});
            }
        }else{
            const product = await Product.findById(id);
            if(!product){

                return res.status(404).json({error:'Product not found'});

            }else if(product.stock>0){
                user.cart.push({
                    product: id,
                    quantity: 1
                });
            }else{
                return res.status(400).json({error:'Stock limit reached'});
            }
        }
        await user.save();

        return res.status(200).json({
            'success':true,
            'message':'Cart updated',
            cart:user.cart
        })
    }catch(err){
        return res.status(500).json({
            error: "Internal server error"
        });
    }


}

const getCart= async(req,res)=>{
    try{
        const id = req.user.id;
        const user = await Customer.findById(id).populate("cart.product");
        return res.status(200).json({
            'success':true,
            cart:liveLines(user.cart)
        })
    }catch(err){
        return res.status(500).json({
            error: "Internal server error"
        });
    }
}
const editCart = async(req,res)=>{
    try{
        const id = req.params.productId;
        if(!id || !mongoose.Types.ObjectId.isValid(id)){
            return res.status(404).json({error:"Product not found"});
        }
        
        const quantity = req.body.quantity;
        if(!quantity || Number.isNaN(Number(quantity)) || !Number.isInteger(Number(quantity)) || quantity<1){
            return res.status(400).json({error:"Invalid quantity"});
        }
        
        const userId = req.user.id;
        const user = await Customer.findById(userId).populate("cart.product");
        if (!user) {
            return res.status(404).json({error:'Customer not found'});
        }

        const item  = user.cart.find(item => item.product && lineProductId(item)===id);
        if(item){
            if(item.product.stock>=quantity){
                item.quantity = quantity;
            }else{
                return res.status(400).json({error:'Stock limit reached'});
            }
        }else{
            return res.status(404).json({error:'Product not in cart'});
           
        }
        await user.save()
        return res.status(200).json({
            success: true,
            message: "Cart updated",
            cart: user.cart
        });
    }catch(err){
        return res.status(500).json({
            error: "Internal server error"
        });
    }
}
const deleteCart = async(req,res)=>{
    try{
        const id = req.params.productId;
        if(!id || !mongoose.Types.ObjectId.isValid(id)){
            return res.status(404).json({error:"Product not found"});
        }

        const userId = req.user.id;
        const user = await Customer.findById(userId).populate("cart.product");
        if (!user) {
            return res.status(404).json({error:'Customer not found'});
        }

        user.cart  = user.cart.filter(item => item.product && lineProductId(item)!==id);

        await user.save();
        return res.status(200).json({
            success: true,
            message: "Cart updated",
            cart: user.cart
        });


    }catch(err){
        return res.status(500).json({
            error: "Internal server error"
        });
    }
}
export {addCart,getCart,editCart,deleteCart}