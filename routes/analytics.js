const express = require('express');
const { pool } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { predictTurnout } = require('../ml/predict');
const { computeStudentFeatures, predictRisk } = require('../ml/predictRisk');
const { detectAnomalies } = require('../ml/anomalyDetection');
const { clusterStudents } = require('../ml/clusterStudents');

const router = express.Router();

router.get('/clusters', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await clusterStudents(pool);
    if (!result.success) {
      return res.status(422).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Clustering error:', err);
    res.status(500).json({ success: false, message: 'Server error clustering students' });
  }
});

router.get('/anomalies', authenticate, requireAdmin, async (req, res) => {
  try {
    const anomalies = await detectAnomalies(pool);
    res.json({ success: true, count: anomalies.length, anomalies });
  } catch (err) {
    console.error('Anomaly detection error:', err);
    res.status(500).json({ success: false, message: 'Server error detecting anomalies' });
  }
});

router.get('/me/summary', authenticate, async (req, res) => {
  try {
    if (!req.user.student_id) {
      return res.status(400).json({ success: false, message: 'Admin accounts do not have an attendance summary' });
    }

    const features = await computeStudentFeatures(pool, req.user.student_id);
    if (!features) {
      return res.json({ success: true, has_history: false });
    }

    res.json({ success: true, has_history: true, ...features });
  } catch (err) {
    console.error('Own summary error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching your attendance summary' });
  }
});

router.get('/risk', authenticate, requireAdmin, async (req, res) => {
  try {
    const [students] = await pool.query(
      `SELECT student_id, name FROM users WHERE role = 'student'`
    );

    const results = [];
    for (const student of students) {
      const features = await computeStudentFeatures(pool, student.student_id);
      if (!features) continue; 

      const prediction = await predictRisk(features);
      results.push({
        student_id: student.student_id,
        name: student.name,
        ...features,
        ...prediction
      });
    }

    results.sort((a, b) => b.risk_probability - a.risk_probability);

    res.json({ success: true, count: results.length, students: results });
  } catch (err) {
    console.error('Risk list error:', err);
    if (err.message.includes('No trained risk model')) {
      return res.status(503).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: 'Server error computing risk scores' });
  }
});


router.get('/risk/:student_id', authenticate, requireAdmin, async (req, res) => {
  try {
    const features = await computeStudentFeatures(pool, req.params.student_id);
    if (!features) {
      return res.status(404).json({
        success: false,
        message: 'No past events yet for this student — not enough history to score'
      });
    }

    const prediction = await predictRisk(features);
    res.json({ success: true, student_id: req.params.student_id, features, prediction });
  } catch (err) {
    console.error('Risk detail error:', err);
    if (err.message.includes('No trained risk model')) {
      return res.status(503).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: 'Server error computing risk score' });
  }
});

router.get('/predict/:eventId', authenticate, requireAdmin, async (req, res) => {
  try {
    const [eventRows] = await pool.query('SELECT * FROM events WHERE id = ?', [req.params.eventId]);
    if (eventRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    const event = eventRows[0];

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users WHERE role = 'student'`
    );
    const total_registered = countRows[0].total || 0;

    const prediction = await predictTurnout({
      event_date: event.event_date,
      event_time: event.event_time,
      total_registered
    });

    res.json({
      success: true,
      event: { id: event.id, title: event.title, event_date: event.event_date, event_time: event.event_time },
      total_registered_students: total_registered,
      prediction
    });
  } catch (err) {
    console.error('Prediction error:', err);
    if (err.message.includes('No trained model')) {
      return res.status(503).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: 'Server error generating prediction' });
  }
});

router.get('/summary', authenticate, requireAdmin, async (req, res) => {
  try {
    const [[studentCount]] = await pool.query(`SELECT COUNT(*) AS total FROM users WHERE role = 'student'`);
    const [[eventCount]] = await pool.query(`SELECT COUNT(*) AS total FROM events`);
    const [[presentCount]] = await pool.query(`SELECT COUNT(*) AS total FROM attendance WHERE status = 'present'`);
    const [[lateCount]] = await pool.query(`SELECT COUNT(*) AS total FROM attendance WHERE status = 'late'`);

    const [recentScans] = await pool.query(
      `SELECT a.student_id, u.name AS student_name, a.status, a.scanned_at, e.title AS event_title
       FROM attendance a
       JOIN users u ON u.student_id = a.student_id
       JOIN events e ON e.id = a.event_id
       ORDER BY a.scanned_at DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      summary: {
        total_students: studentCount.total,
        total_events: eventCount.total,
        total_present: presentCount.total,
        total_late: lateCount.total
      },
      recent_scans: recentScans
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching summary' });
  }
});

module.exports = router;
