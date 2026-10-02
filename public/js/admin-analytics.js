// public/js/analytics.js
// Fetches dashboard summary metrics and per-event ML turnout predictions,
// then renders them with Chart.js.

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
          backgroundColor: ['#c7d2fe', '#4f46e5']
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `Predicted turnout: ${prediction.predicted_turnout_percent}`
        }
      },
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
      tbody.innerHTML = `<tr><td colspan="5" style="color: var(--muted);">${data.message}</td></tr>`;
      return;
    }

    if (data.students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="color: var(--muted);">No students with enough event history yet.</td></tr>`;
      return;
    }

    // Show top at-risk students first; cap the list so the dashboard stays readable.
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
    tbody.innerHTML = `<tr><td colspan="5" style="color: var(--muted);">Could not load risk data.</td></tr>`;
  }
}

async function loadAnomalies() {
  const tbody = document.getElementById('anomalies-body');
  try {
    const res = await fetch('/api/analytics/anomalies', { credentials: 'include' });
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="5" style="color: var(--muted);">${data.message}</td></tr>`;
      return;
    }

    if (data.anomalies.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="color: var(--muted);">No unusual scans detected.</td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="5" style="color: var(--muted);">Could not load anomaly data.</td></tr>`;
  }
}

async function loadClusters() {
  const container = document.getElementById('clusters-container');
  try {
    const res = await fetch('/api/analytics/clusters', { credentials: 'include' });
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `<p style="color: var(--muted);">${data.message}</p>`;
      return;
    }

    const badgeClassByLabel = {
      'Reliable': 'present',
      'Occasional Issues': 'late',
      'Needs Attention': 'late'
    };

    container.innerHTML = data.groups
      .map((group) => {
        const badgeClass = badgeClassByLabel[group.cluster_label] || 'present';
        // Show year/block next to each name when the backend provides it
        // (e.g. "Juan Dela Cruz (2A)"), falling back to just the name otherwise.
        const names = group.students
          .map((s) => (s.year_level && s.block ? `${s.name} (${s.year_level}${s.block})` : s.name))
          .join(', ');
        return `<div class="card">
          <span class="badge ${badgeClass}">${group.cluster_label}</span>
          <p style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted);">
            ${group.students.length} student(s)
          </p>
          <p style="font-size: 0.85rem;">${names}</p>
        </div>`;
      })
      .join('');
  } catch (err) {
    container.innerHTML = `<p style="color: var(--muted);">Could not load student groups.</p>`;
  }
}

/**
 * Loads the student roster into the "Students" table, optionally filtered
 * by year level and/or block via the dropdowns above the table.
 */
async function loadStudents() {
  const tbody = document.getElementById('students-body');
  const yearLevel = document.getElementById('filter-year-level').value;
  const block = document.getElementById('filter-block').value;

  const params = new URLSearchParams();
  if (yearLevel) params.set('year_level', yearLevel);
  if (block) params.set('block', block);

  tbody.innerHTML = `<tr><td colspan="4" style="color: var(--muted);">Loading…</td></tr>`;

  try {
    const res = await fetch(`/api/students?${params.toString()}`, { credentials: 'include' });
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="4" style="color: var(--muted);">${data.message}</td></tr>`;
      return;
    }

    if (data.students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="color: var(--muted);">No students match this filter.</td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="4" style="color: var(--muted);">Could not load students.</td></tr>`;
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
setInterval(loadSummary, 10000); // refresh "real-time" metrics every 10s
