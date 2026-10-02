const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const VALID_BLOCKS = ['A', 'B'];
const MIN_YEAR = 1;
const MAX_YEAR = 4;

/**
 * POST /api/auth/register
 * Body: { name, email, password, student_id, year_level, block }
 *   Public registration always creates a student account. year_level and block
 *   are required for student accounts (this school
 *   only has Block A and Block B for every year level, 1st-4th year).
 * Creates the user and, for students, auto-generates a QR code (Base64 Data URL)
 * encoding their student_id. The QR is stored in the `qr_code` column.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, student_id, year_level, block } = req.body;
    const role = 'student';

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email, and password are required' });
    }

    if (role === 'student') {
      if (!student_id) {
        return res.status(400).json({ success: false, message: 'student_id is required for student accounts' });
      }

      // year_level and block are required for students, and must be valid.
      const parsedYear = Number(year_level);
      if (year_level === undefined || year_level === null || year_level === '' || Number.isNaN(parsedYear)) {
        return res.status(400).json({ success: false, message: 'year_level is required for student accounts' });
      }
      if (!Number.isInteger(parsedYear) || parsedYear < MIN_YEAR || parsedYear > MAX_YEAR) {
        return res.status(400).json({ success: false, message: `year_level must be an integer between ${MIN_YEAR} and ${MAX_YEAR}` });
      }

      const normalizedBlock = typeof block === 'string' ? block.toUpperCase() : block;
      if (!normalizedBlock) {
        return res.status(400).json({ success: false, message: 'block is required for student accounts' });
      }
      if (!VALID_BLOCKS.includes(normalizedBlock)) {
        return res.status(400).json({ success: false, message: `block must be one of: ${VALID_BLOCKS.join(', ')}` });
      }
    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR (student_id IS NOT NULL AND student_id = ?)',
      [email, student_id || null]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email or student_id already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate QR code payload: a JSON string identifying the student.
    let qrDataUrl = null;
    if (role === 'student') {
      const payload = JSON.stringify({ student_id, name });
      qrDataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', width: 300 });
    }

    const finalYearLevel = role === 'student' ? Number(year_level) : null;
    const finalBlock = role === 'student' ? String(block).toUpperCase() : null;

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password, role, student_id, qr_code, year_level, block)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, role, role === 'student' ? student_id : null, qrDataUrl, finalYearLevel, finalBlock]
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: result.insertId,
        name,
        email,
        role,
        student_id: student_id || null,
        year_level: finalYearLevel,
        block: finalBlock
      },
      qr_code: qrDataUrl // frontend can render/download this as the student's badge
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Issues a JWT stored both as an HTTP-only cookie and returned in the response body,
 * so it works whether the frontend prefers cookies or Authorization headers.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'email and password are required' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      student_id: user.student_id
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        student_id: user.student_id,
        year_level: user.year_level,
        block: user.block
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

/** POST /api/auth/logout - clears the auth cookie */
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out' });
});

/** GET /api/auth/me - returns the authenticated user's role for the frontend. */
router.get('/me', authenticate, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      student_id: req.user.student_id
    }
  });
});

module.exports = router;
