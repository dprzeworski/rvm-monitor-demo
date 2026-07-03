// server.js – RVM Monitor (main)
const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const bcrypt      = require('bcrypt');
const session     = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const db = require('./database');
const { startSync, runSync } = require('./tomra-sync');
const { startBinoqSync }           = require('./binoq-sync');
const { startSnapshotScheduler }   = require('./snapshots');
const { startSdSync }              = require('./sd-sync');
const { requireAuth } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;
const SERVER_START = Date.now().toString();

// ── Konfiguracja podstawowa ───────────────────────────────────────────────
app.use(cors({ credentials: true }));
app.use(express.json({ limit: '50mb' }));

// ── Sesje ─────────────────────────────────────────────────────────────────
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  UWAGA: brak SESSION_SECRET w env – używam domyślnego (nie dla produkcji!)');
}

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'rvm-monitor-default-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge:   8 * 60 * 60 * 1000, // 8h
    httpOnly: true,
    sameSite: 'lax',
//    secure:   process.env.NODE_ENV === 'production', // HTTPS only w produkcji
  },
}));

// ── Wersja serwera (dla wymuszenia odświeżenia frontu po restarcie) ──────
app.get('/api/version', (req, res) => {
  res.json({ version: SERVER_START });
});

// ── Publiczne (bez logowania) ─────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Statyczne pliki strony logowania
app.use('/login-assets', express.static(path.join(__dirname, 'public')));

// Routery auth (publiczne endpointy logowania)
app.use('/api/auth', require('./routes/auth'));

// ── Wszystko poniżej wymaga logowania ─────────────────────────────────────
app.use(requireAuth);
app.use(express.static(path.join(__dirname, 'public')));

// Główny endpoint danych (czytanie – dostępne dla wszystkich zalogowanych)
app.get('/api/data', (req, res) => {
  try {
    res.json({
      devices:       db.getAllDevices(),
      tickets:       db.getAllTickets(),
      changelog:     db.getChangelog(500),
      ts:            db.getTs(),
      lastSync:      db.getLastSync(),
      lastSyncBinoq: db.getLastSyncBinoq(),
      lastPingCycle: db.getLastPing(),
    });
  } catch (err) {
    console.error('GET /api/data:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

app.get('/api/ts', (req, res) => {
  res.json({
    ts:            db.getTs(),
    lastSync:      db.getLastSync(),
    lastSyncBinoq: db.getLastSyncBinoq(),
    lastPingCycle: db.getLastPing(),
  });
});

// Routery – edycja wymaga roli (obsłużone w middleware wewnątrz każdego routera)
app.use('/api/devices',      require('./routes/devices'));
app.use('/api',              require('./routes/notes')); // obsługuje /devices/:sn/notes i /notes/:id

const ticketsRouter = require('./routes/tickets');
app.use('/api/tickets',       ticketsRouter);
app.use('/api/ticket-notes',  ticketsRouter.ticketNotesRouter);

app.use('/api/users',         require('./routes/users'));
app.use('/api/stats',         require('./routes/stats'));
app.use('/api/sd',            require('./routes/sd'));
app.use('/api/admin',         require('./routes/admin'));

const syncRouter = require('./routes/sync');
syncRouter.setRunSync(runSync);
app.use('/api/sync', syncRouter);

// ── Legacy – stary frontend mógł wołać /api/save ──────────────────────────
app.post('/api/save', (req, res) => {
  res.json({ ok: true, ts: db.getTs() });
});

// ── Błędy (catch-all) ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Błąd serwera' });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`✅ RVM Monitor na http://0.0.0.0:${PORT}`);
  console.log(`   DB: ${process.env.DB_PATH || path.join(__dirname, 'data', 'rvm.db')}`);

  // Utwórz domyślne konto admin jeśli brak użytkowników
  try {
    const users = db.getAllUsers();
    if (users.length === 0) {
      const hash = await bcrypt.hash('admin123', 12);
      db.addUser({ login: 'admin', password: hash, imie: 'Administrator', rola: 'admin' });
      console.log('✅ Utworzono domyślne konto: admin / admin123 – ZMIEŃ HASŁO!');
    }
  } catch (err) {
    console.error('Błąd tworzenia konta admin:', err);
  }

  startSync();
  startBinoqSync(db);
  startSnapshotScheduler(db);
  startSdSync(db);
});
