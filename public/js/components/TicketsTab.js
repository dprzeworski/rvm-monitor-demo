// TicketsTab.js – zakładka zgłoszeń (po integracji z ServiceDesk)
window.RVM = window.RVM || {};

RVM.TicketsTab = function TicketsTab({
  devices, tickets, canEdit, username,
  onAddTicket, onUpdateTicket,
  newTicketDraft, clearNewTicketDraft,
}) {
  const { useState, useEffect } = React;
  const { PRIO_COLOR, TSTAT_LABEL } = RVM;

  const [tFilter,    setTFilter]    = useState('');
  const [tSearch,    setTSearch]    = useState('');
  const [tPageSize,  setTPageSize]  = useState(25);
  const [tPage,      setTPage]      = useState(1);
  const [showNewT,   setShowNewT]   = useState(false);
  const [openTicket, setOpenTicket] = useState(null);
  const [newNr,      setNewNr]      = useState('');
  const [creating,   setCreating]   = useState(false);
  const [newError,   setNewError]   = useState(null);
  const [syncing,    setSyncing]    = useState({});

  useEffect(() => {
    if (newTicketDraft) {
      setShowNewT(true);
      clearNewTicketDraft();
    }
  }, [newTicketDraft, clearNewTicketDraft]);

  const filteredTickets = tickets
    .filter(t => {
      if (!tFilter) return true;
      if (tFilter === 'moje') return t.by === username || t.osobaOdp === username;
      return t.status === tFilter;
    })
    .filter(t => !tSearch ||
      t.nazwaSklepu?.toLowerCase().includes(tSearch.toLowerCase()) ||
      t.opis?.toLowerCase().includes(tSearch.toLowerCase()) ||
      t.opisDlugi?.toLowerCase().includes(tSearch.toLowerCase()) ||
      t.nrZgloszenia?.toLowerCase().includes(tSearch.toLowerCase()) ||
      t.deviceId?.toLowerCase().includes(tSearch.toLowerCase()) ||
      t.sdTechnician?.toLowerCase().includes(tSearch.toLowerCase())
    );

  const tTotalPages = Math.ceil(filteredTickets.length / tPageSize);
  const tPageData   = filteredTickets.slice((tPage - 1) * tPageSize, tPage * tPageSize);

  const handleAddTicket = async () => {
    const nr = newNr.trim();
    if (!nr) { setNewError('Podaj numer zgłoszenia z ServiceDesk'); return; }
    setCreating(true);
    setNewError(null);
    try {
      await RVM.API.addTicket({ nrZgloszenia: nr });
      setShowNewT(false);
      setNewNr('');
      // App odświeży automatycznie przez polling
    } catch (e) {
      setNewError(e.message || 'Błąd dodawania zgłoszenia');
    } finally {
      setCreating(false);
    }
  };

  const handleSync = async (ticketId) => {
    setSyncing(s => ({ ...s, [ticketId]: true }));
    try {
      await RVM.API.sdSyncTicket(ticketId);
    } catch (e) {
      alert('Błąd synchronizacji: ' + e.message);
    } finally {
      setSyncing(s => ({ ...s, [ticketId]: false }));
    }
  };

  const fmt = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => { setShowNewT(true); setNewError(null); }} className="btn btn-primary">+ Nowe zgłoszenie</button>
          {[
            { id: '',          label: 'Wszystkie' },
            { id: 'otwarty',   label: 'Otwarte' },
            { id: 'w_toku',    label: 'W toku' },
            { id: 'zamkniety', label: 'Zamknięte' },
            { id: 'moje',      label: 'Moje' },
          ].map(f => (
            <button key={f.id} onClick={() => { setTFilter(f.id); setTPage(1); }}
              style={{ background: tFilter === f.id ? '#e0e7ff' : 'white', color: tFilter === f.id ? '#3730a3' : '#374151', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: 7, fontSize: 13, fontWeight: tFilter === f.id ? 700 : 400 }}>
              {f.label}
              {(f.id === 'otwarty' || f.id === 'w_toku' || f.id === 'zamkniety') && (
                <span style={{ marginLeft: 5, background: '#f1f5f9', color: '#64748b', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>
                  {tickets.filter(t => t.status === f.id).length}
                </span>
              )}
              {f.id === 'moje' && (
                <span style={{ marginLeft: 5, background: '#f1f5f9', color: '#64748b', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>
                  {tickets.filter(t => t.by === username || t.osobaOdp === username).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Formularz nowego zgłoszenia — tylko numer SD */}
      {showNewT && canEdit && (
        <div className="card" style={{ border: '2px solid #2563eb', padding: 18, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 15, marginBottom: 4 }}>Nowe zgłoszenie z ServiceDesk</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
            Wszystkie dane (sklep, opis, priorytet, dział, status) zostaną pobrane automatycznie z SD na podstawie numeru zgłoszenia.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Numer zgłoszenia z SD *</label>
              <input
                className="input"
                value={newNr}
                onChange={e => setNewNr(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !creating) handleAddTicket(); }}
                placeholder="np. 5261496"
                disabled={creating}
                autoFocus
                style={{ width: '100%', fontSize: 16, fontFamily: 'monospace' }}
              />
            </div>
            <button onClick={handleAddTicket} className="btn btn-primary" disabled={creating} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {creating ? 'Pobieram z SD…' : <><RVM.Icons.Check size={15} />Utwórz</>}
            </button>
            <button onClick={() => { setShowNewT(false); setNewNr(''); setNewError(null); }} className="btn btn-secondary" disabled={creating}>Anuluj</button>
          </div>
          {newError && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 7, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <RVM.Icons.X size={14} color="#991b1b" /> {newError}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, display: 'flex', alignItems: 'center' }}>
          <RVM.Icons.Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
          <input className="input" value={tSearch} onChange={e => { setTSearch(e.target.value); setTPage(1); }}
            placeholder="Szukaj zgłoszenia, sklepu, nr SD, technika..." style={{ width: '100%', paddingLeft: 34 }} />
        </div>
        <select className="select" value={tPageSize} onChange={e => { setTPageSize(Number(e.target.value)); setTPage(1); }}>
          <option value={10}>10 / stronę</option>
          <option value={25}>25 / stronę</option>
          <option value={50}>50 / stronę</option>
        </select>
        <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{filteredTickets.length} zgłoszeń</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tPageData.length === 0
          ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: 60, fontSize: 14 }}>Brak zgłoszeń</div>
          : tPageData.map(ticket => {
              const isOpen   = openTicket === ticket.id;
              const isSync   = !!syncing[ticket.id];
              const sdColor  = ticket.sdPriorityColor || PRIO_COLOR[ticket.priorytet];

              return (
                <div key={ticket.id} style={{ background: 'white', border: `1px solid ${isOpen ? '#3b82f6' : '#e2e8f0'}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
                       onClick={() => setOpenTicket(isOpen ? null : ticket.id)}>
                    <div style={{ width: 4, borderRadius: 4, alignSelf: 'stretch', background: sdColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ background: sdColor + '22', color: sdColor, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{ticket.priorytet}</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{ticket.nazwaSklepu}</span>
                        {ticket.deviceId && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{ticket.deviceId}</span>}
                        {ticket.nrZgloszenia && (
                          <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                            SD #{ticket.nrZgloszenia}
                          </span>
                        )}
                        {ticket.dzial && <span style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>→ {ticket.dzial}</span>}
                        {ticket.sdError && (
                          <span style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }} title={ticket.sdError}>
                            ⚠ Błąd sync
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, lineHeight: 1.5 }}>{ticket.opis}</div>

                      <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        {ticket.osobaOdp && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><RVM.Icons.User size={12} />Dodał: {ticket.osobaOdp}</span>}
                        {ticket.sdTechnician && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><RVM.Icons.Wrench size={12} />Technik SD: {ticket.sdTechnician}</span>}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><RVM.Icons.Calendar size={12} />{fmt(ticket.created)}</span>
                        {ticket.sdLastSync && <span title={`Sync: ${fmt(ticket.sdLastSync)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><RVM.Icons.Refresh size={12} />{fmt(ticket.sdLastSync)}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
                      <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600 }}>
                        {ticket.sdStatusName || TSTAT_LABEL[ticket.status]}
                      </span>
                      <span style={{ fontSize: 10, color: '#cbd5e1', fontFamily: 'monospace' }}>#{ticket.id.slice(-6)}</span>
                    </div>
                  </div>

                  {/* Rozwinięte szczegóły */}
                  {isOpen && (
                    <div style={{ borderTop: '2px solid #3b82f6', background: '#eff6ff', padding: '14px 18px' }}>

                      {/* Pasek akcji */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Szczegóły z ServiceDesk
                        </div>
                        {canEdit && ticket.status !== 'zamkniety' && (
                          <button onClick={() => handleSync(ticket.id)} disabled={isSync} className="btn btn-secondary btn-sm">
                            <RVM.Icons.Refresh size={14} /> Synchronizuj
                          </button>
                        )}
                      </div>

                      {/* Pełny opis z SD */}
                      {ticket.opisDlugi && (
                        <div style={{ marginBottom: 14, background: 'white', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12 }}>
                          <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pełny opis</div>
                          <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{ticket.opisDlugi}</div>
                        </div>
                      )}

                      {/* Rozwiązanie z SD */}
                      {ticket.sdResolution && (
                        <div style={{ marginBottom: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ fontSize: 11, color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Check size={13} color="#166534" />Rozwiązanie</div>
                            {(ticket.sdResolutionBy || ticket.sdResolutionOn) && (
                              <div style={{ fontSize: 11, color: '#15803d' }}>
                                {ticket.sdResolutionBy}{ticket.sdResolutionBy && ticket.sdResolutionOn ? ' · ' : ''}{ticket.sdResolutionOn}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{ticket.sdResolution}</div>
                        </div>
                      )}

                      {/* Metadane SD */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14, fontSize: 12 }}>
                        {ticket.sdRequesterEmail && <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.MessageSquare size={12} />Email:</span> <strong>{ticket.sdRequesterEmail}</strong></div>}
                        {ticket.sdRequesterPhone && <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Phone size={12} />Telefon:</span> <strong>{ticket.sdRequesterPhone}</strong></div>}
                        {ticket.sdDepartment    && <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.MapPin size={12} />Lokalizacja:</span> <strong>{ticket.sdDepartment}</strong></div>}
                        {ticket.sdCategory      && <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Tag size={12} />Kategoria:</span> <strong>{ticket.sdCategory}</strong></div>}
                        {ticket.sdSubcategory   && <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Tag size={12} />Podkategoria:</span> <strong>{ticket.sdSubcategory}</strong></div>}
                        {ticket.sdItem          && <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Wrench size={12} />Pozycja:</span> <strong>{ticket.sdItem}</strong></div>}
                        {ticket.sdCreatedAt     && <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Calendar size={12} />Utworzono w SD:</span> <strong>{ticket.sdCreatedAt}</strong></div>}
                        {ticket.sdSite          && <div><span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.MapPin size={12} />Region:</span> <strong>{ticket.sdSite}</strong></div>}
                        {ticket.sdHasAttachments && <div style={{ gridColumn: 'span 2', color: '#1e40af', display: 'inline-flex', alignItems: 'center', gap: 5 }}><RVM.Icons.Paperclip size={12} />Zgłoszenie zawiera załączniki (dostępne tylko w SD)</div>}
                      </div>

                      {/* Notatki z SD */}
                      <div>
                        <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Notatki z SD
                          {ticket.sdNotes?.length > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>{ticket.sdNotes.length}</span>}
                        </div>
                        {ticket.sdNotes?.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {ticket.sdNotes.map((n, i) => (
                              <div key={n.sd_id || i} style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: 6, padding: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                                  <strong style={{ color: '#0f172a' }}>{n.autor}</strong>
                                  <span>{fmt(n.data)}</span>
                                </div>
                                <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{n.tresc}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>
                            Brak notatek w ServiceDesk
                          </div>
                        )}
                      </div>

                      {ticket.sdError && (
                        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 7, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: 12 }}>
                          <strong>⚠ Błąd ostatniej synchronizacji:</strong> {ticket.sdError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      {tTotalPages > 1 && (
        <div style={{ padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 12 }}>
          <button onClick={() => setTPage(1)} disabled={tPage === 1} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center' }}><RVM.Icons.ChevronsLeft size={14} /></button>
          <button onClick={() => setTPage(p => Math.max(1, p - 1))} disabled={tPage === 1} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center' }}><RVM.Icons.ChevronLeft size={14} /></button>
          <span style={{ fontSize: 13, color: '#64748b', minWidth: 130, textAlign: 'center' }}>Strona {tPage} z {tTotalPages}</span>
          <button onClick={() => setTPage(p => Math.min(tTotalPages, p + 1))} disabled={tPage === tTotalPages} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center' }}><RVM.Icons.ChevronRight size={14} /></button>
          <button onClick={() => setTPage(tTotalPages)} disabled={tPage === tTotalPages} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center' }}><RVM.Icons.ChevronsRight size={14} /></button>
        </div>
      )}
    </div>
  );
};
