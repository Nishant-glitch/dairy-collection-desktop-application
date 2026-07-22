import React, { useState } from 'react';
import { isValidPin } from '../utils/passbook';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { Milk, Lock, Loader2, LogOut, Droplet, Calendar, IndianRupee } from 'lucide-react';

// Public, no-login farmer passbook. Reached at /passbook/{societyUid}.
// SECURE version: all verification + data fetch happens in the getFarmerPassbook
// Cloud Function (Admin SDK). The client never reads the database directly, so
// pinHash and other farmers' data are never exposed.

// Deployed function URL. Override via VITE_PASSBOOK_FN_URL if the deploy prints
// a different host (gen-2 functions may use a *.run.app URL).
const FN_URL =
  (import.meta as any).env?.VITE_PASSBOOK_FN_URL ||
  'https://us-central1-farmerdb-ba9b0.cloudfunctions.net/getFarmerPassbook';

interface HistoryRow {
  date: string; shift: string; qty: number; fat: number; snf: number | null; rate: number; amount: number;
}
interface PassbookData {
  farmerName: string; societyName: string;
  today: { qty: number; amount: number };
  thisMonth: { qty: number; amount: number };
  history: HistoryRow[];
}

const Passbook: React.FC<{ societyUid: string }> = ({ societyUid }) => {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<PassbookData | null>(null);

  const handleVerify = async () => {
    setError('');
    const c = code.trim();
    if (!c) { setError('Farmer code daalein.'); return; }
    if (!isValidPin(pin)) { setError('4-digit PIN daalein.'); return; }

    setBusy(true);
    try {
      const resp = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societyUid, farmerCode: c, pin: pin.trim() }),
      });
      const json = await resp.json().catch(() => null);
      if (!json) { setError('Server se jawab nahi mila. Dobara try karein.'); return; }
      if (!json.success) { setError(json.message || 'Verify nahi ho paaya.'); return; }
      setData({
        farmerName: json.farmerName || c,
        societyName: json.societyName || '',
        today: json.today || { qty: 0, amount: 0 },
        thisMonth: json.thisMonth || { qty: 0, amount: 0 },
        history: Array.isArray(json.history) ? json.history : [],
      });
    } catch {
      setError('Network error. Internet check karein.');
    } finally {
      setBusy(false);
    }
  };

  const logout = () => { setData(null); setPin(''); setCode(''); setError(''); };

  const wrap: React.CSSProperties = {
    minHeight: '100vh', background: 'linear-gradient(160deg,#f0fdf4,#ecfeff)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px',
    fontFamily: 'system-ui, sans-serif',
  };

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
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

          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>FARMER CODE</label>
          <input
            value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 101" inputMode="numeric"
            style={inputStyle}
          />

          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 12, display: 'block' }}>4-DIGIT PIN</label>
          <input
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••" inputMode="numeric" type="password"
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            style={{ ...inputStyle, letterSpacing: 6, textAlign: 'center', fontSize: 20 }}
          />

          {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 12, fontWeight: 500 }}>{error}</p>}

          <button
            onClick={handleVerify} disabled={busy}
            style={{ marginTop: 18, width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: busy ? '#9ca3af' : 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff',
              fontWeight: 700, fontSize: 15, cursor: busy ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {busy && <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />}
            {busy ? 'Verify ho raha hai…' : 'Passbook Kholein'}
          </button>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 14, textAlign: 'center' }}>
            PIN society se milega. 3 baar galat PIN par 15 minute ke liye lock ho jayega.
          </p>
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: 640 }}>
          {/* Verified header */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#14532d' }}>{data.farmerName}</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>Code: {code.trim()}</div>
            </div>
            <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              <LogOut size={15} /> Band karein
            </button>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <SummaryCard icon={<Droplet size={18} />} color="#2563eb" label="Aaj" qty={data.today.qty} amt={data.today.amount} />
            <SummaryCard icon={<Calendar size={18} />} color="#16a34a" label="Is Mahine" qty={data.thisMonth.qty} amt={data.thisMonth.amount} />
          </div>

          {/* History */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#14532d', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IndianRupee size={16} /> Poori History
            </h3>
            {data.history.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', padding: 20 }}>Abhi koi entry nahi.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: '#6b7280', textAlign: 'left' }}>
                      <th style={thStyle}>Date</th><th style={thStyle}>Shift</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>FAT</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Rate</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={tdStyle}>{r.date}</td>
                        <td style={tdStyle}>{r.shift}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{r.qty.toFixed(1)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{r.fat.toFixed(1)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>₹{r.rate.toFixed(2)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{formatIndianCurrency(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 16, textAlign: 'center' }}>DCS Pro — Farmer Passbook</p>
        </div>
      )}
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%', marginTop: 6, padding: '11px 14px', borderRadius: 10,
  border: '1px solid #d1d5db', fontSize: 15, outline: 'none', boxSizing: 'border-box',
};
const thStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: '9px 10px', color: '#1f2937' };

const SummaryCard: React.FC<{ icon: React.ReactNode; color: string; label: string; qty: number; amt: number }> = ({ icon, color, label, qty, amt }) => (
  <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color, marginBottom: 8 }}>{icon}<span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span></div>
    <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{qty.toFixed(1)} <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>L</span></div>
    <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d', marginTop: 2 }}>{formatIndianCurrency(amt)}</div>
  </div>
);

export default Passbook;
