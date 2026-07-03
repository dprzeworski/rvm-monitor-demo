// AboutTab.js – informacje o aplikacji
window.RVM = window.RVM || {};

RVM.AboutTab = function AboutTab() {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', paddingTop: 20 }}>
      <div className="card">
        <div style={{ background: '#0f172a', padding: '32px 32px 24px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, background: '#22c55e', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 26, margin: '0 auto 12px', color: 'white' }}>R</div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em' }}>RVM Monitor</div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>System monitorowania recyklomatów</div>
        </div>
        <div style={{ padding: '24px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Wersja', value: 'v4.5.4' },
              { label: 'Status', value: 'W aktywnym rozwoju' },
              { label: 'Autor', value: 'DP' },
              { label: 'Stack', value: 'Node.js + SQLite + React' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, marginBottom: 4 }}>✦ Aktywny rozwój</div>
            <div style={{ fontSize: 12, color: '#15803d', lineHeight: 1.6 }}>
              Aplikacja jest stale rozwijana. Nowe funkcje, poprawki i usprawnienia są dodawane regularnie.
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
            RVM Monitor · Wewnętrzne narzędzie · Wszelkie prawa zastrzeżone
          </div>
        </div>
      </div>
    </div>
  );
};
