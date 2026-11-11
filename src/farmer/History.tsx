import React, { useEffect, useRef, useState } from 'react';
import { Droplet, ShoppingBag, MinusCircle, Calculator, LogOut, Globe, RefreshCw, WifiOff, Loader2, HandCoins, AlertTriangle } from 'lucide-react';
import { fetchPassbook, clearFarmerCache, type PassbookData, type PassbookResult } from './api';
import { clearSession, type FarmerSession } from './session';

// Post-login screen. Loads the CURRENT month first (fastest — cheapest cache
// hit) and stashes the list of available months returned by the server so the
// month selector doesn't need a second round-trip. On every month switch we
// re-hit the Cloud Function (which re-verifies the PIN — Option A).
//
// Data is re-fetched whenever the app comes back to the foreground (an
// installed PWA is usually resumed, not reopened, so mount alone isn't enough)
// and when the connection returns.

type Tab = 'milk' | 'gross' | 'deductions' | 'repayments' | 'summary';

const t = {
  hi: {
    milk: 'Milk', gross: 'Gross', deductions: 'Kaat', repayments: 'Wapasi', summary: 'Total',
    month: 'Mahina', logout: 'Logout', refresh: 'Refresh',
    offline: 'Offline — last updated',
    serverErr: 'Server se data nahi mila — thodi der baad try karein.',
    shownData: 'Purana data dikh raha hai, last updated',
    ago: 'pehle', justNow: 'abhi',
    daysAgo: 'din', hoursAgo: 'ghante', minsAgo: 'min',
    noMilk: 'Is mahine mein doodh nahi diya.',
    noGross: 'Is mahine mein koi gross entry nahi hai.',
    noDeductions: 'Is mahine mein koi katauti (advance) nahi hai.',
    noRepayments: 'Is mahine mein koi paisa wapasi nahi hui.',
    loading: 'Loading…',
    milkTotal: 'Doodh',
    grossTotal: 'Gross (saman)',
    deductTotal: 'Advance (kaat)',
    repayTotal: 'Paisa Wapasi (+)',
    bf: 'Pichhla balance (B/F)',
    net: 'Aapko milega',
    date: 'Date', shift: 'Shift', qty: 'Kg', fat: 'FAT', snf: 'SNF', rate: 'Rate', amount: 'Amount',
    item: 'Item', category: 'Category', pcs: 'Pcs',
    morning: 'Sub', evening: 'Sham',
    confirmLogout: 'Logout karein? Dobara login karna padega.',
  },
  en: {
    milk: 'Milk', gross: 'Gross', deductions: 'Deduct', repayments: 'Repaid', summary: 'Total',
    month: 'Month', logout: 'Logout', refresh: 'Refresh',
    offline: 'Offline — last updated',
    serverErr: 'Could not get data from the server — please try again shortly.',
    shownData: 'Showing saved data, last updated',
    ago: 'ago', justNow: 'just now',
    daysAgo: 'd', hoursAgo: 'h', minsAgo: 'm',
    noMilk: 'No milk records for this month.',
    noGross: 'No gross entries for this month.',
    noDeductions: 'No deductions (advance) for this month.',
    noRepayments: 'No repayments this month.',
    loading: 'Loading…',
    milkTotal: 'Milk',
    grossTotal: 'Gross (goods)',
    deductTotal: 'Advance (deducted)',
    repayTotal: 'Repayments (+)',
    bf: 'Balance Forward',
    net: 'Net payable to you',
    date: 'Date', shift: 'Shift', qty: 'Kg', fat: 'FAT', snf: 'SNF', rate: 'Rate', amount: 'Amount',
    item: 'Item', category: 'Category', pcs: 'Pcs',
    morning: 'Mor', evening: 'Eve',
    confirmLogout: 'Log out? You will need to log in again.',
  },
} as const;

// Both languages share the keys; values differ, so type by key, not literal.
type Strings = Record<keyof typeof t.hi, string>;

const monthLabel = (m: string, lang: 'hi' | 'en') => {
  if (!/^\d{4}-\d{2}$/.test(m)) return m;
  return new Date(m + '-01').toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN',
    { month: 'long', year: 'numeric' });
};

