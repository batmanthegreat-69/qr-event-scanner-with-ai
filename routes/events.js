const express = require('express');
const { pool } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Given an event row, computes its current status by comparing NOW to
 * its start (event_date + event_time) and end (event_date + end_time).
 * This is how the system knows an event is "already done" — not by
 * asking anyone, but by checking the clock against the stored times.
 */
function computeEventStatus(event) {
  const now = new Date();
  const start = new Date(`${event.event_date}T${event.event_time}`);

  if (now < start) return 'upcoming';

  if (event.end_time) {
    const end = new Date(`${event.event_date}T${event.end_time}`);
    if (now > end) return 'completed';
    return 'ongoing';
  }

  // No end_time on record (legacy event created before this feature existed) —
  // we can only say it has started, not confidently say it's over.
  return 'ongoing';
}

/**
 * GET /api/events
 * Fetch all events, split into upcoming and past based on event_date.
 * Optional query: ?scope=upcoming | past | all (default: all)
 */
router.get('/', async (req, res) => {
  try {
    const { scope = 'all' } = req.query;
    let query = 'SELECT * FROM events';
    const params = [];

    if (scope === 'upcoming') {
      query += ' WHERE event_date >= CURDATE()';
    } else if (scope === 'past') {
      query += ' WHERE event_date < CURDATE()';
    }
    query += ' ORDER BY event_date ASC, event_time ASC';

    const [rows] = await pool.query(query, params);
    const eventsWithStatus = rows.map((event) => ({ ...event, status: computeEventStatus(event) }));
    res.json({ success: true, count: eventsWithStatus.length, events: eventsWithStatus });
  } catch (err) {
    console.error('List events error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching events' });
  }
});

/** GET /api/events/:id - Fetch a single event */
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    res.json({ success: true, event: rows[0] });
  } catch (err) {
    console.error('Get event error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching event' });
  }
});

/**
 * POST /api/events
 * Admin only. Body: { title, description, event_date, event_time, end_time, location }
 */
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, description = '', event_date, event_time, end_time, location = '' } = req.body;
    if (!title || !event_date || !event_time || !end_time) {
      return res.status(400).json({ success: false, message: 'title, event_date, event_time, and end_time are required' });
    }
    if (end_time <= event_time) {
      return res.status(400).json({ success: false, message: 'end_time must be later than event_time' });
    }

    const [result] = await pool.query(
      `INSERT INTO events (title, description, event_date, event_time, end_time, location)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description, event_date, event_time, end_time, location]
    );

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      event: { id: result.insertId, title, description, event_date, event_time, end_time, location }
    });
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ success: false, message: 'Server error creating event' });
  }
});

/** DELETE /api/events/:id - Admin only */
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    res.json({ success: true, message: 'Event deleted' });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ success: false, message: 'Server error deleting event' });
  }
});

module.exports = router;
