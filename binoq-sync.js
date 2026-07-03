'use strict';

// ── BinoQ Sync Module ─────────────────────────────────────────────────────────
// Źródło danych: https://binoq.tomra.cloud/
// Auth: Firebase Identity Toolkit (REST, bez przeglądarki)
// Endpointy:
//   POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword
//   GET  https://api.eu.prod.tomra.cloud/customer-portal/access/v4
//   POST https://api.eu.prod.tomra.cloud/customer-portal/v2/live-status
//
// WAŻNE: live-status przyjmuje site.id (locationId), NIE installationId!
// ─────────────────────────────────────────────────────────────────────────────

const BINOQ_EMAIL      = process.env.BINOQ_LOGIN;
const BINOQ_PASSWORD   = process.env.BINOQ_PASSWORD;
const FIREBASE_API_KEY = process.env.BINOQ_FIREBASE_KEY;

const FIREBASE_SIGNIN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
const ACCESS_URL          = 'https://api.eu.prod.tomra.cloud/customer-portal/access/v4';
const LIVE_STATUS_URL     = 'https://api.eu.prod.tomra.cloud/customer-portal/v2/live-status';

const SYNC_INTERVAL = (parseInt(process.env.BINOQ_SYNC_INTERVAL_MIN) || 30) * 60 * 1000;

// ── Token cache ───────────────────────────────────────────────────────────────
let _tokenCache = {
  idToken:      null,
  refreshToken: null,
  expiresAt:    0,
};

// ── Firebase login ────────────────────────────────────────────────────────────
async function firebaseLogin() {
  console.log('[BinoQ-Sync] Loguję przez Firebase...');

  const res = await fetch(FIREBASE_SIGNIN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email:             BINOQ_EMAIL,
      password:          BINOQ_PASSWORD,
      returnSecureToken: true,
      clientType:        'CLIENT_TYPE_WEB',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firebase login error ${res.status}: ${err}`);
  }

  const data = await res.json();

  _tokenCache = {
    idToken:      data.idToken,
    refreshToken: data.refreshToken,
    expiresAt:    Date.now() + (parseInt(data.expiresIn) - 60) * 1000,
  };

  console.log('[BinoQ-Sync] Zalogowano, token ważny do:', new Date(_tokenCache.expiresAt).toISOString());
  return _tokenCache.idToken;
}

// ── Token refresh (bez ponownego logowania) ───────────────────────────────────
async function refreshToken() {
  console.log('[BinoQ-Sync] Odświeżam token Firebase...');

  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(_tokenCache.refreshToken)}`,
  });

  if (!res.ok) {
    console.warn('[BinoQ-Sync] Refresh nieudany, loguję ponownie...');
    return firebaseLogin();
  }

  const data = await res.json();

  _tokenCache = {
    idToken:      data.id_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + (parseInt(data.expires_in) - 60) * 1000,
  };

  console.log('[BinoQ-Sync] Token odświeżony.');
  return _tokenCache.idToken;
}

// ── Pobierz aktualny token (loguje lub odświeża wg potrzeby) ──────────────────
async function getToken() {
  if (_tokenCache.idToken && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.idToken;
  }
  if (_tokenCache.refreshToken) {
    return refreshToken();
  }
  return firebaseLogin();
}

// ── Pobierz listę lokalizacji + metadane sklepów ──────────────────────────────
// Zwraca:
//   siteIds    - lista site.id do wysłania do live-status
//   installMap - installationId → metadane (serialNumber, sklep, itd.)
//   siteMap    - site.id → lista installationId (do połączenia odpowiedzi)
async function fetchAccess(token) {
  console.log('[BinoQ-Sync] Pobieram listę instalacji (access/v4)...');

  const res = await fetch(ACCESS_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`access/v4 error ${res.status}`);

  const json = await res.json();
  const data = Array.isArray(json) ? json : (json.data || []);

  // DEBUG: struktura odpowiedzi - czy jest paginacja
  if (!Array.isArray(json)) {
    const keys = Object.keys(json).filter(k => k !== 'data');
    if (keys.length > 0) {
      console.log(`[BinoQ-Sync DEBUG] access/v4 dodatkowe pola: ${keys.join(', ')}`);
      for (const k of keys) {
        const v = json[k];
        if (typeof v !== 'object') console.log(`[BinoQ-Sync DEBUG]   ${k} = ${v}`);
      }
    }
  }

  const siteIds    = [];
  const installMap = new Map(); // installationId → metadane
  const siteMap    = new Map(); // site.id → [installationId, ...]

  for (const site of data) {
    const { id: siteId, locationName, storeReference, city, address, zipCode,
            latitude, longitude, openingHours, isActive } = site;

    // live-status przyjmuje site.id (locationId)
    siteIds.push(siteId);
    siteMap.set(siteId, []);

    for (const inst of (site.installations || [])) {
      siteMap.get(siteId).push(inst.installationId);

      installMap.set(inst.installationId, {
        siteId,
        installationId:  inst.installationId,
        serialNumber:    inst.serialNumber,
        model:           inst.model,
        numberOfBins:    inst.numberOfBins,
        hasCompactor:    inst.hasCompactor,
        installedAt:     inst.installedAt,
        uninstalledAt:   inst.uninstalledAt,
        locationName,
        storeReference,
        city,
        address,
        zipCode,
        latitude,
        longitude,
        openingHours,
        isActive,
      });
    }
  }

  console.log(`[BinoQ-Sync] Pobrano ${installMap.size} instalacji z ${data.length} lokalizacji.`);
  return { siteIds, installMap, siteMap };
}

