// app.js – główny komponent aplikacji
const { useState, useEffect, useRef, useCallback, useMemo } = React;

const PAGE_TITLES = {
  devices:   { title: 'Urządzenia',     subtitle: 'Lista wszystkich recyklomatów' },
  tickets:   { title: 'Zgłoszenia',     subtitle: 'Otwarte i archiwalne zgłoszenia serwisowe' },
  users:     { title: 'Użytkownicy',    subtitle: 'Zarządzanie kontami i rolami' },
  stats:     { title: 'Statystyki',     subtitle: 'Historia statusów sieci recyklomatów' },
  admin:     { title: 'Administracja',  subtitle: 'Synchronizacja i zarządzanie aplikacją' },
  about:     { title: 'O aplikacji',    subtitle: 'Informacje o wersji' },
};

// ── Normalizacja statusu: BinoQ → format Tomra ───────────────────────────────
const BINOQ_TO_TOMRA = {
  'Online':      'up',
  'Down':        'down',
  'BinFull':     'down',
  'BinSemiFull': 'up',
  'Offline':     'offline',
  'Unknown':     'not_seen',
};

// Waga statusów — im wyższa tym gorzej
const STATUS_WEIGHT = { 'not_seen': 0, 'up': 1, 'offline': 2, 'down': 3 };

function normalizeDevices(devices) {
  return devices.map(d => {
    const tomraStatus = d.statusManualny || d.statusTomra || 'not_seen';

    // Tomra nie widziała urządzenia — not_seen, BinoQ nie nadpisuje
    if (tomraStatus === 'not_seen') return d;

    if (!d.statusBinoq || d.statusBinoq === 'not_seen') return d;

    const binoqStatus = BINOQ_TO_TOMRA[d.statusBinoq] || 'not_seen';

    // Użyj statusu z wyższą wagą (gorszy = bardziej krytyczny)
    const tomraW = STATUS_WEIGHT[tomraStatus] ?? 0;
    const binoqW = STATUS_WEIGHT[binoqStatus] ?? 0;

    if (binoqW > tomraW) {
      return { ...d, statusTomra: binoqStatus };
    }
    return d;
  });
}


