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
      <div className="page-wrapper animate-fadeIn">
        <h1 className="page-title"><BarChart3 color="#f59e0b" /> Reports Module</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 option-cards-grid">
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
        </div>

        {showFilterModal && (
          <div className="modal-overlay">
            <div className="modal-3d animate-fadeIn" style={{ padding: '28px', maxWidth: '450px', width: '90%' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>
                  {activeReport === 'collection' ? 'Collection Filters' : 
                   activeReport === 'farmer' ? 'Farmer Filters' : 'Payment Filters'}
                </h2>
                <button onClick={() => setShowFilterModal(false)} style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                {activeReport !== 'payment' ? (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>From Date</label>
                      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>To Date</label>
                      <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} />
                    </div>
                    {activeReport === 'collection' && (
                      <div style={{ marginBottom: '16px' }}>
                        <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Shift</label>
                        <select value={shift} onChange={(e) => setShift(e.target.value as any)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }}>
                          <option value="All">All Shifts</option>
                          <option value="Morning">Morning</option>
                          <option value="Evening">Evening</option>
                        </select>
                      </div>
                    )}
                    {activeReport === 'farmer' && (
                      <div style={{ marginBottom: '16px' }}>
                        <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Farmer Code (Optional)</label>
                        <input type="text" value={farmerCode} onChange={(e) => setFarmerCode(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} placeholder="All Farmers" />
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ marginBottom: '16px' }}>
                    <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Select Month</label>
                    <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} />
                  </div>
                )}

                <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                  <button onClick={() => setShowFilterModal(false)} className="btn-secondary" style={{ flex: 1, padding: '12px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}>Cancel</button>
                  <button 
                    onClick={activeReport === 'collection' ? generateCollectionReport : 
                             activeReport === 'farmer' ? generateFarmerReport : generatePaymentReport}
                    className="btn-3d" 
                    style={{ flex: 2, padding: '12px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}
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
    <div className="page-wrapper animate-fadeIn">
      <div className="no-print" style={{ padding: '12px 24px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
        <button onClick={() => setReportData([])} className="btn-secondary" style={{ padding: '9px 18px', minHeight: '40px', fontSize: '14px' }}>
          Back to Options
        </button>
        <button onClick={handlePrint} className="btn-3d" style={{ padding: '9px 18px', minHeight: '40px', fontSize: '14px' }}>
          <Printer size={16} /> Print Report
        </button>
      </div>

      <div className="report-container glass-card" style={{ padding: 0 }}>
        <div className="report-header" style={{ padding: '20px', marginBottom: 0, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: 'white', textTransform: 'uppercase' }}>{dcsInfo.name || 'DCS PRO'}</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{dcsInfo.address || 'Milk Collection System'}</p>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>{reportTitle}</h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 600 }}>Period: {period}</p>
          </div>
        </div>

        <div className="report-body" style={{ marginTop: 0 }}>
          <table className="w-full report-table" style={{ tableLayout: 'fixed' }}>
            <thead className="table-header">
              {activeReport === 'collection' && (
                <tr>
                  <th style={{ width: '130px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Date</th>
                  <th style={{ width: '100px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Shift</th>
                  <th style={{ width: '90px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Farmers</th>
                  <th style={{ width: '100px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Qty (L)</th>
                  <th style={{ width: '100px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Avg FAT</th>
                  <th style={{ width: '100px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Avg SNF</th>
                  <th style={{ width: '120px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Amount</th>
                </tr>
              )}
              {activeReport === 'farmer' && (
                <tr>
                  <th style={{ width: '80px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Code</th>
                  <th style={{ width: 'auto', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Name</th>
                  <th style={{ width: '80px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Entries</th>
                  <th style={{ width: '100px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Qty (L)</th>
                  <th style={{ width: '100px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Avg FAT</th>
                  <th style={{ width: '100px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Avg SNF</th>
                  <th style={{ width: '120px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Amount</th>
                </tr>
              )}
              {activeReport === 'payment' && (
                <tr>
                  <th style={{ width: '80px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Code</th>
                  <th style={{ width: 'auto', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Name</th>
                  <th style={{ width: '100px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Qty (L)</th>
                  <th style={{ width: '120px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Gross</th>
                  <th style={{ width: '120px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Deductions</th>
                  <th style={{ width: '130px', padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Net Payable</th>
                </tr>
              )}
            </thead>
            <tbody>
              {activeReport === 'collection' && reportData.map((r, i) => (
                <tr key={i} className="table-row">
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.date}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.shift}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.count}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.qty.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.fat.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.snf.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>₹{r.amount.toFixed(2)}</td>
                </tr>
              ))}
              {activeReport === 'farmer' && reportData.map((r, i) => (
                <tr key={i} className="table-row">
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.code}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.count}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.qty.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{(r.fat / r.count).toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{(r.snf / r.count).toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>₹{r.amount.toFixed(2)}</td>
                </tr>
              ))}
              {activeReport === 'payment' && reportData.map((r, i) => (
                <tr key={i} className="table-row">
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.code}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{r.qty.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>₹{r.gross.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>₹{r.deductions.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>₹{r.net.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot style={{ background: 'rgba(255,255,255,0.05)', fontWeight: 700 }}>
              {activeReport === 'collection' && (
                <tr>
                  <td colSpan={3} style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>GRAND TOTAL</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>{grandTotal.qty.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>{grandTotal.fat.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>{grandTotal.snf.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>₹{grandTotal.amount.toFixed(2)}</td>
                </tr>
              )}
              {activeReport === 'farmer' && (
                <tr>
                  <td colSpan={3} style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>GRAND TOTAL</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>{grandTotal.qty.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>{grandTotal.fat.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>{grandTotal.snf.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>₹{grandTotal.amount.toFixed(2)}</td>
                </tr>
              )}
              {activeReport === 'payment' && (
                <tr>
                  <td colSpan={2} style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>GRAND TOTAL</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>{grandTotal.qty.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>₹{grandTotal.gross.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>₹{grandTotal.deductions.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 700 }}>₹{grandTotal.net.toFixed(2)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        <div className="report-footer" style={{ padding: '12px 16px', fontSize: '12px', opacity: 0.6 }}>
          <p>Generated on: {new Date().toLocaleString()}</p>
          <p style={{ marginTop: 4 }}>DCS PRO - Advanced Dairy Management Solution</p>
        </div>
      </div>
    </div>
  );
};

export default Reports;
