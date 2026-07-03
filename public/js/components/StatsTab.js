// StatsTab.js – zakładka statystyk statusów sieci
window.RVM = window.RVM || {};

RVM.StatsTab = function StatsTab() {
  const { useState, useEffect, useCallback, useRef, useMemo } = React;

  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [days,        setDays]        = useState(7);
  const [view,        setView]        = useState('dashboard');
  const [expandedDay, setExpandedDay] = useState(null);
  const [searchCh,    setSearchCh]    = useState('');
  const [pageCh,      setPageCh]      = useState(1);
  const [offRpt,      setOffRpt]      = useState(null);
  const [offLoading,  setOffLoading]  = useState(false);
  const [reportDate,  setReportDate]  = useState(''); // '' = dziś
  const [resFilter,   setResFilter]   = useState(''); // filtr statusu przywróconych
  const [offSort,     setOffSort]     = useState({ col: 'czas', dir: 'desc' });
  const [resSort,     setResSort]     = useState({ col: 'time', dir: 'desc' });
  const [msg,         setMsg]         = useState(null);
  const chartRef  = useRef(null);
  const chartInst = useRef(null);
  const PAGE_CH = 50;

  const STATUS_COLORS = {
    up:       { border: '#22c55e', bg: 'rgba(34,197,94,0.15)',  label: 'UP' },
    down:     { border: '#ef4444', bg: 'rgba(239,68,68,0.15)',  label: 'DOWN' },
    offline:  { border: '#f97316', bg: 'rgba(249,115,22,0.15)', label: 'OFFLINE' },
    not_seen: { border: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: 'NOT SEEN' },
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await RVM.API.getStats(days);
      setData(res);
    } catch (e) {
      setMsg({ type: 'err', text: 'Błąd pobierania statystyk' });
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Ładuj raport offline przy otwarciu zakładki offline lub zmianie daty
  useEffect(() => {
    if (view !== 'offline') return;
    setOffLoading(true);
    RVM.API.getOfflineReport(reportDate || null)
      .then(r => setOffRpt(r))
      .catch(() => {})
      .finally(() => setOffLoading(false));
  }, [view, reportDate]);

  // ── Wykres ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!data?.snapshots?.length || view !== 'chart' || !chartRef.current) return;
    if (typeof Chart === 'undefined') return;
    if (chartInst.current) chartInst.current.destroy();

    const snaps  = data.snapshots;
    const labels = snaps.map(s => {
      const d = new Date(s.timestamp);
      return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) + ' ' +
             d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    });

    chartInst.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: ['up', 'down', 'offline', 'not_seen'].map(s => ({
          label:           STATUS_COLORS[s].label,
          data:            snaps.map(snap => snap[`count_${s}`] || 0),
          borderColor:     STATUS_COLORS[s].border,
          backgroundColor: STATUS_COLORS[s].bg,
          borderWidth:     2,
          pointRadius:     snaps.length > 100 ? 0 : 3,
          tension:         0.3,
          fill:            false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'DM Sans', size: 12 } } },
          tooltip: {
            callbacks: {
              title: ctx => ctx[0]?.label || '',
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}`,
            },
          },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 12, font: { family: 'DM Sans', size: 11 }, maxRotation: 45 }, grid: { color: '#f1f5f9' } },
          y: { beginAtZero: true, ticks: { font: { family: 'DM Sans', size: 11 } }, grid: { color: '#f1f5f9' } },
        },
      },
    });
    return () => { if (chartInst.current) chartInst.current.destroy(); };
  }, [data, view]);

  // ── Dzienne podsumowanie z pogrupowanymi snapshotami ─────────────────────
  const dailySummary = useMemo(() => {
    if (!data?.snapshots?.length) return [];
    const byDay = {};
    for (const s of data.snapshots) {
      const day = s.timestamp.slice(0, 10);
      if (!byDay[day]) byDay[day] = { day, snaps: [] };
      byDay[day].snaps.push(s);
    }
    return Object.values(byDay).map(({ day, snaps }) => {
      const avg = key => Math.round(snaps.reduce((a, s) => a + (s[key] || 0), 0) / snaps.length);
      const max = key => Math.max(...snaps.map(s => s[key] || 0));
      return { day, snaps, avg_up: avg('count_up'), avg_down: avg('count_down'), avg_offline: avg('count_offline'), avg_not_seen: avg('count_not_seen'), max_down: max('count_down') };
    }).reverse();
  }, [data]);

  const fmt = iso => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pl-PL') + ' ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  };
  const fmtTime = iso => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  };

  // ── Eksport XLSX ──────────────────────────────────────────────────────────
  const exportDay = (dayRow) => {
    const wb = XLSX.utils.book_new();

    // Arkusz 1: snapshoty tego dnia
    const snapData = [
      ['Czas', 'UP', 'DOWN', 'OFFLINE', 'NOT SEEN', 'TOTAL'],
      ...dayRow.snaps.map(s => [
        fmt(s.timestamp), s.count_up, s.count_down, s.count_offline, s.count_not_seen, s.count_total,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(snapData), 'Snapshoty');

    // Arkusz 2: zmiany statusów tego dnia (z recent filtrowanego po dniu)
    const dayChanges = (data?.recent || []).filter(r => r.timestamp.startsWith(dayRow.day));
    if (dayChanges.length) {
      const changesData = [
        ['Czas', 'Numer seryjny', 'Sklep', 'Poprzedni status', 'Nowy status', 'Komunikat'],
        ...dayChanges.map(r => [fmt(r.timestamp), r.numer_seryjny, r.nazwa_sklepu, r.stary_status, r.nowy_status, r.reason || '']),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(changesData), 'Zmiany statusów');
    }

    XLSX.writeFile(wb, `statystyki_${dayRow.day}.xlsx`);
  };

  const exportSnapshot = (snap, dayStr) => {
    const wb = XLSX.utils.book_new();
    const snapData = [
      ['Parametr', 'Wartość'],
      ['Czas snapshotu', fmt(snap.timestamp)],
      ['UP', snap.count_up],
      ['DOWN', snap.count_down],
      ['OFFLINE', snap.count_offline],
      ['NOT SEEN', snap.count_not_seen],
      ['TOTAL', snap.count_total],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(snapData), 'Snapshot');
    XLSX.writeFile(wb, `snapshot_${snap.timestamp.replace(/[:.]/g, '-').slice(0, 16)}.xlsx`);
  };

  const exportAll = () => {
    if (!data?.snapshots?.length) return;
    const wb = XLSX.utils.book_new();

    // Wszystkie snapshoty
    const snapData = [
      ['Czas', 'UP', 'DOWN', 'OFFLINE', 'NOT SEEN', 'TOTAL'],
      ...data.snapshots.map(s => [fmt(s.timestamp), s.count_up, s.count_down, s.count_offline, s.count_not_seen, s.count_total]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(snapData), 'Snapshoty');

    // Dzienne podsumowanie
    const dailyData = [
      ['Dzień', 'Śr. UP', 'Śr. DOWN', 'Śr. OFFLINE', 'Śr. NOT SEEN', 'Max DOWN', 'Snapshotów'],
      ...dailySummary.map(r => [r.day, r.avg_up, r.avg_down, r.avg_offline, r.avg_not_seen, r.max_down, r.snaps.length]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dailyData), 'Podsumowanie dzienne');

    // Zmiany statusów
    if (data?.recent?.length) {
      const changesData = [
        ['Czas', 'Numer seryjny', 'Sklep', 'Poprzedni status', 'Nowy status', 'Komunikat'],
        ...data.recent.map(r => [fmt(r.timestamp), r.numer_seryjny, r.nazwa_sklepu, r.stary_status, r.nowy_status, r.reason || '']),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(changesData), 'Zmiany statusów');
    }

    XLSX.writeFile(wb, `statystyki_${days}dni.xlsx`);
  };

  const exportOfflineReport = () => {
    if (!offRpt) return;
    const wb = XLSX.utils.book_new();

    const calcCzas = (d) => {
      const binoqSek = d.status_binoq_since ? Math.max(0, Math.floor((Date.now() - new Date(d.status_binoq_since).getTime()) / 1000)) : 0;
      const tomraSek = d.czas_sek || 0;
      const sek = Math.max(binoqSek, tomraSek);
      if (!sek) return '';
      const m = Math.floor(sek / 60);
      const h = Math.floor(m / 60);
      const dd = Math.floor(h / 24);
      if (dd > 0) return `${dd}d ${h % 24}h ${m % 60}m`;
      if (h > 0) return `${h}h ${m % 60}m`;
      return `${m}m`;
    };

    // Arkusz 1: Offline > 1 dzień
    const offRows = [
      ['Nazwa sklepu', 'Numer seryjny', 'Miasto', 'Model', 'Status', 'Czas w statusie', 'DRS', 'Komunikat'],
      ...offRpt.offline.devices.map(d => [
        d.nazwa_sklepu, d.numer_seryjny, d.miasto, d.model,
        d.status_binoq || d.status_tomra, calcCzas(d),
        d.clearing_house || 'Brak', d.reason_binoq || '',
      ]),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(offRows);
    ws1['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws1, `Offline 1d+ (${offRpt.offline.count})`);

    // Arkusz 2: Przywrócone
    const resRows = [
      ['Nazwa sklepu', 'Numer seryjny', 'Miasto', 'Model', 'Wyjście o', 'Pierwszy status', 'Obecny status'],
      ...offRpt.restored.devices.map(d => [
        d.nazwa_sklepu, d.numer_seryjny, d.miasto, d.model,
        fmt(d.restored_at), d.first_status, d.current_status,
      ]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(resRows);
    ws2['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, `Przywrócone (${offRpt.restored.count})`);

    XLSX.writeFile(wb, `raport_offline_${offRpt.date}.xlsx`);
  };

  const ST = RVM.ST;
  const statusBadge = (s) => {
    const cfg = ST[s] || ST.not_seen;
    return <span style={{ background: cfg.bg, color: cfg.txt, padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{cfg.label}</span>;
  };

  // Czas w statusie offline (sekundy) — dłuższy z BinoQ since i Tomra czas_sek
  const calcCzasSek = (d) => {
    const binoqSek = d.status_binoq_since ? Math.max(0, Math.floor((Date.now() - new Date(d.status_binoq_since).getTime()) / 1000)) : 0;
    const tomraSek = d.czas_sek || 0;
    return Math.max(binoqSek, tomraSek);
  };
  const formatCzas = (sek) => {
    if (!sek) return '—';
    const m = Math.floor(sek / 60), h = Math.floor(m / 60), dd = Math.floor(h / 24);
    if (dd > 0) return `${dd}d ${h % 24}h ${m % 60}m`;
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
  };
  // Efektywny status urządzenia (Tomra + BinoQ, gorszy wygrywa)
  const effStatus = (d) => {
    const BINOQ_MAP = { 'Online': 'up', 'BinSemiFull': 'up', 'BinFull': 'down', 'Down': 'down', 'Offline': 'offline' };
    const W = { not_seen: 0, up: 1, offline: 2, down: 3 };
    let cur = d.status_tomra || 'not_seen';
    if (cur !== 'not_seen' && d.status_binoq) {
      const b = BINOQ_MAP[d.status_binoq];
      if (b && (W[b] ?? 0) > (W[cur] ?? 0)) cur = b;
    }
    return cur;
  };

  // Filtrowanie i paginacja zmian statusów
  const filteredChanges = useMemo(() => {
    const q = searchCh.toLowerCase().trim();
    if (!q) return data?.recent || [];
    return (data?.recent || []).filter(r =>
      r.numer_seryjny?.toLowerCase().includes(q) ||
      r.nazwa_sklepu?.toLowerCase().includes(q) ||
      r.nowy_status?.toLowerCase().includes(q) ||
      r.stary_status?.toLowerCase().includes(q) ||
      r.reason?.toLowerCase().includes(q)
    );
  }, [data, searchCh]);

  const totalPagesCh = Math.max(1, Math.ceil(filteredChanges.length / PAGE_CH));
  const pagedChanges = filteredChanges.slice((pageCh - 1) * PAGE_CH, pageCh * PAGE_CH);

  // Reset strony przy zmianie wyszukiwania
  useEffect(() => { setPageCh(1); }, [searchCh, days]);

  // ── Dashboard: porównanie snapshotów ──────────────────────────────────────
  const dashboard = useMemo(() => {
    if (!data?.snapshots?.length) return null;

    const snaps  = data.snapshots;
    const last   = snaps[snaps.length - 1];
    const prev   = snaps.length >= 2 ? snaps[snaps.length - 2] : null;

    // Porównanie ostatni vs poprzedni snapshot
    const diff = prev ? {
      up:       last.count_up       - prev.count_up,
      down:     last.count_down     - prev.count_down,
      offline:  last.count_offline  - prev.count_offline,
      not_seen: last.count_not_seen - prev.count_not_seen,
    } : null;

    // Bilans dnia liczony od dziś 06:00
    const today6 = new Date();
    today6.setHours(6, 0, 0, 0);
    const today6Iso = today6.toISOString();

    // Pierwszy snapshot dnia od 06:00 (lub najwcześniejszy jeśli nie ma wcześniejszych)
    const daySnaps = snaps.filter(s => s.timestamp >= today6Iso);
    const firstToday = daySnaps.length ? daySnaps[0] : null;
    const dayDiff = firstToday ? {
      up:       last.count_up       - firstToday.count_up,
      down:     last.count_down     - firstToday.count_down,
      offline:  last.count_offline  - firstToday.count_offline,
      not_seen: last.count_not_seen - firstToday.count_not_seen,
    } : null;

    return { last, prev, diff, dayDiff, firstToday };
  }, [data]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>Ładowanie statystyk…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {msg && (
        <div style={{ padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
          ✕ {msg.text}
        </div>
      )}

      {/* Kontrolki */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {view !== 'dashboard' && view !== 'offline' && (
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 3, 7].map(d => (
              <button key={d} onClick={() => setDays(d)} className={`btn ${days === d ? 'btn-primary' : 'btn-secondary'} btn-sm`}>
                {d === 1 ? 'Dziś' : `${d} dni`}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[
            ['dashboard', 'Dashboard', RVM.Icons.Dashboard],
            ['offline', 'Offline 24h+', RVM.Icons.Unplug],
            ['chart', 'Wykres', RVM.Icons.TrendingUp],
            ['table', 'Tabela', RVM.Icons.ClipboardList],
            ['changes', 'Zmiany', RVM.Icons.Refresh],
          ].map(([v, l, Ic]) => (
            <button key={v} onClick={() => setView(v)} className={`btn ${view === v ? 'btn-primary' : 'btn-secondary'} btn-sm`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Ic size={15} />{l}
            </button>
          ))}
        </div>
        <button onClick={load} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RVM.Icons.RotateCw size={15} />Odśwież</button>
        {(view === 'table' || view === 'changes') && (
          <button onClick={exportAll} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RVM.Icons.Download size={15} />Eksport XLSX</button>
        )}
      </div>

      {/* Kafelki */}
      {data?.snapshots?.length > 0 && (() => {
        const last = data.snapshots[data.snapshots.length - 1];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { key: 'up', label: 'UP', val: last.count_up, ...STATUS_COLORS.up },
              { key: 'down', label: 'DOWN', val: last.count_down, ...STATUS_COLORS.down },
              { key: 'offline', label: 'OFFLINE', val: last.count_offline, ...STATUS_COLORS.offline },
              { key: 'not_seen', label: 'NOT SEEN', val: last.count_not_seen, ...STATUS_COLORS.not_seen },
            ].map(s => (
              <div key={s.key} className="card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: s.border }}>{s.val}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', marginTop: 4 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {last.count_total ? `${Math.round(s.val / last.count_total * 100)}%` : ''}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Dashboard */}
      {view === 'dashboard' && dashboard && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Porównanie: ostatni snapshot vs poprzedni */}
          <div className="card">
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 14 }}>
              Aktualny stan vs poprzedni odczyt
              {dashboard.prev && (
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, marginLeft: 8 }}>
                  ({fmtTime(dashboard.prev.timestamp)} → {fmtTime(dashboard.last.timestamp)})
                </span>
              )}
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  { key: 'up',       label: 'UP',       color: '#22c55e', val: dashboard.last.count_up },
                  { key: 'down',     label: 'DOWN',     color: '#ef4444', val: dashboard.last.count_down },
                  { key: 'offline',  label: 'OFFLINE',  color: '#f97316', val: dashboard.last.count_offline },
                  { key: 'not_seen', label: 'NOT SEEN', color: '#94a3b8', val: dashboard.last.count_not_seen },
                ].map(s => {
                  const d = dashboard.diff ? dashboard.diff[s.key] : null;
                  const sign = d > 0 ? '+' : '';
                  const diffColor = s.key === 'up'
                    ? (d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#64748b')
                    : (d > 0 ? '#dc2626' : d < 0 ? '#16a34a' : '#64748b');
                  return (
                    <div key={s.key} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', margin: '4px 0' }}>{s.label}</div>
                      {d !== null && d !== 0 && (
                        <div style={{ fontSize: 14, fontWeight: 700, color: diffColor }}>
                          {sign}{d}
                        </div>
                      )}
                      {d === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>bez zmian</div>}
                      {dashboard.prev && (
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          było: {dashboard.prev[`count_${s.key}`]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Podsumowanie dnia */}
          <div className="card">
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 14 }}>
              Bilans dnia (od 06:00)
            </div>
            <div style={{ padding: 16 }}>
              {dashboard.dayDiff ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[
                    { label: 'UP',       val: dashboard.dayDiff.up,       goodDir: 1 },
                    { label: 'DOWN',     val: dashboard.dayDiff.down,     goodDir: -1 },
                    { label: 'OFFLINE',  val: dashboard.dayDiff.offline,  goodDir: -1 },
                    { label: 'NOT SEEN', val: dashboard.dayDiff.not_seen, goodDir: -1 },
                  ].map(s => {
                    const sign = s.val > 0 ? '+' : '';
                    const isGood = s.val === 0 ? null : (s.val > 0 ? s.goodDir > 0 : s.goodDir < 0);
                    const color = s.val === 0 ? '#94a3b8' : isGood ? '#16a34a' : '#dc2626';
                    return (
                      <div key={s.label} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color }}>{sign}{s.val}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginTop: 2 }}>{s.label}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20, fontSize: 13 }}>
                  Brak snapshotów od 06:00 — bilans dnia będzie dostępny po pierwszym snapshocie
                </div>
              )}
              {dashboard.firstToday && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, textAlign: 'right' }}>
                  Punkt odniesienia: {fmt(dashboard.firstToday.timestamp)}
                </div>
              )}
            </div>
          </div>


        </div>
      )}

      {view === 'dashboard' && !dashboard && (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
          Brak danych — snapshoty zbierane są automatycznie
        </div>
      )}

      {/* Zakładka Offline 24h+ */}
      {view === 'offline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Pasek narzędzi: data + eksport */}
          <div className="card">
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}><RVM.Icons.Unplug size={16} />Offline 24h+ / Przywrócone</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
                {[
                  { label: 'Dziś', val: '' },
                  { label: '-1d', val: new Date(Date.now() - 86400000).toISOString().slice(0, 10) },
                  { label: '-2d', val: new Date(Date.now() - 2*86400000).toISOString().slice(0, 10) },
                  { label: '-3d', val: new Date(Date.now() - 3*86400000).toISOString().slice(0, 10) },
                  { label: '-7d', val: new Date(Date.now() - 7*86400000).toISOString().slice(0, 10) },
                ].map(b => (
                  <button key={b.label} onClick={() => setReportDate(b.val)}
                    className={`btn btn-sm ${reportDate === b.val ? 'btn-primary' : 'btn-secondary'}`}>{b.label}</button>
                ))}
                <input type="date" className="input"
                  value={reportDate || new Date().toISOString().slice(0, 10)}
                  onChange={e => setReportDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  style={{ fontSize: 12, padding: '4px 8px', width: 140 }} />
                {offRpt && (
                  <button onClick={exportOfflineReport} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RVM.Icons.Download size={14} />XLSX</button>
                )}
              </div>
            </div>
          </div>

          {offLoading ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Ładowanie raportu…</div>
          ) : offRpt ? (
            <>
              {/* Kafelki podsumowujące */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 42, fontWeight: 800, color: '#9a3412', lineHeight: 1 }}>{offRpt.offline.count}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#9a3412', marginTop: 6 }}>
                    Offline &gt; 1 dzień{!offRpt.isToday && <span style={{ fontWeight: 400 }}> (o 06:00)</span>}
                  </div>
                </div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 42, fontWeight: 800, color: '#166534', lineHeight: 1 }}>{offRpt.restored.count}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginTop: 6 }}>Przywrócono dnia {offRpt.date}</div>
                </div>
              </div>

              {/* Tabela: Offline > 24h */}
              {(() => {
                const cols = [
                  { key: 'nazwa', label: 'Nazwa sklepu', get: d => d.nazwa_sklepu || '' },
                  { key: 'sn', label: 'Nr seryjny', get: d => d.numer_seryjny || '' },
                  { key: 'miasto', label: 'Miasto', get: d => d.miasto || '' },
                  { key: 'model', label: 'Model', get: d => d.model || '' },
                  { key: 'status', label: 'Status', get: d => d.status_binoq || d.status_tomra || '' },
                  { key: 'czas', label: 'Czas w statusie', get: d => calcCzasSek(d) },
                  { key: 'drs', label: 'DRS', get: d => d.clearing_house || '' },
                  { key: 'komunikat', label: 'Komunikat', get: d => d.reason_binoq || '' },
                ];
                const sorted = [...offRpt.offline.devices].sort((a, b) => {
                  const col = cols.find(c => c.key === offSort.col) || cols[5];
                  const va = col.get(a), vb = col.get(b);
                  const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pl');
                  return offSort.dir === 'desc' ? -cmp : cmp;
                });
                const toggleSort = (key) => setOffSort(s => s.col === key ? { col: key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col: key, dir: 'desc' });
                return (
                  <div className="card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 13, color: '#9a3412' }}>
                      Offline &gt; 24h ({offRpt.offline.count})
                    </div>
                    <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                          <tr>
                            {cols.map(c => (
                              <th key={c.key} onClick={() => toggleSort(c.key)}
                                style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0', userSelect: 'none' }}>
                                {c.label}{offSort.col === c.key && (offSort.dir === 'desc' ? ' ▼' : ' ▲')}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((d, i) => (
                            <tr key={d.numer_seryjny || i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>{d.nazwa_sklepu}</td>
                              <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#64748b' }}>{d.numer_seryjny}</td>
                              <td style={{ padding: '7px 12px', color: '#374151' }}>{d.miasto}</td>
                              <td style={{ padding: '7px 12px', color: '#374151' }}>{d.model || '—'}</td>
                              <td style={{ padding: '7px 12px' }}>{statusBadge(effStatus(d))}</td>
                              <td style={{ padding: '7px 12px', color: '#9a3412', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatCzas(calcCzasSek(d))}</td>
                              <td style={{ padding: '7px 12px' }}>
                                {d.clearing_house
                                  ? <span style={{ background: '#dbeafe', color: '#1e40af', padding: '1px 7px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{d.clearing_house}</span>
                                  : <span style={{ color: '#cbd5e1' }}>—</span>}
                              </td>
                              <td style={{ padding: '7px 12px', color: '#64748b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.reason_binoq}>{d.reason_binoq || '—'}</td>
                            </tr>
                          ))}
                          {sorted.length === 0 && (
                            <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>Brak urządzeń offline &gt; 24h</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Tabela: Przywrócone */}
              {(() => {
                const allRes = offRpt.restored.devices;
                const byStatus = { up: 0, down: 0 };
                for (const d of allRes) if (byStatus[d.current_status] !== undefined) byStatus[d.current_status]++;
                const filtered = resFilter ? allRes.filter(d => d.current_status === resFilter) : allRes;

                const cols = [
                  { key: 'nazwa', label: 'Nazwa sklepu', get: d => d.nazwa_sklepu || '' },
                  { key: 'sn', label: 'Nr seryjny', get: d => d.numer_seryjny || '' },
                  { key: 'miasto', label: 'Miasto', get: d => d.miasto || '' },
                  { key: 'model', label: 'Model', get: d => d.model || '' },
                  { key: 'time', label: 'Wyjście o', get: d => new Date(d.restored_at).getTime() },
                  { key: 'first', label: 'Status wyjścia', get: d => d.first_status || '' },
                  { key: 'current', label: 'Obecny status', get: d => d.current_status || '' },
                ];
                const sorted = [...filtered].sort((a, b) => {
                  const col = cols.find(c => c.key === resSort.col) || cols[4];
                  const va = col.get(a), vb = col.get(b);
                  const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pl');
                  return resSort.dir === 'desc' ? -cmp : cmp;
                });
                const toggleSort = (key) => setResSort(s => s.col === key ? { col: key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col: key, dir: 'desc' });
                return (
                  <div className="card">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#166534' }}>Przywrócone — wyjście z offline &gt; 24h ({offRpt.restored.count})</span>
                      <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                        <button onClick={() => setResFilter('')} className={`btn btn-sm ${resFilter === '' ? 'btn-primary' : 'btn-secondary'}`}>Wszystkie ({allRes.length})</button>
                        {['up', 'down'].filter(s => byStatus[s] > 0).map(s => (
                          <button key={s} onClick={() => setResFilter(resFilter === s ? '' : s)}
                            className={`btn btn-sm ${resFilter === s ? 'btn-primary' : 'btn-secondary'}`}>{(ST[s] || ST.not_seen).label} ({byStatus[s]})</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                          <tr>
                            {cols.map(c => (
                              <th key={c.key} onClick={() => toggleSort(c.key)}
                                style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0', userSelect: 'none' }}>
                                {c.label}{resSort.col === c.key && (resSort.dir === 'desc' ? ' ▼' : ' ▲')}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((d, i) => (
                            <tr key={d.numer_seryjny || i} style={{ background: i % 2 === 0 ? '#f0fdf4' : '#fff', borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>{d.nazwa_sklepu}</td>
                              <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#64748b' }}>{d.numer_seryjny}</td>
                              <td style={{ padding: '7px 12px', color: '#374151' }}>{d.miasto}</td>
                              <td style={{ padding: '7px 12px', color: '#374151' }}>{d.model || '—'}</td>
                              <td style={{ padding: '7px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtTime(d.restored_at)}</td>
                              <td style={{ padding: '7px 12px' }}>{statusBadge(d.first_status)}</td>
                              <td style={{ padding: '7px 12px' }}>{statusBadge(d.current_status)}</td>
                            </tr>
                          ))}
                          {sorted.length === 0 && (
                            <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>Brak urządzeń{resFilter ? ` w statusie „${(ST[resFilter] || {}).label}”` : ''}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nie udało się załadować raportu</div>
          )}

        </div>
      )}

      {/* Wykres */}
      {view === 'chart' && (
        <div className="card">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 14 }}>
            Statusy w czasie
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, marginLeft: 8 }}>({data?.snapshots?.length || 0} snapshotów)</span>
          </div>
          <div style={{ padding: 16, height: 360 }}>
            {data?.snapshots?.length > 0
              ? <canvas ref={chartRef} />
              : <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>Brak danych — snapshoty zbierane są co {data?.snapshotInterval || 30} min</div>
            }
          </div>
        </div>
      )}

      {/* Tabela dzienna z rozwijaniem */}
      {view === 'table' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 14 }}>
            Podsumowanie dzienne
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, marginLeft: 8 }}>— kliknij dzień aby rozwinąć snapshoty</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['', 'Dzień', 'Śr. UP', 'Śr. DOWN', 'Śr. OFFLINE', 'Śr. NOT SEEN', 'Max DOWN', 'Snapshotów', ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 12px', textAlign: i <= 1 ? 'left' : 'right', fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailySummary.map((row, i) => {
                  const isOpen = expandedDay === row.day;
                  return (
                    <React.Fragment key={row.day}>
                      {/* Wiersz dzienny */}
                      <tr
                        style={{ background: isOpen ? '#eff6ff' : (i % 2 === 0 ? '#fff' : '#fafafa'), cursor: 'pointer' }}
                        onClick={() => setExpandedDay(isOpen ? null : row.day)}
                      >
                        <td style={{ padding: '10px 8px 10px 12px', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontSize: 12 }}>
                          {isOpen ? '▾' : '▸'}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}>{row.day}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>{row.avg_up}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>{row.avg_down}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ea580c', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>{row.avg_offline}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>{row.avg_not_seen}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#991b1b', fontWeight: 700, borderBottom: '1px solid #f1f5f9' }}>{row.max_down}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>{row.snaps.length}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={e => { e.stopPropagation(); exportDay(row); }}
                            title="Eksportuj ten dzień do XLSX"
                          ><RVM.Icons.Download size={14} /></button>
                        </td>
                      </tr>

                      {/* Rozwinięte snapshoty */}
                      {isOpen && (
                        <tr>
                          <td colSpan={9} style={{ padding: 0, background: '#f8fafc', borderBottom: '2px solid #bfdbfe' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: '#dbeafe' }}>
                                  {['Czas', 'UP', 'DOWN', 'OFFLINE', 'NOT SEEN', 'TOTAL', ''].map((h, i) => (
                                    <th key={i} style={{ padding: '7px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: '#1e40af', whiteSpace: 'nowrap' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {row.snaps.map((snap, si) => (
                                  <tr key={snap.id} style={{ background: si % 2 === 0 ? '#eff6ff' : '#dbeafe33' }}>
                                    <td style={{ padding: '6px 12px', color: '#374151', whiteSpace: 'nowrap' }}>{fmtTime(snap.timestamp)}</td>
                                    <td style={{ padding: '6px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{snap.count_up}</td>
                                    <td style={{ padding: '6px 12px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{snap.count_down}</td>
                                    <td style={{ padding: '6px 12px', textAlign: 'right', color: '#ea580c', fontWeight: 600 }}>{snap.count_offline}</td>
                                    <td style={{ padding: '6px 12px', textAlign: 'right', color: '#64748b' }}>{snap.count_not_seen}</td>
                                    <td style={{ padding: '6px 12px', textAlign: 'right', color: '#0f172a' }}>{snap.count_total}</td>
                                    <td style={{ padding: '6px 12px' }}>
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        style={{ fontSize: 11, padding: '2px 8px' }}
                                        onClick={() => exportSnapshot(snap, row.day)}
                                        title="Eksportuj ten snapshot"
                                      ><RVM.Icons.Download size={14} /></button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {dailySummary.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Brak danych</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ostatnie zmiany statusów */}
      {view === 'changes' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
              Zmiany statusów
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, marginLeft: 8 }}>
                ({filteredChanges.length} z {data?.recent?.length || 0})
              </span>
            </div>
            <input
              className="input"
              placeholder="Szukaj (sklep, SN, status…)"
              value={searchCh}
              onChange={e => setSearchCh(e.target.value)}
              style={{ width: 240, fontSize: 12 }}
            />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Czas', 'Urządzenie', 'Sklep', 'Poprzedni', 'Nowy', 'Komunikat'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedChanges.map((row, i) => (
                  <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>{fmt(row.timestamp)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, borderBottom: '1px solid #f1f5f9' }}>{row.numer_seryjny}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.nazwa_sklepu}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>{row.stary_status ? statusBadge(row.stary_status) : <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>{statusBadge(row.nowy_status)}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b', fontSize: 12, borderBottom: '1px solid #f1f5f9', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.reason || '—'}</td>
                  </tr>
                ))}
                {pagedChanges.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Brak wyników</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginacja */}
          {totalPagesCh > 1 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setPageCh(1)} disabled={pageCh === 1}><RVM.Icons.ChevronsLeft size={14} /></button>
              <button className="btn btn-secondary btn-sm" onClick={() => setPageCh(p => Math.max(1, p - 1))} disabled={pageCh === 1}><RVM.Icons.ChevronLeft size={14} /></button>
              <span style={{ fontSize: 13, color: '#64748b', padding: '0 8px' }}>
                {pageCh} / {totalPagesCh}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setPageCh(p => Math.min(totalPagesCh, p + 1))} disabled={pageCh === totalPagesCh}><RVM.Icons.ChevronRight size={14} /></button>
              <button className="btn btn-secondary btn-sm" onClick={() => setPageCh(totalPagesCh)} disabled={pageCh === totalPagesCh}><RVM.Icons.ChevronsRight size={14} /></button>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
