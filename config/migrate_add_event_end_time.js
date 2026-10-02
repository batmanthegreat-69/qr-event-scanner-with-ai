/**
 * config/migrate_add_event_end_time.js
 * Adds an end_time column to an EXISTING events table, so the system can
 * tell when an event is actually over (not just when it started).
 * Nullable on purpose: existing events created before this feature won't
 * have one, and the system falls back to "no defined end" for those
 * (same behavior as before this migration).
 *
 * Run with: node config/migrate_add_event_end_time.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'qr_attendance_db'
  });

  const [columns] = await connection.query(`SHOW COLUMNS FROM events`);
  const columnNames = columns.map((c) => c.Field);

  if (!columnNames.includes('end_time')) {
    await connection.query(`ALTER TABLE events ADD COLUMN end_time TIME NULL AFTER event_time`);
    console.log('✅ Added end_time column to events table');
  } else {
    console.log('ℹ️  end_time column already exists, skipping');
  }

  console.log('✅ Migration complete. Existing events will show end_time as NULL until you edit them.');
  await connection.end();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
