// One place for auth-cookie settings so login and logout always agree.
export const authCookieOptions = (config) => ({
  httpOnly: true,
  sameSite: config.cookieSameSite,
  secure: config.isProduction || config.cookieSameSite === "none",
  path: "/",
});

export const setAuthCookie = (res, config, token) =>
  res.cookie("token", token, {
    ...authCookieOptions(config),
    maxAge: config.cookieMaxAgeMs,
  });

export const clearAuthCookie = (res, config) =>
  res.clearCookie("token", authCookieOptions(config));
