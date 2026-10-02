# QR Code Attendance Tracking System + ML Analytics

A full-stack Node.js/Express app for QR-based event attendance, with a
TensorFlow.js model that predicts event turnout.

## 1. Prerequisites

- Node.js 18+
- MySQL 8+ (running locally or reachable remotely)
- A webcam-equipped device for the scanner page

## 2. Install dependencies

```bash
cd qr-attendance-system
npm install
```

> `@tensorflow/tfjs-node` compiles a native binding on install — this can take
> a few minutes the first time.

## 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set your MySQL credentials, a strong `JWT_SECRET`, and adjust
`GRACE_PERIOD_MINUTES` if you want a different present/late cutoff.

## 4. Create the database and tables

```bash
npm run init-db
```

This connects to MySQL using your `.env` credentials, creates the
`qr_attendance_db` database (if it doesn't exist), and creates the `users`,
`events`, and `attendance` tables. (The raw SQL is also documented as
comments inside `config/db.js` if you'd rather run it manually.)

## 5. Dataset generation (for the ML model)

A sample synthetic dataset is already included at `ml/data/history.csv`
(300 rows of `day_of_week, event_hour, total_registered_students,
target_attendance_rate`). To regenerate or expand it with your own logic,
edit or replace that CSV — the trainer just needs those four columns.

## 6. Train the ML model

```bash
npm run train
```

This reads `ml/data/history.csv`, trains a small feed-forward regression
network with `@tensorflow/tfjs-node`, and saves the model + normalization
stats to `models/attendance-model/`. Re-run this any time you update the
dataset.

## 7. Run the server

```bash
npm start
```

Or for auto-reload during development:

```bash
npm run dev
```

The server starts at `http://localhost:3000` (or your configured `PORT`).

## 8. Using the app

1. Go to `/register.html` to create a **student** account (each student gets
   an auto-generated QR code shown on screen — save/print it). Admin accounts
   must be provisioned separately; public registration cannot create them.
2. Log in via `/login.html` to receive a JWT, stored automatically as an
   HTTP-only cookie.
3. As an admin, create an event: `POST /api/events`.
4. Go to `/scan.html`, pick the event, start the camera, and scan student QR
   codes. Each scan hits `POST /api/attendance/scan`, which prevents
   duplicates and marks `present`/`late` based on `GRACE_PERIOD_MINUTES`.
5. Go to `/dashboard.html` to see live totals, recent scans, and — for any
   upcoming event — a Chart.js graph of the ML-predicted turnout
   (`GET /api/analytics/predict/:eventId`).

## API summary

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | Create user, auto-generate QR for students |
| POST | `/api/auth/login` | public | Issue JWT (cookie + body) |
| POST | `/api/auth/logout` | public | Clear auth cookie |
| GET | `/api/auth/me` | authenticated | Return the current user's role |
| GET | `/api/students` | admin | List all students |
| GET | `/api/students/me` | authenticated | Own profile + QR |
| GET | `/api/events` | public | List events (`?scope=upcoming\|past\|all`) |
| POST | `/api/events` | admin | Create event |
| DELETE | `/api/events/:id` | admin | Delete event |
| POST | `/api/attendance/scan` | admin | Record a scan (validates, dedupes, present/late) |
| GET | `/api/attendance/event/:event_id` | admin | Attendance for one event |
| GET | `/api/attendance/student/:student_id` | admin | Attendance history for one student |
| GET | `/api/analytics/summary` | admin | Dashboard totals + recent scans |
| GET | `/api/analytics/predict/:eventId` | admin | ML-predicted turnout for an event |

## Notes on the ML model

- **Features:** `day_of_week` (0–6), `event_hour` (0–23),
  `total_registered_students`.
- **Label:** `target_attendance_rate` (0.0–1.0), i.e. the historical fraction
  of registered students who actually showed up.
- Min-max normalization stats are computed at training time and saved to
  `models/attendance-model/norm-stats.json` so `predict.js` applies the exact
  same scaling to new inputs.
- If `models/attendance-model/model.json` doesn't exist yet,
  `/api/analytics/predict/:eventId` returns a 503 telling you to run
  `npm run train` first.
