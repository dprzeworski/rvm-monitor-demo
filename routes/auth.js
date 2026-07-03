// routes/auth.js – logowanie, wylogowywanie, info o sesji, zmiana hasła
const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../database');

const router = express.Router();

// Logowanie
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'Podaj login i hasło' });

    const user = db.getUser(login);
    if (!user) return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });

    req.session.user = { id: user.id, login: user.login, imie: user.imie, rola: user.rola };
    res.json({ ok: true, user: { login: user.login, imie: user.imie, rola: user.rola } });
  } catch (err) {
    console.error('POST /api/auth/login:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Wylogowanie
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Info o zalogowanym użytkowniku
router.get('/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Niezalogowany' });
  res.json({ user: req.session.user });
});

// Zmiana własnego hasła
router.patch('/password', async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ error: 'Niezalogowany' });

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Podaj stare i nowe hasło' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Nowe hasło musi mieć min. 6 znaków' });

    const user = db.getUser(req.session.user.login);
    const ok   = await bcrypt.compare(oldPassword, user.password);
    if (!ok) return res.status(401).json({ error: 'Stare hasło jest nieprawidłowe' });

    const hash = await bcrypt.hash(newPassword, 12);
    db.updateUserPassword(user.id, hash);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/auth/password:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

module.exports = router;
