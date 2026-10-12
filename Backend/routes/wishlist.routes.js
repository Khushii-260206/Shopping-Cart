import express from 'express';
import {addWishlist, countWishlist, deleteWishlist, getWishlist} from '../controllers/wishlist.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const wishlistRouter = express.Router();

wishlistRouter.post('/:id',authMiddleware,addWishlist);
wishlistRouter.get('/',authMiddleware,getWishlist);
wishlistRouter.get('/count',authMiddleware,countWishlist);
wishlistRouter.delete('/:id',authMiddleware,deleteWishlist);
export default wishlistRouter;