import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, get, push, set, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { getRateFromMap } from '../utils/rateCalculator';
import { handleEnterNav } from '../utils/formNav';
import { restoreCaret } from '../utils/focus';
import { Snowflake, Calendar, Clock, CheckCircle, Trash2, Edit2, History } from 'lucide-react';

interface BMC {
  bmcId: string;
  name: string;
  code?: string;
}

interface BMCEntryRecord {
  entryId: string;
  date: string;
  shift: 'morning' | 'evening';
  milkType: 'cow' | 'buffalo';
  bmcId: string;
  bmcName: string;
  quantityKg: number;
  fat: number;
  snf: number;
  rate: number;
  amount: number;
  createdAt: number;
}

const BMCEntry: React.FC = () => {
  const { t } = useLanguage();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shift, setShift] = useState<'morning' | 'evening'>('morning');
  const [milkType, setMilkType] = useState<'cow' | 'buffalo'>('cow');
  const [editId, setEditId] = useState<string | null>(null);
  const [bmcId, setBmcId] = useState('');
  const [quantityKg, setQuantityKg] = useState('');
  const [fat, setFat] = useState('');
  const [snf, setSnf] = useState('');
  const [rate, setRate] = useState(0);
  const [amount, setAmount] = useState(0);

  const [bmcs, setBmcs] = useState<BMC[]>([]);
  const [rateConfig, setRateConfig] = useState<any>(null);
  const [todayEntries, setTodayEntries] = useState<BMCEntryRecord[]>([]);
  const [showSavedMessage, setShowSavedMessage] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Allowed FAT/SNF ranges (same convention as Milk Collection).
  const FAT_MIN = 2.5, FAT_MAX = 15.0;
  const SNF_MIN = 7.5, SNF_MAX = 15.0;

  const qtyRef = useRef<HTMLInputElement>(null);
  const fatRef = useRef<HTMLInputElement>(null);
  const snfRef = useRef<HTMLInputElement>(null);

  const safeNum = (val: any): number => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  // Same date-aware rate-chart resolution as MilkCollection: pick the chart
  // effective on the entry's date from the versioned history, so a back-dated
  // entry uses the era-appropriate rate. Falls back to /current if no history.
  const getConfigForDate = async (collectionDate: string) => {
    const historySnap = await get(ref(database, 'globalRateConfig/history'));
    if (historySnap.exists()) {
      const configs = (Object.values(historySnap.val()) as any[])
        .filter((c: any) => c && c.effectiveFrom)
        .sort((a: any, b: any) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
      if (configs.length > 0) {
        const valid = [...configs].reverse().find((c: any) => c.effectiveFrom <= collectionDate);
        return valid || configs[0];
      }
    }
    const currentSnap = await get(ref(database, 'globalRateConfig/current'));
    return currentSnap.exists() ? currentSnap.val() : null;
  };

  useEffect(() => {
    const bmcRef = ref(database, up('bmcMaster'));
    const unsubscribe = onValue(bmcRef, (snapshot) => {
      const list: BMC[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach((id) => {
          list.push({ bmcId: id, name: data[id].name, code: data[id].code });
        });
      }
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setBmcs(list);
    });
    return unsubscribe;
  }, []);

  // Load the applicable rate chart whenever the date changes.
  useEffect(() => {
    let active = true;
    getConfigForDate(date).then((config) => {
      if (active) setRateConfig(config);
    });
    return () => { active = false; };
  }, [date]);

  // Recent entries for the selected date (both shifts).
  useEffect(() => {
    const entriesRef = ref(database, up('bmcEntries'));
    return onValue(entriesRef, (snapshot) => {
      const list: BMCEntryRecord[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach((id) => {
          const entry = data[id];
          if (entry.date === date) {
            list.push({ entryId: id, ...entry });
          }
        });
      }
      setTodayEntries(list);
    });
  }, [date]);

  // Live rate + amount calculation — reuses RateChart's getRateFromMap exactly,
  // so BMC rate can never diverge from the farmer-level milk rate. Rate is
  // per-unit; amount = quantity (KG) × rate (direct, per project decision).
  useEffect(() => {
    if (!fat || !snf || !rateConfig) {
      setRate(0);
      setAmount(0);
      return;
    }
    try {
      const r = getRateFromMap(parseFloat(fat) || 0, parseFloat(snf) || 0, rateConfig);
      setRate(r || 0);
      setAmount(safeNum(r) * (parseFloat(quantityKg) || 0));
    } catch (err) {
      console.error('Rate calc error:', err);
      setRate(0);
      setAmount(0);
    }
  }, [quantityKg, fat, snf, rateConfig]);

  const clearForm = () => {
    setEditId(null);
    setBmcId('');
    setQuantityKg('');
    setFat('');
    setSnf('');
    setRate(0);
    setAmount(0);
    setErrorMsg('');
  };

  const handleEdit = (entry: BMCEntryRecord) => {
    // FarmerMaster-style edit: re-populate the form, then Save updates in place.
    setEditId(entry.entryId);
    setDate(entry.date);
    setShift(entry.shift);
    setMilkType(entry.milkType || 'cow');
    setBmcId(entry.bmcId);
    setQuantityKg(entry.quantityKg.toString());
    setFat(entry.fat.toString());
    setSnf(entry.snf.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    // Enter in any field submits the form — preventDefault stops the page reload.
    e.preventDefault();
    handleSave();
  };

  const handleSave = async () => {
    if (!bmcId) {
      alert('Please select a BMC!');
      return;
    }
    if (!quantityKg || !fat || !snf) {
      alert('Quantity, FAT and SNF are required!');
      return;
    }

    // Range validation — block save if FAT/SNF are outside the allowed range.
    const fatVal = parseFloat(fat);
    const snfVal = parseFloat(snf);
    if (fatVal < FAT_MIN || fatVal > FAT_MAX) {
      setErrorMsg(`FAT ${FAT_MIN} se ${FAT_MAX.toFixed(1)} ke beech hona chahiye`);
      fatRef.current?.focus();
      return;
    }
    if (snfVal < SNF_MIN || snfVal > SNF_MAX) {
      setErrorMsg(`SNF ${SNF_MIN} se ${SNF_MAX.toFixed(1)} ke beech hona chahiye`);
      snfRef.current?.focus();
      return;
    }
    setErrorMsg('');

    if (!rateConfig) {
      alert('No rate chart found for this date. Please contact admin to upload a rate chart.');
      return;
    }

    const bmc = bmcs.find((b) => b.bmcId === bmcId);

    const entryData = {
      date,
      shift,
      milkType,
      bmcId,
      bmcName: bmc?.name || '',
      quantityKg: parseFloat(quantityKg),
      fat: parseFloat(fat),
      snf: parseFloat(snf),
      rate,
      amount,
      createdAt: Date.now(),
    };

    if (editId) {
      await set(ref(database, up(`bmcEntries/${editId}`)), entryData);
    } else {
      const newRef = push(ref(database, up('bmcEntries')));
      await set(newRef, entryData);
    }

    clearForm();
    setShowSavedMessage(true);
    setTimeout(() => setShowSavedMessage(false), 1500);
  };

  const handleDelete = async (entryId: string) => {
    if (confirm('Are you sure you want to delete this entry?')) {
      await remove(ref(database, up(`bmcEntries/${entryId}`)));
      restoreCaret(qtyRef.current); // restore cursor (Windows caret bug)
    }
  };

  const totalQty = todayEntries.reduce((sum, e) => sum + safeNum(e?.quantityKg), 0);
  const totalAmount = todayEntries.reduce((sum, e) => sum + safeNum(e?.amount), 0);

  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: '8px', fontSize: '11px', fontWeight: 700,
    letterSpacing: '0.5px', color: 'var(--ink-2)',
  };

  return (
    <div className="page-wrapper animate-fadeIn">
      {showSavedMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-green-500 text-white font-black shadow-2xl flex items-center gap-3 animate-bounce" style={{ padding: '12px 24px' }}>
          <CheckCircle size={20} /> BMC ENTRY SAVED
        </div>
      )}

      <h1 className="page-title flex items-center gap-2" style={{ marginBottom: 24 }}>
        <Snowflake size={22} className="text-sky-400" />
        {t('bmcEntry')}
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '28px', alignItems: 'start' }}>
        {/* Left Panel: New Entry Form */}
        <div>
          <div className="glass-card" style={{ padding: '28px' }}>
            <h2 className="text-lg font-bold text-[#11211A] flex items-center gap-2" style={{ marginBottom: '24px' }}>
              <Snowflake size={20} className="text-sky-400" />
              New BMC Entry
            </h2>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label className="label-text flex items-center gap-2" style={labelStyle}>
                  <Calendar size={14} className="text-blue-400" /> DATE
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="input-field"
                  style={{ padding: '11px 14px', fontSize: '14px' }}
                />
              </div>

              <div>
                <label className="label-text flex items-center gap-2" style={labelStyle}>
                  <Clock size={14} className="text-amber-400" /> SHIFT
                </label>
                <div className="flex gap-2 bg-black/5 rounded-xl border border-slate-200" style={{ padding: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setShift('morning')}
                    style={{ padding: '10px 0' }}
                    className={`flex-1 rounded-lg text-xs font-black transition-all ${shift === 'morning' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-[#11211A]'}`}
                  >
                    MORNING
                  </button>
                  <button
                    type="button"
                    onClick={() => setShift('evening')}
                    style={{ padding: '10px 0' }}
                    className={`flex-1 rounded-lg text-xs font-black transition-all ${shift === 'evening' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-[#11211A]'}`}
                  >
                    EVENING
                  </button>
                </div>
              </div>

              <div>
                <label className="label-text" style={labelStyle}>MILK TYPE</label>
                <div className="flex gap-2 bg-black/5 rounded-xl border border-slate-200" style={{ padding: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setMilkType('cow')}
                    style={{ padding: '10px 0' }}
                    className={`flex-1 rounded-lg text-xs font-black transition-all ${milkType === 'cow' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-[#11211A]'}`}
                  >
                    COW
                  </button>
                  <button
                    type="button"
                    onClick={() => setMilkType('buffalo')}
                    style={{ padding: '10px 0' }}
                    className={`flex-1 rounded-lg text-xs font-black transition-all ${milkType === 'buffalo' ? 'bg-violet-600 text-white shadow-lg' : 'text-slate-500 hover:text-[#11211A]'}`}
                  >
                    BUFFALO
                  </button>
                </div>
              </div>

              <div>
                <label className="label-text" style={labelStyle}>BMC</label>
                <select
                  value={bmcId}
                  onChange={(e) => setBmcId(e.target.value)}
                  className="input-field"
                  style={{ padding: '11px 14px', fontSize: '14px', width: '100%' }}
                >
                  <option value="">Select BMC</option>
                  {bmcs.map((b) => (
                    <option key={b.bmcId} value={b.bmcId}>
                      {b.name}{b.code ? ` (${b.code})` : ''}
                    </option>
                  ))}
                </select>
                {bmcs.length === 0 && (
                  <p className="text-amber-400 text-[10px] font-bold" style={{ marginTop: '6px' }}>
                    No BMCs found. Add one in BMC Master first.
                  </p>
                )}
              </div>

              <div>
                <label className="label-text" style={labelStyle}>QUANTITY (KG)</label>
                <input
                  ref={qtyRef}
                  type="number"
                  step="0.1"
                  value={quantityKg}
                  onChange={(e) => setQuantityKg(e.target.value)}
                  onKeyDown={(e) => handleEnterNav(e, fatRef)}
                  className="input-field"
                  style={{ padding: '11px 14px', fontSize: '14px' }}
                  placeholder="0.0"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="label-text" style={labelStyle}>FAT (%)</label>
                  <input
                    ref={fatRef}
                    type="number"
                    step="0.1"
                    value={fat}
                    onChange={(e) => { setFat(e.target.value); setErrorMsg(''); }}
                    onKeyDown={(e) => handleEnterNav(e, snfRef)}
                    className="input-field"
                    style={{ padding: '11px 14px', fontSize: '14px' }}
                    placeholder="0.0"
                  />
                </div>
                <div>
                  <label className="label-text" style={labelStyle}>SNF (%)</label>
                  <input
                    ref={snfRef}
                    type="number"
                    step="0.1"
                    value={snf}
                    onChange={(e) => { setSnf(e.target.value); setErrorMsg(''); }}
                    onKeyDown={(e) => handleEnterNav(e, handleSave)}
                    className="input-field"
                    style={{ padding: '11px 14px', fontSize: '14px' }}
                    placeholder="0.0"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold" style={{ padding: '10px 12px' }}>
                  ⚠️ {errorMsg}
                </div>
              )}

              <div style={{ padding: '16px 18px', borderRadius: '14px', background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Rate</span>
                  <span className="text-[#11211A] font-black text-lg">₹{safeNum(rate).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px' }} className="border-t border-slate-200">
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-2)' }}>Total Amount</span>
                  <span className="text-2xl font-black text-green-500">₹{safeNum(amount).toFixed(2)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '14px', paddingTop: '4px' }}>
                <button type="button" onClick={clearForm} className="btn-secondary" style={{ flex: 1, padding: '13px', fontSize: '14px', fontWeight: 700 }}>{editId ? 'Cancel' : 'Clear'}</button>
                <button type="submit" className={`btn-primary ${editId ? 'from-amber-500 to-orange-600' : ''}`} style={{ flex: 2, padding: '13px', fontSize: '14px', fontWeight: 800 }}>{editId ? 'Update Entry' : 'Save Entry'}</button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Panel: Summary & Recent Entries */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <div className="glass-card" style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Total QTY</p>
              <p style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)' }}>{totalQty.toFixed(2)} <span style={{ fontSize: '12px', color: 'var(--muted)' }}>KG</span></p>
            </div>
            <div className="glass-card" style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Total Amount</p>
              <p style={{ fontSize: '22px', fontWeight: 900, color: 'var(--brand)' }}>₹{totalAmount.toFixed(2)}</p>
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="border-b border-slate-200 flex justify-between items-center" style={{ padding: '20px' }}>
              <h2 className="text-md font-bold text-[#11211A] flex items-center gap-2">
                <History size={18} className="text-amber-500" />
                Entries for {new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </h2>
              <span className="rounded-md bg-black/5 text-slate-500 text-[10px] font-bold uppercase tracking-wider" style={{ padding: '4px 10px' }}>
                {todayEntries.length} Records
              </span>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
              <table className="w-full text-left border-collapse">
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr className="bg-[#F8FAF9]">
                    {['Shift', 'Type', 'BMC', 'Qty (KG)', 'FAT', 'SNF', 'Rate', 'Amount', ''].map((h, i) => (
                      <th key={i} style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }} className={i === 8 ? 'text-right' : ''}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {todayEntries.sort((a, b) => safeNum(b?.createdAt) - safeNum(a?.createdAt)).map((entry) => (
                    <tr key={entry.entryId} className="hover:bg-black/5 transition-colors">
                      <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>{entry.shift}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, textTransform: 'capitalize', color: (entry.milkType || 'cow') === 'cow' ? '#34d399' : '#a78bfa' }}>{entry.milkType || 'cow'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{entry.bmcName}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{safeNum(entry?.quantityKg).toFixed(2)}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--blue)', fontWeight: 700 }}>{safeNum(entry?.fat).toFixed(1)}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--brand)', fontWeight: 700 }}>{safeNum(entry?.snf).toFixed(1)}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink-2)' }}>₹{safeNum(entry?.rate).toFixed(2)}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 800, color: 'var(--brand)' }}>₹{safeNum(entry?.amount).toFixed(2)}</td>
                      <td style={{ padding: '12px 16px' }} className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(entry)}
                            className="rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-[#11211A] transition-all"
                            style={{ padding: '8px' }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.entryId)}
                            className="rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-[#11211A] transition-all"
                            style={{ padding: '8px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {todayEntries.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center text-slate-500 text-sm font-medium" style={{ padding: '48px' }}>
                        No BMC entries found for this date
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BMCEntry;
