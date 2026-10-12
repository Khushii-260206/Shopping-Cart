// Lets any page tell the navbar that the wishlist changed.
const WISHLIST_EVENT = "shopkart:wishlist-changed";

export const notifyWishlistChanged = () =>
  window.dispatchEvent(new Event(WISHLIST_EVENT));

export const onWishlistChanged = (handler) => {
  window.addEventListener(WISHLIST_EVENT, handler);
  return () => window.removeEventListener(WISHLIST_EVENT, handler);
};