// ── Pobierz live-status dla listy site.id (locationId) ───────────────────────
async function fetchLiveStatus(token, siteIds) {
  console.log(`[BinoQ-Sync] Pobieram live-status dla ${siteIds.length} lokalizacji...`);

  // API przyjmuje max 100 ID na raz
  const CHUNK = 100;
  const results = [];

  for (let i = 0; i < siteIds.length; i += CHUNK) {
    const chunk = siteIds.slice(i, i + CHUNK);

    const res = await fetch(LIVE_STATUS_URL, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Origin':       'https://binoq.tomra.cloud',
        'Referer':      'https://binoq.tomra.cloud/',
      },
      body: JSON.stringify(chunk),
    });

    if (!res.ok) throw new Error(`live-status error ${res.status}`);

    const data = await res.json();
    results.push(...(data.data || []));
  }

  console.log(`[BinoQ-Sync] Otrzymano status dla ${results.length} urządzeń.`);
  return results;
}

// ── Mapuj stan BinoQ → ujednolicony status (kompatybilny z obecną bazą) ────────
function mapMachineState(liveEntry) {
  const machineState = liveEntry?.machine?.state || 'Unknown';
  const online       = liveEntry?.online ?? false;
  const bins         = liveEntry?.bins || [];

  // Brak łączności — zawsze offline
  if (!online) return 'Offline';

  // Maszyna zgłasza awarię
  if (machineState === 'Down') return 'Down';

  // Maszyna działa (Up) — sprawdź stan koszy
  if (machineState === 'Up') {
    const allFull = bins.length > 0 && bins.every(b => b.state === 'Full');
    const anyFull = bins.some(b => b.state === 'Full');
    const anySemi = bins.some(b => b.state === 'SemiFull');

    // Wszystkie kosze pełne → maszyna nie przyjmuje
    if (allFull) return 'BinFull';
    // Przynajmniej jeden pełny ale są wolne, albo któryś się napełnia → działa, wymaga uwagi
    if (anyFull || anySemi) return 'BinSemiFull';
    return 'Online';
  }

  return 'Unknown';
}

