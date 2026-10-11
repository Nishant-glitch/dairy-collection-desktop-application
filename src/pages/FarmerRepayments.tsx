import React, { useEffect, useRef, useState } from 'react';
import { ref, get, onValue } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { printHtml } from '../utils/printHtml';
import { restoreCaret } from '../utils/focus';
import {
  addRepayment, deleteRepayment, listRepayments,
  REPAYMENT_MODES, modeLabel, type Repayment, type RepaymentMode,
} from '../services/repaymentService';
import {
  HandCoins, Printer, Trash2, Save, Loader2, Search, Calendar, RefreshCw, AlertTriangle,
} from 'lucide-react';

// Record a farmer repayment (farmer paid back old dues) and show recent
// entries. Each save auto-mirrors into Cash Book receipt side via the
// service; this page only owns the UI + print receipt.

type Mode = RepaymentMode;

const todayStr = () => new Date().toISOString().split('T')[0];
const firstOfThisMonth = () => `${new Date().toISOString().substring(0, 7)}-01`;

// Rupees in words — short, for the printed receipt. Good enough for the
// typical ≤ ₹100,000 range we expect. Handles whole rupees only.
const numToIndianWords = (n: number): string => {
  n = Math.round(n);
  if (n === 0) return 'Zero';
  const ones = ['', 'One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two = (x: number): string => x < 20 ? ones[x] : `${tens[Math.floor(x/10)]}${x%10 ? ' ' + ones[x%10] : ''}`;
  const three = (x: number): string => x >= 100 ? `${ones[Math.floor(x/100)]} Hundred${x%100 ? ' ' + two(x%100) : ''}` : two(x);
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh  = Math.floor(n / 100000);   n %= 100000;
  const thou  = Math.floor(n / 1000);     n %= 1000;
  if (crore) parts.push(`${two(crore)} Crore`);
  if (lakh)  parts.push(`${two(lakh)} Lakh`);
  if (thou)  parts.push(`${two(thou)} Thousand`);
  if (n)     parts.push(three(n));
  return parts.join(' ');
};

const FarmerRepayments: React.FC = () => {
  const { t } = useLanguage();
  const [farmers, setFarmers] = useState<Record<string, any>>({});
  const [dcsInfo, setDcsInfo] = useState<any>({});

  // Entry form state
  const [date, setDate] = useState(todayStr());
  const [farmerCode, setFarmerCode] = useState('');
  const [farmerName, setFarmerName] = useState('');
  const [farmerFound, setFarmerFound] = useState(false);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<Mode>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [autoPrint, setAutoPrint] = useState(true);
  const [saving, setSaving] = useState(false);

  // History state
  const [fromDate, setFromDate] = useState(firstOfThisMonth());
  const [toDate, setToDate] = useState(todayStr());
  const [filterFarmer, setFilterFarmer] = useState('');
  const [list, setList] = useState<Repayment[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  // Pre-finalized-month warning (resolved async when date/farmer changes).
  const [backdateWarning, setBackdateWarning] = useState<string>('');

  const [toast, setToast] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Load farmer master once (live) + static society info.
  useEffect(() => {
    const un = onValue(ref(database, up('farmers')), (s) => {
      setFarmers(s.exists() ? s.val() : {});
    });
    get(ref(database, up('dcsInfo'))).then((s) => {
      if (s.exists()) setDcsInfo(s.val());
    });
    return () => un();
  }, []);

  // Farmer-code autoresolve + "already-finalized" month check whenever date
  // or farmer changes. Warning doesn't block the save — the clerk can still
  // record a backdated repayment, they just know they should re-finalize.
  useEffect(() => {
    const code = farmerCode.trim();
    if (!code) { setFarmerName(''); setFarmerFound(false); return; }
    const f = farmers[code];
    if (f) {
      setFarmerName(f.farmerName || f.name || '');
      setFarmerFound(true);
    } else {
      setFarmerName('');
      setFarmerFound(false);
    }
  }, [farmerCode, farmers]);

  useEffect(() => {
    const month = (date || '').substring(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) { setBackdateWarning(''); return; }
    let cancelled = false;
    get(ref(database, up(`paymentsHistory/${month}`))).then((s) => {
      if (cancelled) return;
      if (s.exists()) {
        const h = s.val();
        const when = h?.finalizedAt ? new Date(h.finalizedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        setBackdateWarning(`⚠️ Ye month (${month}) pehle finalize ho chuka hai${when ? ` (${when})` : ''}. Repayment save karne ke baad ${month} dobara Finalize karein, warna agle months ka B/F ghalat rahega.`);
      } else {
        setBackdateWarning('');
      }
    }).catch(() => setBackdateWarning(''));
    return () => { cancelled = true; };
  }, [date]);

  const loadList = async () => {
    setLoadingList(true);
    try {
      const rows = await listRepayments(fromDate, toDate, filterFarmer.trim());
      setList(rows);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, []);

  const resetForm = () => {
    setFarmerCode('');
    setFarmerName('');
    setFarmerFound(false);
    setAmount('');
    setReference('');
    setNote('');
    setDate(todayStr());
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const printReceipt = (r: {
    date: string; farmerId: string; farmerName: string;
    amount: number; mode: Mode; reference?: string; note?: string;
  }) => {
    const dateFmt = (r.date || '').split('-').reverse().join('/');
    const words = numToIndianWords(r.amount);
    const esc = (s: any) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
    const line = (lbl: string, val: string) => `<div>${esc(lbl.padEnd(5, ' '))}: ${esc(val)}</div>`;
    const dash = `<div style="border-top:1px dashed #000;margin:3px 1mm"></div>`;
    const body = `
      <div style="text-align:center;font-weight:bold;font-size:16px">${esc(dcsInfo.name || 'DCS Pro')}</div>
      <div style="text-align:center;font-size:13px">Repayment Receipt</div>
      <div style="height:5px"></div>
      <div>Date : ${esc(dateFmt)}</div>
      ${line('Code', r.farmerId)}
      ${line('Name', r.farmerName)}
      ${line('Mode', modeLabel(r.mode))}
      ${r.reference ? line('Ref', r.reference) : ''}
      ${r.note ? line('Note', r.note) : ''}
      ${dash}
      <div style="font-size:17px;font-weight:900">RECEIVED: ₹${r.amount.toFixed(2)}</div>
      <div style="font-size:11px;margin-top:4px">(${words} Only)</div>
      ${dash}
      <div style="height:4px"></div>
      <div style="text-align:center">Thank You! — DCS Pro</div>
      <div style="margin-top:12px">Signature: ____________________</div>
    `;
    printHtml(`<html><head><title>Repayment Receipt</title>
      <style>
        * { color: #000 !important; -webkit-print-color-adjust: exact; }
        html, body { margin: 0; padding: 0; }
        #slip { font-family: 'Courier New', monospace; font-size: 13px; font-weight: 700;
                line-height: 1.55; width: 58mm; box-sizing: border-box; padding: 3mm 4mm 3mm 5mm; }
        #slip div { page-break-inside: avoid; }
        @media print {
          @page { size: 58mm auto; margin: 0; }
          html, body { width: 58mm; margin: 0; padding: 0; }
          #slip { width: 58mm; padding: 3mm 4mm 3mm 5mm; }
        }
      </style></head>
      <body><div id="slip">${body}</div></body></html>`);
  };

  const handleSave = async () => {
    if (!farmerCode.trim()) { alert('Farmer code daalein.'); codeRef.current?.focus(); return; }
    if (!farmerFound) { alert('Farmer code galat hai. Farmer Master mein check karein.'); codeRef.current?.focus(); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { alert('Valid amount daalein (0 se zyada).'); amountRef.current?.focus(); return; }
    if (!date) { alert('Date daalein.'); return; }

    setSaving(true);
    try {
      await addRepayment({
        date, farmerId: farmerCode.trim(), farmerName,
        amount: amt, mode, reference: reference.trim(), note: note.trim(),
      });
      if (autoPrint) {
        printReceipt({ date, farmerId: farmerCode.trim(), farmerName, amount: amt, mode, reference, note });
      }
      showToast(`✅ ₹${amt.toFixed(2)} saved — ${farmerName} (${farmerCode})`);
      resetForm();
      await loadList();
      restoreCaret(codeRef.current);
    } catch (e: any) {
      console.error(e);
      alert('❌ Save failed: ' + (e?.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: Repayment) => {
    if (!r.repaymentId) return;
    if (!confirm(`Delete this repayment?\n\n${r.farmerName || r.farmerId} — ₹${r.amount.toFixed(2)} on ${r.date}\n\nCash Book ki linked entry bhi delete ho jayegi. Ye undo nahi hoga.`)) return;
    try {
      await deleteRepayment(r.repaymentId);
      await loadList();
      showToast('✅ Deleted');
    } catch (e) {
      console.error(e);
      alert('❌ Delete failed.');
    }
  };

  const rePrint = (r: Repayment) => printReceipt({
    date: r.date, farmerId: r.farmerId, farmerName: r.farmerName || r.farmerId,
    amount: r.amount, mode: r.mode, reference: r.reference, note: r.note,
  });

  const totalInRange = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const modeTotals = list.reduce<Record<string, number>>((acc, r) => {
    acc[r.mode] = (acc[r.mode] || 0) + (Number(r.amount) || 0);
    return acc;
  }, {});

  return (
    <div className="page-wrapper animate-fadeIn">
      {toast && (
        <div role="status" style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 200, padding: '10px 18px', borderRadius: 12, background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 800, boxShadow: '0 12px 30px rgba(0,0,0,0.25)', whiteSpace: 'nowrap' }}>{toast}</div>
      )}

      <h1 className="page-title"><HandCoins color="#16a34a" /> Farmer Repayments (Paisa Wapasi)</h1>

      {/* Entry form */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 18 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Naya Repayment</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label className="label-text">Date</label>
            <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Farmer Code</label>
            <input ref={codeRef} className="input-field" value={farmerCode} onChange={(e) => setFarmerCode(e.target.value)} placeholder="e.g. 42"
              onKeyDown={(e) => { if (e.key === 'Enter' && farmerFound) amountRef.current?.focus(); }} />
            {farmerCode && (
              farmerFound
                ? <div style={{ fontSize: 12, color: '#166534', fontWeight: 700, marginTop: 4 }}>✓ {farmerName}</div>
                : <div style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700, marginTop: 4 }}>Farmer nahi mila</div>
            )}
          </div>
          <div>
            <label className="label-text">Amount (₹)</label>
            <input ref={amountRef} type="number" step="0.01" min="0" className="input-field" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }} />
          </div>
          <div>
            <label className="label-text">Mode</label>
            <select className="input-field" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              {REPAYMENT_MODES.map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">Reference No. (optional)</label>
            <input className="input-field" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Txn ID / Cheque No." />
          </div>
          <div>
            <label className="label-text">Note (optional)</label>
            <input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. September dues" />
          </div>
        </div>

        {backdateWarning && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.35)', color: '#b45309', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{backdateWarning}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
            Auto Print Receipt (58mm thermal)
          </label>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '10px 22px', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Repayment'}
          </button>
        </div>
      </div>

      {/* History / filters */}
      <div className="glass-card" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
          <div>
            <label className="label-text">From</label>
            <input type="date" className="input-field" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="label-text">To</label>
            <input type="date" className="input-field" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label className="label-text">Farmer Code (optional)</label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input className="input-field" value={filterFarmer} onChange={(e) => setFilterFarmer(e.target.value)} placeholder="All farmers" style={{ paddingLeft: 32 }} />
            </div>
          </div>
          <button className="btn-secondary" onClick={loadList} disabled={loadingList} style={{ padding: '9px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} /> {loadingList ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {list.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <div style={{ padding: '6px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 999, fontSize: 13, fontWeight: 800, color: '#166534' }}>
              Total: {formatIndianCurrency(totalInRange)}
            </div>
            {Object.keys(modeTotals).map((m) => (
              <div key={m} style={{ padding: '4px 10px', background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 999, fontSize: 12, color: 'var(--ink-2)' }}>
                {modeLabel(m)}: {formatIndianCurrency(modeTotals[m])}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rows */}
      <div className="table-container">
        <table className="table-3d" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead className="table-header">
            <tr>
              <th>Date</th>
              <th>Farmer</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Mode</th>
              <th>Ref</th>
              <th>Note</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.repaymentId} className="table-row">
                <td>{(r.date || '').split('-').reverse().join('/')}</td>
                <td>
                  <div style={{ fontWeight: 700 }}>{r.farmerName || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>#{r.farmerId}</div>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#166534' }}>{formatIndianCurrency(r.amount)}</td>
                <td>{modeLabel(r.mode)}</td>
                <td style={{ fontSize: 12 }}>{r.reference || '—'}</td>
                <td style={{ fontSize: 12 }}>{r.note || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-secondary" onClick={() => rePrint(r)} style={{ padding: '6px 10px' }} title="Print receipt"><Printer size={13} /></button>
                    <button className="btn-danger" onClick={() => handleDelete(r)} style={{ padding: '6px 10px' }} title="Delete"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr className="table-row">
                <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                  {loadingList ? 'Loading…' : 'Is range mein koi repayment nahi.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FarmerRepayments;
