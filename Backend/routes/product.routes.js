import express from 'express';
import {createProduct,getProduct,getProducts} from '../controllers/product.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import requireAdmin from '../middlewares/admin.middleware.js';

const productsRouter = express.Router();

productsRouter.post('/',authMiddleware,requireAdmin,createProduct);
productsRouter.get('/',authMiddleware,getProducts);
productsRouter.get('/:id',authMiddleware,getProduct);


export default productsRouter;
