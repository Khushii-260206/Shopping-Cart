export const formatPrice = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;

export const formatDate = (dateString, withTime = false) => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};
