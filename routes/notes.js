// routes/notes.js – notatki do urządzeń
const express = require('express');
const db      = require('../database');
const { requireEdit } = require('../middleware/auth');

const router = express.Router();

// Dodaj notatkę do urządzenia
router.post('/devices/:sn/notes', requireEdit, (req, res) => {
  try {
    const { sn } = req.params;
    const { id, tresc, autor, data, kategoria } = req.body;

    if (!tresc || !tresc.trim()) return res.status(400).json({ error: 'Treść notatki jest wymagana' });
    if (!id) return res.status(400).json({ error: 'Brak ID notatki' });
    if (kategoria && !['kontakt', 'serwis'].includes(kategoria)) {
      return res.status(400).json({ error: 'Nieprawidłowa kategoria' });
    }

    const device = db.getDevice(sn);
    if (!device) return res.status(404).json({ error: 'Urządzenie nie istnieje' });

    db.addNote(sn, {
      id,
      tresc:     tresc.trim(),
      autor:     autor || req.session.user.login,
      data:      data  || new Date().toISOString(),
      kategoria: kategoria || 'kontakt',
    });

    db.addChangelog({
      id:           `${Date.now()}${Math.random().toString(36).slice(2)}`,
      timestamp:    new Date().toISOString(),
      numerSeryjny: sn,
      nazwaSklepu:  device.nazwaSklepu || '',
      miasto:       device.miasto      || '',
      pole:         'Notatka',
      staraWartosc: '',
      nowaWartosc:  tresc.slice(0, 60),
      uzytkownik:   req.session.user.login,
    });

    res.json({ ok: true, ts: db.touchTs() });
  } catch (err) {
    console.error('POST /api/devices/:sn/notes:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Edytuj notatkę
router.patch('/notes/:id', requireEdit, (req, res) => {
  try {
    const { tresc, kategoria } = req.body;
    if (!tresc || !tresc.trim()) return res.status(400).json({ error: 'Treść notatki jest wymagana' });
    if (kategoria && !['kontakt', 'serwis'].includes(kategoria)) {
      return res.status(400).json({ error: 'Nieprawidłowa kategoria' });
    }
    db.updateNote(req.params.id, tresc.trim(), kategoria);
    res.json({ ok: true, ts: db.touchTs() });
  } catch (err) {
    console.error('PATCH /api/notes/:id:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Usuń notatkę
router.delete('/notes/:id', requireEdit, (req, res) => {
  try {
    db.deleteNote(req.params.id);
    res.json({ ok: true, ts: db.touchTs() });
  } catch (err) {
    console.error('DELETE /api/notes/:id:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

module.exports = router;
