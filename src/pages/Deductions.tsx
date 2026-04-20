import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, set, remove, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { Plus, FileText, BarChart2, X, Edit2, Trash2, Calculator, ShoppingBag, ArrowLeft } from 'lucide-react';
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
    loadFarmers();
  }, []);

  useEffect(() => {
    if (selectedFarmerCode && activeSection === 'newEntry' && step === 2) {
      loadGrossEntries();
    }
  }, [selectedFarmerCode, activeSection, step]);

  const loadFarmers = () => {
    const farmersRef = ref(database, up('farmers'));
    onValue(farmersRef, (snapshot) => {
      if (snapshot.exists()) {
        setFarmers(snapshot.val());
      }
    });
  };

  const loadGrossEntries = () => {
    const grossRef = ref(database, up(`grossEntries/${selectedFarmerCode}`));
    onValue(grossRef, (snapshot) => {
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
                <button
                  onClick={handleNextStep}
                  className="btn-3d"
                  style={{ marginTop: '24px', padding: '12px', width: '100%', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}
                >
                  Next Step
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="w-full lg:w-1/3">
              <div className="glass-card" style={{ padding: '20px' }}>
                <h2 style={{ fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: '16px' }}>Add Item</h2>
                <div className="space-y-4">
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
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10" style={{ marginTop: '4px', marginBottom: '20px', padding: '12px 16px' }}>
                    <div className="flex justify-between items-center">
                      <span className="text-white/50 text-sm">Total Amount</span>
                      <span className="text-xl font-black text-green-400">
                        {formatIndianCurrency(parseFloat(pcs || '0') * parseFloat(entryRate || '0'))}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveEntry}
                    className="btn-3d"
                    style={{ padding: '12px', width: '100%', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}
                  >
                    {isModifyingEntry ? 'Update Entry' : 'Add Entry'}
                  </button>

                  <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <h3 style={{ color: '#4ade80', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '12px' }}>Farmer Summary</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/50">Farmer:</span>
                        <span className="text-white font-bold">{selectedFarmerCode} - {selectedFarmerName}</span>
                      </div>
                      <div className="flex justify-between" style={{ fontSize: '16px' }}>
                        <span className="text-white/50">Total Deductions:</span>
                        <span className="text-green-400 font-black">{formatIndianCurrency(totalEntryAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-2/3">
              <div className="glass-card h-full" style={{ padding: '20px' }}>
                <h2 style={{ fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: '16px' }}>Entries List</h2>
                <div className="table-container overflow-x-auto">
                  <table className="w-full table-3d" style={{ tableLayout: 'fixed' }}>
                    <thead className="table-header">
                      <tr>
                        <th className="px-4 py-3 text-left" style={{ width: '120px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Date</th>
                        <th className="px-4 py-3 text-left" style={{ width: 'auto', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Item</th>
                        <th className="px-4 py-3 text-left" style={{ width: '120px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Category</th>
                        <th className="px-4 py-3 text-right" style={{ width: '70px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Pcs</th>
                        <th className="px-4 py-3 text-right" style={{ width: '100px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Rate</th>
                        <th className="px-4 py-3 text-right" style={{ width: '100px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Amount</th>
                        <th className="px-4 py-3 text-center" style={{ width: '80px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grossEntries.map((entry) => (
                        <tr key={entry.id} className="table-row">
                          <td className="px-4 py-3 text-white/70" style={{ padding: '12px 16px', fontSize: '14px' }}>{entry.date}</td>
                          <td className="px-4 py-3 text-white font-bold" style={{ padding: '12px 16px', fontSize: '14px' }}>{entry.item}</td>
                          <td className="px-4 py-3 text-white/50" style={{ padding: '12px 16px', fontSize: '14px' }}>{entry.category}</td>
                          <td className="px-4 py-3 text-right text-white" style={{ padding: '12px 16px', fontSize: '14px' }}>{entry.pcs}</td>
                          <td className="px-4 py-3 text-right text-white/70" style={{ padding: '12px 16px', fontSize: '14px' }}>₹{entry.rate.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-green-400 font-bold" style={{ padding: '12px 16px', fontSize: '14px' }}>₹{entry.amount.toFixed(2)}</td>
                          <td className="px-4 py-3" style={{ padding: '12px 16px', fontSize: '14px' }}>
                            <div className="flex justify-center gap-2">
                              <button onClick={() => handleModifyEntry(entry)} className="p-1.5 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"><Edit2 size={14} /></button>
                              <button onClick={() => handleDeleteEntry(entry.id)} className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {grossEntries.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-20 text-center text-white/20">No entries found for this farmer.</td>
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

  if (activeSection === 'grossReport') {
    return (
      <div className="page-wrapper animate-fadeIn">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setActiveSection(null)} className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Farmer Gross Report</h1>
        </div>

        <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
          <div className="flex flex-wrap items-end" style={{ gap: '16px' }}>
            <div className="flex-1 min-w-[200px]">
              <label className="label-text" style={{ marginBottom: '6px' }}>Farmer Code (Optional)</label>
              <input
                type="text"
                value={reportFarmerCode}
                onChange={(e) => setReportFarmerCode(e.target.value)}
                className="input-3d"
                style={{ padding: '10px 14px', fontSize: '14px' }}
                placeholder="All Farmers"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="label-text" style={{ marginBottom: '6px' }}>From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="input-3d"
                style={{ padding: '10px 14px', fontSize: '14px' }}
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="label-text" style={{ marginBottom: '6px' }}>To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="input-3d"
                style={{ padding: '10px 14px', fontSize: '14px' }}
              />
            </div>
            <button
              onClick={handleGenerateGrossReport}
              className="btn-3d"
              style={{ alignSelf: 'flex-end', padding: '10px 24px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}
            >
              Generate Report
            </button>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <div className="table-container overflow-x-auto">
            <table className="w-full table-3d" style={{ tableLayout: 'fixed' }}>
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-3 text-left" style={{ width: '120px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Date</th>
                  <th className="px-4 py-3 text-left" style={{ width: '200px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Farmer</th>
                  <th className="px-4 py-3 text-left" style={{ width: 'auto', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Item</th>
                  <th className="px-4 py-3 text-right" style={{ width: '70px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Pcs</th>
                  <th className="px-4 py-3 text-right" style={{ width: '100px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Rate</th>
                  <th className="px-4 py-3 text-right" style={{ width: '110px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((entry, idx) => (
                  <tr key={idx} className="table-row">
                    <td className="px-4 py-3 text-white/70" style={{ padding: '12px 16px', fontSize: '14px' }}>{entry.date}</td>
                    <td className="px-4 py-3" style={{ padding: '12px 16px', fontSize: '14px' }}>
                      <div className="flex flex-col">
                        <span className="text-white font-bold">{entry.farmerCode}</span>
                        <span className="text-[10px] text-white/40">{entry.farmerName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white font-bold" style={{ padding: '12px 16px', fontSize: '14px' }}>{entry.item}</td>
                    <td className="px-4 py-3 text-right text-white" style={{ padding: '12px 16px', fontSize: '14px' }}>{entry.pcs}</td>
                    <td className="px-4 py-3 text-right text-white/70" style={{ padding: '12px 16px', fontSize: '14px' }}>₹{entry.rate.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-bold" style={{ padding: '12px 16px', fontSize: '14px' }}>₹{entry.amount.toFixed(2)}</td>
                  </tr>
                ))}
                {reportData.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-20 text-center text-white/20">No report data found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === 'deductionReport') {
    return (
      <div className="page-wrapper animate-fadeIn">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setActiveSection(null)} className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Monthly Deduction Summary</h1>
        </div>

        <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
          <div className="flex items-end" style={{ gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <label className="label-text" style={{ marginBottom: '6px' }}>Select Month</label>
              <input
                type="month"
                value={deductionMonth}
                onChange={(e) => setDeductionMonth(e.target.value)}
                className="input-3d"
                style={{ padding: '10px 14px', fontSize: '14px' }}
              />
            </div>
            <button
              onClick={handleGenerateDeductionReport}
              className="btn-3d"
              style={{ padding: '10px 24px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}
            >
              Generate Summary
            </button>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <div className="table-container overflow-x-auto">
            <table className="w-full table-3d">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-3 text-left" style={{ width: '150px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Farmer Code</th>
                  <th className="px-4 py-3 text-left" style={{ width: 'auto', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Farmer Name</th>
                  <th className="px-4 py-3 text-right" style={{ width: '130px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Total Entries</th>
                  <th className="px-4 py-3 text-right" style={{ width: '160px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Total Deduction</th>
                </tr>
              </thead>
              <tbody>
                {deductionReportData.map((row, idx) => (
                  <tr key={idx} className="table-row">
                    <td className="px-4 py-3 text-white font-bold" style={{ padding: '12px 16px', fontSize: '14px' }}>{row.farmerCode}</td>
                    <td className="px-4 py-3 text-white/70" style={{ padding: '12px 16px', fontSize: '14px' }}>{row.farmerName}</td>
                    <td className="px-4 py-3 text-right text-white" style={{ padding: '12px 16px', fontSize: '14px' }}>{row.totalEntries}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-bold" style={{ padding: '12px 16px', fontSize: '14px' }}>₹{row.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
                {deductionReportData.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-20 text-center text-white/20">No deduction data found for this month.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default Deductions;
