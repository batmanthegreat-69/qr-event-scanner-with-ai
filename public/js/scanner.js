// public/js/scanner.js
// Uses the html5-qrcode library (loaded via CDN in scan.html) to access the
// webcam, scan a student's QR code, and POST the decoded payload to the
// /api/attendance/scan endpoint.

const statusEl = document.getElementById('status-msg');
const eventSelect = document.getElementById('event-select');
const startBtn = document.getElementById('start-scan-btn');

let html5QrCode = null;
let isScanning = false;
let cooldown = false; // prevents rapid repeated posts for the same scan frame

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status-msg ${type}`;
  statusEl.style.display = 'block';
}

async function loadEvents() {
  try {
    const res = await fetch('/api/events?scope=upcoming');
    const data = await res.json();
    if (data.success) {
      eventSelect.innerHTML = data.events
        .map((e) => `<option value="${e.id}">${e.title} — ${e.event_date} ${e.event_time}</option>`)
        .join('');
    }
  } catch (err) {
    console.error('Failed to load events', err);
  }
}

async function onScanSuccess(decodedText) {
  if (cooldown) return;
  cooldown = true;

  const event_id = eventSelect.value;
  if (!event_id) {
    showStatus('Please select an event first.', 'error');
    cooldown = false;
    return;
  }

  try {
    const res = await fetch('/api/attendance/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ qr_payload: decodedText, event_id })
    });
    const data = await res.json();

    if (data.success) {
      showStatus(`✅ ${data.message}`, 'success');
    } else {
      showStatus(`⚠️ ${data.message}`, 'error');
    }
  } catch (err) {
    showStatus('❌ Network error while recording attendance', 'error');
  }

  // Allow the next distinct scan after a short cooldown
  setTimeout(() => { cooldown = false; }, 2500);
}

function onScanFailure() {
  // Called continuously while no QR code is in frame — intentionally ignored.
}

async function startScanner() {
  if (isScanning) return;
  html5QrCode = new Html5Qrcode('qr-reader');

  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      onScanFailure
    );
    isScanning = true;
    startBtn.textContent = 'Scanning...';
    startBtn.disabled = true;
  } catch (err) {
    showStatus('❌ Could not access camera: ' + err, 'error');
  }
}

startBtn.addEventListener('click', startScanner);
loadEvents();
