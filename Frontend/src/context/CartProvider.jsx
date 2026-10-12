import { useCallback, useMemo, useState } from "react";
import api, { getErrorMessage } from "../services/api";
import CartContext from "./CartContext";

// Items whose product was deleted come back with product: null.
const usableItems = (cart) =>
  (Array.isArray(cart) ? cart : []).filter((item) => item?.product?._id);

function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true); // true until the first fetch settles
  const [error, setError] = useState("");

  const getCart = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get("/cart");
      setCartItems(usableItems(response.data?.cart));
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load your cart."));
    } finally {
      setLoading(false);
    }
  }, []);

  // Mutations refetch, because the cart in their responses is not always populated.
  const addCart = useCallback(
    async (productId) => {
      try {
        await api.post(`/cart/${productId}`);
        await getCart();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          status: err.response?.status,
          error: getErrorMessage(err, "Unable to add product to cart."),
        };
      }
    },
    [getCart]
  );

  const updateCart = useCallback(
    async (productId, quantity) => {
      try {
        setError("");
        await api.patch(`/cart/${productId}`, { quantity });
        await getCart();
      } catch (err) {
        setError(getErrorMessage(err, "Unable to update your cart."));
      }
    },
    [getCart]
  );

  const deleteCart = useCallback(
    async (productId) => {
      try {
        setError("");
        await api.delete(`/cart/${productId}`);
        await getCart();
      } catch (err) {
        setError(getErrorMessage(err, "Unable to remove this item."));
      }
    },
    [getCart]
  );

  const clearCart = useCallback(() => setCartItems([]), []);

  const value = useMemo(
    () => ({
      cartItems,
      loading,
      error,
      getCart,
      addCart,
      updateCart,
      deleteCart,
      clearCart,
    }),
    [cartItems, loading, error, getCart, addCart, updateCart, deleteCart, clearCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export default CartProvider;