const timeAgo = (ts: number, L: Strings): string => {
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
  /** notice: shown on the login screen (e.g. "PIN badal gaya hai"). */
  onLogout: (notice?: string) => void;
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
  // Kept apart from `result` so the month picker survives a failed load.
  const [months, setMonths] = useState<string[]>([currentMonth]);
  const [error, setError] = useState('');
  const lastAttemptRef = useRef(0);
  const busyRef = useRef(false);
  const monthRef = useRef(month);
  monthRef.current = month;

  // Always network-first (the callable is a POST — never served by the
  // service worker); the cache is only a fallback when that call fails.
  const load = async (m: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    lastAttemptRef.current = Date.now();
    setBusy(true);
    setError('');
    const res = await fetchPassbook(session.societyUid, session.farmerCode, session.pin, m);
    if (res.ok) {
      setResult(res.result);
      if (res.result.data.availableMonths?.length) setMonths(res.result.data.availableMonths);
    } else {
      setResult(null); // never show another month's rows under this month
      setError(res.error.message);
      if (res.error.reLogin) {
        // Society reset the PIN / removed the farmer: the saved PIN will
        // never work again, and retrying it would only burn lockout
        // attempts. Wipe this farmer's data from the phone and log in again.
        const notice = res.error.message;
        setTimeout(() => {
          clearFarmerCache(session.societyUid, session.farmerCode);
          clearSession();
          onLogout(notice);
        }, 2500);
      } else if (res.error.locked) {
        // Server thinks this device is spamming wrong PINs — force logout
        // so the farmer can get a fresh PIN from the society.
        setTimeout(() => { clearSession(); onLogout(res.error.message); }, 2000);
      }
    }
    busyRef.current = false;
    setBusy(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(month); }, [month]);

  // Resumed from the background / connection back -> fetch fresh data.
  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastAttemptRef.current < 60_000) return;
      load(monthRef.current);
    };
    const onOnline = () => load(monthRef.current);
    document.addEventListener('visibilitychange', refreshIfStale);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', refreshIfStale);
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              {(months.includes(month) ? months : [month, ...months]).map((m) => (
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

        {/* From-cache banner: "Offline" only when the phone really has no
            connection; any other failure is a server problem. */}
        {result?.fromCache && result.cachedAt && (result.staleReason === 'offline' ? (
          <div className="farmer-info" style={{ marginBottom: 10 }}>
            <WifiOff size={16} /> {L.offline} {timeAgo(result.cachedAt, L)}
          </div>
        ) : (
          <div className="farmer-error" style={{ marginBottom: 10, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{L.serverErr}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {L.shownData} {timeAgo(result.cachedAt, L)}{result.errorCode ? ` · ${result.errorCode}` : ''}
            </div>
          </div>
        ))}

        {/* Error banner (no data could be shown, or the PIN was rejected) */}
        {error && (
          <div className="farmer-error" style={{ marginBottom: 10 }}>{error}</div>
        )}

        {/* Tabs */}
        {data && (
          <>
            <div className="farmer-tabs" role="tablist" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <TabBtn active={tab === 'milk'}       onClick={() => setTab('milk')}       icon={<Droplet size={16} />}      label={L.milk} />
              <TabBtn active={tab === 'gross'}      onClick={() => setTab('gross')}      icon={<ShoppingBag size={16} />}  label={L.gross} />
              <TabBtn active={tab === 'deductions'} onClick={() => setTab('deductions')} icon={<MinusCircle size={16} />}  label={L.deductions} />
              <TabBtn active={tab === 'repayments'} onClick={() => setTab('repayments')} icon={<HandCoins size={16} />}    label={L.repayments} />
              <TabBtn active={tab === 'summary'}    onClick={() => setTab('summary')}    icon={<Calculator size={16} />}   label={L.summary} />
            </div>

            {tab === 'milk'       && <MilkList rows={data.milk} L={L} />}
            {tab === 'gross'      && <GrossList rows={data.gross} L={L} emptyMsg={L.noGross} />}
            {tab === 'deductions' && <GrossList rows={data.deductions} L={L} emptyMsg={L.noDeductions} />}
            {tab === 'repayments' && <RepayList rows={data.repayments} L={L} emptyMsg={L.noRepayments} />}
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

const MilkList: React.FC<{ rows: any[]; L: Strings }> = ({ rows, L }) => {
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

const GrossList: React.FC<{ rows: any[]; L: Strings; emptyMsg: string }> = ({ rows, emptyMsg }) => {
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

const RepayList: React.FC<{ rows: any[]; L: Strings; emptyMsg: string }> = ({ rows, emptyMsg }) => {
  if (!rows.length) return <div className="farmer-empty">{emptyMsg}</div>;
  const modeLabels: Record<string, string> = { cash: 'Cash', bank: 'Bank', upi: 'UPI', other: 'Other' };
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className="farmer-entry">
          <div className="farmer-entry-head">
            <span>{r.date}</span>
            <span>{modeLabels[r.mode] || r.mode || '—'}</span>
          </div>
          <div className="farmer-entry-main">
            <span className="farmer-entry-main-lbl">{r.note || 'Repayment'}</span>
            <span className="farmer-entry-main-val" style={{ color: 'var(--f-brand-2)' }}>+{inr(r.amount)}</span>
          </div>
          {r.reference && <div className="farmer-entry-sub"><span>Ref: <strong>{r.reference}</strong></span></div>}
        </div>
      ))}
    </div>
  );
};

const SummaryPane: React.FC<{ s: any; L: Strings }> = ({ s, L }) => (
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
    <div className="farmer-row">
      <span className="farmer-row-label">{L.repayTotal}</span>
      <span className="farmer-row-value" style={{ color: (s.repaymentAmount || 0) > 0 ? 'var(--f-brand-2)' : 'var(--f-ink-2)' }}>
        {!s.repaymentAmount ? '—' : `+${inr(s.repaymentAmount)}`}
      </span>
    </div>
    <div className="farmer-total">
      <span className="farmer-total-label">{L.net}</span>
      <span className="farmer-total-value" style={{ color: s.netPayable < 0 ? 'var(--f-red)' : 'var(--f-brand-2)' }}>{inr(s.netPayable)}</span>
    </div>
  </div>
);

export default History;
