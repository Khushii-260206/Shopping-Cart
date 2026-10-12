import axios from "axios";

const DEFAULT_API_URL = "http://localhost:8000";

if (!import.meta.env.VITE_API_URL && import.meta.env.PROD) {
  console.warn("VITE_API_URL is not set; the app is using " + DEFAULT_API_URL);
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || DEFAULT_API_URL,
  withCredentials: true,
});

// Pages where a 401 is an expected answer (wrong password, not signed in yet).
const PUBLIC_PATHS = ["/login", "/register"];

// If the session expires while the app is open, send the user to the login page
// instead of leaving every screen showing a vague error.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthCall = /\/customers\/(login|register|me)$/.test(error.config?.url || "");
    if (
      error.response?.status === 401 &&
      !isAuthCall &&
      !PUBLIC_PATHS.includes(window.location.pathname)
    ) {
      window.location.assign("/login");
    }
    return Promise.reject(error);
  }
);

export const getProducts = async (search = "", category = "", sort = "") => {
  const params = {};
  if (search) params.search = search;
  if (category) params.category = category;
  if (sort) params.sort = sort;

  const response = await api.get("/products", { params });
  return response.data;
};

export const getProduct = async (id) => {
  const response = await api.get(`/products/${id}`);
  return response.data;
};

export const getErrorMessage = (err, fallback) =>
  err?.response?.data?.error || err?.response?.data?.message || fallback;

export default api;
