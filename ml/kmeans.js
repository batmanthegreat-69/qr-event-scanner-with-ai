/**
 * ml/kmeans.js
 * A small, dependency-free k-means implementation that works on any
 * n-dimensional numeric vectors. This is the same algorithm you just
 * walked through manually — pick k centers, assign points to the nearest
 * one, recompute centers as the average, repeat until stable.
 */

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function averagePoint(points) {
  const dimensions = points[0].length;
  const avg = new Array(dimensions).fill(0);
  for (const point of points) {
    for (let d = 0; d < dimensions; d++) avg[d] += point[d];
  }
  return avg.map((sum) => sum / points.length);
}

/** Total squared distance of every point to its assigned cluster center — lower is a tighter, better fit. */
function calculateInertia(points, assignments, centers) {
  let total = 0;
  points.forEach((point, i) => {
    total += euclideanDistance(point, centers[assignments[i]]) ** 2;
  });
  return total;
}

function kmeansOnce(points, k, maxIterations) {
  const shuffled = [...points].sort(() => Math.random() - 0.5);
  let centers = shuffled.slice(0, k);
  let assignments = new Array(points.length).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    const newAssignments = points.map((point) => {
      let bestIndex = 0;
      let bestDistance = Infinity;
      centers.forEach((center, idx) => {
        const dist = euclideanDistance(point, center);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestIndex = idx;
        }
      });
      return bestIndex;
    });

    if (JSON.stringify(newAssignments) !== JSON.stringify(assignments)) changed = true;
    assignments = newAssignments;

    const newCenters = centers.map((oldCenter, clusterIdx) => {
      const assignedPoints = points.filter((_, i) => assignments[i] === clusterIdx);
      return assignedPoints.length > 0 ? averagePoint(assignedPoints) : oldCenter;
    });
    centers = newCenters;

    if (!changed) break;
  }

  return { assignments, centers };
}

/**
 * @param {number[][]} points - array of n-dimensional vectors
 * @param {number} k - number of clusters to find
 * @param {number} maxIterations
 * @param {number} restarts - run the whole algorithm this many times with different
 *                            random starting points, and keep the tightest result.
 *                            This protects against unlucky random initialization.
 * @returns {{ assignments: number[], centers: number[][] }}
 */
function kmeans(points, k, maxIterations = 100, restarts = 10) {
  if (points.length < k) {
    throw new Error(`Need at least ${k} data points to form ${k} clusters (got ${points.length}).`);
  }

  let best = null;
  let bestInertia = Infinity;

  for (let r = 0; r < restarts; r++) {
    const result = kmeansOnce(points, k, maxIterations);
    const inertia = calculateInertia(points, result.assignments, result.centers);
    if (inertia < bestInertia) {
      bestInertia = inertia;
      best = result;
    }
  }

  return best;
}

module.exports = { kmeans, euclideanDistance };
