/**
 * ml/trainModel.js
 * Trains a small feed-forward regression network to predict event turnout rate
 * from: [day_of_week, event_hour, total_registered_students].
 * Label: target_attendance_rate (0.0 - 1.0).
 *
 * Run with: node ml/trainModel.js  (or: npm run train)
 * Saves the trained model + normalization stats to /models/attendance-model/
 */
const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs');
const { saveModelToDisk } = require('../../risk-feature-update/ml/modelIO');

const CSV_PATH = path.join(__dirname, 'data', 'history.csv');
const MODEL_DIR = path.join(__dirname, '..', 'models', 'attendance-model');

function loadCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const header = raw[0].split(',');
  const rows = raw.slice(1).map((line) => line.split(',').map(Number));
  return { header, rows };
}


function normalize(values, min, max) {
  if (max === min) return values.map(() => 0);
  return values.map((v) => (v - min) / (max - min));
}

async function train() {
  console.log('📄 Loading dataset from', CSV_PATH);
  const { rows } = loadCsv(CSV_PATH);

  if (rows.length < 10) {
    throw new Error('Not enough training data in history.csv (need at least 10 rows).');
  }

  const dayOfWeek = rows.map((r) => r[0]);
  const eventHour = rows.map((r) => r[1]);
  const totalRegistered = rows.map((r) => r[2]);
  const targetRate = rows.map((r) => r[3]);

  const stats = {
    day_of_week: { min: Math.min(...dayOfWeek), max: Math.max(...dayOfWeek) },
    event_hour: { min: Math.min(...eventHour), max: Math.max(...eventHour) },
    total_registered_students: { min: Math.min(...totalRegistered), max: Math.max(...totalRegistered) }
  };

  const normDay = normalize(dayOfWeek, stats.day_of_week.min, stats.day_of_week.max);
  const normHour = normalize(eventHour, stats.event_hour.min, stats.event_hour.max);
  const normReg = normalize(totalRegistered, stats.total_registered_students.min, stats.total_registered_students.max);

  const inputs = normDay.map((_, i) => [normDay[i], normHour[i], normReg[i]]);

  const xs = tf.tensor2d(inputs);
  const ys = tf.tensor2d(targetRate.map((v) => [v]));

  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [3], units: 16, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' })); // output in [0, 1] like the label

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: 'meanSquaredError',
    metrics: ['mae']
  });

  console.log('🧠 Training model...');
  await model.fit(xs, ys, {
    epochs: 100,
    batchSize: 16,
    validationSplit: 0.15,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if ((epoch + 1) % 10 === 0) {
          console.log(
            `  epoch ${epoch + 1}/100 - loss: ${logs.loss.toFixed(4)} - val_loss: ${logs.val_loss.toFixed(4)}`
          );
        }
      }
    }
  });

  await saveModelToDisk(model, MODEL_DIR);

  fs.writeFileSync(path.join(MODEL_DIR, 'norm-stats.json'), JSON.stringify(stats, null, 2));

  console.log('✅ Model trained and saved to', MODEL_DIR);

  xs.dispose();
  ys.dispose();
}

train().catch((err) => {
  console.error(' Training failed:', err);
  process.exit(1);
});