// ── Główna funkcja synchronizacji ─────────────────────────────────────────────
async function runBinoqSync(db) {
  const t0 = Date.now();
  console.log('[BinoQ-Sync] === Start synchronizacji ===');

  if (!BINOQ_EMAIL || !BINOQ_PASSWORD) {
    console.warn('[BinoQ-Sync] Brak BINOQ_LOGIN/BINOQ_PASSWORD – sync wyłączony');
    return null;
  }

  try {
    const token                          = await getToken();
    const { siteIds, installMap, siteMap } = await fetchAccess(token);
    const liveStatuses                   = await fetchLiveStatus(token, siteIds);

    // Połącz: live-status (per installationId) + metadane z access/v4
    const devices = liveStatuses.map(live => {
      const meta   = installMap.get(live.installationId) || {};
      const status = mapMachineState(live);

      return {
        serialNumber:   meta.serialNumber    || null,
        installationId: live.installationId,
        siteId:         meta.siteId          || null,

        locationName:   meta.locationName    || null,
        storeReference: meta.storeReference  || null,
        city:           meta.city            || null,
        address:        meta.address         || null,
        zipCode:        meta.zipCode         || null,

        model:          meta.model           || null,
        numberOfBins:   meta.numberOfBins    || null,
        hasCompactor:   meta.hasCompactor    || false,

        status,
        online:         live.online          ?? false,
        machineState:   live.machine?.state  || null,
        lastSeen:       live.lastSeen        || null,
        updateTime:     live.updateTime      || null,

        bins: (live.bins || []).map(b => ({
          id:    b.id,
          type:  b.type,
          state: b.state,
        })),

        reasonPL: live.reason?.title?.PL
               || live.reasons?.[0]?.title?.PL
               || null,

        source: 'binoq',
      };
    });

    const duration = ((Date.now() - t0) / 1000).toFixed(1);

    const summary = {
      timestamp: new Date().toISOString(),
      total:     devices.length,
      online:    devices.filter(d => d.online).length,
      offline:   devices.filter(d => !d.online).length,
      duration:  `${duration}s`,
      ok:        true,
      source:    'binoq',
    };

    console.log(`[BinoQ-Sync] Zakończono: ${devices.length} urządzeń (${summary.online} online, ${summary.offline} offline) – ${duration}s`);

    if (db && typeof db.upsertBinoqDevices === 'function') {
      db.upsertBinoqDevices(devices, summary);

      // Synchronizuj status demontażu z installMap (uninstalledAt per serialNumber)
      // UWAGA: ten sam serialNumber może mieć kilka instalacji (urządzenie przenoszone).
      // Jeśli choć jedna instalacja jest aktywna (uninstalledAt = null) → urządzenie AKTYWNE.
      try {
        if (typeof db.syncUninstalledStatus === 'function') {
          const uninstalledMap = {};
          // Zlicz ile instalacji ma każdy serialNumber (do debugowania)
          const installCount = {};
          for (const meta of installMap.values()) {
            if (!meta.serialNumber) continue;
            const sn = meta.serialNumber;
            const u  = meta.uninstalledAt || null;
            installCount[sn] = (installCount[sn] || 0) + 1;

            if (!(sn in uninstalledMap)) {
              uninstalledMap[sn] = u;
            } else if (uninstalledMap[sn] === null) {
              // już mamy aktywną instalację — nie nadpisuj
            } else if (u === null) {
              // ta instalacja jest aktywna — wygrywa
              uninstalledMap[sn] = null;
            } else {
              // obie zdemontowane — bierz najnowszą datę demontażu
              if (new Date(u) > new Date(uninstalledMap[sn])) uninstalledMap[sn] = u;
            }
          }

          // DEBUG: wypisz urządzenia które będą oznaczone jako zdemontowane
          const toMark = Object.entries(uninstalledMap).filter(([sn, u]) => u !== null);
          if (toMark.length > 0) {
            console.log(`[BinoQ-Sync DEBUG] Do oznaczenia jako zdemontowane: ${toMark.length}`);
            for (const [sn, u] of toMark.slice(0, 20)) {
              console.log(`[BinoQ-Sync DEBUG]   ${sn}: uninstalledAt=${u}, liczba instalacji=${installCount[sn]}`);
            }
          }

          db.syncUninstalledStatus(uninstalledMap);
        }
      } catch (e) {
        console.warn('[BinoQ-Sync] syncUninstalledStatus failed:', e.message);
      }

      // Snapshot zaraz po sync — żeby wykres timeline i czas trwania były spójne
      try {
        const { runSnapshot } = require('./snapshots');
        runSnapshot(db);
      } catch (e) {
        console.warn('[BinoQ-Sync] Snapshot trigger failed:', e.message);
      }
    }

    return { devices, summary };

  } catch (err) {
    console.error('[BinoQ-Sync] Błąd synchronizacji:', err.message);
    if (err.message.includes('401') || err.message.includes('403')) {
      _tokenCache = { idToken: null, refreshToken: null, expiresAt: 0 };
    }
    return { error: err.message, ok: false };
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function startBinoqSync(db) {
  if (!BINOQ_EMAIL || !BINOQ_PASSWORD) {
    console.warn('[BinoQ-Sync] Brak BINOQ_LOGIN/BINOQ_PASSWORD – scheduler wyłączony');
    return;
  }

  console.log(`[BinoQ-Sync] Scheduler: co ${SYNC_INTERVAL / 60000} min`);

  setTimeout(async () => {
    await runBinoqSync(db);
    setInterval(() => runBinoqSync(db), SYNC_INTERVAL);
  }, 25 * 1000);
}

module.exports = { startBinoqSync, runBinoqSync };
