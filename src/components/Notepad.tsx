import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ref, get, set, onValue } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { NotebookPen, X, ChevronLeft, ChevronRight, List, Search, Check, Loader2, ArrowLeft } from 'lucide-react';

// Date-wise notepad. Notes live at users/{uid}/notes/{YYYY-MM-DD} = { text,
// updatedAt }. Slide-in panel from the right, auto-saves 1s after typing stops.

const todayStr = () => new Date().toISOString().split('T')[0];
const shiftDate = (d: string, days: number) => {
  const dt = new Date(d + 'T00:00:00');
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().split('T')[0];
};
const prettyDate = (d: string) => {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

type SaveState = 'idle' | 'saving' | 'saved';

const Notepad: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [text, setText] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [showList, setShowList] = useState(false);
  const [allNotes, setAllNotes] = useState<{ date: string; text: string }[]>([]);
  const [query, setQuery] = useState('');

  const debounceRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const closePanel = useCallback(() => {
    setOpen(false);
    setShowList(false);
    // Return focus to whatever the user was on before opening.
    setTimeout(() => prevFocusRef.current?.focus?.(), 50);
  }, []);

  const openPanel = useCallback(() => {
    prevFocusRef.current = document.activeElement as HTMLElement;
    setOpen(true);
  }, []);

  // Ctrl/Cmd+N toggles the panel; Esc closes it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setOpen((o) => { if (!o) prevFocusRef.current = document.activeElement as HTMLElement; return !o; });
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        closePanel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closePanel]);

  // Load the note for the selected date whenever it changes (while open).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSaveState('idle');
    get(ref(database, up(`notes/${date}`))).then((snap) => {
      if (cancelled) return;
      setText(snap.exists() ? (snap.val().text || '') : '');
    }).catch(() => { if (!cancelled) setText(''); });
    return () => { cancelled = true; };
  }, [date, open]);

  // Focus the textarea when the editor opens.
  useEffect(() => {
    if (open && !showList) setTimeout(() => textareaRef.current?.focus(), 60);
  }, [open, showList]);

  // Keep the recent-notes list in sync (used by the list view + search).
  useEffect(() => {
    if (!open) return;
    return onValue(ref(database, up('notes')), (snap) => {
      const list: { date: string; text: string }[] = [];
      if (snap.exists()) {
        const data = snap.val();
        Object.keys(data).forEach((d) => {
          const t = data[d]?.text || '';
          if (t.trim()) list.push({ date: d, text: t });
        });
      }
      list.sort((a, b) => b.date.localeCompare(a.date));
      setAllNotes(list.slice(0, 30));
    });
  }, [open]);

  // Auto-save 1s after the last keystroke.
  const onType = (value: string) => {
    setText(value);
    setSaveState('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const d = date;
    debounceRef.current = setTimeout(() => {
      set(ref(database, up(`notes/${d}`)), { text: value, updatedAt: Date.now() })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('idle'));
    }, 1000);
  };

  const filteredList = query.trim()
    ? allNotes.filter((n) => n.text.toLowerCase().includes(query.trim().toLowerCase()) || n.date.includes(query.trim()))
    : allNotes;

  return (
    <>
      <button onClick={() => (open ? closePanel() : openPanel())} title="Notepad (Ctrl+N)" className="btn-secondary" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
        <NotebookPen size={16} />
      </button>

      {open && createPortal(
        <>
          {/* Backdrop */}
          <div onClick={closePanel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998 }} />

          {/* Panel — portaled to <body> so the navbar's backdrop-filter can't
              make it its containing block (which shrank it + showed through).
              Solid opaque white. */}
          <div
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9999,
              width: 'min(380px, 100vw)', height: '100vh', background: '#ffffff', opacity: 1,
              backdropFilter: 'none', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
              display: 'flex', flexDirection: 'column', animation: 'slideIn .25s ease',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #e5e7eb', background: '#ffffff' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#14532d', display: 'flex', alignItems: 'center', gap: 8 }}>
                <NotebookPen size={18} color="#16a34a" /> Notepad
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setShowList((s) => !s)} title={showList ? 'Back to note' : 'Recent notes'} style={iconBtn}>
                  {showList ? <ArrowLeft size={17} /> : <List size={17} />}
                </button>
                <button onClick={closePanel} title="Close (Esc)" style={iconBtn}><X size={19} /></button>
              </div>
            </div>

            {showList ? (
              /* ---- List / search view ---- */
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, background: '#ffffff' }}>
                <div style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', borderRadius: 10, padding: '8px 12px' }}>
                    <Search size={15} color="#94a3b8" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Notes mein search karein…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: '#0f172a' }} />
                  </div>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {filteredList.length === 0 ? (
                    <p style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Koi note nahi mila.</p>
                  ) : filteredList.map((n) => (
                    <button
                      key={n.date}
                      onClick={() => { setDate(n.date); setShowList(false); setQuery(''); }}
                      style={{ width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid #f1f5f9', background: n.date === date ? '#f0fdf4' : '#fff', cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>{prettyDate(n.date)}</div>
                      <div style={{ fontSize: 13, color: '#475569', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.text.split('\n')[0]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ---- Editor view ---- */
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, background: '#ffffff' }}>
                {/* Date bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#f9fafb' }}>
                  <button onClick={() => setDate((d) => shiftDate(d, -1))} title="Previous day" style={iconBtn}><ChevronLeft size={18} /></button>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayStr())} style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: '#0f172a' }} />
                  <button onClick={() => setDate((d) => shiftDate(d, 1))} title="Next day" style={iconBtn}><ChevronRight size={18} /></button>
                </div>

                {/* Save status */}
                <div style={{ padding: '6px 16px', fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, minHeight: 24 }}>
                  {saveState === 'saving' && <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>}
                  {saveState === 'saved' && <span style={{ color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
                </div>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => onType(e.target.value)}
                  placeholder="Aaj ka kuch note likhein…"
                  style={{ flex: 1, minHeight: '60vh', margin: '0 16px 16px', padding: 14, border: '1px solid #e5e7eb', borderRadius: 12, resize: 'vertical', fontSize: 14, lineHeight: 1.6, color: '#0f172a', outline: 'none', fontFamily: 'inherit', background: '#ffffff' }}
                />
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
};

const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
  border: 'none', background: '#f1f5f9', color: '#334155', cursor: 'pointer', borderRadius: 8,
};

export default Notepad;
