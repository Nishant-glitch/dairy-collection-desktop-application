import React, { useState, useEffect, useCallback } from 'react';
import { Calculator as CalcIcon, X, Copy, Check } from 'lucide-react';

// Compact floating calculator reachable from the navbar. Basic arithmetic with
// keyboard support and copy-to-clipboard. Fixed top-right popup (touch-friendly
// buttons for tablet use).

const CalculatorWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true); // next digit starts a new number
  const [copied, setCopied] = useState(false);

  const inputDigit = useCallback((d: string) => {
    setDisplay((cur) => {
      if (fresh) { setFresh(false); return d === '.' ? '0.' : d; }
      if (d === '.' && cur.includes('.')) return cur;
      if (cur === '0' && d !== '.') return d;
      return cur + d;
    });
  }, [fresh]);

  const apply = (a: number, b: number, o: string) => {
    switch (o) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
      default: return b;
    }
  };

  const chooseOp = useCallback((o: string) => {
    const cur = parseFloat(display);
    if (prev !== null && op && !fresh) {
      const r = apply(prev, cur, op);
      setPrev(r); setDisplay(String(r));
    } else {
      setPrev(cur);
    }
    setOp(o); setFresh(true);
  }, [display, prev, op, fresh]);

  const equals = useCallback(() => {
    if (prev === null || !op) return;
    const cur = parseFloat(display);
    const r = apply(prev, cur, op);
    setDisplay(Number.isFinite(r) ? String(r) : 'Error');
    setPrev(null); setOp(null); setFresh(true);
  }, [display, prev, op]);

  const clearAll = useCallback(() => { setDisplay('0'); setPrev(null); setOp(null); setFresh(true); }, []);
  const backspace = useCallback(() => {
    setDisplay((cur) => (cur.length <= 1 || (cur.length === 2 && cur.startsWith('-')) ? '0' : cur.slice(0, -1)));
  }, []);
  const percent = useCallback(() => { setDisplay((cur) => String(parseFloat(cur) / 100)); setFresh(true); }, []);

  // Keyboard support while open.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const k = e.key;
      if (/\d/.test(k)) { inputDigit(k); }
      else if (k === '.') inputDigit('.');
      else if (k === '+') chooseOp('+');
      else if (k === '-') chooseOp('−');
      else if (k === '*') chooseOp('×');
      else if (k === '/') { e.preventDefault(); chooseOp('÷'); }
      else if (k === '%') percent();
      else if (k === 'Enter' || k === '=') { e.preventDefault(); equals(); }
      else if (k === 'Backspace') backspace();
      else if (k === 'Escape') setOpen(false);
      else if (k.toLowerCase() === 'c') clearAll();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, inputDigit, chooseOp, equals, backspace, percent, clearAll]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(display); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ }
  };

  const Btn: React.FC<{ label: React.ReactNode; onClick: () => void; variant?: 'num' | 'op' | 'eq' | 'clr' }> = ({ label, onClick, variant = 'num' }) => {
    const bg = variant === 'op' ? 'var(--surface-2)' : variant === 'eq' ? 'linear-gradient(135deg,#16a34a,#15803d)' : variant === 'clr' ? '#fee2e2' : '#fff';
    const color = variant === 'eq' ? '#fff' : variant === 'clr' ? '#b91c1c' : variant === 'op' ? 'var(--brand-strong)' : 'var(--ink)';
    return (
      <button onClick={onClick} style={{ padding: '14px 0', borderRadius: 10, border: '1px solid var(--line)', background: bg, color, fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
    );
  };

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} title="Calculator" className="btn-secondary" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
        <CalcIcon size={16} />
      </button>

      {open && (
        <div style={{ position: 'fixed', top: 64, right: 16, zIndex: 200, width: 268, background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: '1px solid var(--line)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}><CalcIcon size={15} /> Calculator</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-2)' }}><X size={18} /></button>
          </div>

          <div style={{ padding: '14px 14px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
              <button onClick={copy} title="Copy result" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#16a34a' : 'var(--ink-2)', flexShrink: 0 }}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <Btn label="C" onClick={clearAll} variant="clr" />
              <Btn label="⌫" onClick={backspace} variant="op" />
              <Btn label="%" onClick={percent} variant="op" />
              <Btn label="÷" onClick={() => chooseOp('÷')} variant="op" />

              <Btn label="7" onClick={() => inputDigit('7')} />
              <Btn label="8" onClick={() => inputDigit('8')} />
              <Btn label="9" onClick={() => inputDigit('9')} />
              <Btn label="×" onClick={() => chooseOp('×')} variant="op" />

              <Btn label="4" onClick={() => inputDigit('4')} />
              <Btn label="5" onClick={() => inputDigit('5')} />
              <Btn label="6" onClick={() => inputDigit('6')} />
              <Btn label="−" onClick={() => chooseOp('−')} variant="op" />

              <Btn label="1" onClick={() => inputDigit('1')} />
              <Btn label="2" onClick={() => inputDigit('2')} />
              <Btn label="3" onClick={() => inputDigit('3')} />
              <Btn label="+" onClick={() => chooseOp('+')} variant="op" />

              <Btn label="0" onClick={() => inputDigit('0')} />
              <Btn label="." onClick={() => inputDigit('.')} />
              <div style={{ gridColumn: 'span 2' }}><button onClick={equals} style={{ width: '100%', height: '100%', minHeight: 48, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', fontSize: 20, fontWeight: 800, cursor: 'pointer' }}>=</button></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CalculatorWidget;
