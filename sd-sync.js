'use strict';

// ── sd-sync.js – cykliczna synchronizacja ticketów RVM z SD ──────────────────
// Aktualizuje dane SD tylko dla niezamkniętych ticketów.
// Zamknięte (status = 'zamkniety') są pomijane — nie odpytujemy SD ponownie.
// ─────────────────────────────────────────────────────────────────────────────

const sdClient = require('./sd-client');

let _schedulerTimer = null;

// ── Synchronizuj jeden ticket z SD ───────────────────────────────────────────
async function syncOneTicket(db, ticket) {
  // Normalizacja pól — ticket może przyjść jako surowy wiersz (snake_case)
  // lub przez rowToTicket (camelCase)
  const sdId          = ticket.nrZgloszenia ?? ticket.nr_zgloszenia;
  const ticketStatus  = ticket.status;
  const finalSynced   = ticket.sdFinalSynced ?? ticket.sd_final_synced ?? 0;

  if (!sdId) return { skipped: true, reason: 'brak nr_zgloszenia' };
  // Zamknięte które już miały finalny sync — pomijamy (rozwiązanie już pobrane)
  if (ticketStatus === 'zamkniety' && finalSynced) {
    return { skipped: true, reason: 'zamknięty (finalny sync wykonany)' };
  }

  let actualSdId = sdId;
  let mergedFrom = null;

  try {
    let sdReq;
    try {
      sdReq = await sdClient.getRequest(sdId);
    } catch (err) {
      // Zgłoszenie scalone - spróbuj pobrać parent
      if (err.merged && err.parentId) {
        console.log(`[SD-Sync] Ticket ${ticket.id}: zgłoszenie ${sdId} scalono z #${err.parentId}, aktualizuję`);
        mergedFrom = sdId;
        actualSdId = err.parentId;
        try {
          sdReq = await sdClient.getRequest(err.parentId);
        } catch (err2) {
          // Parent też niedostępny - może być kolejne scalenie lub błąd
          if (err2.merged && err2.parentId) {
            // Rekurencja max 1 raz - zapisz błąd
            db.updateTicketSdError(ticket.id, `Łańcuch scaleń: ${sdId} → ${err.parentId} → ${err2.parentId} (zbyt głęboko)`);
            return { ok: false, error: 'multi-merge' };
          }
          throw err2;
        }
      } else {
        throw err;
      }
    }

    const sdNotes  = await sdClient.getNotes(actualSdId);
    const sdResolution = await sdClient.getResolution(actualSdId);
    const mapped   = sdClient.mapSdRequestToTicket(sdReq);

    // Jeśli było scalenie - zaktualizuj nr_zgloszenia
    const updateData = {
      ...mapped,
      sd_notes:     sdNotes.map(n => sdClient.mapSdNote(n)),
      sd_resolution:    sdResolution?.content      || '',
      sd_resolution_by: sdResolution?.submitted_by || '',
      sd_resolution_on: sdResolution?.submitted_on || '',
      sd_last_sync: new Date().toISOString(),
      sd_error:     null,
    };

    db.updateTicketFromSd(ticket.id, updateData);

    if (mergedFrom) {
      db.updateTicketNrZgloszenia(ticket.id, actualSdId);
      console.log(`[SD-Sync] Ticket ${ticket.id}: nr zgłoszenia zaktualizowany ${mergedFrom} → ${actualSdId}`);
    }

    // Zgłoszenie zamknięte → to był ostatni sync, oznacz i przestań synchronizować
    if (mapped.status === 'zamkniety') {
      if (typeof db.markTicketFinalSynced === 'function') db.markTicketFinalSynced(ticket.id);
      console.log(`[SD-Sync] Ticket ${ticket.id}: zamknięte, finalny sync wykonany (rozwiązanie pobrane)`);
    } else if (finalSynced && typeof db.resetTicketFinalSynced === 'function') {
      // Zgłoszenie znów otwarte (wznowione) → wznów synchronizację
      db.resetTicketFinalSynced(ticket.id);
    }

    return { ok: true, status: mapped.status, sdStatusName: mapped.sd_status_name, merged: mergedFrom ? { from: mergedFrom, to: actualSdId } : null };
  } catch (err) {
    db.updateTicketSdError(ticket.id, err.message);
    return { ok: false, error: err.message };
  }
}

// ── Synchronizacja wszystkich otwartych ticketów ─────────────────────────────
async function runSdSync(db) {
  const t0 = Date.now();
  const tickets = db.getOpenTicketsForSync();

  if (!tickets.length) {
    console.log('[SD-Sync] Brak otwartych ticketów do synchronizacji');
    return { total: 0, ok: 0, error: 0, skipped: 0 };
  }

  console.log(`[SD-Sync] Start: ${tickets.length} ticketów`);

  let okCount = 0, errCount = 0, skipped = 0;

  // Synchronizuj sekwencyjnie żeby nie obciążać SD
  for (const t of tickets) {
    const result = await syncOneTicket(db, t);
    if (result.skipped) skipped++;
    else if (result.ok) okCount++;
    else errCount++;
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  const summary = {
    timestamp: new Date().toISOString(),
    total:     tickets.length,
    ok:        okCount,
    error:     errCount,
    skipped,
    duration:  `${duration}s`,
  };

  db.setLastSdSync(summary);

  console.log(`[SD-Sync] Zakończono w ${duration}s: ${okCount} ok, ${errCount} błędów, ${skipped} pominiętych`);
  return summary;
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function startSdSync(db) {
  if (!process.env.SD_API_KEY_1 && !process.env.SD_API_KEY_2) {
    console.warn('[SD-Sync] Brak SD_API_KEY_1/SD_API_KEY_2 – sync wyłączony');
    return;
  }

  const intervalMin = db.getSdSyncInterval();
  console.log(`[SD-Sync] Scheduler: co ${intervalMin} min`);

  // Pierwszy sync po 90 sekundach
  setTimeout(() => {
    runSdSync(db).catch(e => console.error('[SD-Sync] Błąd:', e.message));
    scheduleNext(db);
  }, 90 * 1000);
}

function scheduleNext(db) {
  const intervalMin = db.getSdSyncInterval();
  const ms = intervalMin * 60 * 1000;

  if (_schedulerTimer) clearTimeout(_schedulerTimer);
  _schedulerTimer = setTimeout(() => {
    runSdSync(db).catch(e => console.error('[SD-Sync] Błąd:', e.message));
    scheduleNext(db);
  }, ms);
}

function restartSdSync(db) {
  if (_schedulerTimer) {
    clearTimeout(_schedulerTimer);
    _schedulerTimer = null;
  }
  scheduleNext(db);
  console.log('[SD-Sync] Scheduler zrestartowany z nowym interwałem');
}

module.exports = { startSdSync, restartSdSync, runSdSync, syncOneTicket };
