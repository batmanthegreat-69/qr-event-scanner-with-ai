const express = require('express');
const { pool } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const VALID_BLOCKS = ['A', 'B'];

/**
 * GET /api/students - Admin only: list all students.
 * Optional query params: ?year_level=1-4 & ?block=A|B
 * Both are optional and can be used independently or together, so the
 * dashboard can filter e.g. "3rd Year - Block B" or just "Block A".
 */
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { year_level, block } = req.query;

    let query = `SELECT id, name, email, student_id, year_level, block, created_at
                 FROM users WHERE role = 'student'`;
    const params = [];

    if (year_level !== undefined && year_level !== '') {
      const parsedYear = Number(year_level);
      if (!Number.isInteger(parsedYear) || parsedYear < 1 || parsedYear > 4) {
        return res.status(400).json({ success: false, message: 'year_level must be an integer between 1 and 4' });
      }
      query += ' AND year_level = ?';
      params.push(parsedYear);
    }

    if (block !== undefined && block !== '') {
      const normalizedBlock = String(block).toUpperCase();
      if (!VALID_BLOCKS.includes(normalizedBlock)) {
        return res.status(400).json({ success: false, message: `block must be one of: ${VALID_BLOCKS.join(', ')}` });
      }
      query += ' AND block = ?';
      params.push(normalizedBlock);
    }

    query += ' ORDER BY year_level ASC, block ASC, name ASC';

    const [rows] = await pool.query(query, params);
    res.json({ success: true, count: rows.length, students: rows });
  } catch (err) {
    console.error('List students error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching students' });
  }
});

/** GET /api/students/me - Logged-in student: get own profile + QR code */
router.get('/me', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, student_id, year_level, block, qr_code, created_at FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching profile' });
  }
});

/** GET /api/students/:student_id - Admin only: get a specific student's record */
router.get('/:student_id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, student_id, year_level, block, qr_code, created_at FROM users WHERE student_id = ?`,
      [req.params.student_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    res.json({ success: true, student: rows[0] });
  } catch (err) {
    console.error('Get student error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching student' });
  }
});

module.exports = router;
