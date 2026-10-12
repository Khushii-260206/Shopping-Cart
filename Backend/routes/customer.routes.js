import express from 'express';
import {loginCustomer, registerCustomer, showCustomer, logoutCustomer} from '../controllers/customer.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post("/register", registerCustomer);
router.post("/login", loginCustomer);
router.post('/me',authMiddleware,showCustomer);
router.post('/logout',authMiddleware,logoutCustomer);

export default router;