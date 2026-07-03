// api.js – wszystkie wywołania do backendu w jednym miejscu
window.RVM = window.RVM || {};

async function request(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (res.status === 401) {
    window.location = '/login';
    throw new Error('Niezalogowany');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

RVM.API = {
  // ── Dane główne ─────────────────────────────────────────────────────
  getData:    () => request('/api/data'),
  getTs:      () => request('/api/ts'),
  getVersion: () => request('/api/version'),

  // ── Urządzenia ──────────────────────────────────────────────────────
  updateDevice: (sn, payload) =>
    request(`/api/devices/${encodeURIComponent(sn)}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // ── Notatki do urządzeń ─────────────────────────────────────────────
  addNote:    (sn, note)       => request(`/api/devices/${encodeURIComponent(sn)}/notes`, { method: 'POST', body: JSON.stringify(note) }),
  editNote:   (id, tresc, kategoria) => request(`/api/notes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ tresc, kategoria }) }),
  deleteNote: (id)             => request(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ── Zgłoszenia ──────────────────────────────────────────────────────
  addTicket:    (ticket)       => request('/api/tickets', { method: 'POST', body: JSON.stringify(ticket) }),
  updateTicket: (id, fields)   => request(`/api/tickets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(fields) }),

  // ── Notatki do zgłoszeń ─────────────────────────────────────────────
  addTicketNote:    (ticketId, note) => request(`/api/tickets/${encodeURIComponent(ticketId)}/notes`, { method: 'POST', body: JSON.stringify(note) }),
  editTicketNote:   (id, tresc)      => request(`/api/ticket-notes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ tresc }) }),
  deleteTicketNote: (id)             => request(`/api/ticket-notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ── Sync TOMRA ──────────────────────────────────────────────────────
  runSync:       ()  => request('/api/sync/run',    { method: 'POST' }),
  getSyncStatus: ()  => request('/api/sync/status'),

  // ── Użytkownicy (admin) ─────────────────────────────────────────────
  getUsers:           ()              => request('/api/users'),
  addUser:            (payload)       => request('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUserPassword: (id, password)  => request(`/api/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }),
  updateUserRola:     (id, rola)      => request(`/api/users/${id}/rola`,     { method: 'PATCH', body: JSON.stringify({ rola }) }),
  toggleUser:         (id, aktywny)   => request(`/api/users/${id}/toggle`,   { method: 'PATCH', body: JSON.stringify({ aktywny }) }),
  deleteUser:         (id)            => request(`/api/users/${id}`,          { method: 'DELETE' }),

  // ── Auth ────────────────────────────────────────────────────────────
  logout:        ()                             => request('/api/auth/logout', { method: 'POST' }),
  changePassword: (oldPassword, newPassword)    => request('/api/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ oldPassword, newPassword }),
  }),

  // ── Admin – synchronizacja ──────────────────────────────────────────
  getAdminSync:        ()         => request('/api/admin/sync'),
  setSyncSource:       (source)   => request('/api/admin/sync-source', { method: 'POST', body: JSON.stringify({ source }) }),
  triggerSync:         (source)   => request(`/api/admin/sync/${source}`, { method: 'POST' }),
  setSnapshotInterval: (minutes)  => request('/api/admin/snapshot-interval', { method: 'POST', body: JSON.stringify({ minutes }) }),
  runSnapshot:         ()         => request('/api/admin/snapshot/run', { method: 'POST' }),
  getStats:            (days = 7) => request(`/api/stats?days=${days}`),
  getDeviceLog:        (sn)       => request(`/api/stats/device-log/${encodeURIComponent(sn)}`),
  getOfflineReport:    (date)     => request(`/api/stats/offline-report${date ? `?date=${date}` : ''}`),

  // ── ServiceDesk ──────────────────────────────────────────────────────
  sdLookup:           (nr)         => request(`/api/sd/lookup/${encodeURIComponent(nr)}`),
  sdSyncTicket:       (ticketId)   => request(`/api/sd/sync/${encodeURIComponent(ticketId)}`, { method: 'POST' }),
  sdSyncAll:          ()           => request('/api/sd/sync-all', { method: 'POST' }),
  sdSetInterval:      (minutes)    => request('/api/sd/interval', { method: 'POST', body: JSON.stringify({ minutes }) }),
  sdStatus:           ()           => request('/api/sd/status'),
};
