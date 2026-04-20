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

        <div className="grid grid-cols-3 gap-4">
          <div onClick={handleNewEntryClick} className="stat-card-3d cursor-pointer hover:translate-y-[-4px] hover:shadow-[0_0_20px_rgba(74,222,128,0.3)]" style={{ background: 'linear-gradient(135deg, #1a5c2e, #16a34a)', height: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', borderRadius: '14px', padding: '24px' }}>
            <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={24} color="white" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>New Entry</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Add Farmer Gross Entry</p>
            </div>
          </div>

          <div onClick={handleGrossReportClick} className="stat-card-3d cursor-pointer hover:translate-y-[-4px] hover:shadow-[0_0_20px_rgba(37,99,235,0.3)]" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', height: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', borderRadius: '14px', padding: '24px' }}>
            <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={24} color="white" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>Farmer Gross</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Detailed Report</p>
            </div>
          </div>

          <div onClick={handleDeductionReportClick} className="stat-card-3d cursor-pointer hover:translate-y-[-4px] hover:shadow-[0_0_20px_rgba(234,88,12,0.3)]" style={{ background: 'linear-gradient(135deg, #7c2d12, #ea580c)', height: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', borderRadius: '14px', padding: '24px' }}>
            <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart2 size={24} color="white" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>Deduction Report</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Monthly Summary</p>
            </div>
          </div>
        </div>
      </div>
    );
  }n</h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 4 }}>Monthly Summary</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === 'newEntry') {
    if (step === 1) {
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="modal-3d animate-fadeIn" style={{ padding: 32, maxWidth: 450, width: '90%' }}>
            <div className="flex justify-between items-center mb-8">
              <h2 style={{ color: 'white', fontWeight: 800, fontSize: 22 }}>New Gross Entry - Step 1</h2>
              <button onClick={() => setActiveSection(null)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"><X size={24} /></button>
            </div>
            <div className="space-y-6">
              <div>
                <label style={labelStyle}>Farmer Code</label>
                <input type="number" value={selectedFarmerCode} onChange={(e) => setSelectedFarmerCode(e.target.value)} className="input-3d w-full" placeholder="Enter Farmer ID" />
              </div>
              <div>
                <label style={labelStyle}>Entry Date</label>
                <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="input-3d w-full" />
              </div>
              <button onClick={handleNextStep} className="btn-3d w-full" style={{ padding: 16, fontSize: 16 }}>Next Step</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'linear-gradient(135deg, #0a1f0f 0%, #0d2d18 100%)', overflowY: 'auto' }}>
        <div style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => setStep(1)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"><ArrowLeft size={20} /></button>
            <h2 style={{ color: 'white', fontWeight: 800, fontSize: 20 }}>{selectedFarmerName} <span style={{ color: 'white/40', fontSize: 14, fontWeight: 400 }}>({selectedFarmerCode})</span></h2>
          </div>
          <button onClick={() => setActiveSection(null)} className="btn-3d" style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', boxShadow: 'none' }}><X size={18} /> Exit</button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <div className="glass-card animate-fadeIn" style={{ padding: 24 }}>
              <h3 style={{ color: 'white', fontWeight: 800, fontSize: 18, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}><ShoppingBag color="#4ade80" /> {isModifyingEntry ? 'Edit Entry' : 'Add Item'}</h3>
              <div className="space-y-4">
                <div>
                  <label style={labelStyle}>Item Name</label>
                  <input ref={itemRef} type="text" value={item} onChange={(e) => setItem(e.target.value)} className="input-3d w-full" placeholder="e.g. Cattle Feed" />
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-3d w-full" style={{ appearance: 'none' }}>
                    <option value="Cattle Feed">Cattle Feed</option>
                    <option value="Medicine">Medicine</option>
                    <option value="Cash Advance">Cash Advance</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label style={labelStyle}>Pcs / Qty</label>
                    <input type="number" value={pcs} onChange={(e) => setPcs(e.target.value)} className="input-3d w-full" placeholder="0" />
                  </div>
                  <div>
                    <label style={labelStyle}>Rate</label>
                    <input type="number" value={entryRate} onChange={(e) => setEntryRate(e.target.value)} className="input-3d w-full" placeholder="0.00" />
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white/50', fontSize: 13 }}>Total Amount</span>
                  <span style={{ color: '#4ade80', fontSize: 20, fontWeight: 800 }}>{formatIndianCurrency(parseFloat(pcs || '0') * parseFloat(entryRate || '0'))}</span>
                </div>
                <button onClick={handleSaveEntry} className="btn-3d w-full" style={{ padding: 16, marginTop: 12 }}>{isModifyingEntry ? 'Update Entry' : 'Add Entry'}</button>
                {isModifyingEntry && <button onClick={clearEntryForm} className="w-full text-white/40 hover:text-white text-sm py-2">Cancel Edit</button>}
              </div>
            </div>

            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ color: 'white', fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Farmer Summary</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'white/50' }}>Total Deductions</span>
                <span style={{ color: '#ef4444', fontSize: 20, fontWeight: 800 }}>{formatIndianCurrency(totalEntryAmount)}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="glass-card animate-fadeIn" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <h3 style={{ color: 'white', fontWeight: 800, fontSize: 20 }}>Entries List <span style={{ color: 'white/40', fontSize: 14, fontWeight: 400 }}>({grossEntries.length})</span></h3>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                <div className="table-3d">
                  <table className="w-full">
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3 text-right">Pcs</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grossEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-4 py-3">{entry.date}</td>
                          <td className="px-4 py-3 font-bold">{entry.item}</td>
                          <td className="px-4 py-3"><span className="badge-3d" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>{entry.category}</span></td>
                          <td className="px-4 py-3 text-right">{entry.pcs}</td>
                          <td className="px-4 py-3 text-right">₹{entry.rate.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-bold" style={{ color: '#ef4444' }}>{formatIndianCurrency(entry.amount)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-2">
                              <button onClick={() => handleModifyEntry(entry)} className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition"><Edit2 size={16} /></button>
                              <button onClick={() => handleDeleteEntry(entry.id)} className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-500 transition"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === 'grossReport') {
    return (
      <div className="p-6 animate-fadeIn">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setActiveSection(null)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"><ArrowLeft size={24} /></button>
          <h1 style={{ color: 'white', fontWeight: 800, fontSize: 28 }}>Farmer Gross Report</h1>
        </div>
        <div className="glass-card mb-8" style={{ padding: 24 }}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
            <div>
              <label style={labelStyle}>Farmer Code (Optional)</label>
              <input type="number" value={reportFarmerCode} onChange={(e) => setReportFarmerCode(e.target.value)} className="input-3d w-full" placeholder="All Farmers" />
            </div>
            <div>
              <label style={labelStyle}>From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-3d w-full" />
            </div>
            <div>
              <label style={labelStyle}>To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-3d w-full" />
            </div>
            <button onClick={handleGenerateGrossReport} className="btn-3d w-full" style={{ padding: 12 }}>Generate Report</button>
          </div>
        </div>
        {reportData.length > 0 && (
          <div className="glass-card" style={{ padding: 24 }}>
            <div className="table-3d overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Farmer</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-right">Pcs</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((entry, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-3">{entry.date}</td>
                      <td className="px-4 py-3"><div style={{ fontWeight: 700 }}>{entry.farmerCode}</div><div style={{ fontSize: 11, opacity: 0.5 }}>{entry.farmerName}</div></td>
                      <td className="px-4 py-3 font-bold">{entry.item}</td>
                      <td className="px-4 py-3 text-right">{entry.pcs}</td>
                      <td className="px-4 py-3 text-right">₹{entry.rate.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold" style={{ color: '#ef4444' }}>{formatIndianCurrency(entry.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeSection === 'deductionReport') {
    return (
      <div className="p-6 animate-fadeIn">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setActiveSection(null)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"><ArrowLeft size={24} /></button>
          <h1 style={{ color: 'white', fontWeight: 800, fontSize: 28 }}>Monthly Deduction Summary</h1>
        </div>
        <div className="glass-card mb-8" style={{ padding: 24 }}>
          <div className="flex flex-col md:flex-row gap-6 items-end">
            <div className="flex-1">
              <label style={labelStyle}>Select Month</label>
              <input type="month" value={deductionMonth} onChange={(e) => setDeductionMonth(e.target.value)} className="input-3d w-full" />
            </div>
            <button onClick={handleGenerateDeductionReport} className="btn-3d" style={{ padding: '12px 40px' }}>Generate Summary</button>
          </div>
        </div>
        {deductionReportData.length > 0 && (
          <div className="glass-card" style={{ padding: 24 }}>
            <div className="table-3d overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-4 py-3">Farmer Code</th>
                    <th className="px-4 py-3">Farmer Name</th>
                    <th className="px-4 py-3 text-right">Total Entries</th>
                    <th className="px-4 py-3 text-right">Total Deduction</th>
                  </tr>
                </thead>
                <tbody>
                  {deductionReportData.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-3 font-bold">{row.farmerCode}</td>
                      <td className="px-4 py-3">{row.farmerName}</td>
                      <td className="px-4 py-3 text-right">{row.totalEntries}</td>
                      <td className="px-4 py-3 text-right font-bold" style={{ color: '#ef4444' }}>{formatIndianCurrency(row.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default Deductions;
