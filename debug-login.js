// debug-login.js – uruchom: node debug-login.js
// Pokazuje dokładnie co się dzieje podczas logowania
const https = require('https');
const http  = require('http');

const TOMRA_LOGIN    = process.env.TOMRA_LOGIN    || '';
const TOMRA_PASSWORD = process.env.TOMRA_PASSWORD || '';

if (!TOMRA_LOGIN || !TOMRA_PASSWORD) {
  console.error('Ustaw TOMRA_LOGIN i TOMRA_PASSWORD jako zmienne środowiskowe');
  console.error('Przykład: TOMRA_LOGIN=email TOMRA_PASSWORD=haslo node debug-login.js');
  process.exit(1);
}

class CookieJar {
  constructor() { this.cookies = {}; }
  ingest(setCookieHeaders = []) {
    for (const header of setCookieHeaders) {
      const part = header.split(';')[0].trim();
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const name  = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (value === '' || header.includes('Max-Age=0')) delete this.cookies[name];
      else this.cookies[name] = value;
    }
  }
  toString() { return Object.entries(this.cookies).map(([k,v])=>`${k}=${v}`).join('; '); }
  has(name)  { return name in this.cookies; }
  keys()     { return Object.keys(this.cookies); }
}

function rawRequest(options, body, jar) {
  return new Promise((resolve, reject) => {
    const mod = (options.protocol||'https:') === 'http:' ? http : https;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'Accept':     'text/html,application/xhtml+xml,application/json,*/*',
      ...(options.headers || {}),
    };
    if (jar && jar.toString()) headers['Cookie'] = jar.toString();
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = mod.request({ ...options, headers }, res => {
      if (jar) jar.ingest(res.headers['set-cookie'] || []);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function followRedirects(options, body, jar, maxRedirects = 15) {
  let currentOptions = { ...options };
  let currentBody    = body;
  let lastRes;
  let step = 0;

  for (let i = 0; i < maxRedirects; i++) {
    console.log(`\n  [redirect ${i}] ${currentOptions.method} https://${currentOptions.hostname}${currentOptions.path}`);
    lastRes = await rawRequest(currentOptions, currentBody, jar);
    console.log(`  → Status: ${lastRes.status}`);
    console.log(`  → Cookies jar: [${jar.keys().join(', ')}]`);
    if (lastRes.headers['set-cookie']) {
      console.log(`  → Set-Cookie: ${lastRes.headers['set-cookie'].map(c=>c.split(';')[0]).join(' | ')}`);
    }

    if (![301, 302, 303, 307, 308].includes(lastRes.status)) break;

    const location = lastRes.headers['location'];
    if (!location) { console.log('  → Brak Location header!'); break; }
    console.log(`  → Location: ${location}`);

    const url = location.startsWith('http')
      ? new URL(location)
      : new URL(location, `https://${currentOptions.hostname}${currentOptions.path}`);

    currentOptions = { hostname: url.hostname, path: url.pathname + url.search, method: 'GET', protocol: url.protocol };
    currentBody = null;
  }

  return lastRes;
}

async function main() {
  const jar = new CookieJar();

  // KROK 1 – GET strony logowania TOMRA
  console.log('\n=== KROK 1: GET /sso/login ===');
  const res1 = await followRedirects({
    hostname: 'www2.tomraconnect.com',
    path:     '/sso/login',
    method:   'GET',
  }, null, jar);

  console.log(`\nKrok 1 final status: ${res1.status}`);
  console.log(`Krok 1 final URL (z body, pierwsze 500 znaków):`);
  console.log(res1.body.slice(0, 500));
  console.log('\n--- Szukam action= w HTML ---');
  const actions = [...res1.body.matchAll(/action="([^"]+)"/g)].map(m=>m[1]);
  console.log('Znalezione action URLs:', actions);

  if (actions.length === 0) {
    console.log('\n!!! Nie znaleziono formularza – sprawdź body powyżej');
    console.log('Pełne body (pierwsze 2000 znaków):');
    console.log(res1.body.slice(0, 2000));
    return;
  }

  const actionUrl = actions[0].replace(/&amp;/g, '&');
  console.log('\nAction URL do użycia:', actionUrl);

  // KROK 2 – POST email
  console.log('\n=== KROK 2: POST email ===');
  const emailBody = `username=${encodeURIComponent(TOMRA_LOGIN)}&login=Log+in`;
  const url2 = new URL(actionUrl);
  const res2 = await followRedirects({
    hostname: url2.hostname,
    path:     url2.pathname + url2.search,
    method:   'POST',
    protocol: url2.protocol,
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': actionUrl },
  }, emailBody, jar);

  console.log(`\nKrok 2 final status: ${res2.status}`);
  const actions2 = [...res2.body.matchAll(/action="([^"]+)"/g)].map(m=>m[1]);
  console.log('Znalezione action URLs po emailu:', actions2);

  if (actions2.length === 0) {
    console.log('Brak formularza hasła! Body (pierwsze 1000):');
    console.log(res2.body.slice(0, 1000));
    return;
  }

  const passwordActionUrl = actions2[0].replace(/&amp;/g, '&');

  // KROK 3 – POST hasło
  console.log('\n=== KROK 3: POST hasło ===');
  const passBody = `password=${encodeURIComponent(TOMRA_PASSWORD)}&rememberMe=on&login=Log+in`;
  const url3 = new URL(passwordActionUrl);
  const res3 = await followRedirects({
    hostname: url3.hostname,
    path:     url3.pathname + url3.search,
    method:   'POST',
    protocol: url3.protocol,
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': passwordActionUrl },
  }, passBody, jar);

  console.log(`\nKrok 3 final status: ${res3.status}`);
  console.log(`Cookies po logowaniu: [${jar.keys().join(', ')}]`);
  console.log(`JSESSIONID: ${jar.has('JSESSIONID') ? 'TAK ✓' : 'NIE ✗'}`);

  if (!jar.has('JSESSIONID')) {
    console.log('\nBody po haśle (pierwsze 1000):');
    console.log(res3.body.slice(0, 1000));
    return;
  }

  // KROK 4 – Test API
  console.log('\n=== KROK 4: Test API ===');
  const res4 = await rawRequest({
    hostname: 'www2.tomraconnect.com',
    path:     '/rest/installation/newsearch?pageSize=5&pageIndex=0',
    method:   'GET',
    headers:  { 'Accept': 'application/json' },
  }, null, jar);

  console.log(`API status: ${res4.status}`);
  if (res4.status === 200) {
    try {
      const parsed = JSON.parse(res4.body);
      const items  = parsed.data || parsed;
      console.log(`✓ API działa! Przykładowy rekord:`, JSON.stringify(Array.isArray(items) ? items[0] : parsed).slice(0, 300));
    } catch(e) {
      console.log('Body (nie JSON?):', res4.body.slice(0, 500));
    }
  } else {
    console.log('Body:', res4.body.slice(0, 500));
  }
}

main().catch(err => console.error('Błąd:', err));
