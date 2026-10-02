
const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs');
const { saveModelToDisk } = require('./modelIO');

const CSV_PATH = path.join(__dirname, 'data', 'risk_history.csv');
const MODEL_DIR = path.join(__dirname, '..', 'models', 'risk-model');

function loadCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const rows = raw.slice(1).map((line) => line.split(',').map(Number));
  return rows;
}

function normalize(values, min, max) {
  if (max === min) return values.map(() => 0);
  return values.map((v) => (v - min) / (max - min));
}

async function train() {
  console.log('📄 Loading dataset from', CSV_PATH);
  const rows = loadCsv(CSV_PATH);

  if (rows.length < 20) {
    throw new Error('Not enough training data in risk_history.csv (need at least 20 rows).');
  }

  const attendanceRate = rows.map((r) => r[0]);
  const lateRate = rows.map((r) => r[1]);
  const avgLateness = rows.map((r) => r[2]);
  const absenceStreak = rows.map((r) => r[3]);
  const recentTrend = rows.map((r) => r[4]);
  const atRisk = rows.map((r) => r[5]);

  const stats = {
    avg_lateness_minutes: { min: Math.min(...avgLateness), max: Math.max(...avgLateness) },
    absence_streak: { min: Math.min(...absenceStreak), max: Math.max(...absenceStreak) }
  };

  const normLateness = normalize(avgLateness, stats.avg_lateness_minutes.min, stats.avg_lateness_minutes.max);
  const normStreak = normalize(absenceStreak, stats.absence_streak.min, stats.absence_streak.max);

  const trendMin = Math.min(...recentTrend);
  const trendMax = Math.max(...recentTrend);
  stats.recent_trend = { min: trendMin, max: trendMax };
  const normTrend = normalize(recentTrend, trendMin, trendMax);

  const inputs = attendanceRate.map((_, i) => [
    attendanceRate[i], 
    lateRate[i],         
    normLateness[i],
    normStreak[i],
    normTrend[i]
  ]);

  const xs = tf.tensor2d(inputs);
  const ys = tf.tensor2d(atRisk.map((v) => [v]));

  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [5], units: 16, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' })); 

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy']
  });

  console.log('🧠 Training at-risk classifier...');
  await model.fit(xs, ys, {
    epochs: 80,
    batchSize: 16,
    validationSplit: 0.15,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if ((epoch + 1) % 10 === 0) {
          console.log(
            `  epoch ${epoch + 1}/80 - loss: ${logs.loss.toFixed(4)} - acc: ${logs.acc.toFixed(3)} - val_acc: ${logs.val_acc.toFixed(3)}`
          );
        }
      }
    }
  });

  await saveModelToDisk(model, MODEL_DIR);
  fs.writeFileSync(path.join(MODEL_DIR, 'norm-stats.json'), JSON.stringify(stats, null, 2));

  console.log('✅ Risk model trained and saved to', MODEL_DIR);

  xs.dispose();
  ys.dispose();
}

train().catch((err) => {
  console.error(' Training failed:', err);
  process.exit(1);
});
