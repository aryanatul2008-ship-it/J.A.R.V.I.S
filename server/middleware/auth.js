/**
 * auth.js - Session authentication verification middleware
 */

/**
 * Reject unauthenticated requests with a 401 status.
 */
function requireAuth(req, res, next) {
  if (req.session && (req.session.userId || req.session.user)) {
    return next();
  }

  return res.status(401).json({
    error: 'Authentication required',
    code: 'not_authenticated'
  });
}

module.exports = {
  requireAuth
};
