import React, { useState, useEffect } from 'react';
import { ref, get, set, onValue } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { sendPaymentSMS } from '../services/sms';
import { Smartphone, QrCode, Check, Calculator, X, Users, Snowflake, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { COMFED_LOGO, SUDHA_LOGO } from '../utils/reportLogos';

interface PaymentEntry {
  farmerId: string;
  farmerName: string;
  mobile: string;
  upiId: string;
  grossAmount: number;
  deductions: number;
  netPayable: number;
  customAmount: number;
  isPaid: boolean;
}

const PaymentRegister: React.FC = () => {
  const { t } = useLanguage();
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [farmers, setFarmers] = useState<any>({});
  const [dcsInfo, setDcsInfo] = useState<any>({});
  const [showQR, setShowQR] = useState<{ show: boolean; data: string; farmer: string }>({
    show: false,
    data: '',
    farmer: '',
  });

  // BMC Payment Register state
  const [activeTab, setActiveTab] = useState<'farmer' | 'bmc'>('farmer');
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = `${new Date().toISOString().substring(0, 7)}-01`;
  const [bmcFromDate, setBmcFromDate] = useState(firstOfMonth);
  const [bmcToDate, setBmcToDate] = useState(today);
  const [bmcFilter, setBmcFilter] = useState('all');
  const [milkTypeFilter, setMilkTypeFilter] = useState<'all' | 'cow' | 'buffalo'>('all');
  const [bmcList, setBmcList] = useState<any[]>([]);
  const [bmcEntries, setBmcEntries] = useState<any[]>([]);
  const [bmcCalculated, setBmcCalculated] = useState(false);

  useEffect(() => {
    const unsubscribe = loadFarmers();
    loadDCSInfo();
    const bmcUnsub = loadBMCList();
    return () => {
      unsubscribe();
      bmcUnsub();
    };
  }, []);

  const loadBMCList = () => {
    const bmcRef = ref(database, up('bmcMaster'));
    return onValue(bmcRef, (snapshot) => {
      const list: any[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach((id) => list.push({ bmcId: id, ...data[id] }));
      }
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setBmcList(list);
    });
  };

  const calculateBMCEntries = async () => {
    // Read all bmcEntries and filter client-side — the same pattern used by
    // farmer payments (above), Deductions and Reports. This avoids depending on
    // a server-side .indexOn that must be deployed to the live Firebase rules.
    const snapshot = await get(ref(database, up('bmcEntries')));

    const list: any[] = [];
    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.keys(data).forEach((id) => {
        const entry = data[id];
        const d = entry.date;
        if (!d) return;
        if (d < bmcFromDate || d > bmcToDate) return;
        if (bmcFilter !== 'all' && entry.bmcId !== bmcFilter) return;
        if (milkTypeFilter !== 'all' && (entry.milkType || 'cow') !== milkTypeFilter) return;
        list.push({ entryId: id, ...entry });
      });
    }
    list.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    setBmcEntries(list);
    setBmcCalculated(true);
  };

  const loadFarmers = () => {
    const farmersRef = ref(database, up('farmers'));
    return onValue(farmersRef, (snapshot) => {
      if (snapshot.exists()) {
        setFarmers(snapshot.val());
      }
    });
  };

  const loadDCSInfo = async () => {
    const dcsRef = ref(database, up('dcsInfo'));
    const snapshot = await get(dcsRef);
    if (snapshot.exists()) {
      setDcsInfo(snapshot.val());
    }
  };

  const calculatePayments = async () => {
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const collectionRef = ref(database, up('milkCollection'));
    const snapshot = await get(collectionRef);

    const farmerPayments: { [key: string]: PaymentEntry } = {};

    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.keys(data).forEach((date) => {
        if (date >= startDate && date <= endDate) {
          const shifts = data[date];
          Object.values(shifts).forEach((shift: any) => {
            Object.keys(shift).forEach((farmerId) => {
              const entry = shift[farmerId];
              if (!farmerPayments[farmerId]) {
                const farmer = farmers[farmerId] || {};
                farmerPayments[farmerId] = {
                  farmerId,
                  farmerName: farmer.farmerName || 'Unknown',
                  mobile: farmer.mobileNo || '',
                  upiId: farmer.upiId || `${farmer.mobileNo}@ybl`,
                  grossAmount: 0,
                  deductions: 0,
                  netPayable: 0,
                  customAmount: 0,
                  isPaid: false,
                };
              }
              farmerPayments[farmerId].grossAmount += parseFloat(entry.amount || 0);
            });
          });
        }
      });
    }

    const grossEntriesRef = ref(database, up('grossEntries'));
    const grossEntriesSnapshot = await get(grossEntriesRef);
    if (grossEntriesSnapshot.exists()) {
      const grossEntriesData = grossEntriesSnapshot.val();
      Object.keys(grossEntriesData).forEach((farmerId) => {
        if (farmerPayments[farmerId]) {
          const entries = grossEntriesData[farmerId];
          let totalDeduction = 0;
          Object.values(entries).forEach((entry: any) => {
            totalDeduction += parseFloat(entry.amount || 0);
          });
          farmerPayments[farmerId].deductions = totalDeduction;
        }
      });
    }

    Object.keys(farmerPayments).forEach((farmerId) => {
      const payment = farmerPayments[farmerId];
      payment.netPayable = payment.grossAmount - payment.deductions;
      payment.customAmount = payment.netPayable;
    });

    setPayments(Object.values(farmerPayments));
  };

  const handleCustomAmount = (farmerId: string, amount: number) => {
    setPayments((prev) =>
      prev.map((p) => (p.farmerId === farmerId ? { ...p, customAmount: amount } : p))
    );
  };

  const handlePayViaPhonePe = (payment: PaymentEntry) => {
    const upiId = payment.upiId || `${payment.mobile}@ybl`;
    const amount = payment.customAmount;
    const name = payment.farmerName;
    const note = `Milk Payment ${month}`;

    const deepLink = `phonepe://pay?pa=${upiId}&pn=${encodeURIComponent(
      name
    )}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

    window.location.href = deepLink;
  };

  const handleShowQR = (payment: PaymentEntry) => {
    const upiId = payment.upiId || `${payment.mobile}@ybl`;
    const amount = payment.customAmount;
    const name = payment.farmerName;
    const note = `Milk ${month}`;

    const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
      name
    )}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

    setShowQR({
      show: true,
      data: upiString,
      farmer: `${payment.farmerName} - ${formatIndianCurrency(amount)}`,
    });
  };

  const markAsPaid = async (payment: PaymentEntry) => {
    const paymentRef = ref(database, up(`payments/${month}/${payment.farmerId}`));
    await set(paymentRef, {
      grossAmount: payment.grossAmount,
      totalDeductions: payment.deductions,
      netAmount: payment.customAmount,
      status: 'paid',
      paidOn: Date.now(),
    });

    if (payment.mobile) {
      await sendPaymentSMS(
        payment.farmerName,
        payment.farmerId,
        payment.mobile,
        month,
        payment.customAmount,
        dcsInfo.name || 'DCS'
      );
    }

    setPayments((prev) =>
      prev.map((p) => (p.farmerId === payment.farmerId ? { ...p, isPaid: true } : p))
    );

    alert('Payment marked as paid and SMS sent!');
  };

  const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' };

  return (
    <div className="page-wrapper animate-fadeIn">
      <h1 className="page-title">{t('paymentRegister')}</h1>

      {/* Tabs: Farmer vs BMC */}
      <div className="flex gap-2 bg-white/5 rounded-xl border border-white/10" style={{ padding: '4px', marginBottom: '20px', maxWidth: '420px' }}>
        <button
          onClick={() => setActiveTab('farmer')}
          style={{ padding: '10px 16px' }}
          className={`flex-1 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'farmer' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
        >
          <Users size={14} /> FARMER PAYMENTS
        </button>
        <button
          onClick={() => setActiveTab('bmc')}
          style={{ padding: '10px 16px' }}
          className={`flex-1 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'bmc' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
        >
          <Snowflake size={14} /> BMC PAYMENTS
        </button>
      </div>

      {activeTab === 'farmer' && (
      <>
      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end" style={{ gap: '16px' }}>
          <div style={{ maxWidth: '280px', width: '100%' }}>
            <label style={labelStyle}>Select Payment Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="input-3d w-full"
              style={{ height: '40px', padding: '10px 14px', fontSize: '14px' }}
            />
          </div>
          <button
            onClick={calculatePayments}
            className="btn-3d"
            style={{ padding: '10px 20px', height: '40px', minHeight: '40px', marginLeft: 'auto' }}
          >
            <Calculator size={16} />
            Calculate
          </button>
        </div>
      </div>

      {payments.length > 0 && (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <div className="table-3d overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Farmer Code</th>
                  <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Name</th>
                  <th className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Gross Amount</th>
                  <th className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Deductions</th>
                  <th className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Net Payable</th>
                  <th className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Pay Amount</th>
                  <th className="px-4 py-[9px] text-center" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.farmerId} className="table-row">
                    <td className="px-4 py-[9px] font-bold" style={{ padding: '12px 16px', fontSize: '14px' }}>{payment.farmerId}</td>
                    <td className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '14px' }}>{payment.farmerName}</td>
                    <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '14px', color: '#4ade80', fontWeight: 600 }}>
                      {formatIndianCurrency(payment.grossAmount)}
                    </td>
                    <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '14px', color: '#ef4444' }}>
                      {formatIndianCurrency(payment.deductions)}
                    </td>
                    <td className="px-4 py-[9px] text-right font-bold" style={{ padding: '12px 16px', fontSize: '14px', color: 'white' }}>
                      {formatIndianCurrency(payment.netPayable)}
                    </td>
                    <td className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '14px' }}>
                      <input
                        type="number"
                        value={payment.customAmount.toFixed(2)}
                        onChange={(e) =>
                          handleCustomAmount(payment.farmerId, parseFloat(e.target.value) || 0)
                        }
                        className="input-3d w-24 text-right"
                        disabled={payment.isPaid}
                        style={{ opacity: payment.isPaid ? 0.5 : 1, padding: '5px 8px', height: '30px', fontSize: '14px' }}
                      />
                    </td>
                    <td className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '14px' }}>
                      {payment.isPaid ? (
                        <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <div style={{ width: 18, height: 18, background: 'rgba(74,222,128,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={10} />
                          </div>
                          PAID
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => handlePayViaPhonePe(payment)} className="btn-3d" style={{ padding: '6px 12px', minHeight: '40px', fontSize: '12px', background: 'linear-gradient(145deg, #7c3aed, #4c1d95)', boxShadow: '0 4px 12px rgba(124,58,237,0.3)' }} title="Pay via PhonePe"><Smartphone size={12} /></button>
                          <button onClick={() => handleShowQR(payment)} className="btn-3d" style={{ padding: '6px 12px', minHeight: '40px', fontSize: '12px', background: 'linear-gradient(145deg, #2563eb, #1e3a5f)', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }} title="Show QR Code"><QrCode size={12} /></button>
                          <button onClick={() => markAsPaid(payment)} className="btn-3d" style={{ padding: '6px 12px', minHeight: '40px', fontSize: '12px' }} title="Mark as Paid"><Check size={12} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ background: 'rgba(255, 255, 255, 0.05)', fontWeight: 700 }}>
                <tr>
                  <td colSpan={2} className="px-4 py-[9px]" style={{ padding: '12px 16px', color: 'white', fontSize: '14px', fontWeight: 700 }}>TOTAL</td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', color: '#4ade80', fontSize: '14px', fontWeight: 700 }}>
                    {formatIndianCurrency(payments.reduce((sum, p) => sum + p.grossAmount, 0))}
                  </td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', color: '#ef4444', fontSize: '14px', fontWeight: 700 }}>
                    {formatIndianCurrency(payments.reduce((sum, p) => sum + p.deductions, 0))}
                  </td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', color: 'white', fontSize: '14px', fontWeight: 700 }}>
                    {formatIndianCurrency(payments.reduce((sum, p) => sum + p.netPayable, 0))}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      {activeTab === 'bmc' && (
      <>
        <div className="glass-card no-print" style={{ padding: '20px 24px', marginBottom: '20px' }}>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end" style={{ gap: '16px' }}>
            <div style={{ maxWidth: '180px', width: '100%' }}>
              <label style={labelStyle}>From Date</label>
              <input
                type="date"
                value={bmcFromDate}
                onChange={(e) => setBmcFromDate(e.target.value)}
                className="input-3d w-full"
                style={{ height: '40px', padding: '10px 14px', fontSize: '14px' }}
              />
            </div>
            <div style={{ maxWidth: '180px', width: '100%' }}>
              <label style={labelStyle}>To Date</label>
              <input
                type="date"
                value={bmcToDate}
                onChange={(e) => setBmcToDate(e.target.value)}
                className="input-3d w-full"
                style={{ height: '40px', padding: '10px 14px', fontSize: '14px' }}
              />
            </div>
            <div style={{ maxWidth: '220px', width: '100%' }}>
              <label style={labelStyle}>BMC</label>
              <select
                value={bmcFilter}
                onChange={(e) => setBmcFilter(e.target.value)}
                className="input-3d w-full"
                style={{ height: '40px', padding: '10px 14px', fontSize: '14px' }}
              >
                <option value="all">All BMCs</option>
                {bmcList.map((b) => (
                  <option key={b.bmcId} value={b.bmcId}>{b.name}</option>
                ))}
              </select>
            </div>
            <div style={{ maxWidth: '160px', width: '100%' }}>
              <label style={labelStyle}>Milk Type</label>
              <select
                value={milkTypeFilter}
                onChange={(e) => setMilkTypeFilter(e.target.value as 'all' | 'cow' | 'buffalo')}
                className="input-3d w-full"
                style={{ height: '40px', padding: '10px 14px', fontSize: '14px' }}
              >
                <option value="all">All Types</option>
                <option value="cow">Cow</option>
                <option value="buffalo">Buffalo</option>
              </select>
            </div>
            <button
              onClick={calculateBMCEntries}
              className="btn-3d"
              style={{ padding: '10px 20px', height: '40px', minHeight: '40px', marginLeft: 'auto' }}
            >
              <Calculator size={16} />
              Calculate
            </button>
            {bmcCalculated && bmcEntries.length > 0 && (
              <button
                onClick={() => window.print()}
                className="btn-3d"
                style={{ padding: '10px 20px', height: '40px', minHeight: '40px' }}
              >
                <Printer size={16} />
                Print
              </button>
            )}
          </div>
        </div>

        {bmcCalculated && bmcEntries.length === 0 && (
          <div className="glass-card no-print" style={{ padding: '20px 24px' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, textAlign: 'center', padding: '32px 0' }}>
              No BMC entries found for the selected range.
            </p>
          </div>
        )}

        {bmcCalculated && bmcEntries.length > 0 && (() => {
          // Pre-computed aggregates for the printable sheet.
          const grandQty = bmcEntries.reduce((s, e) => s + parseFloat(e.quantityKg || 0), 0);
          const grandAmt = bmcEntries.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
          const byType = bmcEntries.reduce((acc: any, e: any) => {
            const k = e.milkType || 'cow';
            if (!acc[k]) acc[k] = { count: 0, qty: 0, amount: 0 };
            acc[k].count += 1;
            acc[k].qty += parseFloat(e.quantityKg || 0);
            acc[k].amount += parseFloat(e.amount || 0);
            return acc;
          }, {});
          const byBmc = Object.values(
            bmcEntries.reduce((acc: any, e: any) => {
              const key = e.bmcId || e.bmcName;
              if (!acc[key]) acc[key] = { bmcName: e.bmcName, count: 0, qty: 0, amount: 0 };
              acc[key].count += 1;
              acc[key].qty += parseFloat(e.quantityKg || 0);
              acc[key].amount += parseFloat(e.amount || 0);
              return acc;
            }, {})
          );
          const th: React.CSSProperties = { padding: '8px 10px', fontSize: '12px', fontWeight: 700, color: '#111', borderBottom: '2px solid #333', textAlign: 'left' };
          const thR: React.CSSProperties = { ...th, textAlign: 'right' };
          const td: React.CSSProperties = { padding: '7px 10px', fontSize: '13px', color: '#222', borderBottom: '1px solid #ddd' };
          const tdR: React.CSSProperties = { ...td, textAlign: 'right' };
          const selectedBmcName = bmcFilter === 'all' ? 'All BMCs' : (bmcList.find((b) => b.bmcId === bmcFilter)?.name || '');

          return (
            <div
              id="report-sheet"
              style={{ background: '#fff', maxWidth: '920px', margin: '0 auto', padding: '28px 32px', borderRadius: '4px', boxShadow: '0 12px 48px rgba(0,0,0,0.45)', color: '#111' }}
            >
              {/* Header with logos — same COMFED (left) / SUDHA (right) pattern as Reports */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: 20 }}>
                <div style={{ width: '96px', textAlign: 'center', flexShrink: 0 }}>
                  {COMFED_LOGO
                    ? <img src={COMFED_LOGO} alt="COMFED" style={{ maxWidth: '88px', maxHeight: '64px' }} />
                    : <div style={{ border: '1px solid #777', borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '9px', fontWeight: 700 }}>COMFED</div>}
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#111', textTransform: 'uppercase' }}>{dcsInfo.name || 'DCS Pro'}</div>
                  {dcsInfo.code && <div style={{ fontSize: 13, fontWeight: 700, color: '#222' }}>{dcsInfo.code}</div>}
                  {dcsInfo.address && <div style={{ fontSize: 11, fontStyle: 'italic', color: '#444' }}>{dcsInfo.address}</div>}
                  <div style={{ fontSize: 14, fontWeight: 700, textDecoration: 'underline', marginTop: 3, color: '#111' }}>BMC Payment Register</div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                    {bmcFromDate} to {bmcToDate} &nbsp;|&nbsp; BMC: {selectedBmcName} &nbsp;|&nbsp; Type: {milkTypeFilter === 'all' ? 'All' : milkTypeFilter}
                  </div>
                </div>
                <div style={{ width: '96px', textAlign: 'center', flexShrink: 0 }}>
                  {SUDHA_LOGO
                    ? <img src={SUDHA_LOGO} alt="Sudha" style={{ maxWidth: '88px', maxHeight: '64px' }} />
                    : <div style={{ border: '1px solid #c0392b', borderRadius: '4px', padding: '8px 6px', fontSize: '15px', fontWeight: 700, color: '#c0392b', fontStyle: 'italic' }}>Sudha</div>}
                </div>
              </div>

              {/* Cow / Buffalo breakdown */}
              <h3 style={{ fontSize: 13, fontWeight: 800, color: '#111', margin: '0 0 8px', textTransform: 'uppercase' }}>Milk Type Breakdown</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                <thead>
                  <tr>
                    <th style={th}>Milk Type</th>
                    <th style={thR}>Entries</th>
                    <th style={thR}>Total Qty (KG)</th>
                    <th style={thR}>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {['cow', 'buffalo'].filter((k) => byType[k]).map((k) => (
                    <tr key={k}>
                      <td style={{ ...td, textTransform: 'capitalize', fontWeight: 700 }}>{k}</td>
                      <td style={tdR}>{byType[k].count}</td>
                      <td style={tdR}>{byType[k].qty.toFixed(2)}</td>
                      <td style={tdR}>{formatIndianCurrency(byType[k].amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Per-BMC subtotals (only meaningful when All BMCs selected) */}
              {bmcFilter === 'all' && (
                <>
                  <h3 style={{ fontSize: 13, fontWeight: 800, color: '#111', margin: '0 0 8px', textTransform: 'uppercase' }}>Per-BMC Subtotals</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                    <thead>
                      <tr>
                        <th style={th}>BMC</th>
                        <th style={thR}>Entries</th>
                        <th style={thR}>Total Qty (KG)</th>
                        <th style={thR}>Total Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byBmc.map((row: any, idx: number) => (
                        <tr key={idx}>
                          <td style={{ ...td, fontWeight: 700 }}>{row.bmcName}</td>
                          <td style={tdR}>{row.count}</td>
                          <td style={tdR}>{row.qty.toFixed(2)}</td>
                          <td style={tdR}>{formatIndianCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Detailed entries */}
              <h3 style={{ fontSize: 13, fontWeight: 800, color: '#111', margin: '0 0 8px', textTransform: 'uppercase' }}>Detailed Entries</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Shift</th>
                    <th style={th}>Type</th>
                    <th style={th}>BMC</th>
                    <th style={thR}>Qty (KG)</th>
                    <th style={thR}>FAT</th>
                    <th style={thR}>SNF</th>
                    <th style={thR}>Rate</th>
                    <th style={thR}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bmcEntries.map((e: any) => (
                    <tr key={e.entryId}>
                      <td style={td}>{e.date}</td>
                      <td style={{ ...td, textTransform: 'capitalize' }}>{e.shift}</td>
                      <td style={{ ...td, textTransform: 'capitalize' }}>{e.milkType || 'cow'}</td>
                      <td style={td}>{e.bmcName}</td>
                      <td style={tdR}>{parseFloat(e.quantityKg || 0).toFixed(2)}</td>
                      <td style={tdR}>{parseFloat(e.fat || 0).toFixed(1)}</td>
                      <td style={tdR}>{parseFloat(e.snf || 0).toFixed(1)}</td>
                      <td style={tdR}>₹{parseFloat(e.rate || 0).toFixed(2)}</td>
                      <td style={{ ...tdR, fontWeight: 700 }}>{formatIndianCurrency(parseFloat(e.amount || 0))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ ...td, fontWeight: 800, borderTop: '2px solid #333' }}>TOTAL</td>
                    <td style={{ ...tdR, fontWeight: 800, borderTop: '2px solid #333' }}>{grandQty.toFixed(2)}</td>
                    <td colSpan={3} style={{ borderTop: '2px solid #333' }}></td>
                    <td style={{ ...tdR, fontWeight: 800, borderTop: '2px solid #333' }}>{formatIndianCurrency(grandAmt)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })()}
      </>
      )}

      {showQR.show && (
        <div className="modal-overlay">
          <div className="modal-3d animate-fadeIn" style={{ padding: 32, maxWidth: 400, textAlign: 'center' }}>
            <div className="flex justify-between items-center mb-6">
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>Scan to Pay</h2>
              <button onClick={() => setShowQR({ ...showQR, show: false })} style={{ color: 'rgba(255,255,255,0.6)' }}>
                <X size={24} />
              </button>
            </div>
            <div style={{ background: 'white', padding: 20, borderRadius: 16, display: 'inline-block', marginBottom: 20 }}>
              <QRCodeSVG value={showQR.data} size={240} />
            </div>
            <p style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>{showQR.farmer}</p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 8 }}>Scan using any UPI App (PhonePe, Google Pay, etc.)</p>
            <button
              onClick={() => setShowQR({ ...showQR, show: false })}
              className="btn-3d w-full mt-8"
              style={{ padding: 12 }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentRegister;
