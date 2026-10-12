import { createContext } from "react";

// Shape provided by CartProvider:
// { cartItems, loading, error, getCart, addCart, updateCart, deleteCart, clearCart }
const CartContext = createContext({
  cartItems: [],
  loading: false,
  error: "",
  getCart: async () => {},
  addCart: async () => ({ success: false }),
  updateCart: async () => {},
  deleteCart: async () => {},
  clearCart: () => {},
});

export default CartContext;
