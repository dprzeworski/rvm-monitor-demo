// routes/sync.js – status synchronizacji i ręczne uruchomienie
const express = require('express');
const db      = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

let syncRunning = false;
let runSyncFn   = null; // ustawiane przez server.js

function setRunSync(fn) { runSyncFn = fn; }

// Status ostatniej synchronizacji
router.get('/status', (req, res) => {
  res.json(db.getLastSync() || { timestamp: null, total: 0, added: 0, statusChanged: 0 });
});

// Ręczne uruchomienie synchronizacji (tylko admin – chroni przed spamowaniem TOMRA)
router.post('/run', requireAdmin, async (req, res) => {
  if (syncRunning) return res.status(429).json({ error: 'Sync już trwa' });
  if (!runSyncFn)  return res.status(500).json({ error: 'Sync nie jest skonfigurowany' });

  syncRunning = true;
  res.json({ ok: true, message: 'Sync uruchomiony w tle' });

  try {
    await runSyncFn();
  } catch (err) {
    console.error('Sync error:', err);
  } finally {
    syncRunning = false;
  }
});

module.exports = router;
module.exports.setRunSync = setRunSync;
