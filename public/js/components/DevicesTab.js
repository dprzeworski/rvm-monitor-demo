// DevicesTab.js – zakładka urządzeń
window.RVM = window.RVM || {};

RVM.DevicesTab = function DevicesTab({ devices, tickets, canEdit, onUpdate, onAddNote, onEditNote, onDeleteNote, openNewTicket, onOpenDetails }) {
  const { useState, useMemo, Fragment } = React;
  const { ST, FLAGS, FLAG_CYCLE, PAGE, fmtDate, hostToIp } = RVM;

  const [search,  setSearch]  = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fMiasto, setFMiasto] = useState('');
  const [fFlag,   setFFlag]   = useState('');
  const [fCzas,   setFCzas]   = useState('');
  const [page,    setPage]    = useState(1);
  const [openRow, setOpenRow] = useState(null);
  const [editV,   setEditV]   = useState({});
  const [sortBy,  setSortBy]  = useState('');
  const [sortDir, setSortDir] = useState('desc');

  const filtered = useMemo(() => {
    let list = devices;

    // Zdemontowane: domyślnie ukryte, widoczne tylko przy filtrze 'zdemontowane'
    if (fStatus === 'zdemontowane') {
      list = list.filter(d => d.uninstalledAt);
    } else {
      list = list.filter(d => !d.uninstalledAt);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.nazwaSklepu?.toLowerCase().includes(q) ||
        d.miasto?.toLowerCase().includes(q) ||
        d.numerSeryjny?.toLowerCase().includes(q) ||
        d.idSklepu?.toLowerCase().includes(q) ||
        d.ulica?.toLowerCase().includes(q) ||
        d.numerKlienta?.includes(q)
      );
    }
    if (fStatus && fStatus !== 'zdemontowane') list = list.filter(d => (d.statusManualny || d.statusTomra) === fStatus);
    if (fMiasto) list = list.filter(d => d.miasto === fMiasto);
    if (fFlag === 'zarzad')  list = list.filter(d => d.flag === 'zarzad');
    if (fFlag === 'pilna')   list = list.filter(d => d.flag === 'pilna');
    if (fFlag === 'flagged') list = list.filter(d => d.flag);
    if (fCzas) {
      const seconds = Number(fCzas);
      list = list.filter(d => (d.czasSek || 0) >= seconds);
    }
    if (sortBy === 'czas') {
      return [...list].sort((a, b) => sortDir === 'desc' ? (b.czasSek || 0) - (a.czasSek || 0) : (a.czasSek || 0) - (b.czasSek || 0));
    }
    return [...list].sort((a, b) => {
      if (a.flag && !b.flag) return -1;
      if (!a.flag && b.flag) return 1;
      return 0;
    });
  }, [devices, search, fStatus, fMiasto, fFlag, fCzas, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE);
  const pageData   = filtered.slice((page - 1) * PAGE, page * PAGE);
  const cities     = useMemo(() => [...new Set(devices.map(d => d.miasto).filter(Boolean))].sort(), [devices]);
  const counts     = useMemo(() => {
    const c = { up: 0, down: 0, offline: 0, not_seen: 0 };
    for (const d of devices) {
      if (d.uninstalledAt) continue;
      const s = d.statusManualny || d.statusTomra;
      if (s in c) c[s]++;
    }
    return c;
  }, [devices]);
  const uninstalledCount = useMemo(() => devices.filter(d => d.uninstalledAt).length, [devices]);
  const flagCounts = useMemo(() => ({
    zarzad: devices.filter(d => d.flag === 'zarzad' && !d.uninstalledAt).length,
    pilna:  devices.filter(d => d.flag === 'pilna' && !d.uninstalledAt).length,
  }), [devices]);

  const clearFilters = () => { setSearch(''); setFStatus(''); setFMiasto(''); setFFlag(''); setFCzas(''); setPage(1); };
  const hasFilter = search || fStatus || fMiasto || fFlag || fCzas;

  const cycleFlag = async (device) => {
    if (!canEdit) return;
    const nv = FLAG_CYCLE[String(device.flag)];
    await onUpdate(device.numerSeryjny, {
      flag: nv,
      _logs: [{ pole: 'Oznaczenie', stara: device.flag ? FLAGS[device.flag]?.label : 'brak', nowa: nv ? FLAGS[nv]?.label : 'brak' }],
    });
  };

  const saveEdit = async () => {
    if (!canEdit) return;
    const device = devices.find(d => d.numerSeryjny === openRow);
    if (!device) return;
    const logs = [];
    for (const [k, v] of Object.entries(editV)) {
      if (k === 'notatki') continue;
      if (String(device[k] ?? '') !== String(v ?? '')) {
        logs.push({ pole: k, stara: device[k], nowa: v });
      }
    }
    await onUpdate(openRow, { ...editV, _logs: logs });
    setOpenRow(null);
    setEditV({});
  };

  const handleSort = () => {
    if (sortBy !== 'czas')        { setSortBy('czas'); setSortDir('desc'); }
    else if (sortDir === 'desc')  { setSortDir('asc'); }
    else                          { setSortBy(''); setSortDir('desc'); }
    setPage(1);
  };

  const handleExport = () => {
    const XLSX = window.XLSX;
    const ticketMap = {};
    for (const t of tickets) {
      if (t.status === 'zamkniety') continue;
      const key = t.deviceId || t.nazwaSklepu;
      if (!ticketMap[key]) ticketMap[key] = t;
    }
    const getTicket = (d) => ticketMap[d.numerSeryjny] || ticketMap[d.nazwaSklepu] || null;

    // Oblicz czas w statusie — dłuższy z BinoQ i Tomra
    const calcCzas = (d) => {
      const binoqSek = d.statusBinoqSince ? Math.max(0, Math.floor((Date.now() - new Date(d.statusBinoqSince).getTime()) / 1000)) : 0;
      const tomraSek = d.czasSek || 0;
      const sek = Math.max(binoqSek, tomraSek);
      if (!sek) return '';
      const m  = Math.floor(sek / 60);
      const h  = Math.floor(m / 60);
      const dd = Math.floor(h / 24);
      if (dd > 0) return `${dd}d ${h % 24}h ${m % 60}m`;
      if (h > 0) return `${h}h ${m % 60}m`;
      return `${m}m`;
    };

    const toRow = (d) => {
      const t = getTicket(d);
      const notatkaSerwis = (d.notatki || []).find(n => n.kategoria === 'serwis');
      return {
        'Nazwa sklepu':       d.nazwaSklepu,
        'Numer seryjny':      d.numerSeryjny,
        'Miasto':             d.miasto,
        'Model':              d.model,
        'Status':             d.statusManualny || d.statusTomra || 'not_seen',
        'Czas w statusie':    calcCzas(d),
        'DRS':                d.clearingHouse || 'Brak',
        'Ostatni komunikat':  d.reasonBinoq || '',
        'Zgłoszenie aktywne': t ? 'Tak' : 'Nie',
        'Status zgłoszenia':  t ? (t.status === 'otwarty' ? 'Otwarty' : 'W toku') : '',
        'Dział':              t ? (t.dzial || '') : '',
        'Nr zgłoszenia SD':   t ? (t.nrZgloszenia || '') : '',
        'Notatka serwisowa':  notatkaSerwis ? notatkaSerwis.tresc : '',
      };
    };

    const wb = XLSX.utils.book_new();
    const labels = { up: 'UP', down: 'DOWN', offline: 'OFFLINE', not_seen: 'NOT SEEN' };
    for (const [status, label] of Object.entries(labels)) {
      const rows = filtered.filter(d => !d.uninstalledAt && (d.statusManualny || d.statusTomra) === status).map(toRow);
      if (rows.length === 0) rows.push({});
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = Array(12).fill({ wch: 16 });
      ws['!cols'][0] = { wch: 30 };
      XLSX.utils.book_append_sheet(wb, ws, label);
    }
    XLSX.writeFile(wb, `rvm_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {Object.entries(ST).map(([key, cfg]) => (
          <div key={key} onClick={() => { setFStatus(fStatus === key ? '' : key); setPage(1); }}
            style={{ background: 'white', border: `1.5px solid ${fStatus === key ? cfg.dot : '#e2e8f0'}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', boxShadow: fStatus === key ? `0 0 0 3px ${cfg.dot}33` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot }} />
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{cfg.label}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: cfg.dot, lineHeight: 1 }}>{counts[key]}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{devices.length > 0 ? `${Math.round(counts[key] / devices.length * 100)}%` : ''}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Oznaczenia:</span>
        {Object.entries(FLAGS).map(([key, f]) => (
          <button key={key} onClick={() => { setFFlag(fFlag === key ? '' : key); setPage(1); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: fFlag === key ? f.bg : 'white', color: fFlag === key ? f.txt : '#374151', border: `1.5px solid ${fFlag === key ? f.border : '#e2e8f0'}`, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: fFlag === key ? 700 : 400 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.dot }} />{f.label}
            <span style={{ background: fFlag === key ? f.txt + '22' : '#f1f5f9', color: fFlag === key ? f.txt : '#64748b', borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>{flagCounts[key]}</span>
          </button>
        ))}
        {uninstalledCount > 0 && (
          <button onClick={() => { setFStatus(fStatus === 'zdemontowane' ? '' : 'zdemontowane'); setPage(1); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: fStatus === 'zdemontowane' ? '#f1f5f9' : 'white', color: fStatus === 'zdemontowane' ? '#334155' : '#64748b', border: `1.5px solid ${fStatus === 'zdemontowane' ? '#94a3b8' : '#e2e8f0'}`, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: fStatus === 'zdemontowane' ? 700 : 400 }}>
            <RVM.Icons.Unplug size={14} />Zdemontowane
            <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>{uninstalledCount}</span>
          </button>
        )}
      </div>

      <div className="card" style={{ padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, display: 'flex', alignItems: 'center' }}>
          <RVM.Icons.Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
          <input className="input" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Szukaj sklepu, miasta, nr seryjnego, nr klienta..." style={{ width: '100%', paddingLeft: 34 }} />
        </div>
        <select className="select" value={fMiasto} onChange={e => { setFMiasto(e.target.value); setPage(1); }}>
          <option value="">Wszystkie miasta</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" value={fCzas} onChange={e => { setFCzas(e.target.value); setPage(1); }}>
          <option value="">Czas – wszystkie</option>
          <option value="86400">1+ dzień</option>
          <option value="172800">2+ dni</option>
          <option value="259200">3+ dni</option>
          <option value="604800">7+ dni</option>
          <option value="1209600">14+ dni</option>
          <option value="2592000">30+ dni</option>
        </select>
        {hasFilter && <button onClick={clearFilters} className="btn btn-danger btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.X size={14} />Wyczyść</button>}
        <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{filtered.length} wyników</span>
        <button onClick={handleExport} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Download size={14} />Eksport</button>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['', 'Sklep', 'Miasto', 'Nr seryjny', 'Status', 'Ostatnia notatka', ''].map(h => <th key={h} style={th}>{h}</th>)}
                <th style={{ ...th, cursor: 'pointer', userSelect: 'none' }} onClick={handleSort}>
                  Czas w statusie {sortBy === 'czas' ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 50, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  {devices.length === 0 ? '⏳ Trwa pobieranie danych z TOMRA...' : 'Brak wyników dla wybranych filtrów'}
                </td></tr>
              )}
              {pageData.map((d, i) => {
                const isOpen    = openRow === d.numerSeryjny;
                const effStatus = d.statusManualny || d.statusTomra;
                const flagCfg   = d.flag ? FLAGS[d.flag] : null;
                const rowBg     = flagCfg ? (i % 2 === 0 ? flagCfg.rowBg : flagCfg.rowBg + 'cc') : (i % 2 === 0 ? '#fff' : '#fafafa');
                const ip        = d.ipWyliczone || hostToIp(d.numerKlienta);
                const stCfg     = ST[effStatus] || ST.not_seen;

                // Czas w statusie — dłuższy z BinoQ i Tomra (bo BinoQ liczy od migracji)
                const czasTrwania = (() => {
                  const binoqSek = d.statusBinoqSince ? Math.max(0, Math.floor((Date.now() - new Date(d.statusBinoqSince).getTime()) / 1000)) : 0;
                  const tomraSek = d.czasSek || 0;
                  const sek = Math.max(binoqSek, tomraSek);
                  if (!sek) return '—';
                  const m  = Math.floor(sek / 60);
                  const h  = Math.floor(m / 60);
                  const dd = Math.floor(h / 24);
                  if (dd > 0) return `${dd}d ${h % 24}h ${m % 60}m`;
                  if (h > 0)  return `${h}h ${m % 60}m`;
                  if (m > 0)  return `${m}m`;
                  return `${sek}s`;
                })();

                return (
                  <Fragment key={d.numerSeryjny}>
                    <tr style={{ background: d.uninstalledAt ? '#f8fafc' : rowBg, borderBottom: `1px solid ${flagCfg ? flagCfg.border + '44' : '#f1f5f9'}`, opacity: d.uninstalledAt ? 0.6 : 1 }}>
                      <td style={{ padding: '10px 8px 10px 12px', verticalAlign: 'middle', width: 36 }}>
                        <button onClick={() => cycleFlag(d)} disabled={!canEdit}
                          title={d.flag ? `${FLAGS[d.flag]?.label} – kliknij aby zmienić` : 'Kliknij aby oznaczyć'}
                          style={{ background: flagCfg ? flagCfg.bg : 'transparent', color: flagCfg ? flagCfg.dot : '#cbd5e1', border: `1.5px solid ${flagCfg ? flagCfg.border : '#e2e8f0'}`, width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RVM.Icons.Star size={15} color={flagCfg ? flagCfg.dot : '#cbd5e1'} /></button>
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, color: '#0f172a', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nazwaSklepu}</span>
                          {d.uninstalledAt && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f1f5f9', color: '#64748b', padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 800, border: '1px solid #cbd5e1' }} title={`Zdemontowano: ${new Date(d.uninstalledAt).toLocaleDateString('pl-PL')}`}><RVM.Icons.Unplug size={11} />ZDEMONTOWANY</span>
                          )}
                          {d.flag && !d.uninstalledAt && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: FLAGS[d.flag].bg, color: FLAGS[d.flag].txt, padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 800, border: `1px solid ${FLAGS[d.flag].border}` }}><RVM.Icons.Star size={10} color={FLAGS[d.flag].txt} /> {FLAGS[d.flag].short}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.idSklepu}</div>
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{d.miasto}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{d.numerSeryjny}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: stCfg.bg, color: stCfg.txt, padding: '2px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: stCfg.dot }} />{stCfg.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', maxWidth: 220 }}
                        title={d.notatki?.[0] ? `${d.notatki[0].tresc}\n${d.notatki[0].autor} · ${fmtDate(d.notatki[0].data)}${d.notatki.length > 1 ? `\n+${d.notatki.length - 1} więcej` : ''}` : ''}>
                        <RVM.NotesList notes={d.notatki || []} collapsed={true} readonly={!canEdit}
                          onAdd={(t, kat) => onAddNote(d.numerSeryjny, t, kat)}
                          onEdit={(id, t, kat) => onEditNote(id, t, kat)}
                          onDelete={id => onDeleteNote(id)} />
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => {
                            if (isOpen) { setOpenRow(null); setEditV({}); }
                            else { setOpenRow(d.numerSeryjny); setEditV({ osobaOdp: d.osobaOdp ?? '', flag: d.flag ?? null }); }
                          }} className="btn btn-secondary btn-sm" title="Edycja inline" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            {isOpen ? <RVM.Icons.X size={14} /> : <RVM.Icons.Pencil size={14} />} {isOpen ? 'Zamknij' : 'Edytuj'}
                          </button>
                          {onOpenDetails && (
                            <button
                              onClick={() => onOpenDetails(d.numerSeryjny)}
                              className="btn btn-secondary btn-sm"
                              title="Pełne szczegóły urządzenia"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                            ><RVM.Icons.Eye size={14} />Szczegóły</button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: 12, color: '#64748b' }}>{czasTrwania}</td>
                    </tr>

                    {isOpen && (
                      <tr style={{ background: '#eff6ff' }}>
                        <td colSpan={8} style={{ borderBottom: '2px solid #3b82f6', padding: '18px 20px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 13, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Dane urządzenia</div>
                              {canEdit && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                  <div>
                                    <label style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Oznaczenie</label>
                                    <select className="select" value={editV.flag || ''} onChange={e => setEditV(v => ({ ...v, flag: e.target.value || null }))} style={{ width: '100%' }}>
                                      <option value="">Brak</option>
                                      <option value="zarzad">Zarząd</option>
                                      <option value="pilna">⚡ Pilna weryfikacja</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Osoba odpowiedzialna</label>
                                    <input className="input" value={editV.osobaOdp || ''} onChange={e => setEditV(v => ({ ...v, osobaOdp: e.target.value }))} style={{ width: '100%' }} />
                                  </div>
                                </div>
                              )}
                              {canEdit && (
                                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                                  <button onClick={saveEdit} className="btn btn-primary">Zapisz zmiany</button>
                                  <button onClick={() => openNewTicket(d)} className="btn btn-secondary">+ Nowe zgłoszenie</button>
                                </div>
                              )}
                              <div style={{ background: 'white', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#64748b', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, border: '1px solid #e2e8f0' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RVM.Icons.MapPin size={13} color="#94a3b8" />{d.ulica && `${d.ulica}, `}{d.kodPocztowy} {d.miasto}</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RVM.Icons.User size={13} color="#94a3b8" />Klient: {d.numerKlienta || '—'}</span>
                                <span style={{ fontFamily: 'monospace', display: 'inline-flex', alignItems: 'center', gap: 6 }}><RVM.Icons.Wifi size={13} color="#94a3b8" />IP: {ip || 'poza zakresem'}</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RVM.Icons.Clock size={13} color="#94a3b8" />Akt: {d.ostatnia || '—'}</span>
                                <span style={{ gridColumn: 'span 2', color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 6 }}><RVM.Icons.Info size={13} color="#94a3b8" />Status: <strong>{d.extraInfo || '—'}</strong></span>
                                {d.statusBinoq && d.statusBinoq !== 'not_seen' && (
                                  <span style={{ gridColumn: 'span 2', color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <RVM.Icons.Activity size={13} color="#16a34a" />BinoQ: <strong>{d.statusBinoq}</strong>
                                    {d.reasonBinoq && <span style={{ color: '#64748b' }}> · {d.reasonBinoq}</span>}
                                    {d.ostatniaBinoq && <span style={{ color: '#94a3b8', fontSize: 11 }}> · {fmtDate(d.ostatniaBinoq)}</span>}
                                  </span>
                                )}
                                {d.binsBinoq && d.binsBinoq.length > 0 && (
                                  <span style={{ gridColumn: 'span 2', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {d.binsBinoq.map(b => {
                                      const binColors = {
                                        Full:     { bg: '#fee2e2', txt: '#991b1b', dot: '#ef4444' },
                                        SemiFull: { bg: '#fff7ed', txt: '#9a3412', dot: '#f97316' },
                                        Ok:       { bg: '#f0fdf4', txt: '#166534', dot: '#22c55e' },
                                      };
                                      const cfg = binColors[b.state] || binColors.Ok;
                                      return (
                                        <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: cfg.bg, color: cfg.txt, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot }} />
                                          Kosz {b.id}: {b.state}
                                        </span>
                                      );
                                    })}
                                  </span>
                                )}
                                <span style={{ gridColumn: 'span 2' }}>
                                  {d.clearingHouse
                                    ? <span style={{ color: '#166534' }}>✓ Podłączony do kaucji: <strong>{d.clearingHouse}</strong></span>
                                    : <span style={{ color: '#991b1b' }}>✗ Nie podłączony do systemu kaucyjnego</span>}
                                </span>
                                {(() => {
                                  const t = tickets.find(t =>
                                    (t.deviceId === d.numerSeryjny || t.nazwaSklepu === d.nazwaSklepu) &&
                                    (t.status === 'otwarty' || t.status === 'w_toku')
                                  );
                                  if (!t) return <span style={{ gridColumn: 'span 2', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 6 }}><RVM.Icons.ClipboardList size={13} />Brak aktywnych zgłoszeń</span>;
                                  return (
                                    <span style={{ gridColumn: 'span 2' }}>
                                      <span style={{ background: t.status === 'otwarty' ? '#fee2e2' : '#fff7ed', color: t.status === 'otwarty' ? '#991b1b' : '#9a3412', padding: '1px 7px', borderRadius: 8, fontWeight: 700, marginRight: 6 }}>
                                        {t.status === 'otwarty' ? 'Otwarty' : 'W toku'}
                                      </span>
                                      {t.opis?.slice(0, 60)}{t.opis?.length > 60 ? '…' : ''}
                                      {t.dzial && <span style={{ color: '#64748b' }}> → {t.dzial}</span>}
                                      <span style={{ color: '#94a3b8', marginLeft: 6 }}>{fmtDate(t.created)}</span>
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 13, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Notatki
                                {d.notatki?.length > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>{d.notatki.length}</span>}
                              </div>
                              <RVM.NotesList notes={d.notatki || []} collapsed={false} readonly={!canEdit}
                                onAdd={(t, kat) => onAddNote(d.numerSeryjny, t, kat)}
                                onEdit={(id, t, kat) => onEditNote(id, t, kat)}
                                onDelete={id => onDeleteNote(id)} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => setPage(1)} disabled={page === 1} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center' }}><RVM.Icons.ChevronsLeft size={14} /></button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center' }}><RVM.Icons.ChevronLeft size={14} /></button>
            <span style={{ fontSize: 13, color: '#64748b', minWidth: 130, textAlign: 'center' }}>Strona {page} z {totalPages} · {filtered.length} wyników</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center' }}><RVM.Icons.ChevronRight size={14} /></button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center' }}><RVM.Icons.ChevronsRight size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
};
