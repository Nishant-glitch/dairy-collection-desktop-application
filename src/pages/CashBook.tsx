import React, { useState, useEffect, useMemo } from 'react';
import { ref, onValue, push, set, remove, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { restoreCaret } from '../utils/focus';
import { BookOpen, Plus, Printer, Edit2, Trash2, Lock, X, Save, Wallet, AlertTriangle } from 'lucide-react';

// COMFED-style traditional double-sided Cash Book (नकद बही). Left = जमा
// (Receipts), Right = भुगतान (Payments). Data at users/{uid}/cashBook/{id};
// per-month opening balance at users/{uid}/cashBookOpening/{YYYY-MM}.

interface CashEntry {
  id: string;
  date: string;
  side: 'receipt' | 'payment';
  ledgerFolio?: string;
  accountName: string;
  particulars: string;
  voucherNo?: string;
  cashAmount: number;
  bankAmount: number;
  source: 'manual' | 'payment-register';
  sourceRef?: string | null;
  createdAt: number;
}

const ACCOUNT_OPTIONS = ['दूध उत्पादक', 'बैंक', 'अध्यक्ष', 'सचिव', 'विविध'];
const n = (v: any) => (Number(v) || 0).toFixed(2);
const monthLabel = (m: string) => /^\d{4}-\d{2}$/.test(m)
  ? new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : m;
const nextMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthCmp = (a: string, b: string) => a.localeCompare(b);

const emptyForm = () => ({
  id: '', date: new Date().toISOString().split('T')[0], side: 'receipt' as 'receipt' | 'payment',
  ledgerFolio: '', accountName: ACCOUNT_OPTIONS[0], accountOther: '', particulars: '',
  voucherNo: '', cashAmount: '', bankAmount: '',
});

const CashBook: React.FC = () => {
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
  const [viewMode, setViewMode] = useState<'month' | 'day'>('month');
  const [day, setDay] = useState(new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [openings, setOpenings] = useState<Record<string, { cashOpening: number; bankOpening: number }>>({});
  const [dcsInfo, setDcsInfo] = useState<any>({});

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [openingForm, setOpeningForm] = useState({ cashOpening: '', bankOpening: '' });

  useEffect(() => {
    const unsub = onValue(ref(database, up('cashBook')), (snap) => {
      const list: CashEntry[] = [];
      if (snap.exists()) {
        const data = snap.val();
        Object.keys(data).forEach((id) => list.push({ id, ...data[id] }));
      }
      list.sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
      setEntries(list);
    });
    const unsubOpen = onValue(ref(database, up('cashBookOpening')), (snap) => {
      setOpenings(snap.exists() ? snap.val() : {});
    });
    get(ref(database, up('dcsInfo'))).then((s) => { if (s.exists()) setDcsInfo(s.val()); });
    return () => { unsub(); unsubOpen(); };
  }, []);

  // Totals for an arbitrary month (used for carry-forward chaining).
  const monthTotals = (m: string) => {
    let rc = 0, rb = 0, pc = 0, pb = 0;
    entries.forEach((e) => {
      if (!e.date || e.date.substring(0, 7) !== m) return;
      if (e.side === 'receipt') { rc += Number(e.cashAmount) || 0; rb += Number(e.bankAmount) || 0; }
      else { pc += Number(e.cashAmount) || 0; pb += Number(e.bankAmount) || 0; }
    });
    return { rc, rb, pc, pb };
  };

  // Opening balance for the selected month = stored value if set, else carried
  // forward from the earliest stored opening by rolling closing -> next opening.
  const opening = useMemo(() => {
    const monthsWithData = new Set<string>(Object.keys(openings));
    entries.forEach((e) => e.date && monthsWithData.add(e.date.substring(0, 7)));
    const sorted = Array.from(monthsWithData).sort(monthCmp);
    if (sorted.length === 0 || monthCmp(month, sorted[0]) < 0) {
      return openings[month] || { cashOpening: 0, bankOpening: 0 };
    }
    let cash = 0, bank = 0;
    for (let cur = sorted[0]; monthCmp(cur, month) <= 0; cur = nextMonth(cur)) {
      if (openings[cur]) { cash = Number(openings[cur].cashOpening) || 0; bank = Number(openings[cur].bankOpening) || 0; }
      if (cur === month) return { cashOpening: cash, bankOpening: bank };
      const t = monthTotals(cur);
      cash = cash + t.rc - t.pc;
      bank = bank + t.rb - t.pb;
    }
    return { cashOpening: cash, bankOpening: bank };
  }, [entries, openings, month]);

  // Entries shown for the current view (whole month, or a single day).
  const inView = (e: CashEntry) =>
    viewMode === 'month' ? e.date?.substring(0, 7) === month : e.date === day;
  const receipts = entries.filter((e) => e.side === 'receipt' && inView(e));
  const payments = entries.filter((e) => e.side === 'payment' && inView(e));

  // Summary — always month-scoped for balances (a cash book balances per month).
  const t = monthTotals(month);
  const openCash = opening.cashOpening, openBank = opening.bankOpening;
  const closeCash = openCash + t.rc - t.pc;
  const closeBank = openBank + t.rb - t.pb;
  // Double-entry grand totals: receipts side = opening + receipts;
  // payments side = payments + closing. These must match.
  const grandRcCash = openCash + t.rc, grandRcBank = openBank + t.rb;
  const grandPmCash = t.pc + closeCash, grandPmBank = t.pb + closeBank;
  const balanced = Math.abs(grandRcCash - grandPmCash) < 0.01 && Math.abs(grandRcBank - grandPmBank) < 0.01;

  const openAdd = (side: 'receipt' | 'payment' = 'receipt') => {
    setForm({ ...emptyForm(), side, date: viewMode === 'day' ? day : `${month}-01` });
    setShowModal(true);
  };
  const openEdit = (e: CashEntry) => {
    if (e.source === 'payment-register') return; // locked
    const known = ACCOUNT_OPTIONS.includes(e.accountName);
    setForm({
      id: e.id, date: e.date, side: e.side, ledgerFolio: e.ledgerFolio || '',
      accountName: known ? e.accountName : 'Other', accountOther: known ? '' : e.accountName,
      particulars: e.particulars || '', voucherNo: e.voucherNo || '',
      cashAmount: e.cashAmount ? String(e.cashAmount) : '', bankAmount: e.bankAmount ? String(e.bankAmount) : '',
    });
    setShowModal(true);
  };

  const saveEntry = async () => {
    const accountName = form.accountName === 'Other' ? form.accountOther.trim() : form.accountName;
    if (!form.date || !accountName) { alert('Date aur Account Name zaroori hai.'); return; }
    const cashAmount = parseFloat(form.cashAmount) || 0;
    const bankAmount = parseFloat(form.bankAmount) || 0;
    if (cashAmount === 0 && bankAmount === 0) { alert('Cash ya Bank mein koi ek amount daalein.'); return; }
    const payload = {
      date: form.date, side: form.side, ledgerFolio: form.ledgerFolio.trim(),
      accountName, particulars: form.particulars.trim(), voucherNo: form.voucherNo.trim(),
      cashAmount, bankAmount, source: 'manual' as const, sourceRef: null,
      createdAt: Date.now(),
    };
    if (form.id) {
      // Preserve original createdAt on edit.
      const orig = entries.find((e) => e.id === form.id);
      await set(ref(database, up(`cashBook/${form.id}`)), { ...payload, createdAt: orig?.createdAt || Date.now() });
    } else {
      await push(ref(database, up('cashBook')), payload);
    }
    setShowModal(false);
  };

  const deleteEntry = async (e: CashEntry) => {
    if (e.source === 'payment-register') return;
    if (!confirm('Ye entry delete karein?')) return;
    await remove(ref(database, up(`cashBook/${e.id}`)));
    restoreCaret(); // release focus so the caret re-renders (Windows caret bug)
  };

  const saveOpening = async () => {
    await set(ref(database, up(`cashBookOpening/${month}`)), {
      cashOpening: parseFloat(openingForm.cashOpening) || 0,
      bankOpening: parseFloat(openingForm.bankOpening) || 0,
      setAt: Date.now(),
    });
    setShowOpeningModal(false);
  };

  const SideTable: React.FC<{ title: string; rows: CashEntry[]; side: 'receipt' | 'payment' }> = ({ title, rows, side }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ background: side === 'receipt' ? '#dcfce7' : '#fee2e2', color: side === 'receipt' ? '#166534' : '#991b1b', fontWeight: 800, textAlign: 'center', padding: '6px', border: '1px solid #000', fontSize: 14 }}>
        {title}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 420 }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={cbTh}>दिनांक<br /><span style={cbSub}>Date</span></th>
              <th style={cbTh}>खाता पृ.<br /><span style={cbSub}>Folio</span></th>
              <th style={cbTh}>खाता का नाम<br /><span style={cbSub}>Account</span></th>
              <th style={cbTh}>विवरण<br /><span style={cbSub}>Particulars</span></th>
              <th style={cbTh}>वा.सं.<br /><span style={cbSub}>Vou.</span></th>
              <th style={cbThR}>नकद<br /><span style={cbSub}>Cash</span></th>
              <th style={cbThR}>बैंक<br /><span style={cbSub}>Bank</span></th>
              <th className="no-print" style={cbTh}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ ...cbTd, textAlign: 'center', color: '#9ca3af' }}>Koi entry nahi</td></tr>
            ) : rows.map((e) => (
              <tr key={e.id}>
                <td style={cbTd}>{e.date}</td>
                <td style={cbTd}>{e.ledgerFolio || ''}</td>
                <td style={cbTd}>{e.accountName}</td>
                <td style={cbTd}>{e.particulars}</td>
                <td style={cbTd}>{e.voucherNo || ''}</td>
                <td style={cbTdR}>{e.cashAmount ? n(e.cashAmount) : ''}</td>
                <td style={cbTdR}>{e.bankAmount ? n(e.bankAmount) : ''}</td>
                <td className="no-print" style={{ ...cbTd, whiteSpace: 'nowrap' }}>
                  {e.source === 'payment-register' ? (
                    <span title="Ye entry Payment Register se auto-generated hai" style={{ color: '#9ca3af', display: 'inline-flex' }}><Lock size={13} /></span>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <button onClick={() => openEdit(e)} title="Edit" style={iconBtn}><Edit2 size={12} /></button>
                      <button onClick={() => deleteEntry(e)} title="Delete" style={{ ...iconBtn, color: '#dc2626' }}><Trash2 size={12} /></button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {side === 'receipt' ? (
              <>
                <tr style={cbFootRow}>
                  <td style={cbTd} colSpan={5}>Opening Balance (b/d)</td>
                  <td style={cbTdR}>{n(openCash)}</td><td style={cbTdR}>{n(openBank)}</td><td className="no-print" style={cbTd}></td>
                </tr>
                <tr style={cbFootRow}>
                  <td style={cbTd} colSpan={5}>Total Receipts</td>
                  <td style={cbTdR}>{n(t.rc)}</td><td style={cbTdR}>{n(t.rb)}</td><td className="no-print" style={cbTd}></td>
                </tr>
                <tr style={{ ...cbFootRow, fontWeight: 800, background: '#f0fdf4' }}>
                  <td style={cbTd} colSpan={5}>GRAND TOTAL</td>
                  <td style={cbTdR}>{n(grandRcCash)}</td><td style={cbTdR}>{n(grandRcBank)}</td><td className="no-print" style={cbTd}></td>
                </tr>
              </>
            ) : (
              <>
                <tr style={cbFootRow}>
                  <td style={cbTd} colSpan={5}>Total Payments</td>
                  <td style={cbTdR}>{n(t.pc)}</td><td style={cbTdR}>{n(t.pb)}</td><td className="no-print" style={cbTd}></td>
                </tr>
                <tr style={cbFootRow}>
                  <td style={cbTd} colSpan={5}>Closing Balance (c/d)</td>
                  <td style={cbTdR}>{n(closeCash)}</td><td style={cbTdR}>{n(closeBank)}</td><td className="no-print" style={cbTd}></td>
                </tr>
                <tr style={{ ...cbFootRow, fontWeight: 800, background: '#fef2f2' }}>
                  <td style={cbTd} colSpan={5}>GRAND TOTAL</td>
                  <td style={cbTdR}>{n(grandPmCash)}</td><td style={cbTdR}>{n(grandPmBank)}</td><td className="no-print" style={cbTd}></td>
                </tr>
              </>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '20px 20px' }}>
      {/* Controls */}
      <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Cash Book · नकद बही</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>COMFED double-sided cash book (जमा | भुगतान)</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input-field" style={{ width: 'auto', padding: '8px 10px' }} />
          <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            {(['month', 'day'] as const).map((v) => (
              <button key={v} onClick={() => setViewMode(v)} style={{ padding: '8px 12px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: viewMode === v ? 'var(--brand)' : '#fff', color: viewMode === v ? '#fff' : 'var(--ink-2)' }}>
                {v === 'month' ? 'Month' : 'Day'}
              </button>
            ))}
          </div>
          {viewMode === 'day' && <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="input-field" style={{ width: 'auto', padding: '8px 10px' }} />}
          <button onClick={() => { const o = openings[month]; setOpeningForm({ cashOpening: o ? String(o.cashOpening) : String(openCash), bankOpening: o ? String(o.bankOpening) : String(openBank) }); setShowOpeningModal(true); }} className="btn-secondary" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}><Wallet size={16} /> Opening Balance</button>
          <button onClick={() => openAdd('receipt')} className="btn-primary" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> Add Entry</button>
          <button onClick={() => window.print()} className="btn-secondary" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}><Printer size={16} /> Print</button>
        </div>
      </div>

      {!balanced && (
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
          <AlertTriangle size={16} /> Grand totals dono side match nahi kar rahe — data check karein.
        </div>
      )}

      {/* Report sheet (also the print target) */}
      <div id="report-sheet" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 14, borderBottom: '2px solid #000', paddingBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{dcsInfo.name || dcsInfo.societyName || 'Dairy Cooperative Society'}</div>
          {(dcsInfo.code || dcsInfo.address) && <div style={{ fontSize: 12, color: '#374151' }}>{[dcsInfo.code && `Code: ${dcsInfo.code}`, dcsInfo.address].filter(Boolean).join(' · ')}</div>}
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>CASH BOOK · नकद बही</div>
          <div style={{ fontSize: 12, color: '#374151' }}>{viewMode === 'month' ? monthLabel(month) : day}</div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }} className="cashbook-sides">
          <SideTable title="जमा · RECEIPTS" rows={receipts} side="receipt" />
          <SideTable title="भुगतान · PAYMENTS" rows={payments} side="payment" />
        </div>
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <div className="modal-overlay no-print">
          <div className="modal-box animate-fadeUp" style={{ maxWidth: 480, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{form.id ? 'Edit' : 'Add'} Cash Book Entry</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-2)' }}><X size={22} /></button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['receipt', 'payment'] as const).map((s) => (
                <button key={s} onClick={() => setForm({ ...form, side: s })} style={{ flex: 1, padding: '10px', borderRadius: 8, border: form.side === s ? '2px solid var(--brand)' : '1px solid var(--line)', background: form.side === s ? 'var(--brand-soft)' : '#fff', fontWeight: 700, cursor: 'pointer', color: 'var(--ink)' }}>
                  {s === 'receipt' ? 'जमा (Receipt)' : 'भुगतान (Payment)'}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={cbLabel}>DATE</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" /></div>
              <div><label style={cbLabel}>VOUCHER NO.</label><input value={form.voucherNo} onChange={(e) => setForm({ ...form, voucherNo: e.target.value })} className="input-field" placeholder="optional" /></div>
              <div>
                <label style={cbLabel}>खाता का नाम / ACCOUNT</label>
                <select value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} className="input-field">
                  {ACCOUNT_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  <option value="Other">Other (type)</option>
                </select>
              </div>
              <div><label style={cbLabel}>खाता पृ. सं. / FOLIO</label><input value={form.ledgerFolio} onChange={(e) => setForm({ ...form, ledgerFolio: e.target.value })} className="input-field" placeholder="optional" /></div>
              {form.accountName === 'Other' && (
                <div style={{ gridColumn: '1 / -1' }}><label style={cbLabel}>ACCOUNT NAME (custom)</label><input value={form.accountOther} onChange={(e) => setForm({ ...form, accountOther: e.target.value })} className="input-field" /></div>
              )}
              <div style={{ gridColumn: '1 / -1' }}><label style={cbLabel}>विवरण / PARTICULARS</label><input value={form.particulars} onChange={(e) => setForm({ ...form, particulars: e.target.value })} className="input-field" /></div>
              <div><label style={cbLabel}>नकद / CASH ₹</label><input type="number" step="0.01" value={form.cashAmount} onChange={(e) => setForm({ ...form, cashAmount: e.target.value })} className="input-field" placeholder="0" /></div>
              <div><label style={cbLabel}>बैंक / BANK ₹</label><input type="number" step="0.01" value={form.bankAmount} onChange={(e) => setForm({ ...form, bankAmount: e.target.value })} className="input-field" placeholder="0" /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={saveEntry} className="btn-primary" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Save size={16} /> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Opening balance modal */}
      {showOpeningModal && (
        <div className="modal-overlay no-print">
          <div className="modal-box animate-fadeUp" style={{ maxWidth: 400, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Opening Balance — {monthLabel(month)}</h2>
              <button onClick={() => setShowOpeningModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-2)' }}><X size={22} /></button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 16 }}>Agla mahina iska closing balance apne aap opening ban jayega. Set karne par ye mahina override hoga.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={cbLabel}>CASH ₹</label><input type="number" step="0.01" value={openingForm.cashOpening} onChange={(e) => setOpeningForm({ ...openingForm, cashOpening: e.target.value })} className="input-field" /></div>
              <div><label style={cbLabel}>BANK ₹</label><input type="number" step="0.01" value={openingForm.bankOpening} onChange={(e) => setOpeningForm({ ...openingForm, bankOpening: e.target.value })} className="input-field" /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowOpeningModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={saveOpening} className="btn-primary" style={{ flex: 2 }}>Save Opening</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const cbTh: React.CSSProperties = { border: '1px solid #000', padding: '4px 5px', fontSize: 10, fontWeight: 700, textAlign: 'left', verticalAlign: 'top' };
const cbThR: React.CSSProperties = { ...cbTh, textAlign: 'right' };
const cbSub: React.CSSProperties = { fontSize: 8, color: '#6b7280', fontWeight: 400 };
const cbTd: React.CSSProperties = { border: '1px solid #000', padding: '4px 5px', fontSize: 11, color: '#111827' };
const cbTdR: React.CSSProperties = { ...cbTd, textAlign: 'right' };
const cbFootRow: React.CSSProperties = { background: '#fafafa', fontWeight: 600 };
const cbLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', display: 'block', marginBottom: 4 };
const iconBtn: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: 'var(--ink-2)', display: 'inline-flex' };

export default CashBook;
