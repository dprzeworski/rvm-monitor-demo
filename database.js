// database.js – SQLite backend dla RVM Monitor
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_DIR  = process.env.DB_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'rvm.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Wydajność – WAL mode pozwala na równoległy odczyt i zapis
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ── Schema ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    numer_seryjny       TEXT PRIMARY KEY,
    siec                TEXT DEFAULT '',
    operator_drs        TEXT DEFAULT '',
    id_sklepu           TEXT DEFAULT '',
    nazwa_sklepu        TEXT DEFAULT '',
    region              TEXT DEFAULT '',
    zone                TEXT DEFAULT '',
    nr_punktu           TEXT DEFAULT '',
    gln                 TEXT DEFAULT '',
    numer_klienta       TEXT DEFAULT '',
    kod_pocztowy        TEXT DEFAULT '',
    ulica               TEXT DEFAULT '',
    miasto              TEXT DEFAULT '',
    umowa_serwis        TEXT DEFAULT '',
    model               TEXT DEFAULT '',
    zbierane            TEXT DEFAULT '',
    status_tomra        TEXT DEFAULT 'not_seen',
    czas_trwania        TEXT DEFAULT '',
    czas_sek            INTEGER DEFAULT 0,
    ostatnia            TEXT DEFAULT '',
    installation_id     INTEGER,
    store_id            INTEGER,
    connectivity_status TEXT DEFAULT '',
    extra_info          TEXT DEFAULT '',
    -- Pola manualne
    status_manualny     TEXT,
    pinguje             INTEGER,           -- NULL=nieznany, 1=tak, 0=nie
    ip_wyliczone        TEXT,
    ostatni_ping_auto   TEXT,
    osoba_odp           TEXT DEFAULT '',
    flag                TEXT,              -- NULL, 'zarzad', 'pilna'
    import_date         TEXT,
    clearing_house      TEXT,
    updated_at          TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    numer_seryjny TEXT NOT NULL REFERENCES devices(numer_seryjny) ON DELETE CASCADE,
    tresc       TEXT NOT NULL,
    autor       TEXT NOT NULL,
    data        TEXT NOT NULL,
    edytowana   INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id            TEXT PRIMARY KEY,
    device_id     TEXT,
    nazwa_sklepu  TEXT NOT NULL,
    opis          TEXT NOT NULL,
    priorytet     TEXT DEFAULT 'sredni',
    nr_zgloszenia TEXT DEFAULT '',
    dzial         TEXT DEFAULT '',
    osoba_odp     TEXT DEFAULT '',
    status        TEXT DEFAULT 'otwarty',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    created_by    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ticket_notes (
    id         TEXT PRIMARY KEY,
    ticket_id  TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    tresc      TEXT NOT NULL,
    autor      TEXT NOT NULL,
    data       TEXT NOT NULL,
    edytowana  INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS changelog (
    id            TEXT PRIMARY KEY,
    timestamp     TEXT NOT NULL,
    numer_seryjny TEXT DEFAULT '',
    nazwa_sklepu  TEXT DEFAULT '',
    miasto        TEXT DEFAULT '',
    pole          TEXT NOT NULL,
    stara_wartosc TEXT DEFAULT '',
    nowa_wartosc  TEXT DEFAULT '',
    uzytkownik    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    login      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    imie       TEXT DEFAULT '',
    rola       TEXT DEFAULT 'user',
    aktywny    INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS status_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp     TEXT NOT NULL,
    count_up      INTEGER DEFAULT 0,
    count_down    INTEGER DEFAULT 0,
    count_offline INTEGER DEFAULT 0,
    count_not_seen INTEGER DEFAULT 0,
    count_total   INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS device_status_log (
    id            TEXT PRIMARY KEY,
    timestamp     TEXT NOT NULL,
    numer_seryjny TEXT NOT NULL,
    nazwa_sklepu  TEXT DEFAULT '',
    stary_status  TEXT DEFAULT '',
    nowy_status   TEXT NOT NULL,
    reason        TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS offline_daily (
    date          TEXT NOT NULL,
    numer_seryjny TEXT NOT NULL,
    snapshot_time TEXT NOT NULL,
    PRIMARY KEY (date, numer_seryjny)
  );

  CREATE INDEX IF NOT EXISTS idx_status_snapshots_ts   ON status_snapshots(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_device_log_serial     ON device_status_log(numer_seryjny);
  CREATE INDEX IF NOT EXISTS idx_device_log_ts         ON device_status_log(timestamp DESC);

  CREATE INDEX IF NOT EXISTS idx_devices_miasto       ON devices(miasto);
  CREATE INDEX IF NOT EXISTS idx_devices_status_tomra ON devices(status_tomra);
  CREATE INDEX IF NOT EXISTS idx_devices_flag         ON devices(flag);
  CREATE INDEX IF NOT EXISTS idx_notes_serial         ON notes(numer_seryjny);
  CREATE INDEX IF NOT EXISTS idx_tickets_status       ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_changelog_timestamp  ON changelog(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket  ON ticket_notes(ticket_id);\
`);

// ── Migracja: pola BinoQ (jednorazowa, bezpieczna) ────────────────────────
{
  const existing = db.prepare('PRAGMA table_info(devices)').all().map(c => c.name);
  if (!existing.includes('status_binoq')) {
    db.prepare("ALTER TABLE devices ADD COLUMN status_binoq TEXT DEFAULT 'not_seen'").run();
    console.log('[DB] Migracja: dodano status_binoq');
  }
  if (!existing.includes('ostatnia_binoq')) {
    db.prepare("ALTER TABLE devices ADD COLUMN ostatnia_binoq TEXT DEFAULT ''").run();
    console.log('[DB] Migracja: dodano ostatnia_binoq');
  }
  if (!existing.includes('installation_id_binoq')) {
    db.prepare("ALTER TABLE devices ADD COLUMN installation_id_binoq TEXT DEFAULT ''").run();
    console.log('[DB] Migracja: dodano installation_id_binoq');
  }
  if (!existing.includes('reason_binoq')) {
    db.prepare("ALTER TABLE devices ADD COLUMN reason_binoq TEXT DEFAULT ''").run();
    console.log('[DB] Migracja: dodano reason_binoq');
  }
  if (!existing.includes('bins_binoq')) {
    db.prepare("ALTER TABLE devices ADD COLUMN bins_binoq TEXT DEFAULT ''").run();
    console.log('[DB] Migracja: dodano bins_binoq');
  }
  if (!existing.includes('status_binoq_since')) {
    db.prepare("ALTER TABLE devices ADD COLUMN status_binoq_since TEXT DEFAULT ''").run();
    console.log('[DB] Migracja: dodano status_binoq_since');
  }
  if (!existing.includes('uninstalled_at')) {
    db.prepare("ALTER TABLE devices ADD COLUMN uninstalled_at TEXT DEFAULT ''").run();
    console.log('[DB] Migracja: dodano uninstalled_at');
  }
}

// ── Migracja: kategoria notatek ───────────────────────────────────────────
{
  const existing = db.prepare('PRAGMA table_info(notes)').all().map(c => c.name);
  if (!existing.includes('kategoria')) {
    db.prepare("ALTER TABLE notes ADD COLUMN kategoria TEXT DEFAULT 'kontakt'").run();
    console.log('[DB] Migracja: dodano notes.kategoria');
  }
}

// ── Migracja: pola SD w tickets ───────────────────────────────────────────
{
  const existing = db.prepare('PRAGMA table_info(tickets)').all().map(c => c.name);
  const cols = [
    ['opis_dlugi',         "TEXT DEFAULT ''"],
    ['sd_status_name',     "TEXT DEFAULT ''"],
    ['sd_priority_color',  "TEXT DEFAULT ''"],
    ['sd_technician',      "TEXT DEFAULT ''"],
    ['sd_created_at',      "TEXT DEFAULT ''"],
    ['sd_category',        "TEXT DEFAULT ''"],
    ['sd_subcategory',     "TEXT DEFAULT ''"],
    ['sd_item',            "TEXT DEFAULT ''"],
    ['sd_requester_email', "TEXT DEFAULT ''"],
    ['sd_requester_phone', "TEXT DEFAULT ''"],
    ['sd_department',      "TEXT DEFAULT ''"],
    ['sd_site',            "TEXT DEFAULT ''"],
    ['sd_notes',           "TEXT DEFAULT ''"],          // JSON
    ['sd_resolution',      "TEXT DEFAULT ''"],
    ['sd_resolution_by',   "TEXT DEFAULT ''"],
    ['sd_resolution_on',   "TEXT DEFAULT ''"],
    ['sd_final_synced',    "INTEGER DEFAULT 0"],
    ['sd_last_sync',       "TEXT DEFAULT ''"],
    ['sd_error',           "TEXT DEFAULT ''"],
    ['sd_has_attachments', "INTEGER DEFAULT 0"],
  ];
  for (const [name, def] of cols) {
    if (!existing.includes(name)) {
      db.prepare(`ALTER TABLE tickets ADD COLUMN ${name} ${def}`).run();
      console.log(`[DB] Migracja: dodano tickets.${name}`);
    }
  }
}

// ── Meta helpers (ts, lastSync, lastPingCycle) ────────────────────────────
const metaGet = (key) => {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
};
const metaSet = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
};

// ── Devices ───────────────────────────────────────────────────────────────
function upsertDevice(d) {
  db.prepare(`
    INSERT INTO devices (
      numer_seryjny, siec, operator_drs, id_sklepu, nazwa_sklepu,
      region, zone, nr_punktu, gln, numer_klienta, kod_pocztowy, ulica,
      miasto, umowa_serwis, model, zbierane, status_tomra, czas_trwania,
      czas_sek, ostatnia, installation_id, store_id, connectivity_status, 
      clearing_house, status_manualny, pinguje, ip_wyliczone, ostatni_ping_auto,
      osoba_odp, flag, import_date, extra_info, updated_at
    ) VALUES (
      @numer_seryjny, @siec, @operator_drs, @id_sklepu, @nazwa_sklepu,
      @region, @zone, @nr_punktu, @gln, @numer_klienta, @kod_pocztowy, @ulica,
      @miasto, @umowa_serwis, @model, @zbierane, @status_tomra, @czas_trwania,
      @czas_sek, @ostatnia, @installation_id, @store_id, @connectivity_status,
      @clearing_house, @status_manualny, @pinguje, @ip_wyliczone, @ostatni_ping_auto,
      @osoba_odp, @flag, @import_date, @extra_info, @updated_at
    )
    ON CONFLICT(numer_seryjny) DO UPDATE SET
      siec = excluded.siec,
      operator_drs = excluded.operator_drs,
      id_sklepu = excluded.id_sklepu,
      nazwa_sklepu = excluded.nazwa_sklepu,
      region = excluded.region,
      zone = excluded.zone,
      nr_punktu = excluded.nr_punktu,
      gln = excluded.gln,
      numer_klienta = excluded.numer_klienta,
      kod_pocztowy = excluded.kod_pocztowy,
      ulica = excluded.ulica,
      miasto = excluded.miasto,
      umowa_serwis = excluded.umowa_serwis,
      model = excluded.model,
      zbierane = excluded.zbierane,
      status_tomra = excluded.status_tomra,
      czas_trwania = excluded.czas_trwania,
      czas_sek = excluded.czas_sek,
      ostatnia = excluded.ostatnia,
      installation_id = excluded.installation_id,
      store_id = excluded.store_id,
      connectivity_status = excluded.connectivity_status,
      clearing_house = excluded.clearing_house,
      import_date = excluded.import_date,
      extra_info = excluded.extra_info,
      updated_at = excluded.updated_at
  `).run({
    numer_seryjny:       d.numerSeryjny       || '',
    siec:                d.siec               || '',
    operator_drs:        d.operatorDRS        || '',
    id_sklepu:           d.idSklepu           || '',
    nazwa_sklepu:        d.nazwaSklepu        || '',
    region:              d.region             || '',
    zone:                d.zone               || '',
    nr_punktu:           d.nrPunktu           || '',
    gln:                 d.gln                || '',
    numer_klienta:       d.numerKlienta       || '',
    kod_pocztowy:        d.kodPocztowy        || '',
    ulica:               d.ulica              || '',
    miasto:              d.miasto             || '',
    umowa_serwis:        d.umowaSerwis        || '',
    model:               d.model              || '',
    zbierane:            d.zbierane           || '',
    status_tomra:        d.statusTomra        || 'not_seen',
    czas_trwania:        d.czasTrwania        || '',
    czas_sek:            d.czasSek            || 0,
    ostatnia:            d.ostatnia           || '',
    installation_id:     d.installationId     || null,
    store_id:            d.storeId            || null,
    connectivity_status: d.connectivityStatus || '',
    import_date:         d.importDate         || null,
    clearing_house:      d.clearingHouse      || null,
    extra_info:          d.extraInfo          || '',
    updated_at:          new Date().toISOString(),
    // pola manualne – domyślnie null dla nowych urządzeń
    status_manualny:  d.statusManualny  ?? null,
    pinguje:          d.pinguje === true ? 1 : d.pinguje === false ? 0 : null,
    ip_wyliczone:     d.ipWyliczone     ?? null,
    ostatni_ping_auto: d.ostatniPingAuto ?? null,
    osoba_odp:        d.osobaOdp        || '',
    flag:             d.flag            ?? null,
  });
}

function updateDeviceManual(numerSeryjny, updates) {
  const fields = [];
  const params = { numer_seryjny: numerSeryjny };

  const map = {
    statusManualny:  'status_manualny',
    pinguje:         'pinguje',
    ipWyliczone:     'ip_wyliczone',
    ostatniPingAuto: 'ostatni_ping_auto',
    osobaOdp:        'osoba_odp',
    flag:            'flag',
  };

  for (const [jsKey, sqlKey] of Object.entries(map)) {
    if (jsKey in updates) {
      fields.push(`${sqlKey} = @${sqlKey}`);
      let val = updates[jsKey];
      if (jsKey === 'pinguje') val = val === true ? 1 : val === false ? 0 : null;
      params[sqlKey] = val;
    }
  }

  if (fields.length === 0) return;
  fields.push('updated_at = @updated_at');
  params.updated_at = new Date().toISOString();

  db.prepare(`UPDATE devices SET ${fields.join(', ')} WHERE numer_seryjny = @numer_seryjny`).run(params);
}

function rowToDevice(row) {
  if (!row) return null;
  return {
    numerSeryjny:       row.numer_seryjny,
    siec:               row.siec,
    operatorDRS:        row.operator_drs,
    idSklepu:           row.id_sklepu,
    nazwaSklepu:        row.nazwa_sklepu,
    region:             row.region,
    zone:               row.zone,
    nrPunktu:           row.nr_punktu,
    gln:                row.gln,
    numerKlienta:       row.numer_klienta,
    kodPocztowy:        row.kod_pocztowy,
    ulica:              row.ulica,
    miasto:             row.miasto,
    umowaSerwis:        row.umowa_serwis,
    model:              row.model,
    zbierane:           row.zbierane,
    statusTomra:        row.status_tomra,
    czasTrwania:        row.czas_trwania,
    czasSek:            row.czas_sek,
    ostatnia:           row.ostatnia,
    installationId:     row.installation_id,
    storeId:            row.store_id,
    connectivityStatus: row.connectivity_status,
    statusManualny:     row.status_manualny,
    pinguje:            row.pinguje === 1 ? true : row.pinguje === 0 ? false : null,
    ipWyliczone:        row.ip_wyliczone,
    ostatniPingAuto:    row.ostatni_ping_auto,
    osobaOdp:           row.osoba_odp,
    flag:               row.flag,
    importDate:         row.import_date,
    clearingHouse:      row.clearing_house,
    extraInfo:          row.extra_info,
    statusBinoq:        row.status_binoq        || 'not_seen',
    ostatniaBinoq:      row.ostatnia_binoq       || '',
    installationIdBinoq: row.installation_id_binoq || '',
    reasonBinoq:        row.reason_binoq         || '',
    binsBinoq:          row.bins_binoq ? JSON.parse(row.bins_binoq) : [],
    statusBinoqSince:   row.status_binoq_since   || '',
    uninstalledAt:      row.uninstalled_at       || '',
    notatki:            [], // dołączane osobno
  };
}

function getAllDevices() {
  const devices = db.prepare('SELECT * FROM devices ORDER BY nazwa_sklepu').all().map(rowToDevice);
  const notes   = db.prepare('SELECT * FROM notes ORDER BY data DESC').all();

  // Dołącz notatki do urządzeń
  const notesBySerial = {};
  for (const n of notes) {
    if (!notesBySerial[n.numer_seryjny]) notesBySerial[n.numer_seryjny] = [];
    notesBySerial[n.numer_seryjny].push({
      id:        n.id,
      tresc:     n.tresc,
      autor:     n.autor,
      data:      n.data,
      edytowana: n.edytowana === 1,
      kategoria: n.kategoria || 'kontakt',
    });
  }

  for (const d of devices) {
    d.notatki = notesBySerial[d.numerSeryjny] || [];
  }

  return devices;
}

function getDevice(numerSeryjny) {
  const row = db.prepare('SELECT * FROM devices WHERE numer_seryjny = ?').get(numerSeryjny);
  if (!row) return null;
  const d = rowToDevice(row);
  d.notatki = db.prepare('SELECT * FROM notes WHERE numer_seryjny = ? ORDER BY data DESC').all(numerSeryjny)
    .map(n => ({ id:n.id, tresc:n.tresc, autor:n.autor, data:n.data, edytowana: n.edytowana===1, kategoria: n.kategoria || 'kontakt' }));
  return d;
}

// ── Notes ─────────────────────────────────────────────────────────────────
function addNote(numerSeryjny, { id, tresc, autor, data, kategoria }) {
  db.prepare('INSERT INTO notes (id, numer_seryjny, tresc, autor, data, kategoria) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, numerSeryjny, tresc, autor, data, kategoria || 'kontakt');
}

function updateNote(id, tresc, kategoria) {
  if (kategoria !== undefined) {
    db.prepare('UPDATE notes SET tresc = ?, kategoria = ?, edytowana = 1 WHERE id = ?').run(tresc, kategoria, id);
  } else {
    db.prepare('UPDATE notes SET tresc = ?, edytowana = 1 WHERE id = ?').run(tresc, id);
  }
}

function deleteNote(id) {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
}

// ── Tickets ───────────────────────────────────────────────────────────────
function getAllTickets() {
  const tickets = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all().map(rowToTicket);
  const notes   = db.prepare('SELECT * FROM ticket_notes ORDER BY data DESC').all();
  const notesByTicket = {};
  for (const n of notes) {
    if (!notesByTicket[n.ticket_id]) notesByTicket[n.ticket_id] = [];
    notesByTicket[n.ticket_id].push({ id:n.id, tresc:n.tresc, autor:n.autor, data:n.data, edytowana:n.edytowana===1 });
  }
  for (const t of tickets) t.notatki = notesByTicket[t.id] || [];
  return tickets;
}

function rowToTicket(row) {
  return {
    id:           row.id,
    deviceId:     row.device_id,
    nazwaSklepu:  row.nazwa_sklepu,
    opis:         row.opis,
    opisDlugi:    row.opis_dlugi    || '',
    priorytet:    row.priorytet,
    nrZgloszenia: row.nr_zgloszenia,
    dzial:        row.dzial,
    osobaOdp:     row.osoba_odp,
    status:       row.status,
    created:      row.created_at,
    updated:      row.updated_at,
    by:           row.created_by,
    // pola z SD
    sdStatusName:    row.sd_status_name    || '',
    sdPriorityColor: row.sd_priority_color || '',
    sdTechnician:    row.sd_technician     || '',
    sdCreatedAt:     row.sd_created_at     || '',
    sdCategory:      row.sd_category       || '',
    sdSubcategory:   row.sd_subcategory    || '',
    sdItem:          row.sd_item           || '',
    sdRequesterEmail: row.sd_requester_email || '',
    sdRequesterPhone: row.sd_requester_phone || '',
    sdDepartment:    row.sd_department     || '',
    sdSite:          row.sd_site           || '',
    sdNotes:         row.sd_notes ? JSON.parse(row.sd_notes) : [],
    sdResolution:    row.sd_resolution     || '',
    sdResolutionBy:  row.sd_resolution_by  || '',
    sdResolutionOn:  row.sd_resolution_on  || '',
    sdFinalSynced:   !!row.sd_final_synced,
    sdLastSync:      row.sd_last_sync      || '',
    sdError:         row.sd_error          || '',
    sdHasAttachments: !!row.sd_has_attachments,
  };
}

function addTicket(t) {
  db.prepare(`
    INSERT INTO tickets (id, device_id, nazwa_sklepu, opis, priorytet, nr_zgloszenia, dzial, osoba_odp, status, created_at, updated_at, created_by)
    VALUES (@id, @device_id, @nazwa_sklepu, @opis, @priorytet, @nr_zgloszenia, @dzial, @osoba_odp, @status, @created_at, @updated_at, @created_by)
  `).run({
    id:            t.id,
    device_id:     t.deviceId     || null,
    nazwa_sklepu:  t.nazwaSklepu  || '',
    opis:          t.opis         || '',
    priorytet:     t.priorytet    || 'sredni',
    nr_zgloszenia: t.nrZgloszenia || '',
    dzial:         t.dzial        || '',
    osoba_odp:     t.osobaOdp     || '',
    status:        t.status       || 'otwarty',
    created_at:    t.created      || new Date().toISOString(),
    updated_at:    t.updated      || new Date().toISOString(),
    created_by:    t.by           || '',
  });
}

function updateTicket(id, fields) {
  const allowed = ['status', 'nr_zgloszenia', 'dzial', 'osoba_odp', 'opis'];
  const map = { status:'status', nrZgloszenia:'nr_zgloszenia', dzial:'dzial', osobaOdp:'osoba_odp', opis:'opis' };
  const setClauses = [];
  const params = { id, updated_at: new Date().toISOString() };

  for (const [jsKey, sqlKey] of Object.entries(map)) {
    if (jsKey in fields) { setClauses.push(`${sqlKey} = @${sqlKey}`); params[sqlKey] = fields[jsKey]; }
  }
  if (setClauses.length === 0) return;
  setClauses.push('updated_at = @updated_at');
  db.prepare(`UPDATE tickets SET ${setClauses.join(', ')} WHERE id = @id`).run(params);
}

// ── Ticket notes ──────────────────────────────────────────────────────────
function addTicketNote(ticketId, { id, tresc, autor, data }) {
  db.prepare('INSERT INTO ticket_notes (id, ticket_id, tresc, autor, data) VALUES (?, ?, ?, ?, ?)')
    .run(id, ticketId, tresc, autor, data);
}

function updateTicketNote(id, tresc) {
  db.prepare('UPDATE ticket_notes SET tresc = ?, edytowana = 1 WHERE id = ?').run(tresc, id);
}

function deleteTicketNote(id) {
  db.prepare('DELETE FROM ticket_notes WHERE id = ?').run(id);
}

function getTicketNotes(ticketId) {
  return db.prepare('SELECT * FROM ticket_notes WHERE ticket_id = ? ORDER BY data DESC').all(ticketId)
    .map(n => ({ id:n.id, tresc:n.tresc, autor:n.autor, data:n.data, edytowana:n.edytowana===1 }));
}

// ── Users ─────────────────────────────────────────────────────────────────
function getUser(login) {
  return db.prepare('SELECT * FROM users WHERE login = ? AND aktywny = 1').get(login);
}
function getAllUsers() {
  return db.prepare('SELECT id, login, imie, rola, aktywny, created_at FROM users ORDER BY created_at DESC').all();
}
function addUser({ login, password, imie, rola }) {
  return db.prepare('INSERT INTO users (login, password, imie, rola) VALUES (?, ?, ?, ?)').run(login, password, imie||'', rola||'user');
}
function updateUserPassword(id, password) {
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(password, id);
}
function updateUserRola(id, rola) {
  db.prepare('UPDATE users SET rola = ? WHERE id = ?').run(rola, id);
}
function toggleUser(id, aktywny) {
  db.prepare('UPDATE users SET aktywny = ? WHERE id = ?').run(aktywny, id);
}
function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

// ── Changelog ─────────────────────────────────────────────────────────────
function addChangelog(entry) {
  db.prepare(`
    INSERT INTO changelog (id, timestamp, numer_seryjny, nazwa_sklepu, miasto, pole, stara_wartosc, nowa_wartosc, uzytkownik)
    VALUES (@id, @timestamp, @numer_seryjny, @nazwa_sklepu, @miasto, @pole, @stara_wartosc, @nowa_wartosc, @uzytkownik)
  `).run({
    id:            entry.id,
    timestamp:     entry.timestamp,
    numer_seryjny: entry.numerSeryjny  || '',
    nazwa_sklepu:  entry.nazwaSklepu   || '',
    miasto:        entry.miasto        || '',
    pole:          entry.pole          || '',
    stara_wartosc: entry.staraWartosc  || '',
    nowa_wartosc:  entry.nowaWartosc   || '',
    uzytkownik:    entry.uzytkownik    || '',

  });
  // Trzymaj tylko ostatnie 2000 wpisów
  db.prepare('DELETE FROM changelog WHERE id NOT IN (SELECT id FROM changelog ORDER BY timestamp DESC LIMIT 2000)').run();
}

function getChangelog(limit = 500) {
  return db.prepare('SELECT * FROM changelog ORDER BY timestamp DESC LIMIT ?').all(limit).map(row => ({
    id:           row.id,
    timestamp:    row.timestamp,
    numerSeryjny: row.numer_seryjny,
    nazwaSklepu:  row.nazwa_sklepu,
    miasto:       row.miasto,
    pole:         row.pole,
    staraWartosc: row.stara_wartosc,
    nowaWartosc:  row.nowa_wartosc,
    uzytkownik:   row.uzytkownik,
  }));
}

// ── Timestamp (do pollingu) ───────────────────────────────────────────────
function getTs()      { return metaGet('ts'); }
function touchTs()    { const ts = new Date().toISOString(); metaSet('ts', ts); return ts; }
function getLastSync(){ return metaGet('lastSync'); }
function setLastSync(s){ metaSet('lastSync', s); }
function getLastPing(){ return metaGet('lastPingCycle'); }
function setLastPing(p){ metaSet('lastPingCycle', p); }

// ── Bulk upsert (używany przez tomra-sync) ────────────────────────────────
const upsertMany = db.transaction((devices) => {
  for (const d of devices) upsertDevice(d);
});

// ── BinoQ sync ────────────────────────────────────────────────────────────
function upsertBinoqDevices(devices, summary) {
  const now       = new Date().toISOString();
  const isPrimary = getSyncSource() === 'binoq';

  const update = db.prepare(`
    UPDATE devices
    SET
      status_binoq          = @status_binoq,
      ostatnia_binoq        = @ostatnia_binoq,
      installation_id_binoq = @installation_id_binoq,
      reason_binoq          = @reason_binoq,
      bins_binoq            = @bins_binoq,
      status_binoq_since    = CASE
        WHEN status_binoq != @status_binoq THEN @now
        WHEN status_binoq_since = '' OR status_binoq_since IS NULL THEN @now
        ELSE status_binoq_since
      END,
      id_sklepu             = CASE WHEN id_sklepu = '' OR id_sklepu IS NULL THEN @id_sklepu ELSE id_sklepu END,
      numer_klienta         = CASE WHEN numer_klienta = '' OR numer_klienta IS NULL THEN @numer_klienta ELSE numer_klienta END,
      updated_at            = @updated_at
    WHERE numer_seryjny = @numer_seryjny
  `);

  const insert = db.prepare(`
    INSERT INTO devices (
      numer_seryjny, nazwa_sklepu, miasto, ulica, kod_pocztowy,
      id_sklepu, numer_klienta,
      model, status_binoq, ostatnia_binoq, installation_id_binoq, reason_binoq, bins_binoq,
      status_binoq_since, status_tomra, import_date, updated_at
    ) VALUES (
      @numer_seryjny, @nazwa_sklepu, @miasto, @ulica, @kod_pocztowy,
      @id_sklepu, @numer_klienta,
      @model, @status_binoq, @ostatnia_binoq, @installation_id_binoq, @reason_binoq, @bins_binoq,
      @status_binoq_since, 'not_seen', @import_date, @updated_at
    )
  `);

  const run = db.transaction((devices) => {
    let updated = 0, inserted = 0, notFound = 0;
    for (const d of devices) {
      if (!d.serialNumber) continue;

      const result = update.run({
        numer_seryjny:         d.serialNumber,
        status_binoq:          d.status,
        ostatnia_binoq:        d.lastSeen || now,
        installation_id_binoq: d.installationId || '',
        reason_binoq:          d.reasonPL || '',
        bins_binoq:            JSON.stringify(d.bins || []),
        id_sklepu:             d.storeReference || '',
        numer_klienta:         (d.locationName?.match(/\d{4,6}/) || [])[0] || '',
        now,
        updated_at:            now,
      });

      if (result.changes > 0) {
        updated++;
      } else if (isPrimary) {
        try {
          insert.run({
            numer_seryjny:         d.serialNumber,
            nazwa_sklepu:          d.locationName  || '',
            miasto:                d.city          || '',
            ulica:                 d.address       || '',
            kod_pocztowy:          d.zipCode       || '',
            id_sklepu:             d.storeReference || '',
            numer_klienta:         (d.locationName?.match(/\d{4,6}/) || [])[0] || '',
            model:                 d.model         || '',
            status_binoq:          d.status,
            ostatnia_binoq:        d.lastSeen      || now,
            installation_id_binoq: d.installationId || '',
            reason_binoq:          d.reasonPL      || '',
            bins_binoq:            JSON.stringify(d.bins || []),
            status_binoq_since:    now,
            import_date:           now,
            updated_at:            now,
          });
          inserted++;
        } catch (e) {
          console.warn(`[DB-BinoQ] Insert conflict: ${d.serialNumber}`);
        }
      } else {
        notFound++;
      }
    }
    return { updated, inserted, notFound };
  });

  const { updated, inserted, notFound } = run(devices);

  metaSet('lastSyncBinoq', {
    timestamp: summary.timestamp,
    total:     summary.total,
    online:    summary.online,
    offline:   summary.offline,
    duration:  summary.duration,
    updated,
    inserted,
    notFound,
  });

  touchTs();
  console.log(`[DB-BinoQ] Zaktualizowano: ${updated}, dodano: ${inserted}, nie znaleziono: ${notFound}`);
  return { updated, inserted, notFound };
}


function getLastSyncBinoq() { return metaGet('lastSyncBinoq'); }

// ── Oznacz zdemontowane / przywróć ponownie zamontowane ──────────────────
// uninstalledMap: { serialNumber: uninstalledAt|null }
function syncUninstalledStatus(uninstalledMap) {
  const setUninstalled = db.prepare(`UPDATE devices SET uninstalled_at = ? WHERE numer_seryjny = ? AND (uninstalled_at = '' OR uninstalled_at IS NULL)`);
  const clearUninstalled = db.prepare(`UPDATE devices SET uninstalled_at = '' WHERE numer_seryjny = ? AND uninstalled_at != ''`);

  const tx = db.transaction((map) => {
    let marked = 0, cleared = 0;
    for (const [sn, uninstalledAt] of Object.entries(map)) {
      if (uninstalledAt) {
        const r = setUninstalled.run(uninstalledAt, sn);
        if (r.changes > 0) marked++;
      } else {
        // uninstalledAt === null → urządzenie aktywne, wyczyść flagę jeśli była
        const r = clearUninstalled.run(sn);
        if (r.changes > 0) cleared++;
      }
    }
    return { marked, cleared };
  });

  const result = tx(uninstalledMap);
  if (result.marked > 0 || result.cleared > 0) {
    console.log(`[DB-BinoQ] Demontaż: oznaczono ${result.marked}, przywrócono ${result.cleared}`);
    touchTs();
  }
  return result;
}

function getSyncSource()        { return metaGet('primarySource') || 'tomra'; }
function setSyncSource(source)  { metaSet('primarySource', source); }

// ── Statystyki ────────────────────────────────────────────────────────────────
function getSnapshots(days = 7) {
  return db.prepare(`
    SELECT * FROM status_snapshots
    WHERE timestamp > datetime('now', '-' || ? || ' days')
    ORDER BY timestamp ASC
  `).all(days);
}

function getSnapshotInterval() {
  return parseInt(db.prepare("SELECT value FROM meta WHERE key = 'snapshotInterval'").get()?.value) || 30;
}

function setSnapshotInterval(minutes) {
  db.prepare(`INSERT INTO meta (key, value) VALUES ('snapshotInterval', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(minutes));
}

// ── Funkcje używane przez snapshots.js ───────────────────────────────────────
function getAllDevicesRaw() {
  return db.prepare(`
    SELECT numer_seryjny, nazwa_sklepu, clearing_house,
           status_manualny, status_tomra, status_binoq, reason_binoq
    FROM devices
    WHERE uninstalled_at = '' OR uninstalled_at IS NULL
  `).all();
}

function insertSnapshot(data) {
  db.prepare(`
    INSERT INTO status_snapshots (timestamp, count_up, count_down, count_offline, count_not_seen, count_total)
    VALUES (@timestamp, @up, @down, @offline, @not_seen, @total)
  `).run(data);
}

const _getLastDeviceStatus = db.prepare(`
  SELECT nowy_status FROM device_status_log
  WHERE numer_seryjny = ?
  ORDER BY timestamp DESC LIMIT 1
`);

const _insertDeviceLog = db.prepare(`
  INSERT INTO device_status_log (id, timestamp, numer_seryjny, nazwa_sklepu, stary_status, nowy_status, reason)
  VALUES (@id, @timestamp, @numer_seryjny, @nazwa_sklepu, @stary_status, @nowy_status, @reason)
`);

function insertStatusChanges(effective, now) {
  const run = db.transaction((effective) => {
    let changed = 0;
    for (const d of effective) {
      const last = _getLastDeviceStatus.get(d.numer_seryjny);
      if (last?.nowy_status !== d.status) {
        _insertDeviceLog.run({
          id:            `sl${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
          timestamp:     now,
          numer_seryjny: d.numer_seryjny,
          nazwa_sklepu:  d.nazwa_sklepu,
          stary_status:  last?.nowy_status || '',
          nowy_status:   d.status,
          reason:        d.reason,
        });
        changed++;
      }
    }
    return changed;
  });
  return run(effective);
}

function pruneSnapshots(days) {
  db.prepare(`DELETE FROM status_snapshots WHERE timestamp < datetime('now', '-' || ? || ' days')`).run(days);
}

function pruneDeviceLog(days) {
  db.prepare(`DELETE FROM device_status_log WHERE timestamp < datetime('now', '-' || ? || ' days')`).run(days);
}

function getDeviceStatusLog(numerSeryjny, limit = 100) {
  return db.prepare(`
    SELECT * FROM device_status_log
    WHERE numer_seryjny = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(numerSeryjny, limit);
}

function getRecentStatusChanges(hours = 24, limit = 200) {
  return db.prepare(`
    SELECT * FROM device_status_log
    WHERE timestamp > datetime('now', '-' || ? || ' hours')
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(hours, limit);
}

// ── SD ServiceDesk integracja ─────────────────────────────────────────────
function getOpenTicketsForSync() {
  return db.prepare(`
    SELECT * FROM tickets
    WHERE nr_zgloszenia != ''
    AND (status != 'zamkniety' OR sd_final_synced = 0)
    ORDER BY created_at DESC
  `).all();
}

function getTicketByNrZgloszenia(nrZgloszenia) {
  const row = db.prepare(`SELECT * FROM tickets WHERE nr_zgloszenia = ? LIMIT 1`).get(nrZgloszenia);
  return row ? rowToTicket(row) : null;
}

// Oznacz że zamknięte zgłoszenie zostało zsynchronizowane po raz ostatni
function markTicketFinalSynced(ticketId) {
  db.prepare(`UPDATE tickets SET sd_final_synced = 1 WHERE id = ?`).run(ticketId);
}

// Reset flagi gdy zgłoszenie znów otwarte (np. wznowione w SD)
function resetTicketFinalSynced(ticketId) {
  db.prepare(`UPDATE tickets SET sd_final_synced = 0 WHERE id = ?`).run(ticketId);
}

const _updateTicketFromSd = db.prepare(`
  UPDATE tickets SET
    nazwa_sklepu       = @nazwa_sklepu,
    opis               = @opis,
    opis_dlugi         = @opis_dlugi,
    priorytet          = @priorytet,
    dzial              = @dzial,
    status             = @status,
    sd_status_name     = @sd_status_name,
    sd_priority_color  = @sd_priority_color,
    sd_technician      = @sd_technician,
    sd_created_at      = @sd_created_at,
    sd_category        = @sd_category,
    sd_subcategory     = @sd_subcategory,
    sd_item            = @sd_item,
    sd_requester_email = @sd_requester_email,
    sd_requester_phone = @sd_requester_phone,
    sd_department      = @sd_department,
    sd_site            = @sd_site,
    sd_notes           = @sd_notes,
    sd_resolution      = @sd_resolution,
    sd_resolution_by   = @sd_resolution_by,
    sd_resolution_on   = @sd_resolution_on,
    sd_last_sync       = @sd_last_sync,
    sd_error           = '',
    sd_has_attachments = @sd_has_attachments,
    updated_at         = @updated_at
  WHERE id = @id
`);

function updateTicketFromSd(ticketId, data) {
  _updateTicketFromSd.run({
    id:                  ticketId,
    nazwa_sklepu:        data.nazwa_sklepu        || '',
    opis:                data.opis                || '',
    opis_dlugi:          data.opis_dlugi          || '',
    priorytet:           data.priorytet           || 'sredni',
    dzial:               data.dzial               || '',
    status:              data.status              || 'otwarty',
    sd_status_name:      data.sd_status_name      || '',
    sd_priority_color:   data.sd_priority_color   || '',
    sd_technician:       data.sd_technician       || '',
    sd_created_at:       data.sd_created_at       || '',
    sd_category:         data.sd_category         || '',
    sd_subcategory:      data.sd_subcategory      || '',
    sd_item:             data.sd_item             || '',
    sd_requester_email:  data.sd_requester_email  || '',
    sd_requester_phone:  data.sd_requester_phone  || '',
    sd_department:       data.sd_department       || '',
    sd_site:             data.sd_site             || '',
    sd_notes:            JSON.stringify(data.sd_notes || []),
    sd_resolution:       data.sd_resolution       || '',
    sd_resolution_by:    data.sd_resolution_by    || '',
    sd_resolution_on:    data.sd_resolution_on    || '',
    sd_last_sync:        data.sd_last_sync        || new Date().toISOString(),
    sd_has_attachments:  data.has_attachments ? 1 : 0,
    updated_at:          new Date().toISOString(),
  });
  touchTs();
}

function updateTicketSdError(ticketId, errorMsg) {
  db.prepare(`
    UPDATE tickets SET
      sd_error     = ?,
      sd_last_sync = ?,
      updated_at   = ?
    WHERE id = ?
  `).run(errorMsg, new Date().toISOString(), new Date().toISOString(), ticketId);
}

function updateTicketNrZgloszenia(ticketId, newNr) {
  db.prepare(`UPDATE tickets SET nr_zgloszenia = ?, updated_at = ? WHERE id = ?`)
    .run(newNr, new Date().toISOString(), ticketId);
  touchTs();
}

// ── Raport: offline > 1 dzień + przywrócone ──────────────────────────────
// Zapis dziennego snapshotu urządzeń offline > 24h (wywoływane raz dziennie po 6:00)
function saveOfflineDaily() {
  const today = new Date().toISOString().slice(0, 10);

  // Czy już mamy snapshot na dziś?
  const existing = db.prepare(`SELECT COUNT(*) as c FROM offline_daily WHERE date = ?`).get(today);
  if (existing.c > 0) return { saved: false, reason: 'already exists' };

  const oneDayAgo = new Date(Date.now() - 86400 * 1000).toISOString();
  const offlineNow = db.prepare(`
    SELECT numer_seryjny FROM devices d
    WHERE (uninstalled_at = '' OR uninstalled_at IS NULL)
    AND (
      status_tomra = 'offline'
      OR (status_binoq = 'Offline' AND clearing_house != '' AND clearing_house IS NOT NULL)
    )
    AND (
      czas_sek > 86400
      OR (status_binoq_since != '' AND status_binoq_since < ?)
    )
    AND NOT EXISTS (
      SELECT 1 FROM device_status_log l
      WHERE l.numer_seryjny = d.numer_seryjny
      AND l.nowy_status = 'up'
      AND l.timestamp > ?
    )
  `).all(oneDayAgo, oneDayAgo);

  const now = new Date().toISOString();
  const ins = db.prepare(`INSERT OR IGNORE INTO offline_daily (date, numer_seryjny, snapshot_time) VALUES (?, ?, ?)`);
  const tx = db.transaction((rows) => {
    for (const r of rows) ins.run(today, r.numer_seryjny, now);
  });
  tx(offlineNow);

  // Retencja 60 dni
  db.prepare(`DELETE FROM offline_daily WHERE date < date('now', '-60 days')`).run();

  console.log(`[OfflineDaily] Snapshot ${today}: ${offlineNow.length} urządzeń offline > 24h`);
  return { saved: true, count: offlineNow.length };
}

function getOfflineReport(date) {
  const today = date || new Date().toISOString().slice(0, 10);
  const nowDate = new Date().toISOString().slice(0, 10);
  const isToday = today === nowDate;

  const dayStart = `${today}T00:00:00.000Z`;
  const dayEnd   = `${today}T23:59:59.999Z`;

  // 1. Offline > 24h
  let offlineDevices;
  if (isToday) {
    // Dziś: stan bieżący z devices + weryfikacja z logiem (brak UP w 24h)
    const oneDayAgo = new Date(Date.now() - 86400 * 1000).toISOString();
    offlineDevices = db.prepare(`
      SELECT numer_seryjny, nazwa_sklepu, miasto, model, clearing_house,
             status_tomra, status_binoq, czas_trwania, czas_sek,
             status_binoq_since, ostatnia_binoq, reason_binoq
      FROM devices d
      WHERE (uninstalled_at = '' OR uninstalled_at IS NULL)
      AND (
        status_tomra = 'offline'
        OR (status_binoq = 'Offline' AND clearing_house != '' AND clearing_house IS NOT NULL)
      )
      AND (
        czas_sek > 86400
        OR (status_binoq_since != '' AND status_binoq_since < ?)
      )
      AND NOT EXISTS (
        SELECT 1 FROM device_status_log l
        WHERE l.numer_seryjny = d.numer_seryjny
        AND l.nowy_status = 'up'
        AND l.timestamp > ?
      )
    `).all(oneDayAgo, oneDayAgo);
  } else {
    // Dzień historyczny: z dziennego snapshotu offline_daily
    offlineDevices = db.prepare(`
      SELECT od.numer_seryjny, d.nazwa_sklepu, d.miasto, d.model, d.clearing_house,
             d.status_tomra, d.status_binoq, d.czas_trwania, d.czas_sek,
             d.status_binoq_since, d.ostatnia_binoq, d.reason_binoq
      FROM offline_daily od
      JOIN devices d ON d.numer_seryjny = od.numer_seryjny
      WHERE od.date = ?
      AND (d.uninstalled_at = '' OR d.uninstalled_at IS NULL)
    `).all(today);
  }

  // 2. Przywrócone danego dnia:
  //    Wszystkie wyjścia z offline (offline → up/down) tego dnia, gdzie:
  //    - epizod offline (od ostatniego wejścia w offline po ostatnim niе-offline) trwał > 24h
  //    - urządzenie NIE wróciło do offline do końca dnia
  //    Pokazuje pierwszy status przy wyjściu + obecny status urządzenia.
  const restored = db.prepare(`
    WITH exits AS (
      SELECT l.numer_seryjny,
             l.timestamp AS exit_time,
             l.nowy_status AS exit_status,
             -- początek epizodu offline: ostatnie wejście w offline przed wyjściem,
             -- które nie ma wcześniejszego niе-offline pomiędzy (czyli ciągły offline)
             (SELECT MAX(s.timestamp) FROM device_status_log s
              WHERE s.numer_seryjny = l.numer_seryjny
              AND s.nowy_status = 'offline'
              AND s.timestamp <= l.timestamp
             ) AS offline_enter,
             ROW_NUMBER() OVER (PARTITION BY l.numer_seryjny ORDER BY l.timestamp ASC) AS rn
      FROM device_status_log l
      WHERE l.timestamp >= ? AND l.timestamp <= ?
      AND l.stary_status = 'offline'
      AND l.nowy_status IN ('up', 'down')
    )
    SELECT d.numer_seryjny, d.nazwa_sklepu, d.miasto, d.model,
           e.exit_time AS restored_at,
           e.exit_status AS first_status,
           d.status_tomra, d.status_binoq
    FROM exits e
    JOIN devices d ON d.numer_seryjny = e.numer_seryjny
    WHERE e.rn = 1
    -- zdemontowane urządzenia wykluczone
    AND (d.uninstalled_at = '' OR d.uninstalled_at IS NULL)
    -- epizod offline trwał > 24h
    AND e.offline_enter IS NOT NULL
    AND julianday(e.exit_time) - julianday(e.offline_enter) > 1.0
    -- nie wróciło do offline do końca dnia
    AND NOT EXISTS (
      SELECT 1 FROM device_status_log back
      WHERE back.numer_seryjny = e.numer_seryjny
      AND back.nowy_status = 'offline'
      AND back.timestamp > e.exit_time
      AND back.timestamp <= ?
    )
    ORDER BY e.exit_time DESC
  `).all(dayStart, dayEnd, dayEnd);

  // Oblicz obecny efektywny status dla każdego przywróconego
  const BINOQ_MAP = { 'Online': 'up', 'BinSemiFull': 'up', 'BinFull': 'down', 'Down': 'down', 'Offline': 'offline' };
  for (const r of restored) {
    let current = r.status_tomra || 'not_seen';
    if (current !== 'not_seen' && r.status_binoq) {
      const b = BINOQ_MAP[r.status_binoq];
      const W = { not_seen: 0, up: 1, offline: 2, down: 3 };
      if (b && (W[b] ?? 0) > (W[current] ?? 0)) current = b;
    }
    r.current_status = current;
  }

  return {
    date: today,
    isToday,
    offline: {
      count: offlineDevices.length,
      devices: offlineDevices,
    },
    restored: {
      count: restored.length,
      devices: restored,
    },
  };
}

function getSdSyncInterval() {
  return parseInt(metaGet('sdSyncInterval')) || 15;
}

function setSdSyncInterval(minutes) {
  metaSet('sdSyncInterval', String(minutes));
}

function getLastSdSync()        { return metaGet('lastSdSync'); }
function setLastSdSync(summary) { metaSet('lastSdSync', summary); }

module.exports = {
  db,
  // devices
  getAllDevices, getDevice, upsertDevice, upsertMany, updateDeviceManual,
  // notes
  addNote, updateNote, deleteNote,
  // tickets
  getAllTickets, addTicket, updateTicket,
  // ticket_notes
  addTicketNote, updateTicketNote, deleteTicketNote, getTicketNotes,
  // Users
  getUser, getAllUsers, addUser, updateUserPassword, updateUserRola, toggleUser, deleteUser,
  // changelog
  addChangelog, getChangelog,
  // meta
  getTs, touchTs, getLastSync, setLastSync, getLastPing, setLastPing,
  // binoq
  upsertBinoqDevices, getLastSyncBinoq, syncUninstalledStatus,
  // sync source
  getSyncSource, setSyncSource,
  // statystyki
  getSnapshots, getSnapshotInterval, setSnapshotInterval,
  getDeviceStatusLog, getRecentStatusChanges,
  // używane przez snapshots.js
  getAllDevicesRaw, insertSnapshot, insertStatusChanges,
  pruneSnapshots, pruneDeviceLog,
  // raport offline
  getOfflineReport, saveOfflineDaily,
  // ServiceDesk
  getOpenTicketsForSync, getTicketByNrZgloszenia,
  markTicketFinalSynced, resetTicketFinalSynced,
  updateTicketFromSd, updateTicketSdError, updateTicketNrZgloszenia,
  getSdSyncInterval, setSdSyncInterval,
  getLastSdSync, setLastSdSync,
};
