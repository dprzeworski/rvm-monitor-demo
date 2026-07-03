// tomra-sync.js – synchronizacja z TOMRA Connect (SQLite backend)
const TOMRA_HOST     = 'www2.tomraconnect.com';
const TOMRA_LOGIN    = process.env.TOMRA_LOGIN    || '';
const TOMRA_PASSWORD = process.env.TOMRA_PASSWORD || '';
const SYNC_INTERVAL  = (process.env.SYNC_INTERVAL_MIN || 30) * 60 * 1000;
const CHROME_PATH    = process.env.CHROME_PATH || '/home/obi_wiki/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome';

const STATUS_MAP = {
  'up':'up', 'down':'down', 'offline':'offline',
  'not_seen':'not_seen', 'not seen':'not_seen',
};

// ── Mapowanie TOMRA → nasz format ────────────────────────────────────────
function mapDevice(item) {
  const inst = item.installationStatus || {};
  const raw  = (item.status || inst.connectivityStatus || 'not_seen').toLowerCase();
  return {
    numerSeryjny:       String(item.serialNumber   || '').trim(),
    siec:               item.chain                 || '',
    operatorDRS:        '',
    idSklepu:           item.storeReference        || '',
    nazwaSklepu:        item.storeName             || '',
    region:             item.region                || '',
    zone:               item.zone                  || '',
    nrPunktu:           item.externalId            || '',
    gln:                String(item.gln            || ''),
    numerKlienta:       String(item.customerNumber || ''),
    kodPocztowy:        item.zipcode               || '',
    ulica:              item.address               || '',
    miasto:             item.city                  || '',
    umowaSerwis:        item.slaId ? String(item.slaId) : '',
    model:              item.machineModel          || 'Unknown',
    zbierane:           item.materialGroup         || '',
    statusTomra:        STATUS_MAP[raw] || 'not_seen',
    czasTrwania:        item.statusDurationText    || '',
    czasSek:            item.statusDurationSeconds || 0,
    ostatnia:           inst.statusTime            || item.lastSeen || '',
    installationId:     item.installationId        || null,
    storeId:            item.storeId               || null,
    connectivityStatus: inst.connectivityStatus    || '',
    importDate:         new Date().toISOString(),
    clearingHouse:      item.clearingHouse         || null,
    extraInfo:          item.extraInfo             || '',
  };
}

// ── Puppeteer login + fetch ───────────────────────────────────────────────
async function fetchFromTomra() {
  const puppeteer = require('puppeteer');
  const { execSync } = require('child_process');

  // Unikalny katalog dla każdego uruchomienia – uniknij konfliktów
  const userDataDir = `/tmp/chrome-rvm-${Date.now()}`;
  try { execSync(`rm -rf ${userDataDir}`); } catch {}

  console.log('[TOMRA-Sync] Uruchamiam Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    userDataDir,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--disable-extensions', '--no-first-run',
      '--ignore-certificate-errors',
    ],
  });

  const page = await browser.newPage();

  try {
    console.log('[TOMRA-Sync] Ładuję TOMRA Connect...');
    await page.goto(`https://${TOMRA_HOST}/`, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2000));

    const currentUrl = page.url();
    console.log(`[TOMRA-Sync] URL: ${currentUrl}`);

    if (!currentUrl.includes(TOMRA_HOST) || currentUrl.includes('login')) {
      console.log('[TOMRA-Sync] Wymaga logowania...');

      await page.waitForSelector('input', { timeout: 15000 });
      await new Promise(r => setTimeout(r, 500));

      const emailInput = await page.$('input[type="email"], input[type="text"], input[name="username"], input[id="username"]');
      if (!emailInput) throw new Error('Nie znaleziono pola email');
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(TOMRA_LOGIN, { delay: 50 });

      const btn1 = await page.$('input[type="submit"], button[type="submit"]');
      if (btn1) { await btn1.click(); await new Promise(r => setTimeout(r, 2000)); }

      const passInput = await page.$('input[type="password"]');
      if (passInput) {
        await passInput.click({ clickCount: 3 });
        await passInput.type(TOMRA_PASSWORD, { delay: 50 });
        const btn2 = await page.$('input[type="submit"], button[type="submit"]');
        if (btn2) await btn2.click();
      }

      await page.waitForFunction(
        host => window.location.hostname === host,
        { timeout: 30000 },
        TOMRA_HOST
      );
      await new Promise(r => setTimeout(r, 3000));
      console.log('[TOMRA-Sync] Zalogowano pomyślnie');
    } else {
      console.log('[TOMRA-Sync] Sesja aktywna');
    }

    console.log('[TOMRA-Sync] Pobieram urządzenia...');
    const result = await page.evaluate(async () => {
      const PAGE_SIZE = 500;
      let allItems = [], pageIndex = 0, total = null;

      do {
        const res = await fetch('/rest/installation/newsearch', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            pageSelected: pageIndex, rowsPerPage: PAGE_SIZE,
            sortByColumn: 0, sortDirection: 'asc',
            statuses: [], machineModels: [], favorite: false,
            exactMatch: false, showClosed: false, globalSearch: '',
          }),
        });

        if (!res.ok) return { error: `HTTP ${res.status}` };
        const json = await res.json();

        if (total === null) total = json.totalCount || json.total || json.totalElements || null;
        const items = json.data || json.installations || json.items || json.content;
        if (!Array.isArray(items) || items.length === 0) break;

        allItems = allItems.concat(items);
        pageIndex++;
        if (!total || allItems.length >= total || items.length < PAGE_SIZE) break;
      } while (true);

      return { items: allItems, total };
    });

    if (result.error) throw new Error(`API error: ${result.error}`);
    if (!result.items?.length) throw new Error('API zwróciło pustą listę');

    console.log(`[TOMRA-Sync] Pobrano ${result.items.length} urządzeń`);
    return result.items;

  } finally {
    await browser.close();
    try { execSync(`rm -rf ${userDataDir}`); } catch {}
  }
}

