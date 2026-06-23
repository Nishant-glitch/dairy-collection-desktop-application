import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, set, remove, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { Plus, FileText, BarChart2, X, Edit2, Trash2, Calculator, ShoppingBag, ArrowLeft, Printer } from 'lucide-react';
import { formatIndianCurrency } from '../utils/rateCalculator';

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
  const [activeSection, setActiveSection] = useState<'newEntry' | 'grossReport' | 'deductionReport' | null>(null);
  
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
  const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' };

  if (activeSection === null) {
    return (
      <div className="page-wrapper animate-fadeIn">
        <h1 className="page-title">Deductions & Gross Entries</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 option-cards-grid">
          <div onClick={handleNewEntryClick} className="stat-card-3d cursor-pointer hover:translate-y-[-2px]" style={{ background: 'linear-gradient(135deg, #1a5c2e, #16a34a)', height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '12px', padding: '20px' }}>
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={20} color="white" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>New Entry</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, opacity: 0.7 }}>Add Farmer Gross Entry</p>
            </div>
          </div>

          <div onClick={handleGrossReportClick} className="stat-card-3d cursor-pointer hover:translate-y-[-2px]" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '12px', padding: '20px' }}>
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={20} color="white" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>Farmer Gross</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, opacity: 0.7 }}>Detailed Report</p>
            </div>
          </div>

          <div onClick={handleDeductionReportClick} className="stat-card-3d cursor-pointer hover:translate-y-[-2px]" style={{ background: 'linear-gradient(135deg, #7c2d12, #ea580c)', height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '12px', padding: '20px' }}>
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart2 size={20} color="white" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>Monthly Summary</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, opacity: 0.7 }}>Deduction Totals</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === 'newEntry') {
    return (
      <div className="page-wrapper animate-fadeIn">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setActiveSection(null)} className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>New Gross Entry</h1>
        </div>

        {step === 1 && (
          <div className="modal-overlay">
            <div className="modal-3d animate-fadeIn" style={{ padding: '28px', maxWidth: '400px', width: '90%' }}>
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: '20px' }}>Select Farmer & Date</h2>
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
                      borderRadius: 10, color: '#94a3b8',
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
                <h2 style={{ fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: '16px' }}>Add Item</h2>
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
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', marginBottom: '16px' }}>
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>Total Amount:</span>
                      <span style={{ color: '#4ade80', fontWeight: 800, fontSize: '18px' }}>₹{(parseFloat(pcs || '0') * parseFloat(entryRate || '0')).toFixed(2)}</span>
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
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                  <div>
                    <h3 className="text-white font-bold">{selectedFarmerName} ({selectedFarmerCode})</h3>
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
                      <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                        <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.5)' }}>Item</th>
                        <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.5)' }}>Category</th>
                        <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.5)' }}>Qty</th>
                        <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.5)' }}>Rate</th>
                        <th style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.5)' }}>Amount</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {grossEntries.filter(e => e.date === entryDate).map((entry) => (
                        <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: 'bold' }}>{entry.item}</td>
                          <td style={{ padding: '14px 16px' }}><span className="bg-white/5 px-2 py-1 rounded text-[10px] text-slate-400">{entry.category}</span></td>
                          <td style={{ padding: '14px 16px', color: 'white', fontSize: '14px' }}>{entry.pcs}</td>
                          <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>₹{entry.rate.toFixed(2)}</td>
                          <td style={{ padding: '14px 16px', fontWeight: 900, color: '#4ade80', fontSize: '14px' }}>₹{entry.amount.toFixed(2)}</td>
                          <td style={{ padding: '14px 16px' }}>
                            <div className="flex justify-center gap-2">
                              <button onClick={() => handleModifyEntry(entry)} className="p-2 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white transition-all"><Edit2 size={14} /></button>
                              <button onClick={() => handleDeleteEntry(entry.id)} className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"><Trash2 size={14} /></button>
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
          <button onClick={() => setActiveSection(null)} className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-colors">
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
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Farmer Code</label>
              <input type="text" value={reportFarmerCode} onChange={(e) => setReportFarmerCode(e.target.value)} className="input-3d" placeholder="All Farmers" />
            </div>
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-3d" />
            </div>
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>To Date</label>
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
          <button onClick={() => setActiveSection(null)} className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-colors">
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
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Select Month</label>
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

  return null;
};

export default Deductions;
