// routes/tickets.js – zgłoszenia i notatki do zgłoszeń
const express = require('express');
const db      = require('../database');
const { requireEdit } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_STATUSES  = ['otwarty', 'w_toku', 'zamkniety'];
const ALLOWED_PRIORYTET = ['niski', 'sredni', 'wysoki'];
const DZIAL_OPTIONS     = ['', 'HelpDesk IT', 'Serwis Zewnętrzny', 'Utrzymanie Nieruchomości', 'DT Elektryczny', 'DT Ochrona Środowiska', 'Tomra', 'Inny'];

// Dodaj zgłoszenie — pobiera dane z SD na podstawie numeru zgłoszenia
router.post('/', requireEdit, async (req, res) => {
  try {
    const { nrZgloszenia, deviceId } = req.body;
    if (!nrZgloszenia?.trim()) {
      return res.status(400).json({ error: 'Numer zgłoszenia z SD jest wymagany' });
    }

    const nr = nrZgloszenia.trim();

    // Sprawdź czy już istnieje
    const existing = db.getTicketByNrZgloszenia(nr);
    if (existing) {
      return res.status(409).json({ error: `Zgłoszenie ${nr} już istnieje w systemie`, existingTicketId: existing.id });
    }

    // Pobierz dane z SD
    const sdClient = require('../sd-client');
    let sdReq;
    try {
      sdReq = await sdClient.getRequest(nr);
    } catch (err) {
      return res.status(404).json({ error: `Nie znaleziono zgłoszenia ${nr} w SD: ${err.message}` });
    }
    const mapped = sdClient.mapSdRequestToTicket(sdReq);

    // Spróbuj automatycznie powiązać z urządzeniem (po numerze klienta z requester.name)
    let finalDeviceId = deviceId || '';
    if (!finalDeviceId) {
      const clientNr = sdClient.extractClientNumber(mapped.nazwa_sklepu);
      if (clientNr) {
        const found = db.getAllDevices().find(d => d.numerKlienta === clientNr);
        if (found) finalDeviceId = found.numerSeryjny;
      }
    }

    // Pobierz notatki z SD
    let sdNotes = [];
    try {
      const notes = await sdClient.getNotes(nr);
      sdNotes = notes.map(n => sdClient.mapSdNote(n));
    } catch (err) {
      console.warn(`[SD] Nie udało się pobrać notatek dla ${nr}:`, err.message);
    }

    const ticketId = Date.now().toString();
    const now      = new Date().toISOString();

    db.addTicket({
      id:           ticketId,
      deviceId:     finalDeviceId,
      nazwaSklepu:  mapped.nazwa_sklepu,
      opis:         mapped.opis,
      priorytet:    mapped.priorytet,
      nrZgloszenia: nr,
      dzial:        mapped.dzial,
      osobaOdp:     req.session.user.login, // login zalogowanego, jak prosiłeś
      status:       mapped.status,
      created:      now,
      updated:      now,
      by:           req.session.user.login,
    });

    // Zapisz pełne dane z SD (opis_dlugi, sd_*, sd_notes)
    db.updateTicketFromSd(ticketId, {
      ...mapped,
      sd_notes:     sdNotes,
      sd_last_sync: now,
    });

    db.addChangelog({
      id:           `${Date.now()}${Math.random().toString(36).slice(2)}`,
      timestamp:    now,
      numerSeryjny: finalDeviceId,
      nazwaSklepu:  mapped.nazwa_sklepu,
      miasto:       '',
      pole:         'Nowe zgłoszenie (z SD)',
      staraWartosc: '',
      nowaWartosc:  `${nr}: ${mapped.opis.slice(0, 60)}`,
      uzytkownik:   req.session.user.login,
    });

    res.json({ ok: true, ts: db.touchTs(), ticketId });
  } catch (err) {
    console.error('POST /api/tickets:', err);
    res.status(500).json({ error: 'Błąd serwera: ' + err.message });
  }
});

// Aktualizuj zgłoszenie (status, nr, dział itd.)
router.patch('/:id', requireEdit, (req, res) => {
  try {
    const updates = req.body;
    if (updates.status && !ALLOWED_STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: 'Nieprawidłowy status' });
    }
    if (updates.dzial && !DZIAL_OPTIONS.includes(updates.dzial)) {
      return res.status(400).json({ error: 'Nieprawidłowy dział' });
    }
    db.updateTicket(req.params.id, updates);
    res.json({ ok: true, ts: db.touchTs() });
  } catch (err) {
    console.error('PATCH /api/tickets/:id:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Notatki są pobierane z SD — dodawanie ręczne zablokowane
router.post('/:id/notes', requireEdit, (req, res) => {
  res.status(403).json({ error: 'Notatki do zgłoszeń są pobierane z ServiceDesk — dodawanie ręczne jest wyłączone' });
});

module.exports = router;

// osobny router dla /api/ticket-notes/*
const ticketNotesRouter = express.Router();

ticketNotesRouter.patch('/:id', requireEdit, (req, res) => {
  try {
    const { tresc } = req.body;
    if (!tresc || !tresc.trim()) return res.status(400).json({ error: 'Treść notatki jest wymagana' });
    db.updateTicketNote(req.params.id, tresc.trim());
    res.json({ ok: true, ts: db.touchTs() });
  } catch (err) {
    console.error('PATCH /api/ticket-notes/:id:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

ticketNotesRouter.delete('/:id', requireEdit, (req, res) => {
  try {
    db.deleteTicketNote(req.params.id);
    res.json({ ok: true, ts: db.touchTs() });
  } catch (err) {
    console.error('DELETE /api/ticket-notes/:id:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

module.exports.ticketNotesRouter = ticketNotesRouter;
