const jwt = require('jsonwebtoken');
require('dotenv').config();


function authenticate(req, res, next) {
  const token = getToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication token missing' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded; // { id, email, role, student_id }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function getToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return req.cookies && req.cookies.token ? req.cookies.token : null;
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function requirePageRole(role) {
  return (req, res, next) => {
    const token = getToken(req);
    if (!token) return res.redirect('/login.html');

    try {
      const user = verifyToken(token);
      if (user.role !== role) {
        return res.redirect(user.role === 'admin' ? '/dashboard.html' : '/student-dashboard.html');
      }
      req.user = user;
      next();
    } catch (err) {
      return res.redirect('/login.html');
    }
  };
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

/** Restricts a route to student users only (must run after authenticate). */
function requireStudent(req, res, next) {
  if (!req.user || req.user.role !== 'student') {
    return res.status(403).json({ success: false, message: 'Student access required' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, requireStudent, requirePageRole };
