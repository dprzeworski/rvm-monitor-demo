'use strict';

// ── ServiceDesk Plus REST API client ──────────────────────────────────────────
// On-premise instalacja: https://servicedesk.dino.intranet:8080/api/v3/
// Dwa klucze API — automatyczny fallback przy 403 (różne grupy zgłoszeń)
// ─────────────────────────────────────────────────────────────────────────────

const https = require('https');
const http  = require('http');
const { URL } = require('url');

const SD_URL      = process.env.SD_URL || 'https://servicedesk.dino.intranet:8080';
const SD_KEY_1    = process.env.SD_API_KEY_1; // klucz "ktechniczny"
const SD_KEY_2    = process.env.SD_API_KEY_2; // klucz "kinformatyczny"

// Agent HTTPS który ignoruje błędy certyfikatu (self-signed na intranet)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ── Podstawowy fetch z fallbackiem na drugi klucz ─────────────────────────────
async function sdFetch(path, options = {}) {
  if (!SD_KEY_1 && !SD_KEY_2) {
    throw new Error('Brak konfiguracji SD_API_KEY_1 i SD_API_KEY_2');
  }

  const url = `${SD_URL}${path}`;
  const keys = [SD_KEY_1, SD_KEY_2].filter(Boolean);

  let lastError;
  for (const key of keys) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { ...(options.headers || {}), 'authtoken': key },
        // @ts-ignore - undici przyjmuje agenta
        dispatcher: undefined,
        agent: url.startsWith('https') ? httpsAgent : undefined,
      });

      // 403 = brak dostępu dla tego klucza, spróbuj drugiego
      if (res.status === 403 || res.status === 401) {
        lastError = new Error(`SD ${res.status}`);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();

        // Specjalne traktowanie 404 - może być scalenie zgłoszenia
        if (res.status === 404) {
          try {
            const json = JSON.parse(text);
            const msg = json.response_status?.messages?.[0];
            const parentId = msg?.message?.parent_request?.id;
            if (parentId) {
              const err = new Error(`Zgłoszenie scalone z #${parentId}`);
              err.merged = true;
              err.parentId = String(parentId);
              throw err;
            }
          } catch (parseErr) {
            // Jeśli to nasz błąd z merged - przekaż dalej
            if (parseErr.merged) throw parseErr;
            // W przeciwnym wypadku - normalny 404
          }
        }

        throw new Error(`SD HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      return await res.json();
    } catch (err) {
      lastError = err;
      // Jeśli to błąd sieciowy a nie auth — nie próbuj drugiego klucza
      if (!err.message.includes('SD 403') && !err.message.includes('SD 401')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('SD: wszystkie klucze odrzucone');
}

// ── Node 18 fetch z self-signed cert wymaga ustawienia globalnie ──────────────
// Najprostsze podejście: ustawić zmienną środowiskową przy starcie
if (process.env.SD_URL?.includes('intranet')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// ── Pobierz pojedyncze zgłoszenie ─────────────────────────────────────────────
async function getRequest(requestId) {
  const data = await sdFetch(`/api/v3/requests/${encodeURIComponent(requestId)}`);

  if (data.response_status?.status !== 'success' && data.response_status?.[0]?.status !== 'success') {
    throw new Error(`SD: ${JSON.stringify(data.response_status)}`);
  }

  return data.request;
}

// ── Pobierz notatki zgłoszenia ────────────────────────────────────────────────
// Lista z /notes nie zawiera treści — trzeba pobrać każdą notatkę osobno
async function getNotes(requestId) {
  const list = await sdFetch(`/api/v3/requests/${encodeURIComponent(requestId)}/notes`);
  const notes = list.notes || [];

  // Pobierz pełne dane każdej notatki równolegle
  const detailed = await Promise.all(
    notes.map(async (n) => {
      try {
        const full = await sdFetch(`/api/v3/requests/${encodeURIComponent(requestId)}/notes/${encodeURIComponent(n.id)}`);
        return full.note || n;
      } catch (err) {
        console.warn(`[SD] Nie udało się pobrać notatki ${n.id}:`, err.message);
        return n; // fallback do tego co mamy z listy
      }
    })
  );

  return detailed;
}

// ── Pobierz rozwiązanie zgłoszenia ────────────────────────────────────────────
async function getResolution(requestId) {
  try {
    const data = await sdFetch(`/api/v3/requests/${encodeURIComponent(requestId)}/resolutions`);
    // SDP zwraca resolution jako obiekt (lub null jeśli brak)
    const res = data.resolution;
    if (!res) return null;
    return {
      content:      stripHtml(res.content || ''),
      submitted_by: res.submitted_by?.name || res.resolution_owner?.name || '',
      submitted_on: res.submitted_on?.display_value || res.submitted_on?.value || '',
    };
  } catch (e) {
    // Brak rozwiązania lub brak dostępu — nie traktuj jako błąd
    return null;
  }
}

// ── Pobierz konwersacje (rozmowy) zgłoszenia ──────────────────────────────────
async function getConversations(requestId) {
  try {
    const data = await sdFetch(`/api/v3/requests/${encodeURIComponent(requestId)}/conversations`);
    return data.conversations || [];
  } catch (e) {
    // Konwersacje mogą nie być dostępne dla niektórych ticketów
    return [];
  }
}

// ── Mapowania priorytetu i statusu ────────────────────────────────────────────
const PRIORITY_MAP = {
  'Niski':     'niski',
  'Low':       'niski',
  'Normalny':  'sredni',
  'Normal':    'sredni',
  'Medium':    'sredni',
  'Wysoki':    'wysoki',
  'High':      'wysoki',
  'Pilny':     'wysoki',
  'Urgent':    'wysoki',
  'Krytyczny': 'wysoki',
  'Critical':  'wysoki',
};

const STATUS_MAP = {
  'Nowe':         'otwarty',
  'Open':         'otwarty',
  'Otwarte':      'otwarty',
  'W realizacji': 'w_toku',
  'W toku':       'w_toku',
  'In Progress':  'w_toku',
  'Onhold':       'w_toku',
  'On Hold':      'w_toku',
  'Wstrzymane':   'w_toku',
  'Zamknięte':    'zamkniety',
  'Closed':       'zamkniety',
  'Resolved':     'zamkniety',
  'Rozwiązane':   'zamkniety',
  'Wykonane':     'zamkniety',
  'Completed':    'zamkniety',
  'Anulowane':    'zamkniety',
  'Cancelled':    'zamkniety',
};

function mapPriority(sdPriority) {
  return PRIORITY_MAP[sdPriority] || 'sredni';
}

function mapStatus(sdStatus) {
  return STATUS_MAP[sdStatus] || 'otwarty';
}

// Status końcowy = nie ma sensu odpytywać SD ponownie
function isFinalStatus(sdStatus) {
  return mapStatus(sdStatus) === 'zamkniety';
}

// ── Strip HTML z opisu ────────────────────────────────────────────────────────
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<img[^>]*>/gi, '[obrazek]')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Mapuj surowe dane z SD na format RVM ticketa ──────────────────────────────
function mapSdRequestToTicket(sdReq) {
  return {
    sd_id:          sdReq.id,
    nazwa_sklepu:   sdReq.requester?.name || '',
    opis:           sdReq.subject || '',
    opis_dlugi:     stripHtml(sdReq.description),
    priorytet:      mapPriority(sdReq.priority?.name),
    dzial:          sdReq.group?.name || '',
    status:         mapStatus(sdReq.status?.name),
    sd_status_name: sdReq.status?.name || '',
    sd_priority_color: sdReq.priority?.color || null,
    sd_technician:  sdReq.technician?.name || null,
    sd_created_at:  sdReq.created_time?.display_value || null,
    sd_category:    sdReq.category?.name || '',
    sd_subcategory: sdReq.subcategory?.name || '',
    sd_item:        sdReq.item?.name || '',
    sd_requester_email: sdReq.requester?.email_id || '',
    sd_requester_phone: sdReq.requester?.phone || '',
    sd_department:  sdReq.requester?.department?.name || '',
    sd_site:        sdReq.site?.name || '',
    has_attachments: sdReq.has_attachments || false,
  };
}

// ── Wyciągnij numer klienta (5 cyfr) z requester.name ─────────────────────────
// Format SD: "Lubań 3 [14332] [P]" → 14332
function extractClientNumber(requesterName) {
  if (!requesterName) return null;
  const match = requesterName.match(/\[(\d{4,6})\]/);
  return match ? match[1] : null;
}

// ── Mapuj notatki z SD ────────────────────────────────────────────────────────
function mapSdNote(sdNote) {
  const author = sdNote.added_by || sdNote.created_by || {};
  const time   = sdNote.added_time || sdNote.created_time || {};
  return {
    sd_id:     sdNote.id,
    tresc:     stripHtml(sdNote.description || ''),
    autor:     author.name || 'SD',
    data:      time.value
                 ? new Date(parseInt(time.value)).toISOString()
                 : new Date().toISOString(),
  };
}

module.exports = {
  getRequest,
  getNotes,
  getResolution,
  getConversations,
  mapSdRequestToTicket,
  mapSdNote,
  extractClientNumber,
  mapStatus,
  isFinalStatus,
  stripHtml,
};
