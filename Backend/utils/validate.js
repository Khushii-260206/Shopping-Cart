const OBJECT_ID = /^[a-f\d]{24}$/i;

export const isObjectId = (value) =>
  typeof value === "string" && OBJECT_ID.test(value);

export const isNonEmptyString = (value, max = 200) =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

export const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const digitsOnly = (value) => value.replace(/[\s-]/g, "");

// Validates and normalises a shipping address from the browser.
// Returns { value } or { error }.
export const parseShippingAddress = (raw) => {
  if (!raw || typeof raw !== "object") {
    return { error: "Shipping address is required" };
  }

  const fields = {
    fullName: raw.fullName,
    phone: raw.phone,
    addressLine1: raw.addressLine1 ?? raw.address,
    city: raw.city,
    state: raw.state,
    pincode: raw.pincode,
  };

  for (const key of Object.keys(fields)) {
    if (!isNonEmptyString(fields[key])) {
      return { error: "All shipping address fields are required" };
    }
  }

  const phone = digitsOnly(fields.phone.trim());
  if (!/^\d{10}$/.test(phone)) {
    return { error: "Phone must contain a valid 10-digit number" };
  }

  const pincode = fields.pincode.trim();
  if (!/^\d{6}$/.test(pincode)) {
    return { error: "Pincode must contain 6 digits." };
  }

  return {
    value: {
      fullName: fields.fullName.trim(),
      phone,
      addressLine1: fields.addressLine1.trim(),
      city: fields.city.trim(),
      state: fields.state.trim(),
      pincode,
    },
  };
};
