/**
 * config/db.js
 * ---------------------------------------------------------------------------
 * MySQL connection pool (mysql2/promise) + schema reference.
 *
 * SQL SCHEMA (run these once, or via `npm run init-db` which executes them
 * automatically using config/initDb.js):
 *
 * CREATE DATABASE IF NOT EXISTS qr_attendance_db;
 * USE qr_attendance_db;
 *
 * CREATE TABLE IF NOT EXISTS users (
 *   id            INT AUTO_INCREMENT PRIMARY KEY,
 *   name          VARCHAR(150) NOT NULL,
 *   email         VARCHAR(150) NOT NULL UNIQUE,
 *   password      VARCHAR(255) NOT NULL,          -- bcrypt hash
 *   role          ENUM('admin', 'student') NOT NULL DEFAULT 'student',
 *   student_id    VARCHAR(50) UNIQUE,             -- NULL for admins
 *   year_level    TINYINT,                        -- 1-4, NULL for admins
 *   block         ENUM('A', 'B'),                 -- NULL for admins
 *   qr_code       LONGTEXT,                       -- base64 data URL of the student's QR
 *   created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 *
 * CREATE TABLE IF NOT EXISTS events (
 *   id            INT AUTO_INCREMENT PRIMARY KEY,
 *   title         VARCHAR(200) NOT NULL,
 *   description   TEXT,
 *   event_date    DATE NOT NULL,
 *   event_time    TIME NOT NULL,
 *   end_time      TIME,                           -- when the event is over; NULL = unknown/legacy event
 *   location      VARCHAR(200),
 *   created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 *
 * CREATE TABLE IF NOT EXISTS attendance (
 *   id            INT AUTO_INCREMENT PRIMARY KEY,
 *   student_id    VARCHAR(50) NOT NULL,
 *   event_id      INT NOT NULL,
 *   status        ENUM('present', 'late') NOT NULL DEFAULT 'present',
 *   scanned_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   UNIQUE KEY unique_scan (student_id, event_id),   -- prevents duplicate scans
 *   FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
 *   FOREIGN KEY (student_id) REFERENCES users(student_id) ON DELETE CASCADE
 * );
 * ---------------------------------------------------------------------------
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'qr_attendance_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
  }
}

module.exports = { pool, testConnection };
