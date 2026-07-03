// routes/stats.js – endpointy statystyk dostępne dla wszystkich zalogowanych
const express = require('express');
const router  = express.Router();
const db      = require('../database');

// requireAuth jest już zaaplikowany globalnie w server.js (przed app.use(express.static))

// ── GET /api/stats – dane do wykresu i zmiany statusów ────────────────────
router.get('/', (req, res) => {
  try {
    const days  = parseInt(req.query.days) || 7;
    const hours = days * 24;
    res.json({
      snapshots:        db.getSnapshots(days),
      recent:           db.getRecentStatusChanges(hours, 2000),
      snapshotInterval: db.getSnapshotInterval(),
    });
  } catch (err) {
    console.error('GET /api/stats:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── GET /api/stats/device-log/:sn – historia statusów urządzenia ──────────
router.get('/device-log/:sn', (req, res) => {
  try {
    const log = db.getDeviceStatusLog(req.params.sn, 100);
    res.json({ log });
  } catch (err) {
    console.error('GET /api/stats/device-log:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── GET /api/stats/offline-report – raport offline > 1d + przywrócone ─────
router.get('/offline-report', (req, res) => {
  try {
    const date = req.query.date || null; // YYYY-MM-DD lub null = dziś
    const report = db.getOfflineReport(date);
    res.json(report);
  } catch (err) {
    console.error('GET /api/stats/offline-report:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

module.exports = router;
