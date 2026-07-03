'use strict';

// ── snapshots.js – logowanie statusów sieci i zmian per urządzenie ────────────
// Nie używa db.prepare bezpośrednio — korzysta z funkcji exportowanych przez database.js

let _schedulerTimer = null;

const STATUS_WEIGHT = { 'not_seen': 0, 'up': 1, 'offline': 2, 'down': 3 };
const BINOQ_TO_TOMRA = {
  'Online': 'up', 'Down': 'down', 'BinFull': 'down',
  'BinSemiFull': 'up', 'Offline': 'offline', 'Unknown': 'not_seen',
};

// ── Główna funkcja snapshotu ──────────────────────────────────────────────────
function runSnapshot(db) {
  const now = new Date().toISOString();

  // Pobierz surowe dane urządzeń
  const rows = db.getAllDevicesRaw();

  // Oblicz efektywny status (analogicznie do normalizeDevices na froncie)
  const counters = { up: 0, down: 0, offline: 0, not_seen: 0 };
  const effective = [];

  for (const row of rows) {
    const tomra  = row.status_manualny || row.status_tomra || 'not_seen';
    let status;

    if (tomra === 'not_seen') {
      // Tomra nie widziała urządzenia — nie_seen, niezależnie od BinoQ
      status = 'not_seen';
    } else {
      // Tomra widzi urządzenie — BinoQ może nadpisać jeśli gorszy
      const binoq  = row.status_binoq ? (BINOQ_TO_TOMRA[row.status_binoq] || 'not_seen') : null;
      const tomraW = STATUS_WEIGHT[tomra] ?? 0;
      const binoqW = binoq ? (STATUS_WEIGHT[binoq] ?? 0) : 0;
      status = (binoq && binoqW > tomraW) ? binoq : tomra;
    }

    counters[status] = (counters[status] || 0) + 1;
    effective.push({
      numer_seryjny: row.numer_seryjny,
      nazwa_sklepu:  row.nazwa_sklepu,
      status,
      reason:        row.reason_binoq || '',
    });
  }

  // Zapisz snapshot i zmiany statusów przez funkcje z database.js
  db.insertSnapshot({
    timestamp: now,
    up:        counters.up        || 0,
    down:      counters.down      || 0,
    offline:   counters.offline   || 0,
    not_seen:  counters.not_seen  || 0,
    total:     rows.length,
  });

  const changed = db.insertStatusChanges(effective, now);

  // Usuń stare dane
  db.pruneSnapshots(7);
  db.pruneDeviceLog(30);

  console.log(`[Snapshot] ${now} – UP:${counters.up} DOWN:${counters.down} OFFLINE:${counters.offline} NOT_SEEN:${counters.not_seen} | Zmiany: ${changed}`);

  // Dzienny snapshot offline > 24h — raz dziennie, przy pierwszym snapshocie po 6:00
  try {
    const hour = new Date().getHours();
    if (hour >= 6 && typeof db.saveOfflineDaily === 'function') {
      db.saveOfflineDaily();
    }
  } catch (e) {
    console.warn('[Snapshot] saveOfflineDaily failed:', e.message);
  }

  return { counters, changed, total: rows.length };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function startSnapshotScheduler(db) {
  const intervalMin = db.getSnapshotInterval();
  console.log(`[Snapshot] Scheduler: co ${intervalMin} min`);

  // Pierwszy snapshot po 60 sekundach od startu
  setTimeout(() => {
    runSnapshot(db);
    scheduleNext(db);
  }, 60 * 1000);
}

function scheduleNext(db) {
  const intervalMin = db.getSnapshotInterval();
  const ms = intervalMin * 60 * 1000;

  if (_schedulerTimer) clearTimeout(_schedulerTimer);
  _schedulerTimer = setTimeout(() => {
    runSnapshot(db);
    scheduleNext(db);
  }, ms);
}

function restartSnapshotScheduler(db) {
  if (_schedulerTimer) {
    clearTimeout(_schedulerTimer);
    _schedulerTimer = null;
  }
  scheduleNext(db);
  console.log('[Snapshot] Scheduler zrestartowany z nowym interwałem');
}

module.exports = { startSnapshotScheduler, restartSnapshotScheduler, runSnapshot };
