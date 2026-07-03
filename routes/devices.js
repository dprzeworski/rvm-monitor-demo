// routes/devices.js – zarządzanie urządzeniami
const express = require('express');
const db      = require('../database');
const { requireEdit } = require('../middleware/auth');

const router = express.Router();

// Aktualizacja pól manualnych urządzenia
router.patch('/:sn', requireEdit, (req, res) => {
  try {
    const { sn }  = req.params;
    const updates = { ...req.body };
    const logs    = updates._logs || [];
    delete updates._logs;

    // Walidacja podstawowa – tylko dozwolone pola
    const allowedFields = ['statusManualny', 'pinguje', 'ipWyliczone', 'ostatniPingAuto', 'osobaOdp', 'flag'];
    const filtered = {};
    for (const k of allowedFields) {
      if (k in updates) filtered[k] = updates[k];
    }

    db.updateDeviceManual(sn, filtered);

    const device = db.getDevice(sn);
    for (const { pole, stara, nowa } of logs) {
      db.addChangelog({
        id:           `${Date.now()}${Math.random().toString(36).slice(2)}`,
        timestamp:    new Date().toISOString(),
        numerSeryjny: sn,
        nazwaSklepu:  device?.nazwaSklepu || '',
        miasto:       device?.miasto      || '',
        pole,
        staraWartosc: String(stara ?? ''),
        nowaWartosc:  String(nowa  ?? ''),
        uzytkownik:   req.session.user.login,
      });
    }

    res.json({ ok: true, ts: db.touchTs() });
  } catch (err) {
    console.error('PATCH /api/devices/:sn:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

module.exports = router;
