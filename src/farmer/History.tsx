import React, { useEffect, useState } from 'react';
import { Droplet, ShoppingBag, MinusCircle, Calculator, LogOut, Globe, RefreshCw, WifiOff, Loader2 } from 'lucide-react';
import { fetchPassbook, type PassbookData, type PassbookResult } from './api';
import { clearSession, updateSession, type FarmerSession } from './session';

// Post-login screen. Loads the CURRENT month first (fastest — cheapest cache
// hit) and stashes the list of available months returned by the server so the
// month selector doesn't need a second round-trip. On every month switch we
// re-hit the Cloud Function (which re-verifies the PIN — Option A).

type Tab = 'milk' | 'gross' | 'deductions' | 'summary';

const t = {
  hi: {
    milk: 'Milk', gross: 'Gross', deductions: 'Kaat', summary: 'Total',
    month: 'Mahina', logout: 'Logout', refresh: 'Refresh',
    offline: 'Offline — last updated',
    ago: 'pehle', justNow: 'abhi',
    daysAgo: 'din', hoursAgo: 'ghante', minsAgo: 'min',
    noMilk: 'Is mahine mein doodh nahi diya.',
    noGross: 'Is mahine mein koi gross entry nahi hai.',
    noDeductions: 'Is mahine mein koi katauti (advance) nahi hai.',
    loading: 'Loading…',
    milkTotal: 'Doodh',
    grossTotal: 'Gross (saman)',
    deductTotal: 'Advance (kaat)',
    bf: 'Pichhla balance (B/F)',
    net: 'Aapko milega',
    date: 'Date', shift: 'Shift', qty: 'Kg', fat: 'FAT', snf: 'SNF', rate: 'Rate', amount: 'Amount',
    item: 'Item', category: 'Category', pcs: 'Pcs',
    morning: 'Sub', evening: 'Sham',
    confirmLogout: 'Logout karein? Dobara login karna padega.',
  },
  en: {
    milk: 'Milk', gross: 'Gross', deductions: 'Deduct', summary: 'Total',
    month: 'Month', logout: 'Logout', refresh: 'Refresh',
    offline: 'Offline — last updated',
    ago: 'ago', justNow: 'just now',
    daysAgo: 'd', hoursAgo: 'h', minsAgo: 'm',
    noMilk: 'No milk records for this month.',
    noGross: 'No gross entries for this month.',
    noDeductions: 'No deductions (advance) for this month.',
    loading: 'Loading…',
    milkTotal: 'Milk',
    grossTotal: 'Gross (goods)',
    deductTotal: 'Advance (deducted)',
    bf: 'Balance Forward',
    net: 'Net payable to you',
    date: 'Date', shift: 'Shift', qty: 'Kg', fat: 'FAT', snf: 'SNF', rate: 'Rate', amount: 'Amount',
    item: 'Item', category: 'Category', pcs: 'Pcs',
    morning: 'Mor', evening: 'Eve',
    confirmLogout: 'Log out? You will need to log in again.',
  },
} as const;

const monthLabel = (m: string, lang: 'hi' | 'en') => {
  if (!/^\d{4}-\d{2}$/.test(m)) return m;
  return new Date(m + '-01').toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN',
    { month: 'long', year: 'numeric' });
};

