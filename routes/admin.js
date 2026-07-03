// routes/admin.js – endpointy panelu administracyjnego
const express             = require('express');
const router              = express.Router();
const db                  = require('../database');
const { requireAdmin }    = require('../middleware/auth');

// Tylko admin
router.use(requireAdmin);

// ── GET /api/admin/sync – status obu synchronizacji + aktywne źródło ────
router.get('/sync', (req, res) => {
  try {
    res.json({
      primarySource:     db.getSyncSource(),
      lastSync:          db.getLastSync(),
      lastSyncBinoq:     db.getLastSyncBinoq(),
      snapshotInterval:  db.getSnapshotInterval(),
    });
  } catch (err) {
    console.error('GET /api/admin/sync:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── POST /api/admin/snapshot-interval – zmień interwał snapshotu ─────────
router.post('/snapshot-interval', (req, res) => {
  const { minutes } = req.body;
  const min = parseInt(minutes);
  if (!min || min < 5 || min > 60) {
    return res.status(400).json({ error: 'Interwał musi być między 5 a 60 minut' });
  }
  try {
    db.setSnapshotInterval(min);
    const { restartSnapshotScheduler } = require('../snapshots');
    restartSnapshotScheduler(db);
    console.log(`[Admin] Interwał snapshotu zmieniony na ${min} min (przez ${req.session?.user?.login})`);
    res.json({ ok: true, minutes: min });
  } catch (err) {
    console.error('POST /api/admin/snapshot-interval:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── POST /api/admin/snapshot/run – ręczny snapshot ───────────────────────
router.post('/snapshot/run', (req, res) => {
  try {
    const { runSnapshot } = require('../snapshots');
    const result = runSnapshot(db);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('POST /api/admin/snapshot/run:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/stats – dane do wykresu ────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    const days  = parseInt(req.query.days) || 7;
    const hours = days * 24;
    res.json({
      snapshots:        db.getSnapshots(days),
      recent:           db.getRecentStatusChanges(hours, 2000),
      snapshotInterval: db.getSnapshotInterval(),
    });
  } catch (err) {
    console.error('GET /api/admin/stats:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── GET /api/admin/device-log/:sn – historia statusów urządzenia ──────────
router.get('/device-log/:sn', (req, res) => {
  try {
    const log = db.getDeviceStatusLog(req.params.sn, 100);
    res.json({ log });
  } catch (err) {
    console.error('GET /api/admin/device-log:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── POST /api/admin/sync-source – zmień główne źródło danych ────────────
router.post('/sync-source', (req, res) => {
  const { source } = req.body;
  if (!['tomra', 'binoq'].includes(source)) {
    return res.status(400).json({ error: 'Nieprawidłowe źródło. Dozwolone: tomra, binoq' });
  }
  try {
    db.setSyncSource(source);
    console.log(`[Admin] Główne źródło zmienione na: ${source} (przez ${req.session?.user?.login})`);
    res.json({ ok: true, primarySource: source });
  } catch (err) {
    console.error('POST /api/admin/sync-source:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── POST /api/admin/sync/:source – ręczne wyzwolenie synca ──────────────
router.post('/sync/:source', async (req, res) => {
  const { source } = req.params;
  if (!['tomra', 'binoq'].includes(source)) {
    return res.status(400).json({ error: 'Nieprawidłowe źródło' });
  }

  try {
    console.log(`[Admin] Ręczny sync: ${source} (przez ${req.session?.user?.login})`);

    let result;
    if (source === 'tomra') {
      const { runSync } = require('../tomra-sync');
      result = await runSync();
    } else {
      const { runBinoqSync } = require('../binoq-sync');
      result = await runBinoqSync(db);
    }

    if (result?.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      ok:      true,
      source,
      total:   result?.summary?.total   ?? null,
      online:  result?.summary?.online  ?? null,
      offline: result?.summary?.offline ?? null,
      updated: result?.summary?.updated ?? null,
      duration: result?.summary?.duration ?? null,
    });
  } catch (err) {
    console.error(`POST /api/admin/sync/${source}:`, err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
