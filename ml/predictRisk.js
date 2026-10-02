
const fs = require('fs');
const path = require('path');
const { loadModelFromDisk, modelExists } = require('./modelIO');

const MODEL_DIR = path.join(__dirname, '..', 'models', 'risk-model');
const STATS_PATH = path.join(MODEL_DIR, 'norm-stats.json');

let cachedModel = null;
let cachedStats = null;

function normalize(value, min, max) {
  if (max === min) return 0;
  const clamped = Math.min(Math.max(value, min), max);
  return (clamped - min) / (max - min);
}

async function loadModel() {
  if (cachedModel && cachedStats) return { model: cachedModel, stats: cachedStats };

  if (!modelExists(MODEL_DIR)) {
    throw new Error('No trained risk model found. Run "node ml/trainRiskModel.js" first.');
  }

  cachedModel = await loadModelFromDisk(MODEL_DIR);
  cachedStats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));

  return { model: cachedModel, stats: cachedStats };
}

/**
 * Computes the 5 behavioral features for a student from real attendance data.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} student_id
 * @returns {Promise<{attendance_rate:number, late_rate:number, avg_lateness_minutes:number, absence_streak:number, recent_trend:number, eligible_events:number} | null>}
 *          Returns null if the student has no past eligible events yet (not enough history).
 */
async function computeStudentFeatures(pool, student_id) {
  // All events that have already happened, oldest -> newest
  const [pastEvents] = await pool.query(
    `SELECT id, event_date, event_time FROM events
     WHERE TIMESTAMP(event_date, event_time) <= NOW()
     ORDER BY event_date ASC, event_time ASC`
  );

  if (pastEvents.length === 0) return null;

  const [attendanceRows] = await pool.query(
    `SELECT event_id, status, scanned_at FROM attendance WHERE student_id = ?`,
    [student_id]
  );
  const attendanceByEvent = new Map(attendanceRows.map((r) => [r.event_id, r]));

  const eligible = pastEvents.length;
  let attendedCount = 0;
  let lateCount = 0;
  let totalLatenessMinutes = 0;

  // Build a per-event "attended?" sequence in chronological order for streak/trend calc
  const attendedSequence = [];

  for (const event of pastEvents) {
    const record = attendanceByEvent.get(event.id);
    const attended = !!record;
    attendedSequence.push(attended);

    if (attended) {
      attendedCount++;
      if (record.status === 'late') {
        lateCount++;
        const eventDateTime = new Date(`${event.event_date}T${event.event_time}`);
        const scannedAt = new Date(record.scanned_at);
        const diffMinutes = Math.max(0, (scannedAt - eventDateTime) / 60000);
        totalLatenessMinutes += diffMinutes;
      }
    }
  }

  const attendance_rate = attendedCount / eligible;
  const late_rate = attendedCount > 0 ? lateCount / attendedCount : 0;
  const avg_lateness_minutes = lateCount > 0 ? totalLatenessMinutes / lateCount : 0;

  // Absence streak: consecutive misses counting back from the most recent event
  let absence_streak = 0;
  for (let i = attendedSequence.length - 1; i >= 0; i--) {
    if (attendedSequence[i]) break;
    absence_streak++;
  }

  // Recent trend: attendance rate over the last min(5, eligible) events minus overall rate
  const recentWindow = attendedSequence.slice(-Math.min(5, eligible));
  const recentRate = recentWindow.filter(Boolean).length / recentWindow.length;
  const recent_trend = recentRate - attendance_rate;

  return {
    attendance_rate: Number(attendance_rate.toFixed(3)),
    late_rate: Number(late_rate.toFixed(3)),
    avg_lateness_minutes: Number(avg_lateness_minutes.toFixed(1)),
    absence_streak,
    recent_trend: Number(recent_trend.toFixed(3)),
    eligible_events: eligible
  };
}

/**
 * @param {Object} features - output of computeStudentFeatures
 * @returns {Promise<{risk_probability:number, risk_percent:string, is_at_risk:boolean}>}
 */
async function predictRisk(features) {
  const { model, stats } = await loadModel();

  const normLateness = normalize(
    features.avg_lateness_minutes,
    stats.avg_lateness_minutes.min,
    stats.avg_lateness_minutes.max
  );
  const normStreak = normalize(features.absence_streak, stats.absence_streak.min, stats.absence_streak.max);
  const normTrend = normalize(features.recent_trend, stats.recent_trend.min, stats.recent_trend.max);

  const tf = require('@tensorflow/tfjs');
  const inputTensor = tf.tensor2d([[
    features.attendance_rate,
    features.late_rate,
    normLateness,
    normStreak,
    normTrend
  ]]);

  const outputTensor = model.predict(inputTensor);
  const [probability] = await outputTensor.data();

  inputTensor.dispose();
  outputTensor.dispose();

  const clamped = Math.min(Math.max(probability, 0), 1);

  return {
    risk_probability: Number(clamped.toFixed(4)),
    risk_percent: `${(clamped * 100).toFixed(1)}%`,
    is_at_risk: clamped >= 0.5
  };
}

module.exports = { computeStudentFeatures, predictRisk };
