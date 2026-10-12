import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { addCart, getCart, editCart, deleteCart } from '../controllers/cart.controller.js';

const cartRouter = express.Router();


cartRouter.post('/:productId',authMiddleware,addCart);
cartRouter.get('/',authMiddleware,getCart);
cartRouter.patch('/:productId',authMiddleware,editCart);
cartRouter.delete('/:productId',authMiddleware,deleteCart);


export default cartRouter;