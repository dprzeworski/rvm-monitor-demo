// middleware/auth.js – autentykacja i autoryzacja
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Niezalogowany' });
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session?.user?.rola === 'admin') return next();
  res.status(403).json({ error: 'Brak uprawnień administratora' });
}

function requireEdit(req, res, next) {
  const rola = req.session?.user?.rola;
  if (rola === 'admin' || rola === 'user') return next();
  res.status(403).json({ error: 'Brak uprawnień do edycji (rola viewer)' });
}

module.exports = { requireAuth, requireAdmin, requireEdit };
