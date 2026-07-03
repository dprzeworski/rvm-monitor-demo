// ChangelogTab.js – zakładka historii zmian
window.RVM = window.RVM || {};

RVM.ChangelogTab = function ChangelogTab({ changelog }) {
  const { useState } = React;
  const { fmtDate } = RVM;

  const [clFilter, setClFilter] = useState('');

  const filteredCL = changelog.filter(e => {
    if (!clFilter) return true;
    if (clFilter === 'system') return e.uzytkownik === 'TOMRA-SYNC';
    if (clFilter === 'user')   return e.uzytkownik !== 'TOMRA-SYNC';
    return true;
  });

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' };

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Pokaż:</span>
        {[
          { id: '',       label: 'Wszystkie' },
          { id: 'user',   label: 'Zmiany użytkowników' },
          { id: 'system', label: 'Auto-sync TOMRA' },
        ].map(f => (
          <button key={f.id} onClick={() => setClFilter(f.id)}
            style={{ background: clFilter === f.id ? '#0f172a' : 'white', color: clFilter === f.id ? 'white' : '#374151', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: clFilter === f.id ? 700 : 400 }}>
            {f.label}
          </button>
        ))}
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
          {filteredCL.length} wpisów
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>{['Czas', 'Sklep', 'Nr seryjny', 'Pole', 'Poprzednia wartość', 'Nowa wartość', 'Użytkownik'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filteredCL.length === 0 && <tr><td colSpan={7} style={{ padding: 50, textAlign: 'center', color: '#94a3b8' }}>Brak historii zmian</td></tr>}
            {filteredCL.map((e, i) => (
              <tr key={e.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(e.timestamp)}</td>
                <td style={{ padding: '8px 12px', maxWidth: 180 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{e.nazwaSklepu}</div>
                  {e.miasto && <div style={{ fontSize: 10, color: '#94a3b8' }}>{e.miasto}</div>}
                </td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{e.numerSeryjny || '—'}</td>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: e.uzytkownik === 'TOMRA-SYNC' ? '#7c3aed' : '#374151', whiteSpace: 'nowrap' }}>
                  {e.pole}
                  {e.uzytkownik === 'TOMRA-SYNC' && <span style={{ fontSize: 9, background: '#ede9fe', color: '#5b21b6', padding: '1px 5px', borderRadius: 8, marginLeft: 4 }}>auto</span>}
                </td>
                <td style={{ padding: '8px 12px', color: '#dc2626', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.staraWartosc || '—'}</td>
                <td style={{ padding: '8px 12px', color: '#16a34a', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nowaWartosc || '—'}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', fontSize: 12, color: e.uzytkownik === 'TOMRA-SYNC' ? '#7c3aed' : 'inherit', fontWeight: e.uzytkownik === 'TOMRA-SYNC' ? 600 : 400 }}>{e.uzytkownik}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
