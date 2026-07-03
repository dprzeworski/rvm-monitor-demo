// routes/sd.js – endpointy ServiceDesk
const express  = require('express');
const router   = express.Router();
const db       = require('../database');
const sdClient = require('../sd-client');
const { requireAdmin } = require('../middleware/auth');

// ── GET /api/sd/lookup/:nr – walidacja numeru zgłoszenia przed zapisem ──────
// Dostępne dla wszystkich zalogowanych
router.get('/lookup/:nr', async (req, res) => {
  const nr = req.params.nr?.trim();
  if (!nr) return res.status(400).json({ error: 'Brak numeru zgłoszenia' });

  // Sprawdź czy już istnieje w bazie
  const existing = db.getTicketByNrZgloszenia(nr);
  if (existing) {
    return res.status(409).json({
      error: `Zgłoszenie ${nr} już istnieje w systemie`,
      existingTicketId: existing.id,
    });
  }

  try {
    const sdReq  = await sdClient.getRequest(nr);
    const mapped = sdClient.mapSdRequestToTicket(sdReq);

    // Spróbuj automatycznie powiązać z urządzeniem po numerze klienta
    const clientNr = sdClient.extractClientNumber(mapped.nazwa_sklepu);
    let suggestedDevice = null;
    if (clientNr) {
      const allDevices = db.getAllDevices();
      suggestedDevice = allDevices.find(d => d.numerKlienta === clientNr) || null;
    }

    res.json({
      ok: true,
      sdData: mapped,
      suggestedDeviceSn: suggestedDevice?.numerSeryjny || null,
      suggestedDeviceName: suggestedDevice?.nazwaSklepu || null,
    });
  } catch (err) {
    console.error(`SD lookup ${nr}:`, err.message);
    res.status(404).json({ error: `Nie znaleziono zgłoszenia ${nr} w SD: ${err.message}` });
  }
});

// ── POST /api/sd/sync/:ticketId – ręczna synchronizacja jednego ticketa ─────
router.post('/sync/:ticketId', async (req, res) => {
  try {
    const ticket = db.getAllTickets().find(t => t.id === req.params.ticketId);
    if (!ticket) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia' });

    const { syncOneTicket } = require('../sd-sync');
    const result = await syncOneTicket(db, ticket);
    res.json(result);
  } catch (err) {
    console.error('POST /api/sd/sync:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Endpointy administracyjne (wymagają admina) ─────────────────────────────
router.use(requireAdmin);

// ── POST /api/sd/sync-all – ręczna synchronizacja wszystkich otwartych ─────
router.post('/sync-all', async (req, res) => {
  try {
    const { runSdSync } = require('../sd-sync');
    const result = await runSdSync(db);
    res.json(result);
  } catch (err) {
    console.error('POST /api/sd/sync-all:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/sd/interval – zmień interwał synchronizacji ───────────────────
router.post('/interval', (req, res) => {
  const { minutes } = req.body;
  const min = parseInt(minutes);
  if (!min || min < 5 || min > 240) {
    return res.status(400).json({ error: 'Interwał musi być między 5 a 240 minut' });
  }
  try {
    db.setSdSyncInterval(min);
    const { restartSdSync } = require('../sd-sync');
    restartSdSync(db);
    console.log(`[Admin] Interwał SD-sync zmieniony na ${min} min (przez ${req.session?.user?.login})`);
    res.json({ ok: true, minutes: min });
  } catch (err) {
    console.error('POST /api/sd/interval:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── GET /api/sd/status – status synchronizacji SD ────────────────────────────
router.get('/status', (req, res) => {
  try {
    res.json({
      lastSdSync:  db.getLastSdSync(),
      interval:    db.getSdSyncInterval(),
      configured:  !!(process.env.SD_API_KEY_1 || process.env.SD_API_KEY_2),
    });
  } catch (err) {
    console.error('GET /api/sd/status:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

module.exports = router;
