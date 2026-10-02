/**
 * config/initDb.js
 * Run with: npm run init-db
 * Creates the database (if missing) and all tables described in db.js.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'qr_attendance_db';

async function init() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await connection.query(`USE \`${DB_NAME}\``);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(150) NOT NULL,
      email         VARCHAR(150) NOT NULL UNIQUE,
      password      VARCHAR(255) NOT NULL,
      role          ENUM('admin', 'student') NOT NULL DEFAULT 'student',
      student_id    VARCHAR(50) UNIQUE,
      year_level    TINYINT,
      block         ENUM('A', 'B'),
      qr_code       LONGTEXT,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS events (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      title         VARCHAR(200) NOT NULL,
      description   TEXT,
      event_date    DATE NOT NULL,
      event_time    TIME NOT NULL,
      end_time      TIME,
      location      VARCHAR(200),
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      student_id    VARCHAR(50) NOT NULL,
      event_id      INT NOT NULL,
      status        ENUM('present', 'late') NOT NULL DEFAULT 'present',
      scanned_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_scan (student_id, event_id),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(student_id) ON DELETE CASCADE
    )
  `);

  console.log(`✅ Database "${DB_NAME}" and tables are ready.`);
  await connection.end();
}

init().catch((err) => {
  console.error('❌ Failed to initialize database:', err.message);
  process.exit(1);
});
