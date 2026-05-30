import React, { useState, useEffect } from 'react';
import { ref, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { BarChart3, Users, Wallet, Printer, X, Calendar, Search, ArrowLeft } from 'lucide-react';

type ReportType = 'collection' | 'farmer' | 'payment' | 'farmer-periodical' | null;

const Reports: React.FC = () => {
  const { t } = useLanguage();
  const [activeReport, setActiveReport] = useState<ReportType>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dcsInfo, setDcsInfo] = useState<any>({});
  
  // Filter states
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [shift, setShift] = useState<'All' | 'Morning' | 'Evening'>('All');
  const [farmerCode, setFarmerCode] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // yyyy-mm

  // Report data
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportTitle, setReportTitle] = useState('');
  const [period, setPeriod] = useState('');
  const [grandTotal, setGrandTotal] = useState<any>({});

  useEffect(() => {
    loadDCSInfo();
  }, []);

  const loadDCSInfo = async () => {
    const snap = await get(ref(database, up('dcsInfo')));
    if (snap.exists()) setDcsInfo(snap.val());
  };

  const handleOpenFilter = (type: ReportType) => {
    setActiveReport(type);
    setShowFilterModal(true);
    setReportData([]);
  };

  const generateCollectionReport = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(database, up('milkCollection')));
      if (!snap.exists()) {
        setReportData([]);
        return;
      }

      const allData = snap.val();
      const filteredRows: any[] = [];
      let totalQty = 0, totalAmt = 0, totalFat = 0, totalSnf = 0, totalEntries = 0;

      // CHANGE 1: Single date filter for collection report
      const date = fromDate; 
      if (allData[date]) {
        const shifts = allData[date];
        ['Morning', 'Evening'].forEach(s => {
          if (shifts[s]) {
            const entries = shifts[s];
            Object.keys(entries).forEach(code => {
              const e = entries[code];
              filteredRows.push({
                shift: s,
                code,
                name: e.farmerName || 'Unknown',
                qty: e.qty,
                fat: e.fat,
                snf: (e.snf || e.clr || 0),
                rate: e.rate,
                amount: e.amount
              });

              totalQty += e.qty;
              totalAmt += e.amount;
              totalFat += e.fat;
              totalSnf += (e.snf || e.clr || 0);
              totalEntries++;
            });
          }
        });
      }

      setReportData(filteredRows);
      setReportTitle('Collection Shift Wise Report');
      setPeriod(`Date: ${date}`);
      setGrandTotal({
        qty: totalQty,
        amount: totalAmt,
        fat: totalEntries > 0 ? totalFat / totalEntries : 0,
        snf: totalEntries > 0 ? totalSnf / totalEntries : 0,
        count: totalEntries
      });
      setShowFilterModal(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const generateFarmerReport = async () => {
    setLoading(true);
    try {
      const collectionSnap = await get(ref(database, up('milkCollection')));
      const farmersSnap = await get(ref(database, up('farmers')));
      
      if (!collectionSnap.exists()) {
        setReportData([]);
        return;
      }

      const allCollection = collectionSnap.val();
      const farmers = farmersSnap.exists() ? farmersSnap.val() : {};
      const farmerStats: any = {};

      Object.keys(allCollection).forEach(date => {
        if (date >= fromDate && date <= toDate) {
          const shifts = allCollection[date];
          Object.keys(shifts).forEach(s => {
            const entries = shifts[s];
            Object.keys(entries).forEach(code => {
              if (!farmerCode || code === farmerCode) {
                const e = entries[code];
                if (!farmerStats[code]) {
                  farmerStats[code] = {
                    code,
                    name: e.farmerName || (farmers[code]?.farmerName || farmers[code]?.name) || 'Unknown',
                    count: 0,
                    qty: 0,
                    fat: 0,
                    snf: 0,
                    amount: 0,
                    details: []
                  };
                }
                farmerStats[code].count++;
                farmerStats[code].qty += e.qty;
                farmerStats[code].fat += e.fat;
                farmerStats[code].snf += (e.snf || e.clr || 0);
                farmerStats[code].amount += e.amount;
                farmerStats[code].details.push({ date, shift: s, ...e });
              }
            });
          });
        }
      });

      const rows = Object.values(farmerStats);
      let totalQty = 0, totalAmt = 0, totalFat = 0, totalSnf = 0, totalEntries = 0;
      rows.forEach((r: any) => {
        totalQty += r.qty;
        totalAmt += r.amount;
        totalFat += r.fat;
        totalSnf += r.snf;
        totalEntries += r.count;
      });

      setReportData(rows);
      setReportTitle('Farmer Wise Report');
      setPeriod(`${fromDate} to ${toDate}`);
      setGrandTotal({
        qty: totalQty,
        amount: totalAmt,
        fat: totalEntries > 0 ? totalFat / totalEntries : 0,
        snf: totalEntries > 0 ? totalSnf / totalEntries : 0,
        count: totalEntries
      });
      setShowFilterModal(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const generateFarmerPeriodicalReport = async () => {
    if (!farmerCode) {
      alert("Please enter Farmer Code");
      return;
    }
    setLoading(true);
    try {
      const collectionSnap = await get(ref(database, up('milkCollection')));
      if (!collectionSnap.exists()) {
        setReportData([]);
        return;
      }

      const allCollection = collectionSnap.val();
      const filteredRows: any[] = [];
      let totalQty = 0, totalAmt = 0;

      Object.keys(allCollection).forEach(date => {
        if (date >= fromDate && date <= toDate) {
          const shifts = allCollection[date];
          Object.keys(shifts).forEach(s => {
            const entries = shifts[s];
            if (entries[farmerCode]) {
              const e = entries[farmerCode];
              filteredRows.push({
                date,
                shift: s,
                qty: e.qty,
                fat: e.fat,
                snf: (e.snf || e.clr || 0),
                rate: e.rate,
                amount: e.amount
              });
              totalQty += e.qty;
              totalAmt += e.amount;
            }
          });
        }
      });

      filteredRows.sort((a, b) => a.date.localeCompare(b.date));
      setReportData(filteredRows);
      setReportTitle(`Farmer Periodical Report - ${farmerCode}`);
      setPeriod(`${fromDate} to ${toDate}`);
      setGrandTotal({ qty: totalQty, amount: totalAmt });
      setShowFilterModal(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const generatePaymentReport = async () => {
    setLoading(true);
    try {
      const collectionSnap = await get(ref(database, up('milkCollection')));
      const farmersSnap = await get(ref(database, up('farmers')));
      const deductionsSnap = await get(ref(database, up('grossEntries')));
      
      const farmers = farmersSnap.exists() ? farmersSnap.val() : {};
      const allCollection = collectionSnap.exists() ? collectionSnap.val() : {};
      const allDeductions = deductionsSnap.exists() ? deductionsSnap.val() : {};
      
      const stats: any = {};
      
      // Process Collection
      Object.keys(allCollection).forEach(date => {
        if (date.startsWith(month)) {
          const shifts = allCollection[date];
          Object.keys(shifts).forEach(s => {
            const entries = shifts[s];
            Object.keys(entries).forEach(code => {
              const e = entries[code];
              if (!stats[code]) {
                stats[code] = {
                  code,
                  name: e.farmerName || (farmers[code]?.farmerName || farmers[code]?.name) || 'Unknown',
                  qty: 0,
                  gross: 0,
                  deductions: 0,
                  net: 0
                };
              }
              stats[code].qty += e.qty;
              stats[code].gross += e.amount;
            });
          });
        }
      });

      // Process Deductions
      Object.keys(allDeductions).forEach(code => {
        const entries = allDeductions[code];
        Object.keys(entries).forEach(id => {
          const d = entries[id];
          if (d.date.startsWith(month)) {
            if (!stats[code]) {
              stats[code] = {
                code,
                name: (farmers[code]?.farmerName || farmers[code]?.name) || 'Unknown',
                qty: 0,
                gross: 0,
                deductions: 0,
                net: 0
              };
            }
            stats[code].deductions += d.amount;
          }
        });
      });

      const rows = Object.values(stats).map((r: any) => ({
        ...r,
        net: r.gross - r.deductions
      }));

      let totalQty = 0, totalGross = 0, totalDed = 0, totalNet = 0;
      rows.forEach((r: any) => {
        totalQty += r.qty;
        totalGross += r.gross;
        totalDed += r.deductions;
        totalNet += r.net;
      });

      setReportData(rows);
      setReportTitle('Payment Register');
      setPeriod(month);
      setGrandTotal({
        qty: totalQty,
        gross: totalGross,
        deductions: totalDed,
        net: totalNet
      });
      setShowFilterModal(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!activeReport || reportData.length === 0) {
    return (
      <div className="page-wrapper animate-fadeIn">
        <h1 className="page-title"><BarChart3 color="#f59e0b" /> Reports Module</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 option-cards-grid">
          <div onClick={() => handleOpenFilter('collection')} className="stat-card-3d cursor-pointer hover:translate-y-[-2px]" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '12px', padding: '20px' }}>
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar className="text-white" size={20} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>Collection Shift Wise</h3>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, opacity: 0.7 }}>Daily and shift-wise summary</p>
            </div>
          </div>

          <div onClick={() => handleOpenFilter('farmer')} className="stat-card-3d cursor-pointer hover:translate-y-[-2px]" style={{ background: 'linear-gradient(135deg, #1a5c2e, #16a34a)', height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '12px', padding: '20px' }}>
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users className="text-white" size={20} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>Farmer Wise</h3>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, opacity: 0.7 }}>Individual farmer performance</p>
            </div>
          </div>

          <div onClick={() => handleOpenFilter('payment')} className="stat-card-3d cursor-pointer hover:translate-y-[-2px]" style={{ background: 'linear-gradient(135deg, #7c2d12, #ea580c)', height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '12px', padding: '20px' }}>
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet className="text-white" size={20} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>Payment Register</h3>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, opacity: 0.7 }}>Monthly payment summary</p>
            </div>
          </div>

          {/* CHANGE 2: Farmer Wise Periodical Card */}
          <div onClick={() => handleOpenFilter('farmer-periodical')} className="stat-card-3d cursor-pointer hover:translate-y-[-2px]" style={{ background: 'linear-gradient(135deg, #4c1d95, #7c3aed)', height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '12px', padding: '20px' }}>
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users className="text-white" size={20} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>Farmer Wise Periodical</h3>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, opacity: 0.7 }}>Date range farmer report</p>
            </div>
          </div>
        </div>

        {showFilterModal && (
          <div className="modal-overlay">
            <div className="modal-3d animate-fadeIn" style={{ padding: '28px', maxWidth: '450px', width: '90%' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>
                  {activeReport === 'collection' ? 'Collection Filters' : 
                   activeReport === 'farmer' ? 'Farmer Filters' : 
                   activeReport === 'farmer-periodical' ? 'Farmer Periodical Filters' : 'Payment Filters'}
                </h2>
                <button onClick={() => setShowFilterModal(false)} style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                {activeReport === 'collection' ? (
                  <div style={{ marginBottom: '16px' }}>
                    <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Collection Date</label>
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} />
                  </div>
                ) : activeReport !== 'payment' ? (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>From Date</label>
                      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>To Date</label>
                      <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} />
                    </div>
                    {(activeReport === 'farmer' || activeReport === 'farmer-periodical') && (
                      <div style={{ marginBottom: '16px' }}>
                        <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Farmer Code {activeReport === 'farmer-periodical' ? '(Required)' : '(Optional)'}</label>
                        <input type="text" value={farmerCode} onChange={(e) => setFarmerCode(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} placeholder={activeReport === 'farmer-periodical' ? "e.g. F001" : "All Farmers"} />
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ marginBottom: '16px' }}>
                    <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Select Month</label>
                    <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} />
                  </div>
                )}

                <button 
                  onClick={() => {
                    if (activeReport === 'collection') generateCollectionReport();
                    else if (activeReport === 'farmer') generateFarmerReport();
                    else if (activeReport === 'farmer-periodical') generateFarmerPeriodicalReport();
                    else generatePaymentReport();
                  }} 
                  className="btn-3d w-full py-3 mt-4"
                  disabled={loading}
                >
                  {loading ? 'Generating...' : 'Generate Report'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-wrapper animate-fadeIn">
      <div className="flex justify-between items-center mb-6 no-print">
        <button onClick={() => setActiveReport(null)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} /> Back to Reports
        </button>
        <button onClick={handlePrint} className="btn-3d flex items-center gap-2 px-6">
          <Printer size={18} /> Print Report
        </button>
      </div>

      <div className="glass-card" style={{ padding: '24px' }}>
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-white mb-1">{dcsInfo.name || 'DCS Pro'}</h1>
          <p className="text-slate-500 text-sm mb-4">{dcsInfo.address || ''}</p>
          <div className="inline-block px-4 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
            <span className="text-amber-500 text-xs font-black uppercase tracking-widest">{reportTitle}</span>
          </div>
          <p className="text-slate-400 text-xs mt-3 font-bold">Period: {period}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                {activeReport === 'collection' && (
                  <>
                    <th className="p-4">Shift</th>
                    <th className="p-4">Code</th>
                    <th className="p-4">Farmer Name</th>
                    <th className="p-4">Qty (L)</th>
                    <th className="p-4">FAT%</th>
                    <th className="p-4">SNF%</th>
                    <th className="p-4">Rate</th>
                    <th className="p-4">Amount</th>
                  </>
                )}
                {activeReport === 'farmer' && (
                  <>
                    <th className="p-4">Code</th>
                    <th className="p-4">Farmer Name</th>
                    <th className="p-4">Entries</th>
                    <th className="p-4">Total Qty</th>
                    <th className="p-4">Avg FAT</th>
                    <th className="p-4">Avg SNF</th>
                    <th className="p-4">Total Amount</th>
                    <th className="p-4">Farmer Signature</th>
                  </>
                )}
                {activeReport === 'farmer-periodical' && (
                  <>
                    <th className="p-4">Date</th>
                    <th className="p-4">Shift</th>
                    <th className="p-4">Qty (L)</th>
                    <th className="p-4">FAT%</th>
                    <th className="p-4">SNF%</th>
                    <th className="p-4">Rate</th>
                    <th className="p-4">Amount</th>
                  </>
                )}
                {activeReport === 'payment' && (
                  <>
                    <th className="p-4">Code</th>
                    <th className="p-4">Farmer Name</th>
                    <th className="p-4">Total Qty</th>
                    <th className="p-4">Gross Amt</th>
                    <th className="p-4">Deductions</th>
                    <th className="p-4">Net Payment</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {reportData.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                  {activeReport === 'collection' && (
                    <>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${row.shift === 'Morning' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {row.shift}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs text-slate-400">{row.code}</td>
                      <td className="p-4 font-bold text-white">{row.name}</td>
                      <td className="p-4 font-black text-white">{row.qty.toFixed(1)}</td>
                      <td className="p-4 text-slate-400">{row.fat.toFixed(1)}%</td>
                      <td className="p-4 text-slate-400">{row.snf.toFixed(1)}%</td>
                      <td className="p-4 text-slate-400">₹{row.rate.toFixed(2)}</td>
                      <td className="p-4 font-black text-green-400">₹{row.amount.toFixed(2)}</td>
                    </>
                  )}
                  {activeReport === 'farmer' && (
                    <>
                      <td className="p-4 font-mono text-xs text-slate-400">{row.code}</td>
                      <td className="p-4 font-bold text-white">{row.name}</td>
                      <td className="p-4 text-slate-400">{row.count}</td>
                      <td className="p-4 font-black text-white">{row.qty.toFixed(1)}</td>
                      <td className="p-4 text-slate-400">{(row.fat / row.count).toFixed(2)}%</td>
                      <td className="p-4 text-slate-400">{(row.snf / row.count).toFixed(2)}%</td>
                      <td className="p-4 font-black text-green-400">₹{row.amount.toFixed(2)}</td>
                      <td className="p-4"><div style={{ minWidth: '200px', height: '40px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}></div></td>
                    </>
                  )}
                  {activeReport === 'farmer-periodical' && (
                    <>
                      <td className="p-4 text-slate-400 text-sm">{row.date}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${row.shift === 'Morning' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {row.shift}
                        </span>
                      </td>
                      <td className="p-4 font-black text-white">{row.qty.toFixed(1)}</td>
                      <td className="p-4 text-slate-400">{row.fat.toFixed(1)}%</td>
                      <td className="p-4 text-slate-400">{row.snf.toFixed(1)}%</td>
                      <td className="p-4 text-slate-400">₹{row.rate.toFixed(2)}</td>
                      <td className="p-4 font-black text-green-400">₹{row.amount.toFixed(2)}</td>
                    </>
                  )}
                  {activeReport === 'payment' && (
                    <>
                      <td className="p-4 font-mono text-xs text-slate-400">{row.code}</td>
                      <td className="p-4 font-bold text-white">{row.name}</td>
                      <td className="p-4 font-black text-white">{row.qty.toFixed(1)}</td>
                      <td className="p-4 text-slate-300">₹{row.gross.toFixed(2)}</td>
                      <td className="p-4 text-red-400">₹{row.deductions.toFixed(2)}</td>
                      <td className="p-4 font-black text-green-400">₹{row.net.toFixed(2)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-white/10">
              <tr className="font-black text-white">
                {activeReport === 'collection' && (
                  <>
                    <td colSpan={3} className="p-4 text-right text-[10px] uppercase text-slate-500">Grand Total</td>
                    <td className="p-4 text-lg">{grandTotal.qty.toFixed(1)}</td>
                    <td className="p-4 text-slate-400 text-sm">{grandTotal.fat.toFixed(2)}%</td>
                    <td className="p-4 text-slate-400 text-sm">{grandTotal.snf.toFixed(2)}%</td>
                    <td className="p-4"></td>
                    <td className="p-4 text-lg text-green-400">₹{grandTotal.amount.toFixed(2)}</td>
                  </>
                )}
                {activeReport === 'farmer' && (
                  <>
                    <td colSpan={3} className="p-4 text-right text-[10px] uppercase text-slate-500">Grand Total</td>
                    <td className="p-4 text-lg">{grandTotal.qty.toFixed(1)}</td>
                    <td className="p-4 text-slate-400 text-sm">{grandTotal.fat.toFixed(2)}%</td>
                    <td className="p-4 text-slate-400 text-sm">{grandTotal.snf.toFixed(2)}%</td>
                    <td className="p-4 text-lg text-green-400">₹{grandTotal.amount.toFixed(2)}</td>
                    <td className="p-4"></td>
                  </>
                )}
                {activeReport === 'farmer-periodical' && (
                  <>
                    <td colSpan={2} className="p-4 text-right text-[10px] uppercase text-slate-500">Grand Total</td>
                    <td className="p-4 text-lg">{grandTotal.qty.toFixed(1)}</td>
                    <td colSpan={3} className="p-4"></td>
                    <td className="p-4 text-lg text-green-400">₹{grandTotal.amount.toFixed(2)}</td>
                  </>
                )}
                {activeReport === 'payment' && (
                  <>
                    <td colSpan={2} className="p-4 text-right text-[10px] uppercase text-slate-500">Grand Total</td>
                    <td className="p-4 text-lg">{grandTotal.qty.toFixed(1)}</td>
                    <td className="p-4 text-slate-300">₹{grandTotal.gross.toFixed(2)}</td>
                    <td className="p-4 text-red-400">₹{grandTotal.deductions.toFixed(2)}</td>
                    <td className="p-4 text-lg text-green-400">₹{grandTotal.net.toFixed(2)}</td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Hidden Print Area */}
      <div id="print-area">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', margin: 0 }}>{dcsInfo.name || 'DCS Pro'}</h1>
          <p style={{ fontSize: 12 }}>{dcsInfo.address || ''}</p>
          <hr style={{ margin: '10px 0' }} />
          <h2 style={{ fontSize: 16, fontWeight: 'bold' }}>{reportTitle}</h2>
          <p style={{ fontSize: 11 }}>Period: {period}</p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {activeReport === 'collection' && (
                <>
                  <th>Shift</th>
                  <th>Code</th>
                  <th>Farmer Name</th>
                  <th>Qty (L)</th>
                  <th>FAT%</th>
                  <th>SNF%</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </>
              )}
              {activeReport === 'farmer' && (
                <>
                  <th>Code</th>
                  <th>Farmer Name</th>
                  <th>Entries</th>
                  <th>Total Qty</th>
                  <th>Avg FAT</th>
                  <th>Avg SNF</th>
                  <th>Total Amount</th>
                  <th>Farmer Signature</th>
                </>
              )}
              {activeReport === 'farmer-periodical' && (
                <>
                  <th>Date</th>
                  <th>Shift</th>
                  <th>Qty (L)</th>
                  <th>FAT%</th>
                  <th>SNF%</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </>
              )}
              {activeReport === 'payment' && (
                <>
                  <th>Code</th>
                  <th>Farmer Name</th>
                  <th>Total Qty</th>
                  <th>Gross Amt</th>
                  <th>Deductions</th>
                  <th>Net Payment</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {reportData.map((row, idx) => (
              <tr key={idx}>
                {activeReport === 'collection' && (
                  <>
                    <td>{row.shift}</td>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.qty.toFixed(1)}</td>
                    <td>{row.fat.toFixed(1)}%</td>
                    <td>{row.snf.toFixed(1)}%</td>
                    <td>₹{row.rate.toFixed(2)}</td>
                    <td>₹{row.amount.toFixed(2)}</td>
                  </>
                )}
                {activeReport === 'farmer' && (
                  <>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                    <td>{row.qty.toFixed(1)}</td>
                    <td>{(row.fat / row.count).toFixed(2)}%</td>
                    <td>{(row.snf / row.count).toFixed(2)}%</td>
                    <td>₹{row.amount.toFixed(2)}</td>
                    <td><div style={{ minWidth: '200px', height: '60px', borderBottom: '1px solid rgba(0,0,0,0.2)' }}></div></td>
                  </>
                )}
                {activeReport === 'farmer-periodical' && (
                  <>
                    <td>{row.date}</td>
                    <td>{row.shift}</td>
                    <td>{row.qty.toFixed(1)}</td>
                    <td>{row.fat.toFixed(1)}%</td>
                    <td>{row.snf.toFixed(1)}%</td>
                    <td>₹{row.rate.toFixed(2)}</td>
                    <td>₹{row.amount.toFixed(2)}</td>
                  </>
                )}
                {activeReport === 'payment' && (
                  <>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.qty.toFixed(1)}</td>
                    <td>₹{row.gross.toFixed(2)}</td>
                    <td>₹{row.deductions.toFixed(2)}</td>
                    <td>₹{row.net.toFixed(2)}</td>
                  </>
                )}
              </tr>
            ))}
            <tr className="grand-total-row">
              {activeReport === 'collection' && (
                <>
                  <td colSpan={3} style={{ textAlign: 'right' }}>Grand Total</td>
                  <td>{grandTotal.qty.toFixed(1)}</td>
                  <td>{grandTotal.fat.toFixed(2)}%</td>
                  <td>{grandTotal.snf.toFixed(2)}%</td>
                  <td></td>
                  <td>₹{grandTotal.amount.toFixed(2)}</td>
                </>
              )}
              {activeReport === 'farmer' && (
                <>
                  <td colSpan={3} style={{ textAlign: 'right' }}>Grand Total</td>
                  <td>{grandTotal.qty.toFixed(1)}</td>
                  <td>{grandTotal.fat.toFixed(2)}%</td>
                  <td>{grandTotal.snf.toFixed(2)}%</td>
                  <td>₹{grandTotal.amount.toFixed(2)}</td>
                  <td></td>
                </>
              )}
              {activeReport === 'farmer-periodical' && (
                <>
                  <td colSpan={2} style={{ textAlign: 'right' }}>Grand Total</td>
                  <td>{grandTotal.qty.toFixed(1)}</td>
                  <td colSpan={3}></td>
                  <td>₹{grandTotal.amount.toFixed(2)}</td>
                </>
              )}
              {activeReport === 'payment' && (
                <>
                  <td colSpan={2} style={{ textAlign: 'right' }}>Grand Total</td>
                  <td>{grandTotal.qty.toFixed(1)}</td>
                  <td>₹{grandTotal.gross.toFixed(2)}</td>
                  <td>₹{grandTotal.deductions.toFixed(2)}</td>
                  <td>₹{grandTotal.net.toFixed(2)}</td>
                </>
              )}
            </tr>
          </tbody>
        </table>
        
        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 120, borderBottom: '1px solid #000', marginBottom: 5 }}></div>
            <p style={{ fontSize: 10 }}>Secretary Signature</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 120, borderBottom: '1px solid #000', marginBottom: 5 }}></div>
            <p style={{ fontSize: 10 }}>Chairman Signature</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
