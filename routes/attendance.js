const express = require('express');
const { pool } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const GRACE_PERIOD_MINUTES = parseInt(process.env.GRACE_PERIOD_MINUTES || '15', 10);

router.post('/scan', authenticate, requireAdmin, async (req, res) => {
  try {
    const { qr_payload, event_id } = req.body;

    if (!qr_payload || !event_id) {
      return res.status(400).json({ success: false, message: 'qr_payload and event_id are required' });
    }

    let parsed;
    try {
      parsed = JSON.parse(qr_payload);
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid QR code format' });
    }
    const student_id = parsed.student_id;
    if (!student_id) {
      return res.status(400).json({ success: false, message: 'QR code does not contain a valid student_id' });
    }

    
    const [studentRows] = await pool.query(
      `SELECT id, name, student_id FROM users WHERE student_id = ? AND role = 'student'`,
      [student_id]
    );
    if (studentRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not recognized' });
    }
    const student = studentRows[0];

    // 3. Confirm event exists
    const [eventRows] = await pool.query('SELECT * FROM events WHERE id = ?', [event_id]);
    if (eventRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    const event = eventRows[0];

    // 4. Reject duplicate scans
    const [existingScan] = await pool.query(
      'SELECT id FROM attendance WHERE student_id = ? AND event_id = ?',
      [student_id, event_id]
    );
    if (existingScan.length > 0) {
      return res.status(409).json({ success: false, message: `${student.name} has already been scanned for this event` });
    }

    // 5. Determine timing: is the event even open for scanning right now?
    const now = new Date();
    const eventStart = new Date(`${event.event_date}T${event.event_time}`);
    const graceCutoff = new Date(eventStart.getTime() + GRACE_PERIOD_MINUTES * 60000);

    if (now < eventStart) {
      return res.status(400).json({
        success: false,
        message: `"${event.title}" hasn't started yet (starts at ${event.event_time}).`
      });
    }

    if (event.end_time) {
      const eventEnd = new Date(`${event.event_date}T${event.end_time}`);
      if (now > eventEnd) {
        return res.status(400).json({
          success: false,
          message: `"${event.title}" has already ended — attendance can no longer be recorded.`
        });
      }
    }

    const status = now <= graceCutoff ? 'present' : 'late';

    const [result] = await pool.query(
      `INSERT INTO attendance (student_id, event_id, status) VALUES (?, ?, ?)`,
      [student_id, event_id, status]
    );

    res.status(201).json({
      success: true,
      message: `${student.name} marked ${status} for "${event.title}"`,
      attendance: {
        id: result.insertId,
        student_id,
        student_name: student.name,
        event_id,
        event_title: event.title,
        status,
        scanned_at: now.toISOString()
      }
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ success: false, message: 'Server error recording attendance' });
  }
});

/**
 * GET /api/attendance/me
 * Any logged-in student: their OWN full attendance history.
 * Uses the student_id embedded in their JWT, so a student can never
 * see another student's records through this endpoint.
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    if (!req.user.student_id) {
      return res.status(400).json({ success: false, message: 'This account has no student_id (admin accounts have no attendance history)' });
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.event_id, e.title AS event_title, e.event_date, e.event_time, a.status, a.scanned_at
       FROM attendance a
       JOIN events e ON e.id = a.event_id
       WHERE a.student_id = ?
       ORDER BY e.event_date DESC, e.event_time DESC`,
      [req.user.student_id]
    );
    res.json({ success: true, count: rows.length, attendance: rows });
  } catch (err) {
    console.error('Get own attendance error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching attendance' });
  }
});

/** GET /api/attendance/event/:event_id - Admin only: all attendance records for an event */
router.get('/event/:event_id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.student_id, u.name AS student_name, a.status, a.scanned_at
       FROM attendance a
       JOIN users u ON u.student_id = a.student_id
       WHERE a.event_id = ?
       ORDER BY a.scanned_at ASC`,
      [req.params.event_id]
    );
    res.json({ success: true, count: rows.length, attendance: rows });
  } catch (err) {
    console.error('Get event attendance error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching attendance' });
  }
});

/** GET /api/attendance/student/:student_id - Admin only: full attendance history for a student */
router.get('/student/:student_id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.event_id, e.title AS event_title, e.event_date, a.status, a.scanned_at
       FROM attendance a
       JOIN events e ON e.id = a.event_id
       WHERE a.student_id = ?
       ORDER BY e.event_date DESC`,
      [req.params.student_id]
    );
    res.json({ success: true, count: rows.length, attendance: rows });
  } catch (err) {
    console.error('Get student attendance error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching attendance' });
  }
});

module.exports = router;
