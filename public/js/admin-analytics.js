// public/js/admin-analytics.js
// Fetches dashboard data and renders it. Reuses the existing 'badge present'
// / 'badge late' class pattern (which style.css already re-themes onto
// Bootstrap colors) for risk/anomaly/cluster badges too, instead of adding
// new CSS for it.

let turnoutChart = null;

async function loadSummary() {
  const res = await fetch('/api/analytics/summary', { credentials: 'include' });
  const data = await res.json();
  if (!data.success) return;

  document.getElementById('stat-students').textContent = data.summary.total_students;
  document.getElementById('stat-events').textContent = data.summary.total_events;
  document.getElementById('stat-present').textContent = data.summary.total_present;
  document.getElementById('stat-late').textContent = data.summary.total_late;

  const tbody = document.getElementById('recent-scans-body');
  tbody.innerHTML = data.recent_scans
    .map(
      (r) => `<tr>
        <td>${r.student_name}</td>
        <td>${r.event_title}</td>
        <td><span class="badge ${r.status}">${r.status}</span></td>
        <td>${new Date(r.scanned_at).toLocaleString()}</td>
      </tr>`
    )
    .join('');
}

async function loadEventsForPrediction() {
  const res = await fetch('/api/events?scope=upcoming');
  const data = await res.json();
  const select = document.getElementById('predict-event-select');
  select.innerHTML = data.events
    .map((e) => `<option value="${e.id}">${e.title} — ${e.event_date}</option>`)
    .join('');
}

async function predictTurnout() {
  const eventId = document.getElementById('predict-event-select').value;
  if (!eventId) return;

  const res = await fetch(`/api/analytics/predict/${eventId}`, { credentials: 'include' });
  const data = await res.json();

  if (!data.success) {
    alert(data.message);
    return;
  }

  const { prediction, event, total_registered_students } = data;

  const ctx = document.getElementById('turnout-chart').getContext('2d');
  if (turnoutChart) turnoutChart.destroy();

  turnoutChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Registered', 'Predicted Attendees'],
      datasets: [
        {
          label: event.title,
          data: [total_registered_students, prediction.estimated_attendees],
          backgroundColor: ['#cfe2ff', '#0d6efd']
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: `Predicted turnout: ${prediction.predicted_turnout_percent}` } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

async function loadRiskStudents() {
  const tbody = document.getElementById('risk-students-body');
  try {
    const res = await fetch('/api/analytics/risk', { credentials: 'include' });
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted">${data.message}</td></tr>`;
      return;
    }
    if (data.students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted">No students with enough event history yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.students
      .slice(0, 10)
      .map((s) => {
        const trendArrow = s.recent_trend < -0.05 ? '↓' : s.recent_trend > 0.05 ? '↑' : '→';
        const riskBadgeClass = s.is_at_risk ? 'late' : 'present';
        return `<tr>
          <td>${s.name}</td>
          <td>${(s.attendance_rate * 100).toFixed(0)}%</td>
          <td>${s.absence_streak}</td>
          <td>${trendArrow} ${(s.recent_trend * 100).toFixed(0)}%</td>
          <td><span class="badge ${riskBadgeClass}">${s.risk_percent}</span></td>
        </tr>`;
      })
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted">Could not load risk data.</td></tr>`;
  }
}

async function loadAnomalies() {
  const tbody = document.getElementById('anomalies-body');
  try {
    const res = await fetch('/api/analytics/anomalies', { credentials: 'include' });
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted">${data.message}</td></tr>`;
      return;
    }
    if (data.anomalies.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted">No unusual scans detected.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.anomalies
      .slice(0, 10)
      .map((a) => `<tr>
        <td>${a.student_name}</td>
        <td>${a.event_title}</td>
        <td>${a.minutes_late} min</td>
        <td>~${a.typical_minutes_late} min</td>
        <td><span class="badge late">z = ${a.z_score}</span></td>
      </tr>`)
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted">Could not load anomaly data.</td></tr>`;
  }
}

async function loadClusters() {
  const container = document.getElementById('clusters-container');
  try {
    const res = await fetch('/api/analytics/clusters', { credentials: 'include' });
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `<p class="text-muted">${data.message}</p>`;
      return;
    }

    const badgeClassByLabel = { 'Reliable': 'present', 'Occasional Issues': 'late', 'Needs Attention': 'late' };
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);

    container.innerHTML = data.groups
      .map((group) => {
        const badgeClass = badgeClassByLabel[group.cluster_label] || 'present';
        const names = group.students
          .map((student) => {
            const details = student.year_level && student.block
              ? ` (${escapeHtml(student.year_level)}${escapeHtml(student.block)})`
              : '';
            return `<li>${escapeHtml(student.name)}${details}</li>`;
          })
          .join('');
        const count = group.students.length;
        return `<div class="card shadow-sm cluster-card">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center gap-2">
              <span class="badge ${badgeClass}">${escapeHtml(group.cluster_label)}</span>
              <span class="text-muted small">${count} student${count === 1 ? '' : 's'}</span>
            </div>
            <details class="cluster-details mt-3">
              <summary>View student${count === 1 ? '' : 's'}</summary>
              <ul class="cluster-student-list list-unstyled mb-0 mt-2">${names}</ul>
            </details>
          </div>
        </div>`;
      })
      .join('');
  } catch (err) {
    container.innerHTML = `<p class="text-muted">Could not load student groups.</p>`;
  }
}

async function loadStudents() {
  const tbody = document.getElementById('students-body');
  const yearLevel = document.getElementById('filter-year-level').value;
  const block = document.getElementById('filter-block').value;

  const params = new URLSearchParams();
  if (yearLevel) params.set('year_level', yearLevel);
  if (block) params.set('block', block);

  tbody.innerHTML = `<tr><td colspan="4" class="text-muted">Loading…</td></tr>`;

  try {
    const res = await fetch(`/api/students?${params.toString()}`, { credentials: 'include' });
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted">${data.message}</td></tr>`;
      return;
    }
    if (data.students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted">No students match this filter.</td></tr>`;
      return;
    }

    const yearLabels = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };

    tbody.innerHTML = data.students
      .map(
        (s) => `<tr>
          <td>${s.name}</td>
          <td>${s.student_id}</td>
          <td>${yearLabels[s.year_level] || '—'}</td>
          <td>${s.block ? `Block ${s.block}` : '—'}</td>
        </tr>`
      )
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted">Could not load students.</td></tr>`;
  }
}

document.getElementById('predict-btn').addEventListener('click', predictTurnout);
document.getElementById('filter-students-btn').addEventListener('click', loadStudents);

loadSummary();
loadEventsForPrediction();
loadRiskStudents();
loadAnomalies();
loadClusters();
loadStudents();
setInterval(loadSummary, 10000);
