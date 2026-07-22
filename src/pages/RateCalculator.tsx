import React, { useState, useEffect, useMemo } from 'react';
import { ref, get } from 'firebase/database';
import { database } from '../firebase/config';
import { getRateFromMap, formatIndianCurrency } from '../utils/rateCalculator';
import { Calculator, Table as TableIcon, AlertTriangle } from 'lucide-react';

// Standalone rate lookup tool. Nothing is saved — clerks use it to answer
// "mera kitna banega" without creating a milk entry. Rate math is reused from
// utils/rateCalculator (getRateFromMap) so it can never diverge from Milk
// Collection / BMC.

const FAT_MIN = 2.5, FAT_MAX = 15.0;
const SNF_MIN = 7.5, SNF_MAX = 15.0;

const RateCalculator: React.FC = () => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [milkType, setMilkType] = useState<'cow' | 'buffalo'>('cow');
  const [fat, setFat] = useState('');
  const [snf, setSnf] = useState('');
  const [qty, setQty] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const snap = await get(ref(database, 'globalRateConfig/current'));
        if (snap.exists()) setConfig(snap.val());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fatNum = parseFloat(fat);
  const snfNum = parseFloat(snf);
  const qtyNum = parseFloat(qty);

  const fatValid = !fat || (!isNaN(fatNum) && fatNum >= FAT_MIN && fatNum <= FAT_MAX);
  const snfValid = !snf || (!isNaN(snfNum) && snfNum >= SNF_MIN && snfNum <= SNF_MAX);

  // Live rate — only when both FAT & SNF are present and in range.
  const rate = useMemo(() => {
    if (!config) return 0;
    if (isNaN(fatNum) || isNaN(snfNum)) return 0;
    if (fatNum < FAT_MIN || fatNum > FAT_MAX || snfNum < SNF_MIN || snfNum > SNF_MAX) return 0;
    return getRateFromMap(fatNum, snfNum, config) || 0;
  }, [config, fatNum, snfNum]);

  const total = !isNaN(qtyNum) && qtyNum > 0 ? rate * qtyNum : null;

  return (
    <div className="animate-fadeUp" style={{ padding: '24px 28px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Rate Calculator</h1>
        <p style={{ color: 'var(--ink-2)' }}>
          FAT/SNF daal ke turant rate dekhein. Kuch save nahi hota — sirf calculation.
        </p>
      </div>

      {!loading && !config && (
        <div className="glass-card" style={{ background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.3)', padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertTriangle color="#f87171" size={22} />
          <p style={{ color: 'var(--red)', fontWeight: 600 }}>No active rate chart found. Please contact admin to upload one.</p>
        </div>
      )}

      <div style={{ maxWidth: 460 }}>
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ padding: 8, borderRadius: 10, background: 'var(--brand-soft)' }}>
              <Calculator size={20} color="var(--brand)" />
            </div>
            <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700 }}>Rate Calculator</h2>
          </div>

          {/* Milk type toggle */}
          <div style={{ marginBottom: 16 }}>
            <label className="label-text" style={{ fontSize: 11 }}>MILK TYPE</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['cow', 'buffalo'] as const).map((mt) => (
                <button
                  key={mt}
                  onClick={() => setMilkType(mt)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', textTransform: 'capitalize',
                    border: milkType === mt ? '1.5px solid var(--brand)' : '1px solid var(--line)',
                    background: milkType === mt ? 'var(--brand-soft)' : 'var(--surface)',
                    color: milkType === mt ? 'var(--brand-strong)' : 'var(--ink-2)',
                  }}
                >
                  {mt === 'cow' ? '🐄 Cow' : '🐃 Buffalo'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label className="label-text" style={{ fontSize: 11 }}>FAT % ({FAT_MIN}–{FAT_MAX})</label>
              <input
                type="number" step="0.1" inputMode="decimal"
                value={fat} onChange={(e) => setFat(e.target.value)}
                placeholder="e.g. 4.5" className="input-field"
                style={{ borderColor: fatValid ? undefined : 'rgba(248,113,113,0.6)' }}
              />
              {!fatValid && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>Range {FAT_MIN}–{FAT_MAX}</p>}
            </div>
            <div>
              <label className="label-text" style={{ fontSize: 11 }}>SNF % ({SNF_MIN}–{SNF_MAX})</label>
              <input
                type="number" step="0.1" inputMode="decimal"
                value={snf} onChange={(e) => setSnf(e.target.value)}
                placeholder="e.g. 8.6" className="input-field"
                style={{ borderColor: snfValid ? undefined : 'rgba(248,113,113,0.6)' }}
              />
              {!snfValid && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>Range {SNF_MIN}–{SNF_MAX}</p>}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label-text" style={{ fontSize: 11 }}>QTY (LITERS) — optional</label>
            <input
              type="number" step="0.1" inputMode="decimal"
              value={qty} onChange={(e) => setQty(e.target.value)}
              placeholder="e.g. 5.5" className="input-field"
            />
          </div>

          {/* Result */}
          <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: total != null ? 10 : 0 }}>
              <span style={{ color: 'var(--ink-2)', fontSize: 14, fontWeight: 600 }}>Rate / Liter</span>
              <span style={{ color: 'var(--brand-strong)', fontSize: 26, fontWeight: 800 }}>
                {rate > 0 ? `₹${rate.toFixed(2)}` : '—'}
              </span>
            </div>
            {total != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--brand-soft)', borderRadius: 10, padding: '12px 14px' }}>
                <span style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 700 }}>Total ({qtyNum} L)</span>
                <span style={{ color: 'var(--brand-strong)', fontSize: 22, fontWeight: 800 }}>
                  {rate > 0 ? formatIndianCurrency(total) : '—'}
                </span>
              </div>
            )}
          </div>

          {config && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, color: 'var(--muted)', fontSize: 11 }}>
              <TableIcon size={13} />
              Using active rate chart effective from {config.effectiveFrom}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RateCalculator;
