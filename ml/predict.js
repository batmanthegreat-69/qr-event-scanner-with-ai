
const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs');
const { loadModelFromDisk, modelExists } = require('./modelIO');

const MODEL_DIR = path.join(__dirname, '..', 'models', 'attendance-model');
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
    throw new Error('No trained model found. Run "node ml/trainModel.js" first.');
  }

  cachedModel = await loadModelFromDisk(MODEL_DIR);
  cachedStats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));

  return { model: cachedModel, stats: cachedStats };
}

/**
 * @param {Object} params
 * @param {string} params.event_date - 'YYYY-MM-DD'
 * @param {string} params.event_time - 'HH:MM:SS' or 'HH:MM'
 * @param {number} params.total_registered - number of students registered for the event
 * @returns {Promise<{ predicted_turnout_rate: number, predicted_turnout_percent: string }>}
 */
async function predictTurnout({ event_date, event_time, total_registered }) {
  const { model, stats } = await loadModel();

  const dateObj = new Date(`${event_date}T${event_time}`);
  const dayOfWeek = dateObj.getDay(); // 0 (Sun) - 6 (Sat)
  const eventHour = dateObj.getHours();

  const normDay = normalize(dayOfWeek, stats.day_of_week.min, stats.day_of_week.max);
  const normHour = normalize(eventHour, stats.event_hour.min, stats.event_hour.max);
  const normReg = normalize(
    total_registered,
    stats.total_registered_students.min,
    stats.total_registered_students.max
  );

  const inputTensor = tf.tensor2d([[normDay, normHour, normReg]]);
  const outputTensor = model.predict(inputTensor);
  const [rate] = await outputTensor.data();

  inputTensor.dispose();
  outputTensor.dispose();

  const clampedRate = Math.min(Math.max(rate, 0), 1);

  return {
    predicted_turnout_rate: Number(clampedRate.toFixed(4)),
    predicted_turnout_percent: `${(clampedRate * 100).toFixed(1)}%`,
    estimated_attendees: Math.round(clampedRate * total_registered)
  };
}

module.exports = { predictTurnout };