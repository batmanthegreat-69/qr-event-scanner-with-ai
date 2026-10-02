require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const { testConnection } = require('./config/db');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const eventRoutes = require('./routes/events');
const attendanceRoutes = require('./routes/attendance');
const analyticsRoutes = require('./routes/analytics');
const { requirePageRole } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Core middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Protect role-specific pages before serving the static frontend.
app.get('/dashboard.html', requirePageRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/events.html', requirePageRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'events.html'));
});
app.get('/scan.html', requirePageRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scan.html'));
});
app.get('/student-dashboard.html', requirePageRole('student'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student-dashboard.html'));
});

// Public frontend (login, registration, and shared assets)
app.use(express.static(path.join(__dirname, 'public')));

// Redirect root to login page
app.get('/', (req, res) => { res.redirect('/login.html'); });
// API routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'QR Attendance API is running' });
});

// Fallback 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  await testConnection();
});
