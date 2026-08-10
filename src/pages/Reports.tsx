import React, { useState, useEffect } from 'react';
import { ref, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { BarChart3, Users, Wallet, Printer, X, Calendar, Search, ArrowLeft } from 'lucide-react';
import { COMFED_LOGO, SUDHA_LOGO } from '../utils/reportLogos';
import { bfForMonth, hasAnyBalance } from '../utils/farmerBalances';

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
  const [collectionShift, setCollectionShift] = useState('Morning');
  const [farmerCode, setFarmerCode] = useState('');

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

      // Single date filter for collection report
      const date = fromDate; 
      if (allData[date]) {
        const shifts = allData[date];
        // Filter by selected collectionShift
        if (shifts[collectionShift]) {
          const entries = shifts[collectionShift];
          Object.keys(entries).forEach(code => {
            const e = entries[code];
            filteredRows.push({
              shift: collectionShift,
              code,
              name: e.farmerName || 'Unknown',
              qty: e.qty,
              fat: e.fat,
              lr: e.clr,
              snf: e.snf,
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
      }

      setReportData(filteredRows);
      // Update title with date and shift
      const formattedDate = date.split('-').reverse().join('/');
      setReportTitle(`Collection Report — ${formattedDate} | ${collectionShift}`);
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
                    morningCount: 0,
                    eveningCount: 0,
                    qty: 0,
                    fat: 0,
                    snf: 0,
                    amount: 0,
                    details: []
                  };
                }
                farmerStats[code].count++;
                // Per-farmer shift day counts (one entry == one day for that shift).
                if (String(s).toLowerCase() === 'morning') farmerStats[code].morningCount++;
                else if (String(s).toLowerCase() === 'evening') farmerStats[code].eveningCount++;
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
      let totalQty = 0, totalAmt = 0, totalFat = 0, totalSnf = 0, totalEntries = 0, totalMorning = 0, totalEvening = 0;
      rows.forEach((r: any) => {
        totalQty += r.qty;
        totalAmt += r.amount;
        totalFat += r.fat;
        totalSnf += r.snf;
        totalEntries += r.count;
        totalMorning += r.morningCount;
        totalEvening += r.eveningCount;
      });

      setReportData(rows);
      setReportTitle('Farmer Wise Report');
      setPeriod(`${fromDate} to ${toDate}`);
      setGrandTotal({
        qty: totalQty,
        amount: totalAmt,
        fat: totalEntries > 0 ? totalFat / totalEntries : 0,
        snf: totalEntries > 0 ? totalSnf / totalEntries : 0,
        count: totalEntries,
        morningCount: totalMorning,
        eveningCount: totalEvening
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
      const balancesSnap = await get(ref(database, up('farmerBalances')));

      const farmers = farmersSnap.exists() ? farmersSnap.val() : {};
      const allCollection = collectionSnap.exists() ? collectionSnap.val() : {};
      const allDeductions = deductionsSnap.exists() ? deductionsSnap.val() : {};
      const balances: any = balancesSnap.exists() ? balancesSnap.val() : {};

      // Balance-Forward month = the calendar month immediately before the
      // selected range's start month (from `fromDate`). For the usual full-month
      // range this matches the old month-based behaviour.
      const rangeMonth = (fromDate || toDate || '').substring(0, 7);
      let bfMonth = '';
      if (/^\d{4}-\d{2}$/.test(rangeMonth)) {
        const [by, bm] = rangeMonth.split('-').map(Number);
        const bfd = new Date(by, bm - 2, 1);
        bfMonth = `${bfd.getFullYear()}-${String(bfd.getMonth() + 1).padStart(2, '0')}`;
      }
      // Use the shared helper — reads new per-month path first, falls back to
      // legacy scalar. Prevents the "August's Finalize wipes August's B/F"
      // bug that plagued the old single-slot format.
      const bfFor = (code: string) => bfForMonth(balances[code], bfMonth);

      const stats: any = {};
      
      // Process Collection (date range, optional farmer code)
      Object.keys(allCollection).forEach(date => {
        if (date >= fromDate && date <= toDate) {
          const shifts = allCollection[date];
          Object.keys(shifts).forEach(s => {
            const entries = shifts[s];
            Object.keys(entries).forEach(code => {
              if (farmerCode && code !== farmerCode) return;
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

      // Process Deductions (date range, optional farmer code)
      Object.keys(allDeductions).forEach(code => {
        if (farmerCode && code !== farmerCode) return;
        const entries = allDeductions[code];
        // Skip flat "Gross Collection" entries (grossEntries/{entryId}); only the
        // nested per-farmer deduction buckets feed the payment register.
        if (entries && typeof entries.date === 'string') return;
        Object.keys(entries).forEach(id => {
          const d = entries[id];
          if (d.date >= fromDate && d.date <= toDate) {
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

      // Include farmers who carry a prior-month balance but had no activity
      // this month, so their debt/credit still shows on the register.
      Object.keys(balances).forEach(code => {
        if (farmerCode && code !== farmerCode) return;
        if (bfMonth && bfForMonth(balances[code], bfMonth) !== 0 && !stats[code] && hasAnyBalance(balances[code])) {
          stats[code] = {
            code,
            name: (farmers[code]?.farmerName || farmers[code]?.name) || 'Unknown',
            qty: 0, gross: 0, deductions: 0, net: 0,
          };
        }
      });

      const rows = Object.values(stats).map((r: any) => {
        const bf = bfFor(r.code);
        return { ...r, bf, net: r.gross - r.deductions + bf };
      });

      let totalQty = 0, totalGross = 0, totalDed = 0, totalNet = 0, totalBf = 0;
      rows.forEach((r: any) => {
        totalQty += r.qty;
        totalGross += r.gross;
        totalDed += r.deductions;
        totalBf += r.bf;
        totalNet += r.net;
      });

      setReportData(rows);
      setReportTitle('Payment Register');
      setPeriod(`${fromDate} to ${toDate}`);
      setGrandTotal({
        qty: totalQty,
        gross: totalGross,
        deductions: totalDed,
        bf: totalBf,
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
          <div onClick={() => handleOpenFilter('collection')} className="stat-card-blue cursor-pointer" style={{ height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '20px' }}>
            <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.18)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={22} color="rgba(255,255,255,0.9)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Collection Shift Wise</h3>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>Daily and shift-wise summary</p>
            </div>
          </div>

          <div onClick={() => handleOpenFilter('farmer')} className="stat-card-green cursor-pointer" style={{ height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '20px' }}>
            <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.18)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={22} color="rgba(255,255,255,0.9)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Payment Register (Without Deduction)</h3>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>Net payment, no deductions</p>
            </div>
          </div>

          <div onClick={() => handleOpenFilter('payment')} className="stat-card-purple cursor-pointer" style={{ height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '20px' }}>
            <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.18)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={22} color="rgba(255,255,255,0.9)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Payment Register (With Deduction)</h3>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>Monthly payment after deductions</p>
            </div>
          </div>

          {/* CHANGE 2: Farmer Wise Periodical Card */}
          <div onClick={() => handleOpenFilter('farmer-periodical')} className="stat-card-orange cursor-pointer" style={{ height: '140px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '20px' }}>
            <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.18)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={22} color="rgba(255,255,255,0.9)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Farmer Wise Periodical</h3>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>Date range farmer report</p>
            </div>
          </div>
        </div>

        {showFilterModal && (
          <div className="modal-overlay">
            <div className="modal-3d animate-fadeIn" style={{ padding: '28px', maxWidth: '450px', width: '90%' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--line)' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
                  {activeReport === 'collection' ? 'Collection Filters' :
                   activeReport === 'farmer' ? 'Payment (Without Deduction) Filters' :
                   activeReport === 'farmer-periodical' ? 'Farmer Periodical Filters' : 'Payment (With Deduction) Filters'}
                </h2>
                <button onClick={() => setShowFilterModal(false)} style={{ color: 'var(--ink-2)' }}>
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                {activeReport === 'collection' ? (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Collection Date</label>
                      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>SHIFT</label>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setCollectionShift('Morning')}
                          className="flex-1 py-2 rounded-lg font-bold transition-all"
                          style={{ 
                            background: collectionShift === 'Morning' ? '#2563eb' : 'var(--line)',
                            color: 'var(--ink)',
                            border: '1px solid var(--line)'
                          }}
                        >
                          Morning
                        </button>
                        <button 
                          onClick={() => setCollectionShift('Evening')}
                          className="flex-1 py-2 rounded-lg font-bold transition-all"
                          style={{ 
                            background: collectionShift === 'Evening' ? '#2563eb' : 'var(--line)',
                            color: 'var(--ink)',
                            border: '1px solid var(--line)'
                          }}
                        >
                          Evening
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>From Date</label>
                      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>To Date</label>
                      <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} />
                    </div>
                    {(activeReport === 'farmer' || activeReport === 'farmer-periodical' || activeReport === 'payment') && (
                      <div style={{ marginBottom: '16px' }}>
                        <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Farmer Code {activeReport === 'farmer-periodical' ? '(Required)' : '(Optional)'}</label>
                        <input type="text" value={farmerCode} onChange={(e) => setFarmerCode(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} placeholder={activeReport === 'farmer-periodical' ? "e.g. F001" : "All Farmers"} />
                      </div>
                    )}
                  </>
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

  // ---- Classic SUDHA / COMFED style report sheet (used for both preview & print) ----
  const fmtDMY = (d: string) => (d ? d.split('-').reverse().join('/') : '');
  const n = (v: any, dp = 2) =>
    v === null || v === undefined || isNaN(Number(v)) ? '' : Number(v).toFixed(dp);
  const sheetSubtitle =
    activeReport === 'collection' ? 'Shift Summary'
      : activeReport === 'farmer' ? 'Payment Register (Without Deduction)'
        : activeReport === 'payment' ? 'Payment Register (With Deduction)'
          : 'Farmer Periodical Summary';

  const th: React.CSSProperties = { textAlign: 'left', padding: '5px 8px', borderBottom: '2px solid #000', fontWeight: 700, whiteSpace: 'nowrap' };
  const thR: React.CSSProperties = { ...th, textAlign: 'right' };
  const thSign: React.CSSProperties = { ...th, textAlign: 'center', minWidth: '210px' };
  const td: React.CSSProperties = { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #ddd' };
  const tdR: React.CSSProperties = { ...td, textAlign: 'right' };
  const tdSign: React.CSSProperties = { ...td, minWidth: '210px', height: '46px' };
  const ft: React.CSSProperties = { padding: '6px 8px', borderTop: '2px solid #000', borderBottom: '2px solid #000', fontWeight: 700 };
  const ftR: React.CSSProperties = { ...ft, textAlign: 'right' };

  const renderSheet = () => (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#000' }}>
      {/* Header with logos */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '2px solid #000', paddingBottom: '8px' }}>
        <div style={{ width: '96px', textAlign: 'center', flexShrink: 0 }}>
          {COMFED_LOGO
            ? <img src={COMFED_LOGO} alt="COMFED" style={{ maxWidth: '88px', maxHeight: '64px' }} />
            : <div style={{ border: '1px solid #777', borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '9px', fontWeight: 700 }}>COMFED</div>}
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '18px', fontWeight: 700, textTransform: 'uppercase' }}>{dcsInfo.name || 'DCS Pro'}</div>
          {dcsInfo.code && <div style={{ fontSize: '13px', fontWeight: 700 }}>{dcsInfo.code}</div>}
          {dcsInfo.address && <div style={{ fontSize: '11px', fontStyle: 'italic' }}>{dcsInfo.address}</div>}
          <div style={{ fontSize: '14px', fontWeight: 700, textDecoration: 'underline', marginTop: '3px' }}>{sheetSubtitle}</div>
        </div>
        <div style={{ width: '96px', textAlign: 'center', flexShrink: 0 }}>
          {SUDHA_LOGO
            ? <img src={SUDHA_LOGO} alt="Sudha" style={{ maxWidth: '88px', maxHeight: '64px' }} />
            : <div style={{ border: '1px solid #c0392b', borderRadius: '4px', padding: '8px 6px', fontSize: '15px', fontWeight: 700, color: '#c0392b', fontStyle: 'italic' }}>Sudha</div>}
        </div>
      </div>

      {/* Date / Shift line */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, margin: '8px 2px' }}>
        <span>{activeReport === 'collection' ? `Date : ${fmtDMY(fromDate)}` : `Period : ${period}`}</span>
        {activeReport === 'collection'
          ? <span>Shift : {collectionShift}</span>
          : (dcsInfo.phone ? <span>Ph : {dcsInfo.phone}</span> : <span />)}
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr>
            {activeReport === 'collection' && (<>
              <th style={th}>Code</th><th style={th}>Member's Name</th><th style={thR}>Quantity</th>
              <th style={thR}>FAT (%)</th><th style={thR}>LR</th><th style={thR}>SNF%</th>
              <th style={thR}>Rate</th><th style={thR}>net Amount</th>
            </>)}
            {activeReport === 'farmer' && (<>
              <th style={th}>Code</th><th style={th}>Member's Name</th><th style={thR}>Total Qty</th>
              <th style={thR}>Mng Days</th><th style={thR}>Evn Days</th>
              <th style={thR}>Amount</th><th style={thSign}>Signature</th>
            </>)}
            {activeReport === 'farmer-periodical' && (<>
              <th style={th}>Date</th><th style={th}>Shift</th><th style={thR}>Quantity</th>
              <th style={thR}>FAT (%)</th><th style={thR}>SNF%</th><th style={thR}>Rate</th><th style={thR}>net Amount</th>
            </>)}
            {activeReport === 'payment' && (<>
              <th style={th}>Code</th><th style={th}>Member's Name</th><th style={thR}>Total Qty</th>
              <th style={thR}>Gross Amt</th><th style={thR}>B/F Amt</th><th style={thR}>Deductions</th><th style={thR}>Net Payment</th>
              <th style={thSign}>Signature</th>
            </>)}
          </tr>
        </thead>
        <tbody>
          {reportData.map((row, idx) => (
            <tr key={idx}>
              {activeReport === 'collection' && (<>
                <td style={td}>{row.code}</td><td style={td}>{row.name}</td><td style={tdR}>{n(row.qty, 2)}</td>
                <td style={tdR}>{n(row.fat, 1)}</td><td style={tdR}>{n(row.lr, 1)}</td><td style={tdR}>{n(row.snf, 1)}</td>
                <td style={tdR}>{n(row.rate, 2)}</td><td style={tdR}>{n(row.amount, 2)}</td>
              </>)}
              {activeReport === 'farmer' && (<>
                <td style={td}>{row.code}</td><td style={td}>{row.name}</td><td style={tdR}>{n(row.qty, 2)}</td>
                <td style={tdR}>{row.morningCount || 0}</td><td style={tdR}>{row.eveningCount || 0}</td>
                <td style={tdR}>{n(row.amount, 2)}</td><td style={tdSign}></td>
              </>)}
              {activeReport === 'farmer-periodical' && (<>
                <td style={td}>{fmtDMY(row.date)}</td><td style={td}>{row.shift}</td><td style={tdR}>{n(row.qty, 2)}</td>
                <td style={tdR}>{n(row.fat, 1)}</td><td style={tdR}>{n(row.snf, 1)}</td><td style={tdR}>{n(row.rate, 2)}</td><td style={tdR}>{n(row.amount, 2)}</td>
              </>)}
              {activeReport === 'payment' && (<>
                <td style={td}>{row.code}</td><td style={td}>{row.name}</td><td style={tdR}>{n(row.qty, 2)}</td>
                <td style={tdR}>{n(row.gross, 2)}</td>
                <td style={{ ...tdR, fontWeight: row.bf ? 700 : 400, color: row.bf < 0 ? '#c0392b' : row.bf > 0 ? '#128046' : '#222' }}>{row.bf ? `${row.bf > 0 ? '+' : ''}${n(row.bf, 2)}` : '-'}</td>
                <td style={tdR}>{n(row.deductions, 2)}</td>
                <td style={{ ...tdR, fontWeight: 700, color: row.net < 0 ? '#c0392b' : '#128046' }}>{n(row.net, 2)}</td>
                <td style={tdSign}></td>
              </>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            {activeReport === 'collection' && (<>
              <td style={ft} colSpan={2}>Grand Total</td><td style={ftR}>{n(grandTotal.qty, 2)}</td>
              <td style={ftR}>{n(grandTotal.fat, 1)}</td><td style={ft}></td><td style={ftR}>{n(grandTotal.snf, 1)}</td>
              <td style={ft}></td><td style={ftR}>{n(grandTotal.amount, 2)}</td>
            </>)}
            {activeReport === 'farmer' && (<>
              <td style={ft} colSpan={2}>Grand Total</td><td style={ftR}>{n(grandTotal.qty, 2)}</td>
              <td style={ftR}>{grandTotal.morningCount || 0}</td><td style={ftR}>{grandTotal.eveningCount || 0}</td>
              <td style={ftR}>{n(grandTotal.amount, 2)}</td><td style={ft}></td>
            </>)}
            {activeReport === 'farmer-periodical' && (<>
              <td style={ft} colSpan={2}>Grand Total</td><td style={ftR}>{n(grandTotal.qty, 2)}</td>
              <td style={ft} colSpan={3}></td><td style={ftR}>{n(grandTotal.amount, 2)}</td>
            </>)}
            {activeReport === 'payment' && (<>
              <td style={ft} colSpan={2}>Grand Total</td><td style={ftR}>{n(grandTotal.qty, 2)}</td>
              <td style={ftR}>{n(grandTotal.gross, 2)}</td><td style={ftR}>{grandTotal.bf ? n(grandTotal.bf, 2) : '-'}</td><td style={ftR}>{n(grandTotal.deductions, 2)}</td><td style={ftR}>{n(grandTotal.net, 2)}</td>
              <td style={ft}></td>
            </>)}
          </tr>
        </tfoot>
      </table>

      {/* Signatures */}
      <div style={{ marginTop: '44px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '150px', borderBottom: '1px solid #000', marginBottom: '4px' }} />
          <span style={{ fontSize: '11px' }}>Secretary Signature</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '150px', borderBottom: '1px solid #000', marginBottom: '4px' }} />
          <span style={{ fontSize: '11px' }}>Chairman Signature</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-wrapper animate-fadeIn">
      <div className="flex justify-between items-center mb-6 no-print">
        <button onClick={() => setActiveReport(null)} className="flex items-center gap-2 text-slate-400 hover:text-[#11211A] transition-colors">
          <ArrowLeft size={20} /> Back to Reports
        </button>
        <button onClick={handlePrint} className="btn-3d flex items-center gap-2 px-6">
          <Printer size={18} /> Print Report
        </button>
      </div>

      <div
        id="report-sheet"
        style={{ background: '#fff', maxWidth: '920px', margin: '0 auto', padding: '28px 32px', borderRadius: '4px', boxShadow: '0 12px 48px rgba(0,0,0,0.45)' }}
      >
        {renderSheet()}
      </div>
    </div>
  );
};

export default Reports;
