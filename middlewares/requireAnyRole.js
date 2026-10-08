const requireAnyRole = (...roles) => {
  const allowed = roles.flat().map((role) => String(role).toLowerCase());

  return (req, res, next) => {
    const role = String(req.user?.role || '').toLowerCase();
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: insufficient permissions'
      });
    }
    next();
  };
};

module.exports = requireAnyRole;
