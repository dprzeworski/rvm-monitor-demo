// Sidebar.js – lewy panel nawigacji
window.RVM = window.RVM || {};

RVM.Sidebar = function Sidebar({
  tab, setTab,
  user, devicesCount, openTicketsCount,
  collapsed, setCollapsed,
  onLogout, onChangePassword,
}) {
  const visibleItems = RVM.NAV_ITEMS.filter(item =>
    !item.adminOnly || user?.rola === 'admin'
  );

  const stats = { devicesCount, openTicketsCount };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : 'expanded'}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">R</div>
        <div className="sidebar-title">RVM Monitor</div>
      </div>

      <nav className="sidebar-nav">
        {visibleItems.map((item) => {
          const label = item.dynamicLabel ? item.dynamicLabel(stats) : item.label;
          const badge = item.badge ? item.badge(stats) : null;
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? label : undefined}
            >
              <span className="icon">{RVM.Icons[item.icon] ? React.createElement(RVM.Icons[item.icon], { size: 18 }) : null}</span>
              <span className="label">{label}</span>
              {badge !== null && badge !== undefined && <span className="badge">{badge}</span>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-user" title={collapsed ? `${user.imie || user.login} (${user.rola})` : undefined}>
            <div className="sidebar-user-avatar">{RVM.getInitials(user.imie || user.login)}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user.imie || user.login}</div>
              <div className="sidebar-user-role">{user.rola}</div>
            </div>
          </div>
        )}
        <button onClick={onChangePassword} className="sidebar-action" title={collapsed ? 'Zmień hasło' : undefined}>
          <span className="icon"><RVM.Icons.Key size={18} /></span>
          <span className="sidebar-action-text">Zmień hasło</span>
        </button>
        <button onClick={onLogout} className="sidebar-action danger" title={collapsed ? 'Wyloguj' : undefined}>
          <span className="icon"><RVM.Icons.LogOut size={18} /></span>
          <span className="sidebar-action-text">Wyloguj</span>
        </button>
      </div>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="sidebar-toggle"
        title={collapsed ? 'Rozwiń' : 'Zwiń'}
      >
        {collapsed ? '›' : '‹ Zwiń'}
      </button>
    </aside>
  );
};
