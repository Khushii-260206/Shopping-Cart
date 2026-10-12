// Store administrators are listed by email in the ADMIN_EMAILS environment variable.
export const isAdminUser = (config, user) =>
  Boolean(user?.email) && config.adminEmails.includes(user.email.toLowerCase());

const requireAdmin = (req, res, next) => {
  if (!isAdminUser(req.app.locals.config, req.user)) {
    return res.status(403).json({ error: "Administrator access required" });
  }
  next();
};

export default requireAdmin;
