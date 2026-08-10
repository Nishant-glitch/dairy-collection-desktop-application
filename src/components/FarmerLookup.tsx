import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { Search, X, User, Phone, MapPin, Landmark, KeyRound, Droplet, Calendar, Wallet, ExternalLink } from 'lucide-react';
import { bfForMonth, latestFinalizedMonth } from '../utils/farmerBalances';

// Global quick farmer lookup — reachable from any page via the navbar search
// icon or Ctrl+K. Shows a farmer's details + today's collection + this month's
// total + pending balance, with a shortcut to the full profile.

interface Farmer { code: string; farmerName: string; mobileNo?: string; address?: string; bankName?: string; bankAC?: string; pinHash?: string; }
interface Stats { todayQty: number; todayAmount: number; monthQty: number; monthAmount: number; bfBalance: number | null; bfMonth: string; }

const FarmerLookup: React.FC<{ onNavigate?: (page: string) => void }> = ({ onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Farmer | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onValue(ref(database, up('farmers')), (snap) => {
      const list: Farmer[] = [];
      if (snap.exists()) {
        const data = snap.val();
        Object.keys(data).forEach((code) => list.push({ code, ...data[code] }));
      }
      setFarmers(list);
    });
    return () => unsub();
  }, []);

  // Ctrl+K / Cmd+K to open, Esc to close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); }
      if (e.key === 'Escape') { setOpen(false); setSelected(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  const matches = q.trim()
    ? farmers.filter((f) => f.code.toLowerCase().includes(q.trim().toLowerCase()) || (f.farmerName || '').toLowerCase().includes(q.trim().toLowerCase())).slice(0, 20)
    : [];

  const selectFarmer = async (f: Farmer) => {
    setSelected(f);
    setLoadingStats(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const month = today.substring(0, 7);
      const [mcSnap, balSnap] = await Promise.all([
        get(ref(database, up('milkCollection'))),
        get(ref(database, up(`farmerBalances/${f.code}`))),
      ]);
      let todayQty = 0, todayAmount = 0, monthQty = 0, monthAmount = 0;
      const mc = mcSnap.exists() ? mcSnap.val() : {};
      Object.keys(mc).forEach((date) => {
        if (!date.startsWith(month)) return;
        Object.values(mc[date] || {}).forEach((shift: any) => {
          const e = shift?.[f.code];
          if (!e) return;
          const qty = Number(e.qty) || 0, amt = Number(e.amount) || 0;
          monthQty += qty; monthAmount += amt;
          if (date === today) { todayQty += qty; todayAmount += amt; }
        });
      });
      // Show the LATEST finalized month's balance (from either the new
      // per-month path or the legacy scalar). Popover just wants "how much
      // does this farmer carry right now", not per-month history.
      const balNode = balSnap.exists() ? balSnap.val() : null;
      const latestMonth = latestFinalizedMonth(balNode);
      const latestBalance = latestMonth ? bfForMonth(balNode, latestMonth) : null;
      setStats({
        todayQty, todayAmount, monthQty, monthAmount,
        bfBalance: latestBalance,
        bfMonth: latestMonth || '',
      });
    } finally {
      setLoadingStats(false);
    }
  };

  const close = () => { setOpen(false); setSelected(null); setQ(''); setStats(null); };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Farmer lookup (Ctrl+K)"
        className="btn-secondary"
        style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Search size={15} />
        <span className="hidden md:inline" style={{ fontSize: 12, color: 'var(--ink-2)' }}>Farmer</span>
      </button>

      {open && (
        <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '8vh' }} onClick={close}>
          <div className="modal-box animate-fadeUp" style={{ maxWidth: 520, width: '92%', padding: 0, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            {/* Search bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
              <Search size={18} color="var(--ink-2)" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setSelected(null); }}
                placeholder="Farmer code ya naam se search karein…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent', color: 'var(--ink)' }}
              />
              <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-2)' }}><X size={20} /></button>
            </div>

            {!selected ? (
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {q.trim() === '' ? (
                  <p style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Code ya naam type karein… (Ctrl+K se kahin se bhi khulega)</p>
                ) : matches.length === 0 ? (
                  <p style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Koi farmer nahi mila.</p>
                ) : matches.map((f) => (
                  <button key={f.code} onClick={() => selectFarmer(f)} style={{ width: '100%', textAlign: 'left', padding: '11px 18px', border: 'none', borderBottom: '1px solid var(--line)', background: '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--brand-soft)', color: 'var(--brand-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{f.code}</span>
                      <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>{f.farmerName || 'Unknown'}</span>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{f.mobileNo || ''}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ padding: 18, maxHeight: '70vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--brand-soft)', color: 'var(--brand-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{selected.code}</div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{selected.farmerName || 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Code: {selected.code}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <Detail icon={<Phone size={13} />} label="Mobile" value={selected.mobileNo || '—'} />
                  <Detail icon={<MapPin size={13} />} label="Address" value={selected.address || '—'} />
                  <Detail icon={<Landmark size={13} />} label="Bank" value={selected.bankName || '—'} />
                  <Detail icon={<KeyRound size={13} />} label="Passbook PIN" value={selected.pinHash ? 'Set ✓' : 'Not set'} valueColor={selected.pinHash ? '#16a34a' : 'var(--muted)'} />
                </div>

                {loadingStats ? (
                  <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 12 }}>Loading…</p>
                ) : stats && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <StatBox icon={<Droplet size={15} />} color="#2563eb" label="Aaj" qty={stats.todayQty} amt={stats.todayAmount} />
                    <StatBox icon={<Calendar size={15} />} color="#16a34a" label="Is Mahine" qty={stats.monthQty} amt={stats.monthAmount} />
                    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)', borderRadius: 10, padding: '10px 14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)', fontSize: 13, fontWeight: 600 }}><Wallet size={15} /> Pending Balance (B/F)</span>
                      <span style={{ fontWeight: 800, fontSize: 15, color: stats.bfBalance == null ? 'var(--muted)' : stats.bfBalance < 0 ? '#dc2626' : '#16a34a' }}>
                        {stats.bfBalance == null ? '—' : formatIndianCurrency(stats.bfBalance)}{stats.bfMonth ? ` (${stats.bfMonth})` : ''}
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setSelected(null)} className="btn-secondary" style={{ flex: 1 }}>← Back</button>
                  <button
                    onClick={() => { if (onNavigate) onNavigate('farmer-master'); close(); }}
                    className="btn-primary"
                    style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <ExternalLink size={15} /> Full Profile
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const Detail: React.FC<{ icon: React.ReactNode; label: string; value: string; valueColor?: string }> = ({ icon, label, value, valueColor }) => (
  <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-2)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 700 }}>{icon}{label}</div>
    <div style={{ color: valueColor || 'var(--ink)', fontSize: 13, fontWeight: 600, marginTop: 2, wordBreak: 'break-word' }}>{value}</div>
  </div>
);

const StatBox: React.FC<{ icon: React.ReactNode; color: string; label: string; qty: number; amt: number }> = ({ icon, color, label, qty, amt }) => (
  <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{icon}{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{qty.toFixed(1)} <span style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 500 }}>L</span></div>
    <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{formatIndianCurrency(amt)}</div>
  </div>
);

export default FarmerLookup;
