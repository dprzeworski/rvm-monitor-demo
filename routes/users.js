// routes/users.js – zarządzanie użytkownikami (tylko admin)
const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_ROLES = ['admin', 'user', 'viewer'];

// Lista użytkowników
router.get('/', requireAdmin, (req, res) => {
  try {
    res.json(db.getAllUsers());
  } catch (err) {
    console.error('GET /api/users:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Dodaj użytkownika
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { login, password, imie, rola } = req.body;

    if (!login || !password) return res.status(400).json({ error: 'Login i hasło są wymagane' });
    if (login.length < 3)    return res.status(400).json({ error: 'Login musi mieć min. 3 znaki' });
    if (password.length < 6) return res.status(400).json({ error: 'Hasło musi mieć min. 6 znaków' });
    if (rola && !ALLOWED_ROLES.includes(rola)) return res.status(400).json({ error: 'Nieprawidłowa rola' });

    const hash = await bcrypt.hash(password, 12);
    db.addUser({ login: login.trim(), password: hash, imie: imie?.trim() || '', rola: rola || 'user' });
    res.json({ ok: true });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Login już istnieje' });
    console.error('POST /api/users:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Zmień hasło użytkownika
router.patch('/:id/password', requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Hasło musi mieć min. 6 znaków' });
    const hash = await bcrypt.hash(password, 12);
    db.updateUserPassword(req.params.id, hash);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/users/:id/password:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Zmień rolę
router.patch('/:id/rola', requireAdmin, (req, res) => {
  try {
    const { rola } = req.body;
    if (!ALLOWED_ROLES.includes(rola)) return res.status(400).json({ error: 'Nieprawidłowa rola' });
    db.updateUserRola(req.params.id, rola);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/users/:id/rola:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Aktywuj/dezaktywuj
router.patch('/:id/toggle', requireAdmin, (req, res) => {
  try {
    db.toggleUser(req.params.id, req.body.aktywny ? 1 : 0);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/users/:id/toggle:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Usuń użytkownika
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    if (req.session.user.id === Number(req.params.id)) {
      return res.status(400).json({ error: 'Nie możesz usunąć własnego konta' });
    }
    db.deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/users/:id:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

module.exports = router;
