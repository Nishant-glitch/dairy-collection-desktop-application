import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../firebase/config';
import { isValidPin } from '../utils/passbook';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { Milk, Lock, Loader2, LogOut, Droplet, ShoppingBag, MinusCircle, Calculator } from 'lucide-react';

// Public, no-login farmer passbook at /passbook/{societyUid}. SECURE: all
// verification + data fetch happens in the getFarmerPassbook callable (Admin
// SDK). The client never reads the DB directly.
const functions = getFunctions(app, 'us-central1');
const getFarmerPassbook = httpsCallable(functions, 'getFarmerPassbook');

interface MilkRow { date: string; shift: string; qty: number; fat: number; snf: number | null; rate: number; amount: number; }
interface GrossRow { date: string; item: string; category: string; pcs: number; rate: number; amount: number; }
interface Summary { milkQty: number; milkAmount: number; grossAmount: number; deductionAmount: number; bfAmount: number; netPayable: number; }
interface PassbookData {
  farmerName: string; societyName: string; month: string; availableMonths: string[];
  milk: MilkRow[]; gross: GrossRow[]; deductions: GrossRow[]; summary: Summary;
}

type Tab = 'milk' | 'gross' | 'deductions' | 'summary';

const monthLabel = (m: string) => {
  if (!/^\d{4}-\d{2}$/.test(m)) return m;
  return new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const Passbook: React.FC<{ societyUid: string }> = ({ societyUid }) => {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<PassbookData | null>(null);
  const [tab, setTab] = useState<Tab>('milk');
  // Kept after a successful verify so month changes can re-query securely.
  const [verified, setVerified] = useState<{ code: string; pin: string } | null>(null);

  const fetchPassbook = async (farmerCode: string, farmerPin: string, month?: string) => {
    setBusy(true);
    setError('');
    try {
      const resp = await getFarmerPassbook({ societyUid, farmerCode, pin: farmerPin, month });
      const json = (resp?.data || null) as any;
      if (!json) { setError('Server se jawab nahi mila. Dobara try karein.'); return false; }
      if (!json.success) { setError(json.message || 'Verify nahi ho paaya.'); return false; }
      setData({
        farmerName: json.farmerName || farmerCode,
        societyName: json.societyName || '',
        month: json.month || '',
        availableMonths: Array.isArray(json.availableMonths) ? json.availableMonths : [],
        milk: Array.isArray(json.milk) ? json.milk : [],
        gross: Array.isArray(json.gross) ? json.gross : [],
        deductions: Array.isArray(json.deductions) ? json.deductions : [],
        summary: json.summary || { milkQty: 0, milkAmount: 0, grossAmount: 0, deductionAmount: 0, bfAmount: 0, netPayable: 0 },
      });
      return true;
    } catch (err: any) {
      setError(err?.message ? `Error: ${err.message}` : 'Network error. Internet check karein.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    const c = code.trim();
    if (!c) { setError('Farmer code daalein.'); return; }
    if (!isValidPin(pin)) { setError('4-digit PIN daalein.'); return; }
    const ok = await fetchPassbook(c, pin.trim());
    if (ok) { setVerified({ code: c, pin: pin.trim() }); setTab('milk'); }
  };

  const changeMonth = async (m: string) => {
    if (!verified) return;
    await fetchPassbook(verified.code, verified.pin, m);
  };

  const logout = () => { setData(null); setVerified(null); setPin(''); setCode(''); setError(''); setTab('milk'); };

  const wrap: React.CSSProperties = {
    minHeight: '100vh', background: 'linear-gradient(160deg,#f0fdf4,#ecfeff)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 12px',
    fontFamily: 'system-ui, sans-serif',
  };

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,#16a34a,#15803d)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Milk color="#fff" size={24} />
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#14532d' }}>Farmer Passbook</div>
          <div style={{ fontSize: 13, color: '#166534' }}>{data?.societyName || 'DCS Pro'}</div>
        </div>
      </div>

      {!data ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 10px 40px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <Lock size={18} color="#16a34a" />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#14532d' }}>Apni Passbook Dekhein</h2>
          </div>

          <label style={labelStyle}>FARMER CODE</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 59" inputMode="numeric" style={inputStyle} />

          <label style={{ ...labelStyle, marginTop: 12, display: 'block' }}>4-DIGIT PIN</label>
          <input
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••" inputMode="numeric" type="password"
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            style={{ ...inputStyle, letterSpacing: 6, textAlign: 'center', fontSize: 20 }}
          />

          {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 12, fontWeight: 500 }}>{error}</p>}

          <button onClick={handleVerify} disabled={busy} style={primaryBtn(busy)}>
            {busy && <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />}
            {busy ? 'Verify ho raha hai…' : 'Passbook Kholein'}
          </button>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 14, textAlign: 'center' }}>
            PIN society se milega. 3 baar galat PIN par 15 minute ke liye lock ho jayega.
          </p>
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: 680 }}>
          {/* Farmer + month */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#14532d' }}>{data.farmerName}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Code: {verified?.code}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select
                value={data.month}
                onChange={(e) => changeMonth(e.target.value)}
                disabled={busy}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, fontWeight: 600, color: '#14532d', background: '#fff' }}
              >
                {(data.availableMonths.length ? data.availableMonths : [data.month]).map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
              <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px 12px', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                <LogOut size={14} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: '#fff', padding: 6, borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
            <TabBtn active={tab === 'milk'} onClick={() => setTab('milk')} icon={<Droplet size={15} />} label="Milk" />
            <TabBtn active={tab === 'gross'} onClick={() => setTab('gross')} icon={<ShoppingBag size={15} />} label="Gross" />
            <TabBtn active={tab === 'deductions'} onClick={() => setTab('deductions')} icon={<MinusCircle size={15} />} label="Deductions" />
            <TabBtn active={tab === 'summary'} onClick={() => setTab('summary')} icon={<Calculator size={15} />} label="Summary" />
          </div>

          <div style={{ position: 'relative' }}>
            {busy && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
                <Loader2 size={26} color="#16a34a" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            )}

            {tab === 'milk' && (
              <Card>
                <TableScroll>
                  <table style={tableStyle}>
                    <thead><tr style={theadRow}>
                      <th style={th}>Date</th><th style={th}>Shift</th>
                      <th style={thR}>Qty(L)</th><th style={thR}>FAT</th><th style={thR}>SNF</th><th style={thR}>Rate</th><th style={thR}>Amount</th>
                    </tr></thead>
                    <tbody>
                      {data.milk.length === 0 ? <EmptyRow cols={7} /> : data.milk.map((r, i) => (
                        <tr key={i} style={bodyRow}>
                          <td style={td}>{r.date}</td><td style={td}>{r.shift}</td>
                          <td style={tdR}>{r.qty.toFixed(1)}</td><td style={tdR}>{r.fat.toFixed(1)}</td>
                          <td style={tdR}>{r.snf != null ? r.snf.toFixed(1) : '—'}</td>
                          <td style={tdR}>₹{r.rate.toFixed(2)}</td>
                          <td style={{ ...tdR, fontWeight: 700, color: '#15803d' }}>{formatIndianCurrency(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
                <TotalBar left={`Total: ${data.summary.milkQty.toFixed(1)} L`} right={formatIndianCurrency(data.summary.milkAmount)} />
              </Card>
            )}

            {tab === 'gross' && (
              <Card>
                <TableScroll>
                  <table style={tableStyle}>
                    <thead><tr style={theadRow}>
                      <th style={th}>Date</th><th style={th}>Item</th><th style={th}>Category</th>
                      <th style={thR}>Qty</th><th style={thR}>Rate</th><th style={thR}>Amount</th>
                    </tr></thead>
                    <tbody>
                      {data.gross.length === 0 ? <EmptyRow cols={6} /> : data.gross.map((r, i) => (
                        <tr key={i} style={bodyRow}>
                          <td style={td}>{r.date}</td><td style={td}>{r.item}</td><td style={td}>{r.category}</td>
                          <td style={tdR}>{r.pcs}</td><td style={tdR}>₹{r.rate.toFixed(2)}</td>
                          <td style={{ ...tdR, fontWeight: 700, color: '#b45309' }}>{formatIndianCurrency(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
                <TotalBar left="Total Gross (saman)" right={formatIndianCurrency(data.summary.grossAmount)} rightColor="#b45309" />
              </Card>
            )}

            {tab === 'deductions' && (
              <Card>
                <TableScroll>
                  <table style={tableStyle}>
                    <thead><tr style={theadRow}>
                      <th style={th}>Date</th><th style={th}>Description</th><th style={thR}>Amount</th>
                    </tr></thead>
                    <tbody>
                      {data.deductions.length === 0 ? <EmptyRow cols={3} /> : data.deductions.map((r, i) => (
                        <tr key={i} style={bodyRow}>
                          <td style={td}>{r.date}</td>
                          <td style={td}>{r.item || r.category}{r.category && r.item ? ` (${r.category})` : ''}</td>
                          <td style={{ ...tdR, fontWeight: 700, color: '#dc2626' }}>{formatIndianCurrency(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
                <TotalBar left="Total Deductions" right={formatIndianCurrency(data.summary.deductionAmount)} rightColor="#dc2626" />
              </Card>
            )}

            {tab === 'summary' && (
              <Card>
                <div style={{ padding: '8px 4px' }}>
                  <SummaryRow label="Milk Collection" value={`+ ${formatIndianCurrency(data.summary.milkAmount)}`} color="#15803d" />
                  <SummaryRow label="Gross Entries (saman)" value={`− ${formatIndianCurrency(data.summary.grossAmount)}`} color="#b45309" />
                  <SummaryRow label="Deductions" value={`− ${formatIndianCurrency(data.summary.deductionAmount)}`} color="#dc2626" />
                  <SummaryRow
                    label="Previous Balance (B/F)"
                    value={data.summary.bfAmount === 0 ? '₹0' : `${data.summary.bfAmount > 0 ? '+ ' : '− '}${formatIndianCurrency(Math.abs(data.summary.bfAmount))}`}
                    color={data.summary.bfAmount < 0 ? '#dc2626' : '#15803d'}
                  />
                  <div style={{ borderTop: '2px solid #e5e7eb', margin: '12px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px' }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Net Payable</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: data.summary.netPayable < 0 ? '#dc2626' : '#15803d' }}>
                      {formatIndianCurrency(data.summary.netPayable)}
                    </span>
                  </div>
                  {data.summary.netPayable < 0 && (
                    <p style={{ fontSize: 12, color: '#dc2626', textAlign: 'center', marginTop: 8 }}>Aapke upar society ka balance baki hai.</p>
                  )}
                </div>
              </Card>
            )}
          </div>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 16, textAlign: 'center' }}>DCS Pro — Farmer Passbook · {monthLabel(data.month)}</p>
        </div>
      )}
    </div>
  );
};

// ---- small presentational helpers ----------------------------------------

const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} style={{
    flex: 1, minWidth: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
    background: active ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'transparent',
    color: active ? '#fff' : '#6b7280',
  }}>{icon}{label}</button>
);

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>{children}</div>
);

const TableScroll: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
);

const TotalBar: React.FC<{ left: string; right: string; rightColor?: string }> = ({ left, right, rightColor = '#15803d' }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e5e7eb' }}>
    <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{left}</span>
    <span style={{ fontSize: 16, fontWeight: 800, color: rightColor }}>{right}</span>
  </div>
);

const SummaryRow: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 10px' }}>
    <span style={{ fontSize: 14, color: '#374151' }}>{label}</span>
    <span style={{ fontSize: 15, fontWeight: 700, color }}>{value}</span>
  </div>
);

const EmptyRow: React.FC<{ cols: number }> = ({ cols }) => (
  <tr><td colSpan={cols} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>Is mahine koi entry nahi.</td></tr>
);

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151' };
const inputStyle: React.CSSProperties = {
  width: '100%', marginTop: 6, padding: '11px 14px', borderRadius: 10,
  border: '1px solid #d1d5db', fontSize: 15, outline: 'none', boxSizing: 'border-box',
};
const primaryBtn = (busy: boolean): React.CSSProperties => ({
  marginTop: 18, width: '100%', padding: '12px', borderRadius: 10, border: 'none',
  background: busy ? '#9ca3af' : 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff',
  fontWeight: 700, fontSize: 15, cursor: busy ? 'not-allowed' : 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
});
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 460 };
const theadRow: React.CSSProperties = { color: '#6b7280', textAlign: 'left' };
const bodyRow: React.CSSProperties = { borderTop: '1px solid #f1f5f9' };
const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700, whiteSpace: 'nowrap' };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '9px 10px', color: '#1f2937', whiteSpace: 'nowrap' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right' };

export default Passbook;
