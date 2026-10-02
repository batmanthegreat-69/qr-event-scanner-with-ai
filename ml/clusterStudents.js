
const { kmeans } = require('./kmeans');
const { computeStudentFeatures } = require('./predictRisk');

const K = 3;

function normalize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0);
  return values.map((v) => (v - min) / (max - min));
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<Array<{cluster_label:string, students:Array}>>}
 */
async function clusterStudents(pool) {
  const [studentRows] = await pool.query(`SELECT student_id, name FROM users WHERE role = 'student'`);

  const withFeatures = [];
  for (const student of studentRows) {
    const features = await computeStudentFeatures(pool, student.student_id);
    if (features) withFeatures.push({ ...student, ...features });
  }

  if (withFeatures.length < K) {
    return { success: false, message: `Need at least ${K} students with event history to form ${K} groups.` };
  }

  // Normalize each dimension to 0-1 so no single feature (like absence_streak,
  // which might range 0-6) dominates the distance calculation over the others.
  const attendanceRates = withFeatures.map((s) => s.attendance_rate);
  const lateRates = withFeatures.map((s) => s.late_rate);
  const streaks = normalize(withFeatures.map((s) => s.absence_streak));
  const trends = normalize(withFeatures.map((s) => s.recent_trend));

  const vectors = withFeatures.map((_, i) => [
    attendanceRates[i], // already 0-1
    lateRates[i],       // already 0-1
    streaks[i],
    trends[i]
  ]);

  const { assignments, centers } = kmeans(vectors, K);

  // Rank clusters by their center's attendance_rate (dimension 0), highest first,
  // so we can attach meaningful labels instead of arbitrary cluster numbers.
  const clusterOrder = centers
    .map((center, idx) => ({ idx, attendanceRate: center[0] }))
    .sort((a, b) => b.attendanceRate - a.attendanceRate)
    .map((c) => c.idx);

  const labels = ['Reliable', 'Occasional Issues', 'Needs Attention'];
  const labelByClusterIdx = {};
  clusterOrder.forEach((clusterIdx, rank) => {
    labelByClusterIdx[clusterIdx] = labels[rank] || `Group ${rank + 1}`;
  });

  const grouped = {};
  withFeatures.forEach((student, i) => {
    const clusterIdx = assignments[i];
    const label = labelByClusterIdx[clusterIdx];
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push({
      student_id: student.student_id,
      name: student.name,
      attendance_rate: student.attendance_rate,
      late_rate: student.late_rate,
      absence_streak: student.absence_streak,
      recent_trend: student.recent_trend
    });
  });

  return {
    success: true,
    groups: labels
      .filter((label) => grouped[label])
      .map((label) => ({ cluster_label: label, students: grouped[label] }))
  };
}

module.exports = { clusterStudents };
