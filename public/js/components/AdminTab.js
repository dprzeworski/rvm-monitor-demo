// AdminTab.js – panel administracyjny (synchronizacja i zarządzanie aplikacją)
window.RVM = window.RVM || {};

RVM.AdminTab = function AdminTab() {
  const { useState, useEffect, useCallback } = React;

  const [syncInfo,   setSyncInfo]   = useState(null);
  const [sdStatus,   setSdStatus]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [running,    setRunning]    = useState({ tomra: false, binoq: false, snapshot: false, sd: false });
  const [switching,  setSwitching]  = useState(false);
  const [interval,   setInterval_]  = useState(30);
  const [sdInt,      setSdInt]      = useState(15);
  const [savingInt,  setSavingInt]  = useState(false);
  const [savingSdInt, setSavingSdInt] = useState(false);
  const [msg,        setMsg]        = useState(null); // { type: 'ok'|'err', text }

  const showMsg = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      const data = await RVM.API.getAdminSync();
      setSyncInfo(data);
      setInterval_(data.snapshotInterval || 30);
      try {
        const sd = await RVM.API.sdStatus();
        setSdStatus(sd);
        setSdInt(sd.interval || 15);
      } catch {}
    } catch (e) {
      showMsg('err', 'Błąd pobierania statusu synchronizacji');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSync = async (source) => {
    setRunning(r => ({ ...r, [source]: true }));
    try {
      const res = await RVM.API.triggerSync(source);
      showMsg('ok', `Synchronizacja ${source === 'tomra' ? 'Tomra Connect' : 'BinoQ'} zakończona: ${res.updated ?? '–'} zaktualizowanych`);
      await load();
    } catch (e) {
      showMsg('err', `Błąd synchronizacji: ${e.message}`);
    } finally {
      setRunning(r => ({ ...r, [source]: false }));
    }
  };

  const runSnapshotNow = async () => {
    setRunning(r => ({ ...r, snapshot: true }));
    try {
      const res = await RVM.API.runSnapshot();
      showMsg('ok', `Snapshot wykonany: UP:${res.counters?.up} DOWN:${res.counters?.down} OFFLINE:${res.counters?.offline}`);
    } catch (e) {
      showMsg('err', `Błąd snapshotu: ${e.message}`);
    } finally {
      setRunning(r => ({ ...r, snapshot: false }));
    }
  };

  const saveInterval = async () => {
    setSavingInt(true);
    try {
      await RVM.API.setSnapshotInterval(interval);
      showMsg('ok', `Interwał snapshotu zmieniony na ${interval} min`);
    } catch (e) {
      showMsg('err', `Błąd: ${e.message}`);
    } finally {
      setSavingInt(false);
    }
  };

  const runSdSyncAll = async () => {
    setRunning(r => ({ ...r, sd: true }));
    try {
      const res = await RVM.API.sdSyncAll();
      showMsg('ok', `SD sync zakończony: ${res.ok} ok, ${res.error} błędów, ${res.skipped} pominiętych (${res.duration})`);
      await load();
    } catch (e) {
      showMsg('err', `Błąd SD sync: ${e.message}`);
    } finally {
      setRunning(r => ({ ...r, sd: false }));
    }
  };

  const saveSdInterval = async () => {
    setSavingSdInt(true);
    try {
      await RVM.API.sdSetInterval(sdInt);
      showMsg('ok', `Interwał SD sync zmieniony na ${sdInt} min`);
      await load();
    } catch (e) {
      showMsg('err', `Błąd: ${e.message}`);
    } finally {
      setSavingSdInt(false);
    }
  };

  const switchSource = async (newSource) => {
    setSwitching(true);
    try {
      await RVM.API.setSyncSource(newSource);
      showMsg('ok', `Główne źródło zmienione na ${newSource === 'binoq' ? 'BinoQ' : 'Tomra Connect'}`);
      await load();
    } catch (e) {
      showMsg('err', `Błąd: ${e.message}`);
    } finally {
      setSwitching(false);
    }
  };

  const fmt = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pl-PL') + ' ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  };

  const primarySource = syncInfo?.primarySource || 'tomra';

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>Ładowanie…</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>

      {/* Komunikat */}
      {msg && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          background: msg.type === 'ok' ? '#f0fdf4' : '#fef2f2',
          color:      msg.type === 'ok' ? '#166534' : '#991b1b',
          border:     `1px solid ${msg.type === 'ok' ? '#bbf7d0' : '#fecaca'}`,
        }}>
          {msg.type === 'ok' ? '✓ ' : '✕ '}{msg.text}
        </div>
      )}

      {/* Główne źródło danych */}
      <div className="card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Główne źródło danych</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Decyduje które źródło dodaje nowe urządzenia do bazy
          </div>
        </div>
        <div style={{ padding: 20, display: 'flex', gap: 12 }}>
          {[
            { id: 'tomra', label: 'Tomra Connect', icon: '🔗', desc: 'Dotychczasowe źródło danych' },
            { id: 'binoq', label: 'BinoQ',         icon: '🟢', desc: 'Nowe źródło — TOMRA BinoQ' },
          ].map(s => {
            const active = primarySource === s.id;
            return (
              <button
                key={s.id}
                onClick={() => !active && switchSource(s.id)}
                disabled={switching || active}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: active ? '2px solid #2563eb' : '2px solid #e2e8f0',
                  background: active ? '#eff6ff' : 'white',
                  cursor: active ? 'default' : 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                  opacity: switching && !active ? 0.6 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: active ? '#1d4ed8' : '#0f172a' }}>
                    {s.label}
                  </span>
                  {active && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 10, fontWeight: 700,
                      background: '#2563eb', color: 'white',
                      padding: '2px 8px', borderRadius: 10,
                    }}>AKTYWNE</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{s.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Karty synchronizacji */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          {
            id:       'tomra',
            label:    'Tomra Connect',
            icon:     '🔗',
            data:     syncInfo?.lastSync,
            color:    '#f59e0b',
            colorBg:  '#fffbeb',
            colorBorder: '#fde68a',
          },
          {
            id:       'binoq',
            label:    'BinoQ',
            icon:     '🟢',
            data:     syncInfo?.lastSyncBinoq,
            color:    '#22c55e',
            colorBg:  '#f0fdf4',
            colorBorder: '#bbf7d0',
          },
        ].map(s => {
          const d = s.data;
          const isPrimary = primarySource === s.id;
          return (
            <div key={s.id} className="card">
              <div style={{
                padding: '14px 16px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{s.label}</div>
                  {isPrimary && (
                    <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                      Główne źródło
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Statystyki */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {(s.id === 'tomra' ? [
                    { label: 'Łącznie',          val: d?.total   ?? '—' },
                    { label: 'Dodano',            val: d?.added   ?? '—' },
                    { label: 'Zaktualizowano',    val: d?.updated ?? '—' },
                  ] : [
                    { label: 'Łącznie',           val: d?.total   ?? '—' },
                    { label: 'Online',            val: d?.online  ?? '—' },
                    { label: 'Offline',           val: d?.offline ?? '—' },
                  ]).map(stat => (
                    <div key={stat.label} style={{
                      background: '#f8fafc', borderRadius: 8,
                      padding: '8px 10px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{stat.val}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Szczegóły */}
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Ostatni sync</span>
                    <span style={{ color: '#0f172a', fontWeight: 500 }}>{fmt(d?.timestamp)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Czas trwania</span>
                    <span style={{ color: '#0f172a', fontWeight: 500 }}>{d?.duration ?? '—'}</span>
                  </div>
                  {d?.updated !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Zaktualizowano</span>
                      <span style={{ color: '#0f172a', fontWeight: 500 }}>{d.updated}</span>
                    </div>
                  )}
                  {d?.inserted !== undefined && d.inserted > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Dodano nowych</span>
                      <span style={{ color: '#22c55e', fontWeight: 500 }}>{d.inserted}</span>
                    </div>
                  )}
                  {d?.notFound !== undefined && d.notFound > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Nie znaleziono w bazie</span>
                      <span style={{ color: '#f59e0b', fontWeight: 500 }}>{d.notFound}</span>
                    </div>
                  )}
                </div>

                {/* Przycisk */}
                <button
                  className="btn btn-secondary"
                  onClick={() => runSync(s.id)}
                  disabled={running[s.id]}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
                >
                  {running[s.id]
                    ? <span className="pulse">⏳ Synchronizuję…</span>
                    : '↺ Synchronizuj teraz'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Info o not_found */}
      {(syncInfo?.lastSyncBinoq?.notFound > 0) && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          background: '#fffbeb',
          border: '1px solid #fde68a',
          fontSize: 13,
          color: '#92400e',
        }}>
          <strong>ℹ️ {syncInfo.lastSyncBinoq.notFound} urządzeń z BinoQ nie znaleziono w bazie.</strong>
          {' '}Aby BinoQ mogło dodawać nowe urządzenia automatycznie, ustaw BinoQ jako główne źródło danych.
        </div>
      )}

      {/* ServiceDesk integracja */}
      <div className="card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>ServiceDesk integracja</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {sdStatus?.configured
              ? 'Synchronizacja danych zgłoszeń z ManageEngine ServiceDesk Plus'
              : '⚠ Brak konfiguracji SD_API_KEY w środowisku — synchronizacja wyłączona'}
          </div>
        </div>
        {sdStatus?.configured && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Statystyki ostatniego syncu */}
            {sdStatus?.lastSdSync && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { label: 'Ticketów',   val: sdStatus.lastSdSync.total },
                  { label: 'OK',         val: sdStatus.lastSdSync.ok,      color: '#16a34a' },
                  { label: 'Błędów',     val: sdStatus.lastSdSync.error,   color: '#dc2626' },
                  { label: 'Pominiętych', val: sdStatus.lastSdSync.skipped, color: '#64748b' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: s.color || '#0f172a' }}>{s.val ?? '—'}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {sdStatus?.lastSdSync && (
              <div style={{ fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                <span>Ostatni sync</span>
                <span style={{ color: '#0f172a', fontWeight: 500 }}>
                  {sdStatus.lastSdSync.timestamp ? new Date(sdStatus.lastSdSync.timestamp).toLocaleString('pl-PL') : '—'}
                  {sdStatus.lastSdSync.duration && ` · ${sdStatus.lastSdSync.duration}`}
                </span>
              </div>
            )}

            {/* Interwał */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>Interwał synchronizacji:</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {[5, 15, 30, 60].map(m => (
                  <button key={m} onClick={() => setSdInt(m)} className={`btn btn-sm ${sdInt === m ? 'btn-primary' : 'btn-secondary'}`}>
                    {m} min
                  </button>
                ))}
              </div>
              <button onClick={saveSdInterval} disabled={savingSdInt} className="btn btn-secondary btn-sm">
                {savingSdInt ? '⏳' : '💾 Zapisz'}
              </button>
            </div>

            {/* Akcje */}
            <button
              className="btn btn-secondary"
              onClick={runSdSyncAll}
              disabled={running.sd}
              style={{ width: 'fit-content' }}
            >
              {running.sd ? <span className="pulse">⏳ Synchronizuję otwarte zgłoszenia…</span> : '🔄 Synchronizuj wszystkie otwarte teraz'}
            </button>
          </div>
        )}
      </div>

      {/* Snapshoty statystyk */}
      <div className="card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Snapshoty statystyk</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Automatyczne zapisywanie liczników statusów do historii</div>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>Interwał:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[15, 30, 60].map(m => (
                <button key={m} onClick={() => setInterval_(m)} className={`btn btn-sm ${interval === m ? 'btn-primary' : 'btn-secondary'}`}>
                  {m} min
                </button>
              ))}
            </div>
            <button onClick={saveInterval} disabled={savingInt} className="btn btn-secondary btn-sm" style={{ marginLeft: 4 }}>
              {savingInt ? '⏳' : '💾 Zapisz'}
            </button>
          </div>
          <button
            className="btn btn-secondary"
            onClick={runSnapshotNow}
            disabled={running.snapshot}
            style={{ width: 'fit-content' }}
          >
            {running.snapshot ? <span className="pulse">⏳ Wykonuję…</span> : '📸 Wykonaj snapshot teraz'}
          </button>
        </div>
      </div>

    </div>
  );
};