function App() {
  const auth = RVM.useAuth();

  const [tab,        setTab]        = useState('devices');
  const [collapsed,  setCollapsed]  = useState(() => localStorage.getItem('sidebar_collapsed') === '1');
  const [devices,    setDevices]    = useState([]);
  const [tickets,    setTickets]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [lastTs,     setLastTs]     = useState(null);
  const [newTicketDraft, setNewTicketDraft] = useState(null);
  const [panelDeviceSn,  setPanelDeviceSn]  = useState(null);

  const tsRef            = useRef(null);
  const serverVersionRef = useRef(null);

  // ── Persist sidebar state ────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  // ── Pobierz dane ─────────────────────────────────────────────────────
  const load = useCallback(async (force = false) => {
    if (!force) {
      try {
        const info = await RVM.API.getTs();
        if (info.ts === tsRef.current) return;
        tsRef.current = info.ts;
      } catch { return; }
    }
    try {
      const data = await RVM.API.getData();
      setDevices(normalizeDevices(data.devices || []));
      setTickets(data.tickets   || []);
      if (data.ts) setLastTs(new Date(data.ts));
      setLoading(false);
    } catch (err) {
      console.error('load:', err);
      setLoading(false);
    }
  }, []);

  // ── Polling + wykrywanie restartu serwera ────────────────────────────
  useEffect(() => {
    if (!auth.user) return;

    load(true);

    // Pobierz początkową wersję serwera
    RVM.API.getVersion()
      .then(d => { serverVersionRef.current = d.version; })
      .catch(() => {});

    const id = setInterval(async () => {
      load(false);
      // Sprawdź czy serwer się zrestartował
      try {
        const v = await RVM.API.getVersion();
        if (serverVersionRef.current && v.version !== serverVersionRef.current) {
          window.location.reload();
        }
      } catch {}
    }, 5000);

    return () => clearInterval(id);
  }, [auth.user, load]);

  // ── Akcje na urządzeniach ────────────────────────────────────────────
  const updateDevice = useCallback(async (sn, payload) => {
    try { await RVM.API.updateDevice(sn, payload); await load(true); }
    catch (e) { alert(`Błąd: ${e.message}`); }
  }, [load]);

  const addNote = useCallback(async (sn, tresc, kategoria) => {
    try {
      const note = {
        id: `n${Date.now()}`,
        tresc,
        autor: auth.user.imie || auth.user.login,
        data: new Date().toISOString(),
        kategoria: kategoria || 'kontakt',
      };
      await RVM.API.addNote(sn, note);
      await load(true);
    } catch (e) { alert(`Błąd: ${e.message}`); }
  }, [auth.user, load]);

  const editNote = useCallback(async (id, tresc, kategoria) => {
    try { await RVM.API.editNote(id, tresc, kategoria); await load(true); }
    catch (e) { alert(`Błąd: ${e.message}`); }
  }, [load]);

  const deleteNote = useCallback(async (id) => {
    try { await RVM.API.deleteNote(id); await load(true); }
    catch (e) { alert(`Błąd: ${e.message}`); }
  }, [load]);

  // ── Akcje na zgłoszeniach ────────────────────────────────────────────
  const addTicket = useCallback(async (newT) => {
    try {
      const ticket = { id: Date.now().toString(), ...newT };
      await RVM.API.addTicket(ticket);
      await load(true);
    } catch (e) { alert(`Błąd: ${e.message}`); }
  }, [load]);

  const updateTicket = useCallback(async (id, fields) => {
    try { await RVM.API.updateTicket(id, fields); await load(true); }
    catch (e) { alert(`Błąd: ${e.message}`); }
  }, [load]);

  const addTicketNote = useCallback(async (ticketId, tresc) => {
    try {
      const note = { id: `tn${Date.now()}`, tresc, autor: auth.user.imie || auth.user.login, data: new Date().toISOString() };
      await RVM.API.addTicketNote(ticketId, note);
      await load(true);
    } catch (e) { alert(`Błąd: ${e.message}`); }
  }, [auth.user, load]);

  const editTicketNote = useCallback(async (id, tresc) => {
    try { await RVM.API.editTicketNote(id, tresc); await load(true); }
    catch (e) { alert(`Błąd: ${e.message}`); }
  }, [load]);

  const deleteTicketNote = useCallback(async (id) => {
    try { await RVM.API.deleteTicketNote(id); await load(true); }
    catch (e) { alert(`Błąd: ${e.message}`); }
  }, [load]);

  // ── Otwórz formularz nowego zgłoszenia z urządzeniem ─────────────────
  const openNewTicket = useCallback((device) => {
    setNewTicketDraft({
      deviceId:    device.numerSeryjny,
      nazwaSklepu: device.nazwaSklepu,
      opis:        '',
      priorytet:   'sredni',
      osobaOdp:    '',
      nrZgloszenia: '',
      dzial:       '',
    });
    setTab('tickets');
  }, []);

  // ── Akcje sidebara ───────────────────────────────────────────────────
  const handleLogout = async () => {
    try { await RVM.API.logout(); }
    finally { window.location = '/login'; }
  };

  const handleChangePassword = async () => {
    const oldP = prompt('Stare hasło:');
    if (!oldP) return;
    const newP = prompt('Nowe hasło (min. 6 znaków):');
    if (!newP) return;
    try {
      await RVM.API.changePassword(oldP, newP);
      alert('Hasło zostało zmienione');
    } catch (e) { alert(`Błąd: ${e.message}`); }
  };

  // ── Pochodne dane ────────────────────────────────────────────────────
  const canEdit = auth.user?.rola === 'admin' || auth.user?.rola === 'user';
  const username = auth.user?.imie || auth.user?.login || '';
  const openTicketsCount = useMemo(() =>
    tickets.filter(t => t.status !== 'zamkniety').length, [tickets]);

  // ── Renderowanie ─────────────────────────────────────────────────────
  if (auth.loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>Ładowanie…</div>;
  }
  if (!auth.user) return null;

  const pageTitle = PAGE_TITLES[tab] || PAGE_TITLES.devices;

  return (
    <div className="app-layout">
      <RVM.Sidebar
        tab={tab} setTab={setTab}
        user={auth.user}
        devicesCount={devices.length}
        openTicketsCount={openTicketsCount}
        collapsed={collapsed} setCollapsed={setCollapsed}
        onLogout={handleLogout}
        onChangePassword={handleChangePassword}
      />

      <div className="main-content">
        <div className="page-header">
          <div style={{ flex: 1 }}>
            <div className="page-title">{pageTitle.title}</div>
            <div className="page-subtitle">
              {pageTitle.subtitle}
              {lastTs && tab === 'devices' && ` · Ostatnia aktualizacja: ${lastTs.toLocaleTimeString('pl-PL')}`}
            </div>
          </div>
        </div>

        <div className="content-area">
          {loading
            ? <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>Ładowanie danych…</div>
            : (<>
              {tab === 'devices' && (
                <RVM.DevicesTab
                  devices={devices} tickets={tickets} canEdit={canEdit}
                  onUpdate={updateDevice}
                  onAddNote={addNote} onEditNote={editNote} onDeleteNote={deleteNote}
                  openNewTicket={openNewTicket}
                  onOpenDetails={(sn) => setPanelDeviceSn(sn)}
                />
              )}
              {tab === 'tickets' && (
                <RVM.TicketsTab
                  devices={devices} tickets={tickets} canEdit={canEdit} username={username}
                  onAddTicket={addTicket} onUpdateTicket={updateTicket}
                  newTicketDraft={newTicketDraft} clearNewTicketDraft={() => setNewTicketDraft(null)}
                />
              )}
              {tab === 'users' && auth.user.rola === 'admin' && <RVM.UsersTab />}
              {tab === 'stats' && <RVM.StatsTab />}
              {tab === 'admin' && auth.user.rola === 'admin' && <RVM.AdminTab />}
              {tab === 'about' && <RVM.AboutTab />}
            </>)}
        </div>
      </div>

      {/* Side-panel ze szczegółami urządzenia */}
      {panelDeviceSn && (() => {
        const dev = devices.find(d => d.numerSeryjny === panelDeviceSn);
        if (!dev) return null;
        return (
          <RVM.DeviceDetailsPanel
            device={dev}
            tickets={tickets}
            canEdit={canEdit}
            username={username}
            onClose={() => setPanelDeviceSn(null)}
            onUpdate={updateDevice}
            onAddNote={addNote}
            onEditNote={editNote}
            onDeleteNote={deleteNote}
          />
        );
      })()}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
