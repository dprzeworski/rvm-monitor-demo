// DeviceDetailsPanel.js – side-panel ze szczegółami urządzenia
window.RVM = window.RVM || {};

RVM.DeviceDetailsPanel = function DeviceDetailsPanel({
  device, tickets, canEdit, username, onClose,
  onUpdate, onAddNote, onEditNote, onDeleteNote,
}) {
  const { useState, useEffect, useRef, useMemo } = React;
  const { ST, PRIO_COLOR, TSTAT_LABEL, hostToIp, fmtDate, fmtDateLong } = RVM;

  const [tab,        setTab]        = useState('overview');
  const [log,        setLog]        = useState([]);
  const [logLoading, setLogLoading] = useState(true);
  const [openTicket, setOpenTicket] = useState(null);
  const [syncingTicket, setSyncingTicket] = useState({});

  const statusChartRef = useRef(null);
  const onlineChartRef = useRef(null);
  const statusChartInst = useRef(null);
  const onlineChartInst = useRef(null);

  // ── Pobierz historię statusów ────────────────────────────────────────────
  useEffect(() => {
    if (!device?.numerSeryjny) return;
    setLogLoading(true);
    RVM.API.getDeviceLog(device.numerSeryjny)
      .then(d => setLog(d.log || []))
      .catch(() => setLog([]))
      .finally(() => setLogLoading(false));
  }, [device?.numerSeryjny]);

  // ── ESC zamyka panel ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Wykresy timeline ─────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'history' || !log.length || typeof Chart === 'undefined') return;

    // Wykres 1: status urządzenia (up/down/not_seen)
    if (statusChartRef.current) {
      if (statusChartInst.current) statusChartInst.current.destroy();

      // Tworzymy data points dla każdej zmiany — stepped line
      const sorted = [...log].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const STATUS_NUM = { up: 3, offline: 2, down: 1, not_seen: 0 };
      const STATUS_LBL = { 3: 'UP', 2: 'OFFLINE', 1: 'DOWN', 0: 'NOT SEEN' };
      const STATUS_COLOR = { up: '#22c55e', offline: '#f97316', down: '#ef4444', not_seen: '#94a3b8' };

      const points = sorted.map(l => ({
        x: new Date(l.timestamp).getTime(),
        y: STATUS_NUM[l.nowy_status] ?? 0,
        status: l.nowy_status,
        reason: l.reason || '',
      }));

      // Dodaj punkt "teraz" z bieżącym statusem
      const current = device.statusManualny || device.statusTomra || 'not_seen';
      points.push({
        x: Date.now(),
        y: STATUS_NUM[current] ?? 0,
        status: current,
        reason: 'aktualnie',
      });

      statusChartInst.current = new Chart(statusChartRef.current, {
        type: 'line',
        data: {
          datasets: [{
            label: 'Status',
            data: points,
            stepped: true,
            borderColor: '#0f172a',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: ctx => STATUS_COLOR[ctx.raw?.status] || '#94a3b8',
            pointBorderColor: ctx => STATUS_COLOR[ctx.raw?.status] || '#94a3b8',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: ctx => new Date(ctx[0].parsed.x).toLocaleString('pl-PL'),
                label: ctx => {
                  const s = STATUS_LBL[ctx.parsed.y] || 'NIEZNANY';
                  const r = ctx.raw?.reason ? ` · ${ctx.raw.reason}` : '';
                  return `${s}${r}`;
                },
              },
            },
          },
          scales: {
            x: {
              type: 'linear',
              ticks: {
                callback: v => new Date(v).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' }),
                font: { family: 'DM Sans', size: 11 },
                maxRotation: 0,
              },
              grid: { color: '#f1f5f9' },
            },
            y: {
              min: -0.5,
              max: 3.5,
              ticks: {
                stepSize: 1,
                callback: v => STATUS_LBL[v] || '',
                font: { family: 'DM Sans', size: 11 },
              },
              grid: { color: '#f1f5f9' },
            },
          },
        },
      });
    }

    // Wykres 2: łączność (online/offline)
    if (onlineChartRef.current) {
      if (onlineChartInst.current) onlineChartInst.current.destroy();

      const sorted = [...log].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const ONLINE_NUM = { online: 1, offline: 0 };
      const ONLINE_LBL = { 1: 'Online', 0: 'Offline' };

      const points = sorted.map(l => ({
        x: new Date(l.timestamp).getTime(),
        y: l.nowy_status === 'offline' || l.nowy_status === 'not_seen' ? 0 : 1,
        status: l.nowy_status,
      }));

      const current = device.statusManualny || device.statusTomra || 'not_seen';
      points.push({
        x: Date.now(),
        y: current === 'offline' || current === 'not_seen' ? 0 : 1,
        status: current,
      });

      onlineChartInst.current = new Chart(onlineChartRef.current, {
        type: 'line',
        data: {
          datasets: [{
            label: 'Łączność',
            data: points,
            stepped: true,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.1)',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: ctx => ctx.raw?.y === 1 ? '#22c55e' : '#f97316',
            pointBorderColor: ctx => ctx.raw?.y === 1 ? '#22c55e' : '#f97316',
            fill: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: ctx => new Date(ctx[0].parsed.x).toLocaleString('pl-PL'),
                label: ctx => ONLINE_LBL[ctx.parsed.y] || '',
              },
            },
          },
          scales: {
            x: {
              type: 'linear',
              ticks: {
                callback: v => new Date(v).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' }),
                font: { family: 'DM Sans', size: 11 },
                maxRotation: 0,
              },
              grid: { color: '#f1f5f9' },
            },
            y: {
              min: -0.2,
              max: 1.2,
              ticks: {
                stepSize: 1,
                callback: v => ONLINE_LBL[v] || '',
                font: { family: 'DM Sans', size: 11 },
              },
              grid: { color: '#f1f5f9' },
            },
          },
        },
      });
    }

    return () => {
      if (statusChartInst.current) statusChartInst.current.destroy();
      if (onlineChartInst.current) onlineChartInst.current.destroy();
    };
  }, [tab, log, device]);

  // ── Zgłoszenia dla tego urządzenia ───────────────────────────────────────
  const deviceTickets = useMemo(() => {
    return (tickets || []).filter(t => t.deviceId === device.numerSeryjny);
  }, [tickets, device.numerSeryjny]);

  const handleSyncTicket = async (ticketId) => {
    setSyncingTicket(s => ({ ...s, [ticketId]: true }));
    try {
      await RVM.API.sdSyncTicket(ticketId);
    } catch (e) {
      alert('Błąd synchronizacji: ' + e.message);
    } finally {
      setSyncingTicket(s => ({ ...s, [ticketId]: false }));
    }
  };

  if (!device) return null;

  const ip      = device.ipWyliczone || hostToIp(device.numerKlienta);
  const effStatus = device.statusManualny || device.statusTomra || 'not_seen';
  const stCfg   = ST[effStatus] || ST.not_seen;

  // Czas w statusie — dłuższy z BinoQ i Tomra
  const binoqCzas = (() => {
    const binoqSek = device.statusBinoqSince ? Math.max(0, Math.floor((Date.now() - new Date(device.statusBinoqSince).getTime()) / 1000)) : 0;
    const tomraSek = device.czasSek || 0;
    const sek = Math.max(binoqSek, tomraSek);
    if (!sek) return '';
    const m  = Math.floor(sek / 60);
    const h  = Math.floor(m / 60);
    const dd = Math.floor(h / 24);
    if (dd > 0) return `${dd}d ${h % 24}h ${m % 60}m`;
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${sek % 60}s`;
    return `${sek}s`;
  })();
  const tabs    = [
    { id: 'overview', label: 'Przegląd',   icon: 'ClipboardList' },
    { id: 'tickets',  label: `Zgłoszenia${deviceTickets.length ? ` (${deviceTickets.length})` : ''}`, icon: 'FileText' },
    { id: 'history',  label: 'Historia',   icon: 'TrendingUp' },
    { id: 'notes',    label: `Notatki${device.notatki?.length ? ` (${device.notatki.length})` : ''}`, icon: 'MessageSquare' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.4)',
          zIndex: 100,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: 'min(720px, 100vw)',
        background: 'white',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.15)',
        zIndex: 101,
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ background: stCfg.bg, color: stCfg.txt, padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, background: stCfg.dot, borderRadius: '50%', marginRight: 6 }} />
                {stCfg.label}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{device.numerSeryjny}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {device.nazwaSklepu || '—'}
            </div>
            {device.idSklepu && (
              <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', marginTop: 2 }}>{device.idSklepu}</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: 24, color: '#64748b', cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}
            title="Zamknij (Esc)"
          >×</button>
        </div>

        {/* Taby */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                background: tab === t.id ? 'white' : 'transparent',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
                padding: '12px 8px',
                fontSize: 13,
                fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? '#1e40af' : '#64748b',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ marginRight: 6, display: 'inline-flex', alignItems: 'center' }}>{RVM.Icons[t.icon] && React.createElement(RVM.Icons[t.icon], { size: 15 })}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ── PRZEGLĄD ─────────────────────────────────────────── */}
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Stan aktualny */}
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Status aktualny
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                  <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Info size={13} />Efektywny:</span> <strong style={{ color: stCfg.txt }}>{stCfg.label}</strong></div>
                  <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Clock size={13} />W statusie:</span> <strong>{binoqCzas || device.czasTrwania || '—'}</strong></div>
                  <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Activity size={13} />BinoQ:</span> <strong>{device.statusBinoq || '—'}</strong></div>
                  <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Refresh size={13} />Tomra:</span> <strong>{device.statusTomra}</strong></div>
                  {device.reasonBinoq && (
                    <div style={{ gridColumn: 'span 2', color: '#374151' }}>
                      <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.MessageSquare size={13} />Powód:</span> <strong>{device.reasonBinoq}</strong>
                    </div>
                  )}
                  {device.extraInfo && (
                    <div style={{ gridColumn: 'span 2', color: '#374151' }}>
                      <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Info size={13} />Komunikat:</span> <strong>{device.extraInfo}</strong>
                    </div>
                  )}
                  {device.binsBinoq?.length > 0 && (
                    <div style={{ gridColumn: 'span 2', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {device.binsBinoq.map(b => {
                        const cfg = b.state === 'Full'     ? { bg: '#fee2e2', txt: '#991b1b', dot: '#ef4444' } :
                                    b.state === 'SemiFull' ? { bg: '#fff7ed', txt: '#9a3412', dot: '#f97316' } :
                                                             { bg: '#f0fdf4', txt: '#166534', dot: '#22c55e' };
                        return (
                          <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: cfg.bg, color: cfg.txt, padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot }} />
                            Kosz {b.id}: {b.state}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Lokalizacja */}
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Lokalizacja
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.MapPin size={13} />Adres:</span> <strong>{device.ulica && `${device.ulica}, `}{device.kodPocztowy} {device.miasto}</strong>
                  </div>
                  <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.User size={13} />Nr klienta:</span> <strong>{device.numerKlienta || '—'}</strong></div>
                  <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Wifi size={13} />IP:</span> <strong style={{ fontFamily: 'monospace' }}>{ip || 'poza zakresem'}</strong></div>
                </div>
              </div>

              {/* Urządzenie */}
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Urządzenie
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                  <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Tag size={13} />Model:</span> <strong>{device.model || '—'}</strong></div>
                  <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Tag size={13} />DRS:</span> <strong>{device.clearingHouse || 'Brak'}</strong></div>
                  <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Clock size={13} />Sync BinoQ:</span> <strong>{device.ostatniaBinoq ? fmtDate(device.ostatniaBinoq) : '—'}</strong></div>
                  {device.idSklepu && <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Info size={13} />ID sklepu:</span> <strong style={{ fontFamily: 'monospace' }}>{device.idSklepu}</strong></div>}
                </div>
              </div>
            </div>
          )}

          {/* ── ZGŁOSZENIA ─────────────────────────────────────── */}
          {tab === 'tickets' && (
            <div>
              {deviceTickets.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  Brak zgłoszeń dla tego urządzenia
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {deviceTickets.map(ticket => {
                    const isOpen = openTicket === ticket.id;
                    const sdColor = ticket.sdPriorityColor || PRIO_COLOR[ticket.priorytet];
                    const isSync = !!syncingTicket[ticket.id];
                    return (
                      <div key={ticket.id} style={{ background: 'white', border: `1px solid ${isOpen ? '#3b82f6' : '#e2e8f0'}`, borderRadius: 8, overflow: 'hidden' }}>
                        <div onClick={() => setOpenTicket(isOpen ? null : ticket.id)}
                             style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                          <div style={{ width: 3, borderRadius: 3, alignSelf: 'stretch', background: sdColor }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                              {ticket.nrZgloszenia && (
                                <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                                  SD #{ticket.nrZgloszenia}
                                </span>
                              )}
                              <span style={{ background: sdColor + '22', color: sdColor, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase' }}>{ticket.priorytet}</span>
                              {ticket.dzial && <span style={{ background: '#eff6ff', color: '#1e40af', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{ticket.dzial}</span>}
                              <span style={{ marginLeft: 'auto', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600 }}>
                                {ticket.sdStatusName || TSTAT_LABEL[ticket.status]}
                              </span>
                            </div>
                            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>{ticket.opis}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                              <RVM.Icons.User size={12} />{ticket.osobaOdp || ticket.by} · <RVM.Icons.Calendar size={12} />{fmtDate(ticket.created)}
                            </div>
                          </div>
                        </div>

                        {/* Rozwinięte szczegóły */}
                        {isOpen && (
                          <div style={{ borderTop: '2px solid #3b82f6', background: '#eff6ff', padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                              <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Szczegóły z SD
                              </div>
                              {canEdit && ticket.status !== 'zamkniety' && (
                                <button onClick={() => handleSyncTicket(ticket.id)} disabled={isSync} className="btn btn-secondary btn-sm" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                  <RVM.Icons.Refresh size={13} /> Sync
                                </button>
                              )}
                            </div>

                            {ticket.opisDlugi && (
                              <div style={{ marginBottom: 10, background: 'white', border: '1px solid #bfdbfe', borderRadius: 6, padding: 10, fontSize: 12, color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                {ticket.opisDlugi}
                              </div>
                            )}

                            {ticket.sdResolution && (
                              <div style={{ marginBottom: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#166534', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                  <RVM.Icons.Check size={13} color="#166534" />Rozwiązanie{ticket.sdResolutionBy ? ` · ${ticket.sdResolutionBy}` : ''}
                                </div>
                                <div style={{ fontSize: 12, color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{ticket.sdResolution}</div>
                              </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, marginBottom: 10 }}>
                              {ticket.sdRequesterEmail && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.MessageSquare size={12} color="#64748b" /> {ticket.sdRequesterEmail}</div>}
                              {ticket.sdRequesterPhone && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Phone size={12} color="#64748b" /> {ticket.sdRequesterPhone}</div>}
                              {ticket.sdTechnician     && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Wrench size={12} color="#64748b" /> {ticket.sdTechnician}</div>}
                              {ticket.sdCategory       && <div><span style={{ color: '#64748b' }}>📂</span> {ticket.sdCategory}</div>}
                            </div>

                            {ticket.sdNotes?.length > 0 && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', marginBottom: 6, textTransform: 'uppercase' }}>
                                  Notatki SD ({ticket.sdNotes.length})
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {ticket.sdNotes.map((n, i) => (
                                    <div key={n.sd_id || i} style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: 4, padding: 8, fontSize: 12 }}>
                                      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3 }}>
                                        <strong>{n.autor}</strong> · {fmtDate(n.data)}
                                      </div>
                                      <div style={{ whiteSpace: 'pre-wrap', color: '#374151' }}>{n.tresc}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── HISTORIA ───────────────────────────────────────── */}
          {tab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {logLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Ładowanie historii…</div>
              ) : log.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                  Brak zarejestrowanych zmian statusu
                </div>
              ) : (
                <>
                  {/* Wykres 1: Status urządzenia */}
                  <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, background: stCfg.dot, borderRadius: '50%', marginRight: 6 }} />
                      Status urządzenia: <span style={{ color: stCfg.txt }}>{stCfg.label}</span>
                      <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 6 }}>({device.czasTrwania || '—'})</span>
                    </div>
                    <div style={{ height: 160, marginTop: 8 }}>
                      <canvas ref={statusChartRef} />
                    </div>
                  </div>

                  {/* Wykres 2: Łączność */}
                  <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, background: effStatus === 'offline' || effStatus === 'not_seen' ? '#f97316' : '#22c55e', borderRadius: '50%', marginRight: 6 }} />
                      Łączność: <span style={{ color: effStatus === 'offline' || effStatus === 'not_seen' ? '#9a3412' : '#166534' }}>
                        {effStatus === 'offline' || effStatus === 'not_seen' ? 'Offline' : 'Online'}
                      </span>
                    </div>
                    <div style={{ height: 140, marginTop: 8 }}>
                      <canvas ref={onlineChartRef} />
                    </div>
                  </div>

                  {/* Tabela zmian */}
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700 }}>
                      Wszystkie zmiany statusu ({log.length})
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Czas</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Z</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Na</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Powód</th>
                        </tr>
                      </thead>
                      <tbody>
                        {log.map((l, i) => {
                          const oldCfg = ST[l.stary_status] || ST.not_seen;
                          const newCfg = ST[l.nowy_status]  || ST.not_seen;
                          return (
                            <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                              <td style={{ padding: '6px 12px', color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>{fmtDateLong(l.timestamp)}</td>
                              <td style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                {l.stary_status
                                  ? <span style={{ background: oldCfg.bg, color: oldCfg.txt, padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 700 }}>{oldCfg.label}</span>
                                  : <span style={{ color: '#94a3b8' }}>—</span>}
                              </td>
                              <td style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ background: newCfg.bg, color: newCfg.txt, padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 700 }}>{newCfg.label}</span>
                              </td>
                              <td style={{ padding: '6px 12px', color: '#64748b', borderBottom: '1px solid #f1f5f9', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── NOTATKI ────────────────────────────────────────── */}
          {tab === 'notes' && (
            <RVM.NotesList
              notes={device.notatki || []}
              readonly={!canEdit}
              onAdd={(t, kat) => onAddNote(device.numerSeryjny, t, kat)}
              onEdit={(id, t, kat) => onEditNote(id, t, kat)}
              onDelete={id => onDeleteNote(id)}
            />
          )}

        </div>

      </div>
    </>
  );
};
