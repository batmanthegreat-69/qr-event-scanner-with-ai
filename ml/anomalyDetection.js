/**
 * ml/anomalyDetection.js
 * Flags attendance scans that are statistically unusual FOR THAT SPECIFIC
 * STUDENT, using z-score analysis — the same math from our scratch test,
 * now applied to real data from the attendance table.
 *
 * A scan is flagged if it's more than Z_THRESHOLD standard deviations away
 * from that student's own typical "minutes late" pattern.
 */

const Z_THRESHOLD = 2;     // |z| above this counts as "unusual"
const MIN_HISTORY = 3;     // need at least this many OTHER scans to judge what's "normal"

function calculateMean(numbers) {
  return numbers.reduce((total, n) => total + n, 0) / numbers.length;
}

function calculateStdDev(numbers, mean) {
  const squaredDiffs = numbers.map((n) => (n - mean) ** 2);
  return Math.sqrt(calculateMean(squaredDiffs));
}

function calculateZScore(value, mean, stdDev) {
  if (stdDev === 0) return 0; // perfectly consistent student — nothing to flag against
  return (value - mean) / stdDev;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<Array>} flagged scans, sorted by how unusual they are (most first)
 */
async function detectAnomalies(pool) {
  // Pull every scan, joined with the event it belongs to (so we know the
  // scheduled start time) and the student's name (for display).
  const [rows] = await pool.query(`
    SELECT a.id, a.student_id, u.name AS student_name, a.event_id, e.title AS event_title,
           e.event_date, e.event_time, a.scanned_at
    FROM attendance a
    JOIN users u ON u.student_id = a.student_id
    JOIN events e ON e.id = a.event_id
    ORDER BY a.student_id, a.scanned_at ASC
  `);

  // Group every scan by student, computing "minutes late" for each one
  // (negative = arrived early, positive = arrived after the event started).
  const byStudent = new Map();
  for (const row of rows) {
    const eventDateTime = new Date(`${row.event_date}T${row.event_time}`);
    const scannedAt = new Date(row.scanned_at);
    const minutesLate = (scannedAt - eventDateTime) / 60000;

    if (!byStudent.has(row.student_id)) byStudent.set(row.student_id, []);
    byStudent.get(row.student_id).push({
      id: row.id,
      student_id: row.student_id,
      student_name: row.student_name,
      event_id: row.event_id,
      event_title: row.event_title,
      scanned_at: row.scanned_at,
      minutes_late: minutesLate
    });
  }

  const anomalies = [];

  for (const scans of byStudent.values()) {
    // Skip students who don't have enough scans yet to know what's "normal" for them
    if (scans.length < MIN_HISTORY + 1) continue;

    for (let i = 0; i < scans.length; i++) {
      const current = scans[i];
      // "Leave-one-out": compare this scan against all of the student's OTHER scans,
      // not including itself — otherwise a scan could never look unusual relative to a set that contains it.
      const others = scans.filter((_, idx) => idx !== i).map((s) => s.minutes_late);

      const mean = calculateMean(others);
      const stdDev = calculateStdDev(others, mean);
      const z = calculateZScore(current.minutes_late, mean, stdDev);

      if (Math.abs(z) > Z_THRESHOLD) {
        anomalies.push({
          ...current,
          minutes_late: Number(current.minutes_late.toFixed(1)),
          typical_minutes_late: Number(mean.toFixed(1)),
          z_score: Number(z.toFixed(2))
        });
      }
    }
  }

  anomalies.sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score));
  return anomalies;
}

module.exports = { detectAnomalies, calculateMean, calculateStdDev, calculateZScore };
