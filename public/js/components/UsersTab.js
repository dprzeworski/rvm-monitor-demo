// UsersTab.js – zarządzanie użytkownikami (admin)
window.RVM = window.RVM || {};

RVM.UsersTab = function UsersTab() {
  const { useState, useEffect } = React;

  const [users,   setUsers]   = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [newU,    setNewU]    = useState({ login: '', password: '', imie: '', rola: 'user' });
  const [msg,     setMsg]     = useState('');

  const load = async () => {
    try { setUsers(await RVM.API.getUsers()); }
    catch (e) { setMsg(`Błąd: ${e.message}`); }
  };

  useEffect(() => { load(); }, []);

  const flash = (text) => { setMsg(text); setTimeout(() => setMsg(''), 3000); };

  const handleAdd = async () => {
    if (!newU.login || !newU.password) return;
    try {
      await RVM.API.addUser(newU);
      setShowNew(false);
      setNewU({ login: '', password: '', imie: '', rola: 'user' });
      await load();
      flash('Użytkownik dodany');
    } catch (e) { flash(`Błąd: ${e.message}`); }
  };

  const changePassword = async (id) => {
    const p = prompt('Nowe hasło (min. 6 znaków):');
    if (!p) return;
    try {
      await RVM.API.updateUserPassword(id, p);
      flash('Hasło zmienione');
    } catch (e) { flash(`Błąd: ${e.message}`); }
  };

  const changeRole = async (id, login, rola) => {
    if (!confirm(`Zmienić rolę ${login} na "${rola}"?`)) return;
    try {
      await RVM.API.updateUserRola(id, rola);
      await load();
    } catch (e) { flash(`Błąd: ${e.message}`); }
  };

  const toggleActive = async (u) => {
    try {
      await RVM.API.toggleUser(u.id, u.aktywny ? 0 : 1);
      await load();
    } catch (e) { flash(`Błąd: ${e.message}`); }
  };

  const deleteUser = async (id) => {
    if (!confirm('Usunąć użytkownika?')) return;
    try {
      await RVM.API.deleteUser(id);
      await load();
    } catch (e) { flash(`Błąd: ${e.message}`); }
  };

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <button onClick={() => setShowNew(true)} className="btn btn-primary">+ Nowy użytkownik</button>
        {msg && (
          <span style={{ fontSize: 13, color: msg.startsWith('Błąd') ? '#991b1b' : '#166534', background: msg.startsWith('Błąd') ? '#fef2f2' : '#f0fdf4', border: `1px solid ${msg.startsWith('Błąd') ? '#fecaca' : '#bbf7d0'}`, padding: '5px 12px', borderRadius: 7 }}>
            {msg}
          </span>
        )}
      </div>

      {showNew && (
        <div className="card" style={{ border: '2px solid #2563eb', padding: 18, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 15, marginBottom: 12 }}>Nowy użytkownik</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Login *</label>
              <input className="input" value={newU.login} onChange={e => setNewU(u => ({ ...u, login: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Hasło *</label>
              <input className="input" type="password" value={newU.password} onChange={e => setNewU(u => ({ ...u, password: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Imię i nazwisko</label>
              <input className="input" value={newU.imie} onChange={e => setNewU(u => ({ ...u, imie: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Rola</label>
              <select className="select" value={newU.rola} onChange={e => setNewU(u => ({ ...u, rola: e.target.value }))} style={{ width: '100%' }}>
                <option value="viewer">Viewer (tylko podgląd)</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleAdd} className="btn btn-primary">Utwórz</button>
            <button onClick={() => setShowNew(false)} className="btn btn-secondary">Anuluj</button>
          </div>
        </div>
      )}

      <div className="card">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Login', 'Imię i nazwisko', 'Rola', 'Status', 'Akcje'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{u.login}</td>
                <td style={{ padding: '10px 12px', color: '#374151' }}>{u.imie || '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  <select className="select" value={u.rola} onChange={e => changeRole(u.id, u.login, e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }}>
                    <option value="viewer">Viewer</option>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ background: u.aktywny ? '#dcfce7' : '#fee2e2', color: u.aktywny ? '#166534' : '#991b1b', padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                    {u.aktywny ? 'Aktywny' : 'Nieaktywny'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => changePassword(u.id)} className="btn btn-secondary btn-sm">Zmień hasło</button>
                    <button onClick={() => toggleActive(u)} style={{ background: u.aktywny ? '#fff7ed' : '#f0fdf4', color: u.aktywny ? '#9a3412' : '#166534', border: `1px solid ${u.aktywny ? '#fed7aa' : '#bbf7d0'}`, padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>
                      {u.aktywny ? 'Dezaktywuj' : 'Aktywuj'}
                    </button>
                    <button onClick={() => deleteUser(u.id)} className="btn btn-danger btn-sm">Usuń</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
