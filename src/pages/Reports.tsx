import React, { useState, useEffect } from 'react';
import { ref, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { BarChart3, Users, Wallet, Printer, X, Calendar, Search } from 'lucide-react';

type ReportType = 'collection' | 'farmer' | 'payment' | null;

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

      Object.keys(allData).forEach(date => {
        if (date >= fromDate && date <= toDate) {
          const shifts = allData[date];
          Object.keys(shifts).forEach(s => {
            if (shift === 'All' || s === shift) {
              const entries = shifts[s];
              const farmerCodes = Object.keys(entries);
              let dayQty = 0, dayAmt = 0, dayFat = 0, daySnf = 0;

              farmerCodes.forEach(code => {
                const e = entries[code];
                dayQty += e.qty;
                dayAmt += e.amount;
                dayFat += e.fat;
                daySnf += (e.snf || e.clr || 0);
              });

              filteredRows.push({
                date,
                shift: s,
                count: farmerCodes.length,
                qty: dayQty,
                fat: dayFat / farmerCodes.length,
                snf: daySnf / farmerCodes.length,
                amount: dayAmt
              });

              totalQty += dayQty;
              totalAmt += dayAmt;
              totalFat += dayFat;
              totalSnf += daySnf;
              totalEntries += farmerCodes.length;
            }
          });
        }
      });

      filteredRows.sort((a, b) => a.date.localeCompare(b.date));
      setReportData(filteredRows);
      setReportTitle('Collection Shift Wise Report');
      setPeriod(`${fromDate} to ${toDate} (${shift})`);
      setGrandTotal({
        qty: totalQty,
        amount: totalAmt,
        fat: totalFat / totalEntries,
        snf: totalSnf / totalEntries,
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
        fat: totalFat / totalEntries,
        snf: totalSnf / totalEntries,
        count: totalEntries
      });
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
      <div className="p-6">
        <h1 className="page-title"><BarChart3 color="#f59e0b" /> Reports Module</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div onClick={() => handleOpenFilter('collection')} className="glass-card p-8 cursor-pointer hover:scale-105 transition-transform border-l-4 border-blue-500">
            <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-6">
              <Calendar className="text-blue-400" size={32} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Collection Shift Wise</h3>
            <p className="text-slate-400 text-sm">Daily and shift-wise milk collection summary with totals.</p>
          </div>

          <div onClick={() => handleOpenFilter('farmer')} className="glass-card p-8 cursor-pointer hover:scale-105 transition-transform border-l-4 border-green-500">
            <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mb-6">
              <Users className="text-green-400" size={32} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Farmer Wise Report</h3>
            <p className="text-slate-400 text-sm">Detailed collection history and summary for individual farmers.</p>
          </div>

          <div onClick={() => handleOpenFilter('payment')} className="glass-card p-8 cursor-pointer hover:scale-105 transition-transform border-l-4 border-amber-500">
            <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6">
              <Wallet className="text-amber-400" size={32} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Payment Register</h3>
            <p className="text-slate-400 text-sm">Monthly payment calculation including milk gross and deductions.</p>
          </div>
        </div>

        {showFilterModal && (
          <div className="modal-overlay">
            <div className="modal-box animate-fadeUp">
              <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Search size={20} className="text-amber-500" /> 
                  {activeReport === 'collection' ? 'Collection Filters' : activeReport === 'farmer' ? 'Farmer Filters' : 'Payment Filters'}
                </h2>
                <button onClick={() => setShowFilterModal(false)} className="text-slate-400 hover:text-white"><X /></button>
              </div>

              <div className="space-y-4">
                {activeReport !== 'payment' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label-text">From Date</label>
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input-field" />
                      </div>
                      <div>
                        <label className="label-text">To Date</label>
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input-field" />
                      </div>
                    </div>
                    {activeReport === 'collection' && (
                      <div>
                        <label className="label-text">Shift</label>
                        <select value={shift} onChange={e => setShift(e.target.value as any)} className="input-field">
                          <option value="All">All Shifts</option>
                          <option value="Morning">Morning</option>
                          <option value="Evening">Evening</option>
                        </select>
                      </div>
                    )}
                    {activeReport === 'farmer' && (
                      <div>
                        <label className="label-text">Farmer Code (Optional)</label>
                        <input type="text" value={farmerCode} onChange={e => setFarmerCode(e.target.value)} className="input-field" placeholder="Leave empty for all" />
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <label className="label-text">Select Month</label>
                    <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input-field" />
                  </div>
                )}

                <div className="flex gap-3 mt-8">
                  <button onClick={() => setShowFilterModal(false)} className="btn-secondary flex-1">Cancel</button>
                  <button 
                    onClick={activeReport === 'collection' ? generateCollectionReport : activeReport === 'farmer' ? generateFarmerReport : generatePaymentReport} 
                    className="btn-primary flex-1"
                    disabled={loading}
                  >
                    {loading ? 'Generating...' : 'Generate Report'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6 no-print">
        <button onClick={() => setActiveReport(null)} className="btn-secondary"><X size={16} /> Back to Options</button>
        <button onClick={handlePrint} className="btn-primary"><Printer size={16} /> Print Report</button>
      </div>

      <div className="glass-card p-8 animate-fadeUp">
        {/* Report Header */}
        <div className="text-center mb-8 border-b border-slate-700 pb-6">
          <h2 className="text-2xl font-black text-white mb-1">{dcsInfo.name || 'DCS Pro'}</h2>
          <p className="text-slate-400 text-sm">{dcsInfo.address || ''}</p>
          <p className="text-slate-400 text-sm">Code: {dcsInfo.code || '—'} | Phone: {dcsInfo.phone || '—'}</p>
          <div className="mt-4 inline-block px-4 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full">
            <span className="text-amber-500 font-bold uppercase tracking-wider text-xs">{reportTitle}</span>
          </div>
          <p className="text-slate-300 mt-2 font-medium">Period: {period}</p>
        </div>

        {/* Report Table */}
        <div className="table-container">
          <table className="w-full">
            <thead className="table-header">
              {activeReport === 'collection' && (
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Shift</th>
                  <th className="px-4 py-3 text-right">Farmers</th>
                  <th className="px-4 py-3 text-right">Qty (L)</th>
                  <th className="px-4 py-3 text-right">Avg FAT</th>
                  <th className="px-4 py-3 text-right">Avg SNF</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              )}
              {activeReport === 'farmer' && (
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Farmer Name</th>
                  <th className="px-4 py-3 text-right">Entries</th>
                  <th className="px-4 py-3 text-right">Qty (L)</th>
                  <th className="px-4 py-3 text-right">Avg FAT</th>
                  <th className="px-4 py-3 text-right">Avg SNF</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              )}
              {activeReport === 'payment' && (
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Farmer Name</th>
                  <th className="px-4 py-3 text-right">Total Qty</th>
                  <th className="px-4 py-3 text-right">Gross ₹</th>
                  <th className="px-4 py-3 text-right">Deductions ₹</th>
                  <th className="px-4 py-3 text-right">Net Payable ₹</th>
                </tr>
              )}
            </thead>
            <tbody>
              {activeReport === 'collection' && reportData.map((row, i) => (
                <tr key={i} className="table-row">
                  <td className="px-4 py-3 text-white font-medium">{row.date}</td>
                  <td className="px-4 py-3 text-slate-300">{row.shift}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{row.count}</td>
                  <td className="px-4 py-3 text-right text-white font-bold">{row.qty.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{row.fat.toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right text-slate-300">{row.snf.toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right text-amber-400 font-bold">₹{row.amount.toFixed(2)}</td>
                </tr>
              ))}
              {activeReport === 'farmer' && reportData.map((row, i) => (
                <tr key={i} className="table-row">
                  <td className="px-4 py-3 text-white font-bold">{row.code}</td>
                  <td className="px-4 py-3 text-slate-300">{row.name}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{row.count}</td>
                  <td className="px-4 py-3 text-right text-white font-bold">{row.qty.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{(row.fat / row.count).toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right text-slate-300">{(row.snf / row.count).toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right text-amber-400 font-bold">₹{row.amount.toFixed(2)}</td>
                </tr>
              ))}
              {activeReport === 'payment' && reportData.map((row, i) => (
                <tr key={i} className="table-row">
                  <td className="px-4 py-3 text-white font-bold">{row.code}</td>
                  <td className="px-4 py-3 text-slate-300">{row.name}</td>
                  <td className="px-4 py-3 text-right text-white">{row.qty.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">₹{row.gross.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-red-400">₹{row.deductions.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-green-400 font-bold">₹{row.net.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-800/50 font-bold">
              {activeReport === 'collection' && (
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-white">GRAND TOTAL</td>
                  <td className="px-4 py-4 text-right text-white">{grandTotal.count}</td>
                  <td className="px-4 py-4 text-right text-white">{grandTotal.qty.toFixed(2)}</td>
                  <td className="px-4 py-4 text-right text-white">{grandTotal.fat.toFixed(2)}%</td>
                  <td className="px-4 py-4 text-right text-white">{grandTotal.snf.toFixed(2)}%</td>
                  <td className="px-4 py-4 text-right text-amber-400">₹{grandTotal.amount.toFixed(2)}</td>
                </tr>
              )}
              {activeReport === 'farmer' && (
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-white">GRAND TOTAL</td>
                  <td className="px-4 py-4 text-right text-white">{grandTotal.count}</td>
                  <td className="px-4 py-4 text-right text-white">{grandTotal.qty.toFixed(2)}</td>
                  <td className="px-4 py-4 text-right text-white">{grandTotal.fat.toFixed(2)}%</td>
                  <td className="px-4 py-4 text-right text-white">{grandTotal.snf.toFixed(2)}%</td>
                  <td className="px-4 py-4 text-right text-amber-400">₹{grandTotal.amount.toFixed(2)}</td>
                </tr>
              )}
              {activeReport === 'payment' && (
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-white">GRAND TOTAL</td>
                  <td className="px-4 py-4 text-right text-white">{grandTotal.qty.toFixed(2)}</td>
                  <td className="px-4 py-4 text-right text-white">₹{grandTotal.gross.toFixed(2)}</td>
                  <td className="px-4 py-4 text-right text-red-400">₹{grandTotal.deductions.toFixed(2)}</td>
                  <td className="px-4 py-4 text-right text-green-400">₹{grandTotal.net.toFixed(2)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
        
        <div className="mt-8 text-slate-500 text-xs flex justify-between items-center">
          <p>Generated on: {new Date().toLocaleString()}</p>
          <p>DCS Pro - Dairy Collection System</p>
        </div>
      </div>

      {/* Hidden Print Area */}
      <div id="print-area">
        <div style={{ textAlign: 'center', marginBottom: '20px', fontFamily: 'sans-serif' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0' }}>{dcsInfo.name}</h2>
          <p style={{ margin: '4px 0' }}>{dcsInfo.address}</p>
          <p style={{ margin: '4px 0' }}>Code: {dcsInfo.code} | Phone: {dcsInfo.phone}</p>
          <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '15px 0' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase' }}>{reportTitle}</h3>
          <p>Period: {period}</p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'sans-serif', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              {activeReport === 'collection' && (
                <>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Date</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Shift</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Farmers</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Qty (L)</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>FAT %</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>SNF %</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Amount ₹</th>
                </>
              )}
              {activeReport === 'farmer' && (
                <>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Code</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Farmer Name</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Entries</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Qty (L)</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>FAT %</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>SNF %</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Amount ₹</th>
                </>
              )}
              {activeReport === 'payment' && (
                <>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Code</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Farmer Name</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Total Qty</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Gross ₹</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Deductions ₹</th>
                  <th style={{ border: '1px solid #000', padding: '8px' }}>Net Payable ₹</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {activeReport === 'collection' && reportData.map((row, i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #000', padding: '8px' }}>{row.date}</td>
                <td style={{ border: '1px solid #000', padding: '8px' }}>{row.shift}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.count}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.qty.toFixed(2)}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.fat.toFixed(2)}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.snf.toFixed(2)}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.amount.toFixed(2)}</td>
              </tr>
            ))}
            {activeReport === 'farmer' && reportData.map((row, i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #000', padding: '8px' }}>{row.code}</td>
                <td style={{ border: '1px solid #000', padding: '8px' }}>{row.name}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.count}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.qty.toFixed(2)}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{(row.fat / row.count).toFixed(2)}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{(row.snf / row.count).toFixed(2)}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.amount.toFixed(2)}</td>
              </tr>
            ))}
            {activeReport === 'payment' && reportData.map((row, i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #000', padding: '8px' }}>{row.code}</td>
                <td style={{ border: '1px solid #000', padding: '8px' }}>{row.name}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.qty.toFixed(2)}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.gross.toFixed(2)}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.deductions.toFixed(2)}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{row.net.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 'bold', background: '#f0f0f0' }}>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '8px' }}>GRAND TOTAL</td>
              {activeReport === 'collection' && (
                <>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.count}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.qty.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.fat.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.snf.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.amount.toFixed(2)}</td>
                </>
              )}
              {activeReport === 'farmer' && (
                <>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.count}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.qty.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.fat.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.snf.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.amount.toFixed(2)}</td>
                </>
              )}
              {activeReport === 'payment' && (
                <>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.qty.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.gross.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.deductions.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{grandTotal.net.toFixed(2)}</td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
        <p style={{ marginTop: '20px', fontSize: '10px' }}>Generated on: {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
};

export default Reports;
