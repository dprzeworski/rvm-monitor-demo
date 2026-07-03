// NotesList.js – komponent listy notatek (używany dla urządzeń)
window.RVM = window.RVM || {};

// Konfiguracja kategorii notatek
RVM.NOTE_KATEGORIE = {
  kontakt: { label: 'Kontakt',    icon: 'Phone',  bg: '#eff6ff', txt: '#1e40af', border: '#bfdbfe' },
  serwis:  { label: 'Serwisowa',  icon: 'Wrench', bg: '#fff7ed', txt: '#9a3412', border: '#fed7aa' },
};

RVM.NotesList = function NotesList({
  notes = [],
  onAdd,
  onEdit,
  onDelete,
  collapsed = false,
  readonly = false,
}) {
  const { useState, useMemo } = React;
  const [text, setText]               = useState('');
  const [kategoria, setKategoria]     = useState('kontakt');
  const [editId, setEditId]           = useState(null);
  const [editText, setEditText]       = useState('');
  const [editKat, setEditKat]         = useState('kontakt');
  const [filter, setFilter]           = useState(''); // '' = wszystkie
  const [showAll, setShowAll]         = useState(false);
  const KAT = RVM.NOTE_KATEGORIE;

  // Filtrowanie
  const filtered = useMemo(() => {
    if (!filter) return notes;
    return notes.filter(n => (n.kategoria || 'kontakt') === filter);
  }, [notes, filter]);

  // ── Widok collapsed (w komórce tabeli) ────────────────────────────
  if (collapsed) {
    if (notes.length === 0) return <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>;
    const n = notes[0];
    const kat = KAT[n.kategoria || 'kontakt'];
    return (
      <div style={{ fontSize: 12, color: '#374151', maxWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
          <span style={{ display: 'inline-flex', flexShrink: 0 }} title={kat.label}>{RVM.Icons[kat.icon] && React.createElement(RVM.Icons[kat.icon], { size: 12, color: kat.txt })}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{n.tresc}</span>
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
          {n.autor} · {RVM.fmtDate(n.data)}
          {notes.length > 1 && <span style={{ marginLeft: 6, color: '#3b82f6' }}>+{notes.length - 1}</span>}
        </div>
      </div>
    );
  }

  const VISIBLE_COUNT = 5;
  const display = showAll ? filtered : filtered.slice(0, VISIBLE_COUNT);
  const hiddenCount = Math.max(0, filtered.length - VISIBLE_COUNT);

  const handleAdd = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t, kategoria);
    setText('');
  };

  const handleEdit = (id) => {
    const t = editText.trim();
    if (!t) return;
    onEdit(id, t, editKat);
    setEditId(null);
  };

  // Liczby per kategoria
  const counts = { kontakt: 0, serwis: 0 };
  for (const n of notes) {
    const k = n.kategoria || 'kontakt';
    if (counts[k] !== undefined) counts[k]++;
  }

  return (
    <div>
      {/* Filtr kategorii */}
      {notes.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => { setFilter(''); setShowAll(false); }}
            style={{
              background: filter === '' ? '#e0e7ff' : 'white',
              color:      filter === '' ? '#3730a3' : '#64748b',
              border:     '1px solid #e2e8f0',
              padding:    '3px 10px',
              borderRadius: 12,
              fontSize:   11,
              fontWeight: filter === '' ? 700 : 500,
              cursor:     'pointer',
            }}
          >Wszystkie ({notes.length})</button>
          {Object.entries(KAT).map(([id, cfg]) => (
            <button
              key={id}
              onClick={() => { setFilter(id); setShowAll(false); }}
              style={{
                background: filter === id ? cfg.bg : 'white',
                color:      filter === id ? cfg.txt : '#64748b',
                border:     `1px solid ${filter === id ? cfg.border : '#e2e8f0'}`,
                padding:    '3px 10px',
                borderRadius: 12,
                fontSize:   11,
                fontWeight: filter === id ? 700 : 500,
                cursor:     'pointer',
                display:    'inline-flex',
                alignItems: 'center',
                gap:        5,
              }}
            >{RVM.Icons[cfg.icon] && React.createElement(RVM.Icons[cfg.icon], { size: 12 })} {cfg.label} ({counts[id]})</button>
          ))}
        </div>
      )}

      {/* Lista */}
      {display.length === 0 && filter && (
        <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0', fontStyle: 'italic' }}>
          Brak notatek w kategorii „{KAT[filter]?.label}”
        </div>
      )}

      {display.map((n) => {
        const kat = KAT[n.kategoria || 'kontakt'];
        return (
          <div key={n.id} className="note-row" style={{ borderLeftColor: kat.border, background: kat.bg + '60' }}>
            {editId === n.id ? (
              <div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  {Object.entries(KAT).map(([id, cfg]) => (
                    <button
                      key={id}
                      onClick={() => setEditKat(id)}
                      style={{
                        background: editKat === id ? cfg.bg : 'white',
                        color:      editKat === id ? cfg.txt : '#64748b',
                        border:     `1px solid ${editKat === id ? cfg.border : '#e2e8f0'}`,
                        padding:    '3px 10px',
                        borderRadius: 12,
                        fontSize:   11,
                        fontWeight: editKat === id ? 700 : 500,
                        cursor:     'pointer',
                        display:    'inline-flex',
                        alignItems: 'center',
                        gap:        5,
                      }}
                    >{RVM.Icons[cfg.icon] && React.createElement(RVM.Icons[cfg.icon], { size: 12 })} {cfg.label}</button>
                  ))}
                </div>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={2}
                  style={{ width: '100%', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 10px', fontSize: 13, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button onClick={() => handleEdit(n.id)} className="btn btn-primary btn-sm">Zapisz</button>
                  <button onClick={() => setEditId(null)} className="btn btn-secondary btn-sm">Anuluj</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: 1 }} title={kat.label}>{RVM.Icons[kat.icon] && React.createElement(RVM.Icons[kat.icon], { size: 14, color: kat.txt })}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{n.tresc}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    <span style={{ background: kat.bg, color: kat.txt, padding: '0 6px', borderRadius: 8, fontSize: 10, fontWeight: 600, marginRight: 6 }}>{kat.label}</span>
                    {n.autor} · {RVM.fmtDate(n.data)}
                    {n.edytowana && ' (edytowano)'}
                  </div>
                </div>
                {!readonly && (
                  <div className="note-actions" style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    <button
                      onClick={() => { setEditId(n.id); setEditText(n.tresc); setEditKat(n.kategoria || 'kontakt'); }}
                      title="Edytuj"
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', padding: '2px 5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                    ><RVM.Icons.Pencil size={14} /></button>
                    <button
                      onClick={() => onDelete(n.id)}
                      title="Usuń"
                      style={{ background: 'transparent', border: 'none', color: '#fca5a5', padding: '2px 5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                    ><RVM.Icons.Trash size={14} /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Pokaż starsze / zwiń */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(s => !s)}
          style={{
            background: 'transparent',
            border: '1px dashed #cbd5e1',
            color: '#3b82f6',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
            marginTop: 6,
          }}
        >
          {showAll ? `▲ Zwiń (ukryj ${hiddenCount} starszych)` : `▼ Pokaż starsze (${hiddenCount})`}
        </button>
      )}

      {/* Formularz dodawania */}
      {!readonly && (
        <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {Object.entries(KAT).map(([id, cfg]) => (
              <button
                key={id}
                onClick={() => setKategoria(id)}
                style={{
                  background: kategoria === id ? cfg.bg : 'white',
                  color:      kategoria === id ? cfg.txt : '#64748b',
                  border:     `1px solid ${kategoria === id ? cfg.border : '#e2e8f0'}`,
                  padding:    '4px 12px',
                  borderRadius: 14,
                  fontSize:   12,
                  fontWeight: kategoria === id ? 700 : 500,
                  cursor:     'pointer',
                  display:    'inline-flex',
                  alignItems: 'center',
                  gap:        5,
                }}
              >{RVM.Icons[cfg.icon] && React.createElement(RVM.Icons[cfg.icon], { size: 13 })} {cfg.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleAdd(); }}
              placeholder="Nowa notatka… (Ctrl+Enter aby zapisać)"
              rows={2}
              style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 10px', fontSize: 13, resize: 'vertical', background: 'white' }}
            />
            <button onClick={handleAdd} disabled={!text.trim()} className="btn btn-primary">
              + Dodaj
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
