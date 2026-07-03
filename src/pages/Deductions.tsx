import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, set, remove, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { Plus, FileText, BarChart2, X, Edit2, Trash2, Calculator, ShoppingBag, ArrowLeft, Printer } from 'lucide-react';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { handleEnterNav } from '../utils/formNav';

interface GrossEntry {
  id: string;
  date: string;
  item: string;
  category: string;
  pcs: number;
  rate: number;
  amount: number;
  timestamp: number;
}

const Deductions: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'newEntry' | 'grossReport' | 'deductionReport' | 'grossCollection' | null>(null);

  // New Gross Collection states (2-step popup, flat grossEntries/{entryId})
  const CATEGORIES = ['Cattle Feed', 'Medicine', 'Advance', 'Store', 'Other'];
  const [gcStep, setGcStep] = useState(1);
  const [gcDate, setGcDate] = useState(new Date().toISOString().split('T')[0]);
  const [gcCode, setGcCode] = useState('');
  const [gcName, setGcName] = useState('');
  const [gcFound, setGcFound] = useState(false);
  const [gcItem, setGcItem] = useState('');
  const [gcCategory, setGcCategory] = useState('Cattle Feed');
  const [gcQty, setGcQty] = useState('');
  const [gcRate, setGcRate] = useState('');
  const gcCodeRef = useRef<HTMLInputElement>(null);
  const gcItemRef = useRef<HTMLInputElement>(null);
  const gcCategoryRef = useRef<HTMLSelectElement>(null);
  const gcQtyRef = useRef<HTMLInputElement>(null);
  const gcRateRef = useRef<HTMLInputElement>(null);
  const [gcList, setGcList] = useState<any[]>([]);
  const [gcSaved, setGcSaved] = useState(false);
  const [gcEditPath, setGcEditPath] = useState<string | null>(null);

  // New Entry states
  const [step, setStep] = useState(1);
  const [selectedFarmerCode, setSelectedFarmerCode] = useState('');
  const [selectedFarmerName, setSelectedFarmerName] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [item, setItem] = useState('');
  const [category, setCategory] = useState('Cattle Feed');
  const [pcs, setPcs] = useState('');
  const [entryRate, setEntryRate] = useState('');
  const [isModifyingEntry, setIsModifyingEntry] = useState(false);
  const [entryIdToEdit, setEntryIdToEdit] = useState('');
  const [grossEntries, setGrossEntries] = useState<GrossEntry[]>([]);

  // Report states
  const [reportFarmerCode, setReportFarmerCode] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportData, setReportData] = useState<any[]>([]);
  const [deductionMonth, setDeductionMonth] = useState(new Date().toISOString().substring(0, 7));
  const [deductionReportData, setDeductionReportData] = useState<any[]>([]);

  const [farmers, setFarmers] = useState<any>({});
  
  const itemRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = loadFarmers();
    return unsubscribe;
  }, []);

  // Live list of ALL Gross Entries (both old "New Entry" and new "Gross
  // Collection") from the shared grossEntries node. Normal shape is a nested
  // per-farmer bucket (grossEntries/{farmerCode}/{entryId}); any legacy flat
  // entry (grossEntries/{entryId} with a direct string `date`) is tolerated.
  useEffect(() => {
    return onValue(ref(database, up('grossEntries')), (snap) => {
      const list: any[] = [];
      if (snap.exists()) {
        const data = snap.val();
        Object.keys(data).forEach((key) => {
          const v = data[key];
          if (!v || typeof v !== 'object') return;
          if (typeof v.date === 'string') {
            // Legacy flat entry.
            list.push({ _path: key, farmerCode: v.farmerCode || key, ...v });
          } else {
            // Per-farmer bucket: key is the farmer code.
            Object.keys(v).forEach((entryId) => {
              const e = v[entryId];
              if (e && typeof e === 'object') {
                list.push({ _path: `${key}/${entryId}`, farmerCode: key, ...e });
              }
            });
          }
        });
      }
      list.sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));
      setGcList(list);
    });
  }, []);

  useEffect(() => {
    if (selectedFarmerCode && activeSection === 'newEntry' && step === 2) {
      const unsubscribe = loadGrossEntries();
      return unsubscribe;
    }
  }, [selectedFarmerCode, activeSection, step]);

  const loadFarmers = () => {
    const farmersRef = ref(database, up('farmers'));
    return onValue(farmersRef, (snapshot) => {
      if (snapshot.exists()) {
        setFarmers(snapshot.val());
      }
    });
  };

  const loadGrossEntries = () => {
    const grossRef = ref(database, up(`grossEntries/${selectedFarmerCode}`));
    return onValue(grossRef, (snapshot) => {
      const entries: GrossEntry[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach((key) => {
          entries.push({ id: key, ...data[key] });
        });
      }
      setGrossEntries(entries.sort((a, b) => b.timestamp - a.timestamp));
    });
  };

  const handleNewEntryClick = () => {
    setActiveSection('newEntry');
    setStep(1);
    setSelectedFarmerCode('');
    setSelectedFarmerName('');
    setEntryDate(new Date().toISOString().split('T')[0]);
    clearEntryForm();
  };

  const handleGrossReportClick = () => {
    setActiveSection('grossReport');
    setReportFarmerCode('');
    setFromDate('');
    setToDate('');
    setReportData([]);
  };

  const handleDeductionReportClick = () => {
    setActiveSection('deductionReport');
    setDeductionMonth(new Date().toISOString().substring(0, 7));
    setDeductionReportData([]);
  };

  // ---- New Gross Collection (2-step popup) ----
  const resetGrossCollection = () => {
    setGcStep(1);
    setGcDate(new Date().toISOString().split('T')[0]);
    setGcCode('');
    setGcName('');
    setGcFound(false);
    setGcItem('');
    setGcCategory('Cattle Feed');
    setGcQty('');
    setGcRate('');
  };

  const handleGrossCollectionClick = () => {
    resetGrossCollection();
    setActiveSection('grossCollection');
  };

  const handleGcNext = () => {
    if (!gcDate) {
      alert('Please select a date!');
      return;
    }
    setGcStep(2);
    setTimeout(() => gcCodeRef.current?.focus(), 100);
  };

  // Resolve farmer name as the code is typed so a wrong code is caught early.
  const handleGcCodeChange = (code: string) => {
    setGcCode(code);
    const farmer = farmers[code];
    if (farmer) {
      setGcName(farmer.farmerName || farmer.name || '');
      setGcFound(true);
    } else {
      setGcName('');
      setGcFound(false);
    }
  };

  // Enter on the Farmer Code field: only advance if the code is valid.
  const handleGcCodeEnter = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!gcFound) {
      alert('Farmer not found! Please enter a valid farmer code.');
      gcCodeRef.current?.focus();
      return;
    }
    gcItemRef.current?.focus();
  };

  const gcAmount = (parseFloat(gcQty) || 0) * (parseFloat(gcRate) || 0);

  const handleSaveGrossCollection = async () => {
    if (!gcFound) {
      alert('Farmer not found! Please enter a valid farmer code.');
      gcCodeRef.current?.focus();
      return;
    }
    if (!gcItem || !gcCategory || !gcQty || !gcRate) {
      alert('All fields are required!');
      return;
    }

    // Save into the SAME structure as the existing Gross Entries
    // (grossEntries/{farmerCode}/{entryId}) so old and new entries appear
    // together everywhere — same field names: item, pcs, rate, amount, etc.
    const entry = {
      date: gcDate,
      item: gcItem,
      category: gcCategory,
      pcs: parseFloat(gcQty),
      rate: parseFloat(gcRate),
      amount: gcAmount,
      timestamp: Date.now(),
    };

    if (gcEditPath) {
      const origCode = gcEditPath.split('/')[0];
      if (origCode === gcCode) {
        await set(ref(database, up(`grossEntries/${gcEditPath}`)), entry);
      } else {
        // Farmer code changed — move the entry to the new farmer's bucket.
        await remove(ref(database, up(`grossEntries/${gcEditPath}`)));
        await push(ref(database, up(`grossEntries/${gcCode}`)), entry);
      }
    } else {
      await push(ref(database, up(`grossEntries/${gcCode}`)), entry);
    }

    // Clear for the next entry (keep the Date), refocus Farmer Code — the
    // form stays open so the user can keep entering, like Milk Collection.
    clearGcForm();
    setGcSaved(true);
    setTimeout(() => setGcSaved(false), 2000);
  };

  // Clear the entry fields but keep the selected Date; return focus to code.
  const clearGcForm = () => {
    setGcEditPath(null);
    setGcCode('');
    setGcName('');
    setGcFound(false);
    setGcItem('');
    setGcCategory('Cattle Feed');
    setGcQty('');
    setGcRate('');
    setTimeout(() => gcCodeRef.current?.focus(), 50);
  };

  const handleEditGrossEntry = (e: any) => {
    setGcEditPath(e._path);
    setGcDate(e.date || new Date().toISOString().split('T')[0]);
    const code = e.farmerCode || '';
    setGcCode(code);
    setGcName(e.farmerName || farmers[code]?.farmerName || farmers[code]?.name || '');
    setGcFound(!!farmers[code]);
    setGcItem(e.item || e.itemName || '');
    setGcCategory(e.category || 'Cattle Feed');
    setGcQty((e.pcs ?? e.qty ?? '').toString());
    setGcRate((e.rate ?? '').toString());
    setGcStep(2);
    setActiveSection('grossCollection');
    setTimeout(() => gcCodeRef.current?.focus(), 100);
  };

  const handleDeleteGrossEntry = async (path: string) => {
    if (confirm('Delete this gross entry?')) {
      await remove(ref(database, up(`grossEntries/${path}`)));
    }
  };

  const handleNextStep = () => {
    if (!selectedFarmerCode || !entryDate) {
      alert('Please enter Farmer Code and Date!');
      return;
    }

    const farmer = farmers[selectedFarmerCode];
    if (!farmer) {
      alert('Farmer not found!');
      return;
    }

    setSelectedFarmerName(farmer.farmerName);
    setStep(2);
    setTimeout(() => {
      itemRef.current?.focus();
    }, 100);
  };

  const clearEntryForm = () => {
    setItem('');
    setCategory('Cattle Feed');
    setPcs('');
    setEntryRate('');
    setIsModifyingEntry(false);
    setEntryIdToEdit('');
  };

  const handleSaveEntry = async () => {
    if (!item || !category || !pcs || !entryRate) {
      alert('All fields are required!');
      return;
    }

    const amount = parseFloat(pcs) * parseFloat(entryRate);
    const entryData = {
      date: entryDate,
      item,
      category,
      pcs: parseFloat(pcs),
      rate: parseFloat(entryRate),
      amount,
      timestamp: Date.now(),
    };

    if (isModifyingEntry && entryIdToEdit) {
      const entryRef = ref(database, up(`grossEntries/${selectedFarmerCode}/${entryIdToEdit}`));
      await set(entryRef, entryData);
    } else {
      const grossRef = ref(database, up(`grossEntries/${selectedFarmerCode}`));
      await push(grossRef, entryData);
    }

    clearEntryForm();
    itemRef.current?.focus();
  };

  const handleModifyEntry = (entry: GrossEntry) => {
    setItem(entry.item);
    setCategory(entry.category);
    setPcs(entry.pcs.toString());
    setEntryRate(entry.rate.toString());
    setIsModifyingEntry(true);
    setEntryIdToEdit(entry.id);
    itemRef.current?.focus();
  };

  const handleDeleteEntry = async (id: string) => {
    if (confirm('Are you sure you want to delete this entry?')) {
      const entryRef = ref(database, up(`grossEntries/${selectedFarmerCode}/${id}`));
      await remove(entryRef);
    }
  };

  const handleGenerateGrossReport = async () => {
    const grossEntriesRef = ref(database, up('grossEntries'));
    const snapshot = await get(grossEntriesRef);

    const reportEntries: any[] = [];

    if (snapshot.exists()) {
      const allEntries = snapshot.val();
      Object.keys(allEntries).forEach((farmerId) => {
        const farmerEntries = allEntries[farmerId];
        // Skip flat "Gross Collection" entries (grossEntries/{entryId}); this
        // report is for the nested per-farmer deduction buckets only.
        if (farmerEntries && typeof farmerEntries.date === 'string') return;
        Object.keys(farmerEntries).forEach((entryId) => {
          const entry = farmerEntries[entryId];
          if (reportFarmerCode && farmerId !== reportFarmerCode) return;
          if (fromDate && entry.date < fromDate) return;
          if (toDate && entry.date > toDate) return;

          reportEntries.push({
            farmerCode: farmerId,
            farmerName: farmers[farmerId]?.farmerName || 'Unknown',
            ...entry,
          });
        });
      });
    }

    reportEntries.sort((a, b) => a.farmerCode.localeCompare(b.farmerCode) || a.date.localeCompare(b.date));
    setReportData(reportEntries);
  };

  const handleGenerateDeductionReport = async () => {
    const grossEntriesRef = ref(database, up('grossEntries'));
    const snapshot = await get(grossEntriesRef);

    const farmerTotals: any = {};

    if (snapshot.exists()) {
      const allEntries = snapshot.val();
      Object.keys(allEntries).forEach((farmerId) => {
        const farmerEntries = allEntries[farmerId];
        // Skip flat "Gross Collection" entries (grossEntries/{entryId}).
        if (farmerEntries && typeof farmerEntries.date === 'string') return;
        let totalAmount = 0;
        let totalCount = 0;

        Object.values(farmerEntries).forEach((entry: any) => {
          if (entry.date.startsWith(deductionMonth)) {
            totalAmount += entry.amount || 0;
            totalCount++;
          }
        });

        if (totalCount > 0) {
          farmerTotals[farmerId] = {
            farmerCode: farmerId,
            farmerName: farmers[farmerId]?.farmerName || 'Unknown',
            totalEntries: totalCount,
            totalAmount,
          };
        }
      });
    }

    const reportArray = Object.values(farmerTotals).sort((a: any, b: any) =>
      a.farmerCode.localeCompare(b.farmerCode)
    );
    setDeductionReportData(reportArray);
  };

  const totalEntryAmount = grossEntries.reduce((sum, e) => sum + e.amount, 0);
  const labelStyle: React.CSSProperties = { color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' };

  if (activeSection === null) {
    return (
      <div className="page-wrapper animate-fadeIn">
        {gcSaved && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-green-500 text-white font-black shadow-2xl flex items-center gap-3 animate-bounce" style={{ padding: '12px 24px' }}>
            <span style={{ fontSize: 18 }}>✓</span> Entry saved successfully
          </div>
        )}
        <h1 className="page-title">Deductions & Gross Entries</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 option-cards-grid">
          <div onClick={handleNewEntryClick} className="stat-card-3d cursor-pointer hover:translate-y-[-2px]" style={{ height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '12px', padding: '20px' }}>
            <div style={{ width: 36, height: 36, background: 'var(--surface-2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={22} color="var(--brand-strong)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 700 }}>New Entry</h2>
              <p style={{ color: 'var(--ink-2)', fontSize: 12, opacity: 0.7 }}>Add Farmer Gross Entry</p>
            </div>
          </div>

          <div onClick={handleGrossCollectionClick} className="stat-card-3d cursor-pointer hover:translate-y-[-2px]" style={{ height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '12px', padding: '20px' }}>
            <div style={{ width: 36, height: 36, background: 'var(--surface-2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingBag size={22} color="#7C3AED" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 700 }}>New Gross Collection</h2>
              <p style={{ color: 'var(--ink-2)', fontSize: 12, opacity: 0.7 }}>Quick 2-step entry</p>
            </div>
          </div>

          <div onClick={handleGrossReportClick} className="stat-card-3d cursor-pointer hover:translate-y-[-2px]" style={{ height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '12px', padding: '20px' }}>
            <div style={{ width: 36, height: 36, background: 'var(--surface-2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={22} color="#2563EB" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 700 }}>Farmer Gross</h2>
              <p style={{ color: 'var(--ink-2)', fontSize: 12, opacity: 0.7 }}>Detailed Report</p>
            </div>
          </div>

          <div onClick={handleDeductionReportClick} className="stat-card-3d cursor-pointer hover:translate-y-[-2px]" style={{ height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '12px', padding: '20px' }}>
            <div style={{ width: 36, height: 36, background: 'var(--surface-2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart2 size={22} color="#D97706" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 700 }}>Monthly Summary</h2>
              <p style={{ color: 'var(--ink-2)', fontSize: 12, opacity: 0.7 }}>Deduction Totals</p>
            </div>
          </div>
        </div>

        {/* All Gross Entries (old "New Entry" + new "Gross Collection") */}
        <div className="glass-card overflow-hidden" style={{ marginTop: 24 }}>
          <div className="border-b border-slate-200 flex justify-between items-center" style={{ padding: '20px' }}>
            <h2 className="text-md font-bold text-[#11211A] flex items-center gap-2">
              <ShoppingBag size={18} className="text-purple-400" />
              Gross Entries
            </h2>
            <span className="rounded-md bg-black/5 text-slate-500 text-[10px] font-bold uppercase tracking-wider" style={{ padding: '4px 10px' }}>
              {gcList.length} Records
            </span>
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <table className="w-full text-left border-collapse">
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr className="bg-[#F8FAF9]">
                  {['Date', 'Code', 'Farmer Name', 'Item', 'Category', 'Qty', 'Rate', 'Amount', ''].map((h, i) => (
                    <th key={i} style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }} className={i === 8 ? 'text-right' : ''}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {gcList.map((e) => {
                  // Older entries may lack some fields — show "—" instead of erroring.
                  const name = e.farmerName || farmers[e.farmerCode]?.farmerName || farmers[e.farmerCode]?.name || 'N/A';
                  const item = e.item || e.itemName || '—';
                  const qty = e.pcs ?? e.qty;
                  const hasRate = e.rate !== undefined && e.rate !== null && e.rate !== '';
                  const hasAmt = e.amount !== undefined && e.amount !== null && e.amount !== '';
                  return (
                    <tr key={e._path} className="hover:bg-black/5 transition-colors">
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink-2)' }}>{e.date || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{e.farmerCode || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>{name}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>{item}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px' }}>{e.category ? <span className="bg-black/5 rounded text-[10px] text-slate-400" style={{ padding: '4px 8px' }}>{e.category}</span> : '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>{qty ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink-2)' }}>{hasRate ? `₹${Number(e.rate).toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 800, color: 'var(--brand)' }}>{hasAmt ? `₹${Number(e.amount).toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '12px 16px' }} className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEditGrossEntry(e)}
                            className="rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-[#11211A] transition-all"
                            style={{ padding: '8px' }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteGrossEntry(e._path)}
                            className="rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-[#11211A] transition-all"
                            style={{ padding: '8px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {gcList.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-slate-500 text-sm font-medium" style={{ padding: '40px' }}>
                      No gross entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === 'newEntry') {
    return (
      <div className="page-wrapper animate-fadeIn">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setActiveSection(null)} className="p-2 rounded-lg bg-black/5 text-slate-500 hover:bg-black/5 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>New Gross Entry</h1>
        </div>

        {step === 1 && (
          <div className="modal-overlay">
            <div className="modal-3d animate-fadeIn" style={{ padding: '28px', maxWidth: '400px', width: '90%' }}>
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--ink)', marginBottom: '20px' }}>Select Farmer & Date</h2>
              <div className="space-y-4">
                <div style={{ marginBottom: '16px' }}>
                  <label className="label-text" style={{ marginBottom: '6px' }}>Farmer Code</label>
                  <input
                    type="text"
                    value={selectedFarmerCode}
                    onChange={(e) => setSelectedFarmerCode(e.target.value)}
                    className="input-3d"
                    style={{ padding: '10px 14px', fontSize: '14px' }}
                    placeholder="e.g. F001"
                    autoFocus
                  />
                </div>
                <div style={{ marginBottom: '0' }}>
                  <label className="label-text" style={{ marginBottom: '6px' }}>Entry Date</label>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="input-3d"
                    style={{ padding: '10px 14px', fontSize: '14px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <button
                    onClick={() => setActiveSection(null)}
                    style={{
                      flex: 1, padding: '12px',
                      background: 'rgba(148,163,184,0.1)',
                      border: '1px solid rgba(148,163,184,0.2)',
                      borderRadius: 10, color: 'var(--ink-2)',
                      fontWeight: 600, fontSize: 14, cursor: 'pointer'
                    }}
                  >
                    ✕ Close
                  </button>
                  <button
                    onClick={handleNextStep}
                    style={{
                      flex: 2, padding: '12px',
                      background: 'linear-gradient(135deg, #4ade80, #16a34a)',
                      border: 'none', borderRadius: 10,
                      color: '#0f172a', fontWeight: 700,
                      fontSize: 14, cursor: 'pointer'
                    }}
                  >
                    Next Step →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', gap: '28px', alignItems: 'flex-start' }}>
            <div style={{ width: '360px', flexShrink: 0 }}>
              <div className="glass-card" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--ink)', marginBottom: '16px' }}>Add Item</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ marginBottom: '14px' }}>
                    <label className="label-text">Item Name</label>
                    <input
                      ref={itemRef}
                      type="text"
                      value={item}
                      onChange={(e) => setItem(e.target.value)}
                      className="input-3d"
                      placeholder="e.g. Cattle Feed"
                    />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label className="label-text">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="input-3d"
                    >
                      <option value="Cattle Feed">Cattle Feed</option>
                      <option value="Medicine">Medicine</option>
                      <option value="Advance">Advance</option>
                      <option value="Store">Store</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2" style={{ gap: '12px', marginBottom: '14px' }}>
                    <div>
                      <label className="label-text">Pcs/Qty</label>
                      <input
                        type="number"
                        value={pcs}
                        onChange={(e) => setPcs(e.target.value)}
                        className="input-3d"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="label-text">Rate</label>
                      <input
                        type="number"
                        value={entryRate}
                        onChange={(e) => setEntryRate(e.target.value)}
                        className="input-3d"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div style={{ padding: '14px', background: 'var(--surface-2)', borderRadius: '10px', marginBottom: '16px' }}>
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--ink-2)', fontSize: '12px' }}>Total Amount:</span>
                      <span style={{ color: 'var(--brand)', fontWeight: 800, fontSize: '18px' }}>₹{(parseFloat(pcs || '0') * parseFloat(entryRate || '0')).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={clearEntryForm} className="btn-secondary" style={{ flex: 1, padding: '10px' }}>Clear</button>
                    <button onClick={handleSaveEntry} className="btn-3d" style={{ flex: 2, padding: '10px' }}>{isModifyingEntry ? 'Update' : 'Add Entry'}</button>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-black/5">
                  <div>
                    <h3 className="text-[#11211A] font-bold">{selectedFarmerName} ({selectedFarmerCode})</h3>
                    <p className="text-slate-400 text-xs">Entries for {entryDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400 text-[10px] uppercase font-bold">Total</p>
                    <p className="text-lg font-black text-green-400">₹{totalEntryAmount.toFixed(2)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-2)' }}>Item</th>
                        <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-2)' }}>Category</th>
                        <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-2)' }}>Qty</th>
                        <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-2)' }}>Rate</th>
                        <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-2)' }}>Amount</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {grossEntries.filter(e => e.date === entryDate).map((entry) => (
                        <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td style={{ padding: '14px 16px', color: 'var(--ink-2)', fontSize: '14px', fontWeight: 'bold' }}>{entry.item}</td>
                          <td style={{ padding: '14px 16px' }}><span className="bg-black/5 px-2 py-1 rounded text-[10px] text-slate-400">{entry.category}</span></td>
                          <td style={{ padding: '14px 16px', color: 'var(--ink)', fontSize: '14px' }}>{entry.pcs}</td>
                          <td style={{ padding: '14px 16px', color: 'var(--ink-2)', fontSize: '14px' }}>₹{entry.rate.toFixed(2)}</td>
                          <td style={{ padding: '14px 16px', fontWeight: 900, color: 'var(--brand)', fontSize: '14px' }}>₹{entry.amount.toFixed(2)}</td>
                          <td style={{ padding: '14px 16px' }}>
                            <div className="flex justify-center gap-2">
                              <button onClick={() => handleModifyEntry(entry)} className="p-2 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-[#11211A] transition-all"><Edit2 size={14} /></button>
                              <button onClick={() => handleDeleteEntry(entry.id)} className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-[#11211A] transition-all"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {grossEntries.filter(e => e.date === entryDate).length === 0 && (
                        <tr><td colSpan={6} className="p-12 text-center text-slate-500 italic">No entries for this date.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeSection === 'grossReport') {
    return (
      <div className="page-wrapper animate-fadeIn">
        <div className="flex items-center gap-4 mb-6 no-print">
          <button onClick={() => setActiveSection(null)} className="p-2 rounded-lg bg-black/5 text-slate-500 hover:bg-black/5 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Farmer Gross Report</h1>
          {reportData.length > 0 && (
            <button onClick={() => window.print()} className="btn-3d flex items-center gap-2 px-6" style={{ marginLeft: 'auto' }}>
              <Printer size={18} /> Print Report
            </button>
          )}
        </div>

        <div className="glass-card no-print" style={{ padding: '20px 24px', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '16px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--ink-2)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Farmer Code</label>
              <input type="text" value={reportFarmerCode} onChange={(e) => setReportFarmerCode(e.target.value)} className="input-3d" placeholder="All Farmers" />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--ink-2)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-3d" />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--ink-2)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-3d" />
            </div>
            <button onClick={handleGenerateGrossReport} className="btn-3d py-3">Generate Report</button>
          </div>
        </div>

        {reportData.length > 0 && (
          <div
            id="report-sheet"
            style={{ background: '#fff', maxWidth: '920px', margin: '0 auto', padding: '28px 32px', borderRadius: '4px', boxShadow: '0 12px 48px rgba(0,0,0,0.45)', color: '#111' }}
          >
            <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #111', paddingBottom: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111', margin: 0 }}>Farmer Gross Report</h2>
              <p style={{ fontSize: 12, color: '#555', margin: '6px 0 0' }}>
                {reportFarmerCode ? `Farmer: ${reportFarmerCode}` : 'All Farmers'}
                {(fromDate || toDate) ? ` | ${fromDate || '…'} to ${toDate || '…'}` : ''}
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Date', 'Farmer', 'Item', 'Category', 'Qty', 'Rate', 'Amount'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 700, color: '#111', borderBottom: '2px solid #333', textAlign: i >= 4 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportData.map((entry, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd' }}>{entry.date}</td>
                    <td style={{ padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd', fontWeight: 700 }}>{entry.farmerName} ({entry.farmerCode})</td>
                    <td style={{ padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd' }}>{entry.item}</td>
                    <td style={{ padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd' }}>{entry.category}</td>
                    <td style={{ padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{entry.pcs}</td>
                    <td style={{ padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd', textAlign: 'right' }}>₹{entry.rate.toFixed(2)}</td>
                    <td style={{ padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 700 }}>₹{entry.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ padding: '10px', textAlign: 'right', fontWeight: 800, fontSize: '13px', borderTop: '2px solid #333' }}>Total Amount</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, fontSize: '14px', borderTop: '2px solid #333' }}>₹{reportData.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (activeSection === 'deductionReport') {
    return (
      <div className="page-wrapper animate-fadeIn">
        <div className="flex items-center gap-4 mb-6 no-print">
          <button onClick={() => setActiveSection(null)} className="p-2 rounded-lg bg-black/5 text-slate-500 hover:bg-black/5 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Monthly Deduction Summary</h1>
          {deductionReportData.length > 0 && (
            <button onClick={() => window.print()} className="btn-3d flex items-center gap-2 px-6" style={{ marginLeft: 'auto' }}>
              <Printer size={18} /> Print Report
            </button>
          )}
        </div>

        <div className="glass-card no-print" style={{ padding: '20px 24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
            <div className="flex-1">
              <label style={{ display: 'block', color: 'var(--ink-2)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Select Month</label>
              <input type="month" value={deductionMonth} onChange={(e) => setDeductionMonth(e.target.value)} className="input-3d" />
            </div>
            <button onClick={handleGenerateDeductionReport} className="btn-3d py-3 px-8">Generate Summary</button>
          </div>
        </div>

        {deductionReportData.length > 0 && (
          <div
            id="report-sheet"
            style={{ background: '#fff', maxWidth: '920px', margin: '0 auto', padding: '28px 32px', borderRadius: '4px', boxShadow: '0 12px 48px rgba(0,0,0,0.45)', color: '#111' }}
          >
            <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #111', paddingBottom: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111', margin: 0 }}>Monthly Deduction Summary</h2>
              <p style={{ fontSize: 12, color: '#555', margin: '6px 0 0' }}>Month: {deductionMonth}</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Farmer Code', 'Farmer Name', 'Total Entries', 'Total Deduction Amount'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 700, color: '#111', borderBottom: '2px solid #333', textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deductionReportData.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd', fontWeight: 700 }}>{row.farmerCode}</td>
                    <td style={{ padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd' }}>{row.farmerName}</td>
                    <td style={{ padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd' }}>{row.totalEntries} items</td>
                    <td style={{ padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 700 }}>₹{row.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ padding: '10px', textAlign: 'right', fontWeight: 800, fontSize: '13px', borderTop: '2px solid #333' }}>Grand Total</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, fontSize: '14px', borderTop: '2px solid #333' }}>₹{deductionReportData.reduce((sum, row) => sum + row.totalAmount, 0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (activeSection === 'grossCollection') {
    // Right-side table + stats show only the entries for the date currently
    // selected in the form, so the table and the stat cards always match.
    const gcDayList = gcList.filter((e) => e.date === gcDate);
    const gcTotalAmount = gcDayList.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    return (
      <div className="page-wrapper animate-fadeIn">
        {gcSaved && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-green-500 text-white font-black shadow-2xl flex items-center gap-3 animate-bounce" style={{ padding: '12px 24px' }}>
            <span style={{ fontSize: 18 }}>✓</span> Entry saved successfully
          </div>
        )}

        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => { resetGrossCollection(); setActiveSection(null); }} className="p-2 rounded-lg bg-black/5 text-slate-500 hover:bg-black/5 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>New Gross Collection</h1>
        </div>

        {/* Step 1 — small date popup */}
        {gcStep === 1 && (
          <div className="modal-overlay">
            <div className="modal-3d animate-fadeIn" style={{ padding: '28px', maxWidth: '440px', width: '90%' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--ink)' }}>Select Date</h2>
                <button onClick={() => { resetGrossCollection(); setActiveSection(null); }} style={{ color: 'var(--ink-2)', cursor: 'pointer', background: 'none', border: 'none' }}>
                  <X size={24} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input
                    type="date"
                    value={gcDate}
                    onChange={(e) => setGcDate(e.target.value)}
                    onKeyDown={(e) => handleEnterNav(e, handleGcNext)}
                    className="input-3d"
                    style={{ padding: '10px 14px', fontSize: '14px' }}
                    autoFocus
                  />
                </div>
                <button onClick={handleGcNext} className="btn-3d" style={{ padding: '12px', fontSize: '14px', fontWeight: 700 }}>Next →</button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — persistent split layout (form + live table) */}
        {gcStep === 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '28px', alignItems: 'start' }}>
            {/* Left: entry form */}
            <div className="glass-card" style={{ padding: '28px' }}>
              <h2 className="text-lg font-bold text-[#11211A] flex items-center gap-2" style={{ marginBottom: '24px' }}>
                <ShoppingBag size={20} className="text-purple-400" />
                {gcEditPath ? 'Edit Entry' : 'New Entry'}
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input
                    type="date"
                    value={gcDate}
                    onChange={(e) => setGcDate(e.target.value)}
                    className="input-3d"
                    style={{ padding: '10px 14px', fontSize: '14px' }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Farmer Code</label>
                  <input
                    ref={gcCodeRef}
                    type="text"
                    value={gcCode}
                    onChange={(e) => handleGcCodeChange(e.target.value)}
                    onKeyDown={handleGcCodeEnter}
                    className="input-3d"
                    style={{ padding: '10px 14px', fontSize: '14px' }}
                    placeholder="e.g. F001"
                    autoFocus
                  />
                  {gcCode && gcFound && (
                    <p style={{ color: 'var(--brand)', fontSize: 13, fontWeight: 700, marginTop: 6 }}>✓ {gcName}</p>
                  )}
                  {gcCode && !gcFound && (
                    <p style={{ color: 'var(--red)', fontSize: 13, fontWeight: 700, marginTop: 6 }}>✗ Farmer not found</p>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Item Name</label>
                  <input
                    ref={gcItemRef}
                    type="text"
                    value={gcItem}
                    onChange={(e) => setGcItem(e.target.value)}
                    onKeyDown={(e) => handleEnterNav(e, gcCategoryRef)}
                    className="input-3d"
                    style={{ padding: '10px 14px', fontSize: '14px' }}
                    placeholder="e.g. Cattle Feed 50kg"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Category</label>
                  <select
                    ref={gcCategoryRef}
                    value={gcCategory}
                    onChange={(e) => setGcCategory(e.target.value)}
                    onKeyDown={(e) => handleEnterNav(e, gcQtyRef)}
                    className="input-3d"
                    style={{ padding: '10px 14px', fontSize: '14px' }}
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2" style={{ gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Pcs / Qty</label>
                    <input
                      ref={gcQtyRef}
                      type="number"
                      value={gcQty}
                      onChange={(e) => setGcQty(e.target.value)}
                      onKeyDown={(e) => handleEnterNav(e, gcRateRef)}
                      className="input-3d"
                      style={{ padding: '10px 14px', fontSize: '14px' }}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Rate</label>
                    <input
                      ref={gcRateRef}
                      type="number"
                      value={gcRate}
                      onChange={(e) => setGcRate(e.target.value)}
                      onKeyDown={(e) => handleEnterNav(e, handleSaveGrossCollection)}
                      className="input-3d"
                      style={{ padding: '10px 14px', fontSize: '14px' }}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div style={{ padding: '16px 18px', borderRadius: '14px', background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                  <div className="flex justify-between items-center">
                    <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-2)' }}>Amount (Qty × Rate)</span>
                    <span className="text-2xl font-black text-green-500">₹{gcAmount.toFixed(2)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '14px' }}>
                  <button onClick={clearGcForm} className="btn-secondary" style={{ flex: 1, padding: '13px', fontSize: '14px', fontWeight: 700 }}>Clear</button>
                  <button onClick={handleSaveGrossCollection} className="btn-3d" style={{ flex: 2, padding: '13px', fontSize: '14px', fontWeight: 800 }}>{gcEditPath ? 'Update Entry' : 'Save Entry'}</button>
                </div>
              </div>
            </div>

            {/* Right: stats + live table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="glass-card" style={{ padding: '16px 20px' }}>
                  <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Total Entries</p>
                  <p style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)' }}>{gcDayList.length}</p>
                </div>
                <div className="glass-card" style={{ padding: '16px 20px' }}>
                  <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Total Amount</p>
                  <p style={{ fontSize: '22px', fontWeight: 900, color: 'var(--brand)' }}>₹{gcTotalAmount.toFixed(2)}</p>
                </div>
              </div>

              <div className="glass-card overflow-hidden">
                <div className="border-b border-slate-200 flex justify-between items-center" style={{ padding: '20px' }}>
                  <h2 className="text-md font-bold text-[#11211A] flex items-center gap-2">
                    <ShoppingBag size={18} className="text-purple-400" />
                    Recent Entries
                  </h2>
                  <span className="rounded-md bg-black/5 text-slate-500 text-[10px] font-bold uppercase tracking-wider" style={{ padding: '4px 10px' }}>
                    {gcDayList.length} Records
                  </span>
                </div>
                <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                  <table className="w-full text-left border-collapse">
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr className="bg-[#F8FAF9]">
                        {['Date', 'Code', 'Farmer Name', 'Item', 'Category', 'Qty', 'Rate', 'Amount', 'Actions'].map((h, i) => (
                          <th key={i} style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }} className={i === 8 ? 'text-right' : ''}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {gcDayList.map((e) => {
                        const name = e.farmerName || farmers[e.farmerCode]?.farmerName || farmers[e.farmerCode]?.name || 'N/A';
                        const item = e.item || e.itemName || '—';
                        const qty = e.pcs ?? e.qty;
                        const hasRate = e.rate !== undefined && e.rate !== null && e.rate !== '';
                        const hasAmt = e.amount !== undefined && e.amount !== null && e.amount !== '';
                        return (
                          <tr key={e._path} className="hover:bg-black/5 transition-colors">
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink-2)' }}>{e.date || '—'}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{e.farmerCode || '—'}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>{name}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>{item}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px' }}>{e.category ? <span className="bg-black/5 rounded text-[10px] text-slate-400" style={{ padding: '4px 8px' }}>{e.category}</span> : '—'}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>{qty ?? '—'}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink-2)' }}>{hasRate ? `₹${Number(e.rate).toFixed(2)}` : '—'}</td>
                            <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 800, color: 'var(--brand)' }}>{hasAmt ? `₹${Number(e.amount).toFixed(2)}` : '—'}</td>
                            <td style={{ padding: '12px 16px' }} className="text-right">
                              <div className="flex justify-end gap-2">
                                <button onClick={() => handleEditGrossEntry(e)} className="rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-[#11211A] transition-all" style={{ padding: '8px' }}>
                                  <Edit2 size={14} />
                                </button>
                                <button onClick={() => handleDeleteGrossEntry(e._path)} className="rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-[#11211A] transition-all" style={{ padding: '8px' }}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {gcDayList.length === 0 && (
                        <tr>
                          <td colSpan={9} className="text-center text-slate-500 text-sm font-medium" style={{ padding: '48px' }}>
                            No entries for {gcDate}. Add one from the form on the left.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default Deductions;
