// utils.js – stałe, formatery, helpery
// Wszystko eksportowane na window.RVM (żeby inne pliki mogły używać)

window.RVM = window.RVM || {};

// ── Stałe konfiguracyjne ──────────────────────────────────────────────────
RVM.PAGE = 25;

RVM.DZIAL_OPTIONS = ['HelpDesk', 'Serwis', 'Inny'];

RVM.ST = {
  up:       { label: 'UP',       bg: '#dcfce7', txt: '#166534', dot: '#22c55e' },
  down:     { label: 'DOWN',     bg: '#fee2e2', txt: '#991b1b', dot: '#ef4444' },
  offline:  { label: 'OFFLINE',  bg: '#ffedd5', txt: '#9a3412', dot: '#f97316' },
  not_seen: { label: 'NOT SEEN', bg: '#f1f5f9', txt: '#64748b', dot: '#94a3b8' },
};

RVM.FLAGS = {
  zarzad: { label: 'Zarząd',            short: 'ZRZ', bg: '#ede9fe', txt: '#5b21b6', dot: '#7c3aed', border: '#a78bfa', rowBg: '#faf5ff' },
  pilna:  { label: 'Pilna weryfikacja', short: 'PIL', bg: '#ffedd5', txt: '#9a3412', dot: '#f97316', border: '#fb923c', rowBg: '#fff7ed' },
};

RVM.FLAG_CYCLE = { 'null': 'zarzad', 'undefined': 'zarzad', 'zarzad': 'pilna', 'pilna': null };

RVM.PRIO_COLOR  = { niski: '#64748b', sredni: '#d97706', wysoki: '#dc2626' };
RVM.TSTAT_LABEL = { otwarty: 'Otwarty', w_toku: 'W toku', zamkniety: 'Zamknięty' };

RVM.NAV_ITEMS = [
  { id: 'devices',   label: 'Urządzenia',     icon: 'Monitor',     dynamicLabel: s => `Urządzenia (${s.devicesCount})` },
  { id: 'tickets',   label: 'Zgłoszenia',     icon: 'FileText',    badge: s => s.openTicketsCount > 0 ? s.openTicketsCount : null },
  { id: 'users',     label: 'Użytkownicy',    icon: 'Users',       adminOnly: true },
  { id: 'stats',     label: 'Statystyki',     icon: 'TrendingUp' },
  { id: 'admin',     label: 'Administracja',  icon: 'Settings',    adminOnly: true },
  { id: 'about',     label: 'O aplikacji',    icon: 'Info' },
];

// ── Formatery ─────────────────────────────────────────────────────────────
RVM.fmtDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

RVM.fmtDateLong = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

// ── IP helper (konwersja nr klienta → IP sklepu Dino) ─────────────────────
RVM.hostToIp = (hostNumber) => {
  const n = parseInt(hostNumber);
  if (!n || isNaN(n)) return null;
  const digits = String(n).padStart(5, '0').split('').map(Number);
  const ranges = [
    [10000, 10999, 80,  ''],
    [11000, 11999, 80,  '1'],
    [12000, 12999, 50,  ''],
    [13000, 13999, 50,  '1'],
    [14000, 14999, 190, ''],
    [15000, 15999, 190, '1'],
    [16000, 16999, 150, ''],
    [17000, 17999, 150, '1'],
  ];
  for (const [lo, hi, offset, prefix] of ranges) {
    if (n >= lo && n <= hi) {
      const s2 = digits[2] + offset;
      const s3 = parseInt(`${prefix}${digits[3]}${digits[4]}`);
      if (s2 > 255 || s3 > 255) return null;
      return `10.${s2}.${s3}.185`;
    }
  }
  return null;
};

// ── Hook do pobierania sesji ──────────────────────────────────────────────
RVM.useAuth = () => {
  const [auth, setAuth] = React.useState({ loading: true, user: null });

  React.useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => setAuth({ loading: false, user: d.user }))
      .catch(() => { window.location = '/login'; });
  }, []);

  return auth;
};

// ── Inicjały użytkownika ──────────────────────────────────────────────────
RVM.getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