const timeAgo = (ts: number, L: typeof t.hi): string => {
  const ms = Date.now() - ts;
  if (ms < 60_000) return L.justNow;
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} ${L.minsAgo} ${L.ago}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${L.hoursAgo} ${L.ago}`;
  const d = Math.floor(h / 24);
  return `${d} ${L.daysAgo} ${L.ago}`;
};

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  session: FarmerSession;
  onLogout: () => void;
  language: 'hi' | 'en';
  onToggleLanguage: () => void;
}

const History: React.FC<Props> = ({ session, onLogout, language, onToggleLanguage }) => {
  const L = t[language];
  const currentMonth = new Date().toISOString().substring(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [tab, setTab] = useState<Tab>('milk');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PassbookResult | null>(null);
  const [error, setError] = useState('');

  const load = async (m: string) => {
    setBusy(true);
    setError('');
    const res = await fetchPassbook(session.societyUid, session.farmerCode, session.pin, m);
    if (res.ok) {
      setResult(res.result);
    } else {
      setError(res.error.message);
      // A `locked` response means the server thinks this device is
      // spamming wrong PINs — force logout so the farmer can go get a
      // fresh PIN from the society and start clean.
      if (res.error.locked) {
        setTimeout(() => { clearSession(); onLogout(); }, 2000);
      }
    }
    setBusy(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(month); }, [month]);

  const handleLogout = () => {
    if (!confirm(L.confirmLogout)) return;
    clearSession();
    onLogout();
  };

  const data: PassbookData | null = result?.data || null;

  return (
    <>
      <header className="farmer-header">
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{session.farmerName}</div>
          <div style={{ fontSize: 12, color: 'var(--f-muted)' }}>
            {session.societyName || session.societyCode} · #{session.farmerCode}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="farmer-btn farmer-btn-ghost" style={{ width: 'auto', padding: '8px 10px' }} onClick={onToggleLanguage} title="Language">
            <Globe size={16} /> {language === 'hi' ? 'EN' : 'हि'}
          </button>
          <button className="farmer-btn farmer-btn-ghost" style={{ width: 'auto', padding: '8px 10px', color: 'var(--f-red)' }} onClick={handleLogout} title={L.logout}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="farmer-container">
        {/* Month + refresh */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="farmer-label" htmlFor="mo">{L.month}</label>
            <select
              id="mo"
              className="farmer-input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={busy}
              style={{ paddingRight: 40 }}
            >
              {(data?.availableMonths || [currentMonth]).map((m) => (
                <option key={m} value={m}>{monthLabel(m, language)}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              className="farmer-btn farmer-btn-secondary"
              style={{ width: 60, minHeight: 52, padding: 0 }}
              onClick={() => load(month)}
              disabled={busy}
              aria-label={L.refresh}
              title={L.refresh}
            >
              {busy ? <Loader2 size={20} className="farmer-spinner" /> : <RefreshCw size={20} />}
            </button>
          </div>
        </div>

        {/* Offline / from-cache banner */}
        {result?.fromCache && result.cachedAt && (
          <div className="farmer-info" style={{ marginBottom: 10 }}>
            <WifiOff size={16} /> {L.offline} {timeAgo(result.cachedAt, L)}
          </div>
        )}

        {/* Error banner (shown when even cache-fallback couldn't return anything) */}
        {error && !data && (
          <div className="farmer-error">{error}</div>
        )}

        {/* Tabs */}
        {data && (
          <>
            <div className="farmer-tabs" role="tablist">
              <TabBtn active={tab === 'milk'}       onClick={() => setTab('milk')}       icon={<Droplet size={18} />}     label={L.milk} />
              <TabBtn active={tab === 'gross'}      onClick={() => setTab('gross')}      icon={<ShoppingBag size={18} />} label={L.gross} />
              <TabBtn active={tab === 'deductions'} onClick={() => setTab('deductions')} icon={<MinusCircle size={18} />} label={L.deductions} />
              <TabBtn active={tab === 'summary'}    onClick={() => setTab('summary')}    icon={<Calculator size={18} />}  label={L.summary} />
            </div>

            {tab === 'milk'       && <MilkList rows={data.milk} L={L} />}
            {tab === 'gross'      && <GrossList rows={data.gross} L={L} emptyMsg={L.noGross} />}
            {tab === 'deductions' && <GrossList rows={data.deductions} L={L} emptyMsg={L.noDeductions} />}
            {tab === 'summary'    && <SummaryPane s={data.summary} L={L} />}
          </>
        )}

        {!data && busy && (
          <div className="farmer-empty">
            <Loader2 size={28} className="farmer-spinner" style={{ color: 'var(--f-brand)' }} />
            <div style={{ marginTop: 10 }}>{L.loading}</div>
          </div>
        )}
      </div>
    </>
  );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> =
  ({ active, onClick, icon, label }) => (
    <button className={`farmer-tab ${active ? 'active' : ''}`} onClick={onClick} role="tab" aria-selected={active}>
      {icon}
      <span>{label}</span>
    </button>
  );

const MilkList: React.FC<{ rows: any[]; L: typeof t.hi }> = ({ rows, L }) => {
  if (!rows.length) return <div className="farmer-empty">{L.noMilk}</div>;
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className="farmer-entry">
          <div className="farmer-entry-head">
            <span>{r.date}</span>
            <span>{r.shift === 'Evening' ? L.evening : L.morning}</span>
          </div>
          <div className="farmer-entry-main">
            <span className="farmer-entry-main-lbl">{Number(r.qty).toFixed(1)} {L.qty}</span>
            <span className="farmer-entry-main-val">{inr(r.amount)}</span>
          </div>
          <div className="farmer-entry-sub">
            <span>{L.fat}: <strong>{Number(r.fat).toFixed(1)}</strong></span>
            {r.snf != null && <span>{L.snf}: <strong>{Number(r.snf).toFixed(1)}</strong></span>}
            <span>{L.rate}: <strong>{inr(r.rate)}</strong></span>
          </div>
        </div>
      ))}
    </div>
  );
};

const GrossList: React.FC<{ rows: any[]; L: typeof t.hi; emptyMsg: string }> = ({ rows, L, emptyMsg }) => {
  if (!rows.length) return <div className="farmer-empty">{emptyMsg}</div>;
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className="farmer-entry">
          <div className="farmer-entry-head">
            <span>{r.date}</span>
            <span>{r.category || '—'}</span>
          </div>
          <div className="farmer-entry-main">
            <span className="farmer-entry-main-lbl">{r.item || '—'}{r.pcs ? ` × ${r.pcs}` : ''}</span>
            <span className="farmer-entry-main-val" style={{ color: 'var(--f-red)' }}>{inr(r.amount)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const SummaryPane: React.FC<{ s: any; L: typeof t.hi }> = ({ s, L }) => (
  <div className="farmer-card">
    <div className="farmer-row">
      <span className="farmer-row-label">{L.milkTotal}</span>
      <span className="farmer-row-value" style={{ color: 'var(--f-brand-2)' }}>{inr(s.milkAmount)}</span>
    </div>
    <div className="farmer-row">
      <span className="farmer-row-label">{L.grossTotal}</span>
      <span className="farmer-row-value" style={{ color: 'var(--f-red)' }}>− {inr(s.grossAmount)}</span>
    </div>
    <div className="farmer-row">
      <span className="farmer-row-label">{L.deductTotal}</span>
      <span className="farmer-row-value" style={{ color: 'var(--f-red)' }}>− {inr(s.deductionAmount)}</span>
    </div>
    <div className="farmer-row">
      <span className="farmer-row-label">{L.bf}</span>
      <span className="farmer-row-value" style={{ color: s.bfAmount < 0 ? 'var(--f-red)' : s.bfAmount > 0 ? 'var(--f-brand-2)' : 'var(--f-ink-2)' }}>
        {s.bfAmount === 0 ? '—' : `${s.bfAmount > 0 ? '+' : ''}${inr(s.bfAmount)}`}
      </span>
    </div>
    <div className="farmer-total">
      <span className="farmer-total-label">{L.net}</span>
      <span className="farmer-total-value" style={{ color: s.netPayable < 0 ? 'var(--f-red)' : 'var(--f-brand-2)' }}>{inr(s.netPayable)}</span>
    </div>
  </div>
);

export default History;