// ── Główna funkcja sync ───────────────────────────────────────────────────
async function runSync() {
  const t0 = Date.now();
  console.log('[TOMRA-Sync] === Start synchronizacji ===');

  if (!TOMRA_LOGIN || !TOMRA_PASSWORD) {
    console.error('[TOMRA-Sync] Brak TOMRA_LOGIN/TOMRA_PASSWORD');
    return { ok: false, error: 'Brak credentials' };
  }

  let tomraItems;
  try {
    tomraItems = await fetchFromTomra();
  } catch (err) {
    console.error('[TOMRA-Sync] Błąd:', err.message);
    return { ok: false, error: err.message };
  }

  const db        = require('./database');
  const timestamp = new Date().toISOString();
  let added = 0, updated = 0, statusChanged = 0;

  const existingMap = {};
  try {
    db.db.prepare('SELECT numer_seryjny, status_tomra FROM devices').all()
      .forEach(r => { existingMap[r.numer_seryjny] = r.status_tomra; });
  } catch {}

  const validItems = tomraItems.filter(item => item.serialNumber);

  db.upsertMany(validItems.map(mapDevice));

  for (const item of validItems) {
    const sn        = String(item.serialNumber || '').trim();
    const newStatus = (item.status || '').toLowerCase();
    const oldStatus = existingMap[sn];

    if (!oldStatus) {
      added++;
    } else {
      updated++;
      if (oldStatus !== newStatus && newStatus) {
        statusChanged++;
        db.addChangelog({
          id:           `${Date.now()}${Math.random().toString(36).slice(2)}`,
          timestamp,
          numerSeryjny: sn,
          nazwaSklepu:  item.storeName || '',
          miasto:       item.city      || '',
          pole:         'Status TOMRA (auto-sync)',
          staraWartosc: oldStatus,
          nowaWartosc:  newStatus,
          uzytkownik:   'TOMRA-SYNC',
        });
      }
    }
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  const lastSync = { timestamp, total: validItems.length, added, updated, statusChanged, duration: `${duration}s`, ok: true };

  db.setLastSync(lastSync);
  db.touchTs();

  console.log(`[TOMRA-Sync] Zakończono: ${validItems.length} urządzeń (+${added} nowych, ${statusChanged} zmian statusu) – ${duration}s`);
  return lastSync;
}

// ── Scheduler ─────────────────────────────────────────────────────────────
function startSync() {
  if (!TOMRA_LOGIN || !TOMRA_PASSWORD) {
    console.warn('[TOMRA-Sync] Brak TOMRA_LOGIN/TOMRA_PASSWORD – sync wyłączony');
    return;
  }
  console.log(`[TOMRA-Sync] Scheduler: co ${SYNC_INTERVAL / 60000} min`);
  setTimeout(async () => {
    await runSync();
    setInterval(runSync, SYNC_INTERVAL);
  }, 20 * 1000);
}

module.exports = { startSync, runSync };
