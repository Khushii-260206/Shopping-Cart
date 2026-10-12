import mongoose from 'mongoose';

const customerSchema = mongoose.Schema({
    name:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required : true,
        unique:true
    },
    password:{
        type:String,
        required:true
    },
    phone:{
        type:String,
        required:true
    },
    createdAt:{
        type:Date,
        default:Date.now
    },
    wishlist:{
        type:[mongoose.Schema.Types.ObjectId],
        ref:"Product",
        default:[]
    },
    cart:[
         {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1
    }
  }
    ]
})

const Customer= mongoose.model('Customer',customerSchema);

export default Customer;