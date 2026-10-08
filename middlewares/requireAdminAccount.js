// Use after auth, which verifies the token and checks the account is active.
module.exports = (req, res, next) => {
  if (req.user?.type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: an admin account is required'
    });
  }
  next();
};
