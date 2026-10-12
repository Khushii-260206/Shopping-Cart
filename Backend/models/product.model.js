import mongoose from "mongoose";

const productSchema = mongoose.Schema({
    name:{
        type:String,
        required:true
    },
    description:{
        type:String,
        required:true
    },
    price:{
        type:Number,
        required:true,
        min:0.01
    },
    category:{
        type:String,
        required:true
    },
    image:{
        type:String,
        required:true
    },
    stock:{
        type:Number,
        required:true,
        min:0,
        validate:{
            validator:Number.isInteger,
            message:"Stock must be a whole number"
        }
    },
    createdAt:{
        type:Date,
        default:Date.now
    }
})

const Product = mongoose.model('Product', productSchema);

export default Product;