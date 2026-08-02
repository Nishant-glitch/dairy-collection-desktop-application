import React, { useState, useEffect } from 'react';
import { ref, get, set, onValue, push } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { sendPaymentSMS } from '../services/sms';
import { Smartphone, QrCode, Check, Calculator, X, Users, Snowflake, Printer, Lock } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { COMFED_LOGO, SUDHA_LOGO } from '../utils/reportLogos';
import { restoreCaret } from '../utils/focus';

interface PaymentEntry {
  farmerId: string;
  farmerName: string;
  mobile: string;
  upiId: string;
  grossAmount: number;
  deductions: number;
  bfAmount: number;
  netPayable: number;
  customAmount: number;
  isPaid: boolean;
}

// "YYYY-MM" of the calendar month immediately before the given month.
const prevMonthOf = (m: string): string => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Reusable "resolved period" — whatever mode the user picked, the calc & the
// downstream mark-paid / finalize / print / SMS all read from this so the
// period the user calculated with is the period every action uses.
type PayPeriodKind = 'month' | 'range';
interface ResolvedPeriod {
  kind: PayPeriodKind;
  startDate: string;   // yyyy-MM-dd (inclusive)
  endDate: string;     // yyyy-MM-dd (inclusive)
  month?: string;      // yyyy-MM (only in 'month' mode — drives farmerBalances key)
  label: string;       // human display, e.g. "August 2026" or "01/08/2026 to 15/08/2026"
  key: string;         // storage key, e.g. month "2026-08" or range "2026-08-01_2026-08-15"
}

const fmtDDMMYYYY = (yyyyMMdd: string): string => {
  const parts = String(yyyyMMdd).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : yyyyMMdd;
};

const monthLabel = (yyyyMM: string): string => {
  try {
    return new Date(`${yyyyMM}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  } catch { return yyyyMM; }
};

const PaymentRegister: React.FC = () => {
  const { t } = useLanguage();
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
  // Farmer payment period selector — default Monthly (backward compatible with
  // every existing flow: finalize, farmerBalances keying, payments/{month}/...).
  const todayStr = new Date().toISOString().split('T')[0];
  const firstOfCurMonth = `${new Date().toISOString().substring(0, 7)}-01`;
  const [payPeriod, setPayPeriod] = useState<PayPeriodKind>('month');
  const [fromDate, setFromDate] = useState(firstOfCurMonth);
  const [toDate, setToDate] = useState(todayStr);
  // Frozen at Calculate time so mark-as-paid / finalize / print use the SAME
  // period the results were computed for, even if the user then edits the form.
  const [calcPeriod, setCalcPeriod] = useState<ResolvedPeriod | null>(null);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [paidFilter, setPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  // Render rows in pages so 1000+ farmers don't hang the table.
  const PM_PAGE = 50;
  const [pmVisible, setPmVisible] = useState(PM_PAGE);
  // Cash vs Bank for the auto-generated Cash Book entry when marking paid.
  const [payMode, setPayMode] = useState<'cash' | 'bank'>('cash');
  const [locking, setLocking] = useState(false);
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
  // BMC defaults to Range mode (that's how the tab has always worked). Adding
  // Monthly as an opt-in for societies that batch BMC payouts by month.
  const [bmcPeriod, setBmcPeriod] = useState<PayPeriodKind>('range');
  const [bmcMonth, setBmcMonth] = useState(new Date().toISOString().substring(0, 7));
  const [bmcFilter, setBmcFilter] = useState('all');
  const [milkTypeFilter, setMilkTypeFilter] = useState<'all' | 'cow' | 'buffalo'>('all');
  const [bmcList, setBmcList] = useState<any[]>([]);
  const [bmcEntries, setBmcEntries] = useState<any[]>([]);
  const [bmcCalculated, setBmcCalculated] = useState(false);
  const [bmcBill, setBmcBill] = useState<any>({ unionName: '', route: '', salesSthan: '', headLoadRate: '', nextBillNo: 1 });
  const [billNo, setBillNo] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = loadFarmers();
    loadDCSInfo();
    const bmcUnsub = loadBMCList();
    const billUnsub = loadBmcBill();
    return () => {
      unsubscribe();
      bmcUnsub();
      billUnsub();
    };
  }, []);

  // Reset paging when the result set or the paid/unpaid filter changes.
  useEffect(() => { setPmVisible(PM_PAGE); }, [paidFilter, payments]);

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

  const loadBmcBill = () => {
    // Union-bill header fields (Union Name, Route, Sales Sthan, Head Load Rate)
    // and the auto-increment Bill No counter — all configured in Settings.
    const billRef = ref(database, up('settings/bmcBill'));
    return onValue(billRef, (snapshot) => {
      if (snapshot.exists()) {
        setBmcBill({ unionName: '', route: '', salesSthan: '', headLoadRate: '', nextBillNo: 1, ...snapshot.val() });
      }
    });
  };

  const calculateBMCEntries = async () => {
    // If Monthly mode, sync the range to the month's bounds so the print
    // header + downstream filtering all see the same window. Range mode uses
    // whatever the user typed as-is.
    let fromD = bmcFromDate;
    let toD = bmcToDate;
    if (bmcPeriod === 'month') {
      fromD = `${bmcMonth}-01`;
      toD = `${bmcMonth}-31`; // lexicographic upper bound — safe for Feb too
      setBmcFromDate(fromD);
      setBmcToDate(toD);
    } else {
      if (!fromD || !toD) { alert('From & To dates required.'); return; }
      if (toD < fromD) { alert('To Date, From Date ke baad ya barabar hona chahiye.'); return; }
    }

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
        if (d < fromD || d > toD) return;
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

    // Assign an auto-increment Bill No to this generated bill, then bump the
    // stored counter so the next bill gets the next number. Only consume a
    // number when the bill actually has data.
    if (list.length > 0) {
      const billSnap = await get(ref(database, up('settings/bmcBill/nextBillNo')));
      const cur = billSnap.exists() ? (parseInt(billSnap.val()) || 1) : 1;
      setBillNo(cur);
      await set(ref(database, up('settings/bmcBill/nextBillNo')), cur + 1);
    } else {
      setBillNo(null);
    }
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

  // Resolve the current form state into a single ResolvedPeriod value used by
  // every downstream operation. Returns null (and alerts) on invalid input.
  const resolvePeriod = (): ResolvedPeriod | null => {
    if (payPeriod === 'month') {
      return {
        kind: 'month',
        startDate: `${month}-01`,
        endDate: `${month}-31`,   // lexicographic upper bound — safe for Feb too
        month,
        label: monthLabel(month),
        key: month,
      };
    }
    // range mode
    if (!fromDate || !toDate) {
      alert('From Date aur To Date dono zaroori hain.');
      return null;
    }
    if (toDate < fromDate) {
      alert('To Date, From Date ke baad ya barabar hona chahiye.');
      return null;
    }
    return {
      kind: 'range',
      startDate: fromDate,
      endDate: toDate,
      label: `${fmtDDMMYYYY(fromDate)} to ${fmtDDMMYYYY(toDate)}`,
      key: `${fromDate}_${toDate}`,
    };
  };

  const calculatePayments = async () => {
    const period = resolvePeriod();
    if (!period) return;
    const { startDate, endDate } = period;

    const collectionRef = ref(database, up('milkCollection'));
    const snapshot = await get(collectionRef);

    const farmerPayments: { [key: string]: PaymentEntry } = {};

    // Get-or-create a payment row so the farmer list is a UNION of everyone
    // with ANY activity this month (milk, gross/deductions) or a carried
    // balance — never just farmers who gave milk. Missing a gross-only farmer
    // would drop their (usually negative) net and lose their B/F.
    const getOrCreate = (farmerId: string): PaymentEntry => {
      if (!farmerPayments[farmerId]) {
        const farmer = farmers[farmerId] || {};
        farmerPayments[farmerId] = {
          farmerId,
          farmerName: farmer.farmerName || 'Unknown',
          mobile: farmer.mobileNo || '',
          upiId: farmer.upiId || `${farmer.mobileNo}@ybl`,
          grossAmount: 0,
          deductions: 0,
          bfAmount: 0,
          netPayable: 0,
          customAmount: 0,
          isPaid: false,
        };
      }
      return farmerPayments[farmerId];
    };

    const inMonth = (d: any) => typeof d === 'string' && d >= startDate && d <= endDate;

    // 1. Milk collection (income).
    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.keys(data).forEach((date) => {
        if (date >= startDate && date <= endDate) {
          const shifts = data[date];
          Object.values(shifts).forEach((shift: any) => {
            Object.keys(shift).forEach((farmerId) => {
              getOrCreate(farmerId).grossAmount += parseFloat(shift[farmerId].amount || 0);
            });
          });
        }
      });
    }

    // 2. Balance Forward carriers — a farmer with a non-zero prior-month
    // balance must appear even with no activity this period. For range mode,
    // B/F is the balance stored for the month IMMEDIATELY BEFORE the range's
    // start month (same formula, driven off startDate). Note: within-month
    // ranges therefore show the same B/F irrespective of range start day;
    // exact mid-month carry needs full-month finalization first (documented
    // in the Date Range help text).
    const bfMonth = prevMonthOf(startDate.substring(0, 7));
    const balSnap = await get(ref(database, up('farmerBalances')));
    const balances: any = balSnap.exists() ? balSnap.val() : {};
    Object.keys(balances).forEach((farmerId) => {
      const bal = balances[farmerId];
      if (bal && bal.forMonth === bfMonth && bal.balance) getOrCreate(farmerId);
    });

    // 3. Gross entries / deductions from the nested per-farmer buckets
    // (grossEntries/{farmerCode}/{entryId}). Creates the farmer row if they
    // only have deductions this month — this is the core fix. Legacy flat
    // entries (grossEntries/{entryId} with a direct `date`) are skipped, same
    // as the Reports payment register, so a stray entryId can't become a
    // phantom farmer.
    const grossEntriesSnapshot = await get(ref(database, up('grossEntries')));
    if (grossEntriesSnapshot.exists()) {
      const grossEntriesData = grossEntriesSnapshot.val();
      Object.keys(grossEntriesData).forEach((code) => {
        const bucket = grossEntriesData[code];
        if (!bucket || typeof bucket !== 'object') return;
        if (typeof bucket.date === 'string') return; // legacy flat entry — skip
        let total = 0;
        Object.values(bucket).forEach((entry: any) => {
          if (entry && inMonth(entry.date)) total += parseFloat(entry.amount || 0);
        });
        if (total !== 0) getOrCreate(code).deductions += total;
      });
    }

    Object.keys(farmerPayments).forEach((farmerId) => {
      const payment = farmerPayments[farmerId];
      const bal = balances[farmerId];
      // Carry the prior month's balance forward (only if it's exactly the
      // previous month — a gap breaks the chain and B/F resets to 0).
      payment.bfAmount = (bal && bal.forMonth === bfMonth && typeof bal.balance === 'number') ? bal.balance : 0;
      payment.netPayable = payment.grossAmount - payment.deductions + payment.bfAmount;
      payment.customAmount = payment.netPayable;
    });

    // Restore persisted paid status for this period. Storage key is
    // period.key (month "yyyy-MM" or range "yyyy-MM-dd_yyyy-MM-dd") so month
    // marks and range marks live in separate buckets and never overwrite.
    const paidSnap = await get(ref(database, up(`payments/${period.key}`)));
    if (paidSnap.exists()) {
      const paidData = paidSnap.val();
      Object.keys(paidData).forEach((farmerId) => {
        if (farmerPayments[farmerId] && paidData[farmerId]?.status === 'paid') {
          farmerPayments[farmerId].isPaid = true;
          if (typeof paidData[farmerId].netAmount === 'number') {
            farmerPayments[farmerId].customAmount = paidData[farmerId].netAmount;
          }
        }
      });
    }

    setPayments(Object.values(farmerPayments));
    // Freeze the period AFTER the results are ready so any in-flight edit to
    // the form doesn't drift under the user before they mark-as-paid.
    setCalcPeriod(period);
  };

  // Finalize the month: store each farmer's Net Payable as their carry-forward
  // balance. The EXACT value carries — positive (credit) or negative (debt) —
  // so it becomes next month's B/F Amount. Month-mode only: range mode has no
  // stable "next month" to key against, so the button is hidden in that mode.
  const lockMonth = async () => {
    if (payments.length === 0 || !calcPeriod || calcPeriod.kind !== 'month') return;
    const lockedMonth = calcPeriod.month!;
    if (!confirm(`Finalize ${monthLabel(lockedMonth)}? Each farmer's Net Payable (positive or negative) will carry forward as next month's Balance Forward (B/F). You can re-finalize after recalculating.`)) {
      return;
    }
    setLocking(true);
    try {
      await Promise.all(
        payments.map((p) =>
          set(ref(database, up(`farmerBalances/${p.farmerId}`)), {
            balance: p.netPayable,
            forMonth: lockedMonth,
            updatedAt: Date.now(),
          })
        )
      );
      alert('✅ Month finalized. Balances will carry forward to next month.');
    } catch (err) {
      console.error('Finalize month failed:', err);
      alert('❌ Failed to finalize month. Please try again.');
    } finally {
      setLocking(false);
      restoreCaret(); // release focus so the caret re-renders (Windows caret bug)
    }
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
    const note = `Milk Payment ${calcPeriod?.label || month}`;

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
    if (!calcPeriod) return; // shouldn't happen — Calculate always sets it
    const periodKey = calcPeriod.key;
    const periodLabel = calcPeriod.label;
    const paymentRef = ref(database, up(`payments/${periodKey}/${payment.farmerId}`));
    await set(paymentRef, {
      grossAmount: payment.grossAmount,
      totalDeductions: payment.deductions,
      netAmount: payment.customAmount,
      status: 'paid',
      paidOn: Date.now(),
      payMode,
      period: { kind: calcPeriod.kind, startDate: calcPeriod.startDate, endDate: calcPeriod.endDate, label: periodLabel },
    });

    // Auto-link into the Cash Book (payment side). Dedup by sourceRef so
    // re-marking never creates a second entry. Only when actually paying out
    // (positive net) — a negative net means the farmer owes the society.
    const sourceRef = `${periodKey}_${payment.farmerId}`;
    const paidAmount = payment.customAmount || 0;
    if (paidAmount > 0) {
      const cbSnap = await get(ref(database, up('cashBook')));
      const already = cbSnap.exists() && Object.values(cbSnap.val()).some((e: any) => e.sourceRef === sourceRef);
      if (!already) {
        await push(ref(database, up('cashBook')), {
          date: new Date().toISOString().split('T')[0],
          side: 'payment',
          ledgerFolio: '',
          accountName: 'दूध उत्पादक',
          particulars: `${payment.farmerName} (${payment.farmerId}) - ${periodLabel} milk payment`,
          voucherNo: '',
          cashAmount: payMode === 'cash' ? paidAmount : 0,
          bankAmount: payMode === 'bank' ? paidAmount : 0,
          source: 'payment-register',
          sourceRef,
          createdAt: Date.now(),
        });
      }
    }

    if (payment.mobile) {
      await sendPaymentSMS(
        payment.farmerName,
        payment.farmerId,
        payment.mobile,
        periodLabel,
        payment.customAmount,
        dcsInfo.name || 'DCS'
      );
    }

    setPayments((prev) =>
      prev.map((p) => (p.farmerId === payment.farmerId ? { ...p, isPaid: true } : p))
    );

    alert('Payment marked as paid and SMS sent!');
  };

  const labelStyle: React.CSSProperties = { color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' };

  // Paid/Unpaid filter for the Farmer Payments result table. Totals below use
  // the full filtered set; only the RENDER is paginated (pmVisible).
  const filteredPayments = payments.filter((p) =>
    paidFilter === 'all' ? true : paidFilter === 'paid' ? p.isPaid : !p.isPaid
  );
  const visiblePayments = filteredPayments.slice(0, pmVisible);
  const paidCount = payments.filter((p) => p.isPaid).length;
  const unpaidCount = payments.length - paidCount;

  return (
    <div className="page-wrapper animate-fadeIn">
      <h1 className="page-title">{t('paymentRegister')}</h1>

      {/* Tabs: Farmer vs BMC */}
      <div className="flex gap-2 bg-black/5 rounded-xl border border-slate-200" style={{ padding: '4px', marginBottom: '20px', maxWidth: '420px' }}>
        <button
          onClick={() => setActiveTab('farmer')}
          style={{ padding: '10px 16px' }}
          className={`flex-1 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'farmer' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-[#11211A]'}`}
        >
          <Users size={14} /> FARMER PAYMENTS
        </button>
        <button
          onClick={() => setActiveTab('bmc')}
          style={{ padding: '10px 16px' }}
          className={`flex-1 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'bmc' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-[#11211A]'}`}
        >
          <Snowflake size={14} /> BMC PAYMENTS
        </button>
      </div>

      {activeTab === 'farmer' && (
      <>
      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
        <label style={{ ...labelStyle, marginBottom: 12 }}>Select Payment Period</label>

        {/* Two radio-driven rows: pick monthly OR a specific range. The inactive
            row is dimmed but kept visible so the user can see what they're not
            using — one click flips modes without losing their inputs. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Monthly row */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: 'pointer', opacity: payPeriod === 'month' ? 1 : 0.55 }}>
            <input
              type="radio"
              name="payPeriod"
              checked={payPeriod === 'month'}
              onChange={() => setPayPeriod('month')}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--brand)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', minWidth: 100 }}>Full Month:</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              onFocus={() => setPayPeriod('month')}
              className="input-3d"
              style={{ height: '38px', padding: '8px 12px', fontSize: '14px', maxWidth: 200 }}
            />
          </label>

          {/* Date Range row */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: 'pointer', opacity: payPeriod === 'range' ? 1 : 0.55 }}>
            <input
              type="radio"
              name="payPeriod"
              checked={payPeriod === 'range'}
              onChange={() => setPayPeriod('range')}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--brand)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', minWidth: 100 }}>Date Range:</span>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>From</span>
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
              onFocus={() => setPayPeriod('range')}
              className="input-3d"
              style={{ height: '38px', padding: '8px 12px', fontSize: '14px', maxWidth: 170 }}
            />
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>To</span>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              onFocus={() => setPayPeriod('range')}
              className="input-3d"
              style={{ height: '38px', padding: '8px 12px', fontSize: '14px', maxWidth: 170 }}
            />
          </label>
        </div>

        <div className="flex" style={{ gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            onClick={calculatePayments}
            className="btn-3d"
            style={{ padding: '10px 20px', height: '40px', minHeight: '40px' }}
          >
            <Calculator size={16} />
            Calculate
          </button>
          {/* Finalize is inherently month-keyed (drives next month's B/F).
              Hidden in range mode so users can't half-finalize a slice. */}
          {payments.length > 0 && calcPeriod?.kind === 'month' && (
            <button
              onClick={lockMonth}
              disabled={locking}
              className="btn-secondary"
              style={{ padding: '10px 20px', height: '40px', minHeight: '40px' }}
              title="Store each farmer's Net Payable as next month's Balance Forward"
            >
              <Lock size={16} />
              {locking ? 'Finalizing…' : 'Finalize Month'}
            </button>
          )}
        </div>

        {payPeriod === 'range' && (
          <p style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            <strong>Note:</strong> Date Range mein B/F wo hai jo range ki starting month se pehle carry forward hua hai — mid-month starting date pe exact carry-forward chahiye toh pehle poora previous month "Finalize Month" karke settle karein.
          </p>
        )}
      </div>

      {payments.length > 0 && (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          {/* Period header — visible on screen AND on print so the printout
              always states which range the numbers cover. */}
          {calcPeriod && (
            <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Payment Period:</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{calcPeriod.label}</span>
              {calcPeriod.kind === 'range' && (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  ({fmtDDMMYYYY(calcPeriod.startDate)} – {fmtDDMMYYYY(calcPeriod.endDate)})
                </span>
              )}
            </div>
          )}

          {/* Payment mode for the Cash Book auto-entry when marking paid */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Mark-as-Paid mode (Cash Book):</span>
            <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
              {(['cash', 'bank'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPayMode(m)}
                  style={{ padding: '6px 16px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, textTransform: 'capitalize', background: payMode === m ? 'var(--brand)' : '#fff', color: payMode === m ? '#fff' : 'var(--ink-2)' }}
                >
                  {m === 'cash' ? 'नकद Cash' : 'बैंक Bank'}
                </button>
              ))}
            </div>
          </div>

          {/* Paid / Unpaid filter */}
          <div className="flex gap-2 bg-black/5 rounded-xl border border-slate-200" style={{ padding: '4px', marginBottom: '16px', maxWidth: '360px' }}>
            {([
              { id: 'all', label: `All (${payments.length})` },
              { id: 'unpaid', label: `Unpaid (${unpaidCount})` },
              { id: 'paid', label: `Paid (${paidCount})` },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setPaidFilter(opt.id)}
                style={{ padding: '8px 12px' }}
                className={`flex-1 rounded-lg text-xs font-black transition-all ${paidFilter === opt.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-[#11211A]'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="table-3d overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Farmer Code</th>
                  <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Name</th>
                  <th className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Gross Amount</th>
                  <th className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>B/F Amt</th>
                  <th className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Deductions</th>
                  <th className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Net Payable</th>
                  <th className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Pay Amount</th>
                  <th className="px-4 py-[9px] text-center" style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePayments.map((payment) => (
                  <tr key={payment.farmerId} className="table-row">
                    <td className="px-4 py-[9px] font-bold" style={{ padding: '12px 16px', fontSize: '14px' }}>{payment.farmerId}</td>
                    <td className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '14px' }}>{payment.farmerName}</td>
                    <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--brand)', fontWeight: 600 }}>
                      {formatIndianCurrency(payment.grossAmount)}
                    </td>
                    <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '14px', color: payment.bfAmount < 0 ? '#ef4444' : payment.bfAmount > 0 ? '#16a34a' : 'var(--ink-2)', fontWeight: payment.bfAmount !== 0 ? 700 : 400 }}>
                      {payment.bfAmount === 0 ? '—' : `${payment.bfAmount > 0 ? '+' : ''}${formatIndianCurrency(payment.bfAmount)}`}
                    </td>
                    <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '14px', color: '#ef4444' }}>
                      {formatIndianCurrency(payment.deductions)}
                    </td>
                    <td className="px-4 py-[9px] text-right font-bold" style={{ padding: '12px 16px', fontSize: '14px', color: payment.netPayable < 0 ? '#ef4444' : '#16a34a' }}>
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
                        <div style={{ color: 'var(--brand)', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
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
                {filteredPayments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center" style={{ padding: '32px 16px', color: 'var(--muted)', fontSize: 14 }}>
                      No {paidFilter} farmers for this month.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                <tr>
                  <td colSpan={2} className="px-4 py-[9px]" style={{ padding: '12px 16px', color: 'var(--ink)', fontSize: '14px', fontWeight: 700 }}>TOTAL</td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', color: 'var(--brand)', fontSize: '14px', fontWeight: 700 }}>
                    {formatIndianCurrency(filteredPayments.reduce((sum, p) => sum + p.grossAmount, 0))}
                  </td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', color: 'var(--ink-2)', fontSize: '14px', fontWeight: 700 }}>
                    {formatIndianCurrency(filteredPayments.reduce((sum, p) => sum + p.bfAmount, 0))}
                  </td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', color: '#ef4444', fontSize: '14px', fontWeight: 700 }}>
                    {formatIndianCurrency(filteredPayments.reduce((sum, p) => sum + p.deductions, 0))}
                  </td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', color: 'var(--ink)', fontSize: '14px', fontWeight: 700 }}>
                    {formatIndianCurrency(filteredPayments.reduce((sum, p) => sum + p.netPayable, 0))}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {filteredPayments.length > pmVisible && (
            <div className="no-print" style={{ textAlign: 'center', marginTop: 16 }}>
              <button onClick={() => setPmVisible((c) => c + PM_PAGE)} className="btn-secondary" style={{ padding: '10px 24px', fontWeight: 700 }}>
                Load more ({pmVisible} / {filteredPayments.length})
              </button>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {activeTab === 'bmc' && (
      <>
        <div className="glass-card no-print" style={{ padding: '20px 24px', marginBottom: '20px' }}>
          {/* Same Monthly / Date Range toggle as Farmer payments. BMC defaults
              to Date Range because that's how the tab has always worked. */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
            {(['range', 'month'] as const).map((mode) => (
              <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: bmcPeriod === mode ? 'var(--ink)' : 'var(--ink-2)' }}>
                <input
                  type="radio"
                  name="bmcPeriod"
                  checked={bmcPeriod === mode}
                  onChange={() => setBmcPeriod(mode)}
                  style={{ width: 15, height: 15, accentColor: 'var(--brand)' }}
                />
                {mode === 'range' ? 'Date Range' : 'Full Month'}
              </label>
            ))}
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end" style={{ gap: '16px' }}>
            {bmcPeriod === 'month' ? (
              <div style={{ maxWidth: '200px', width: '100%' }}>
                <label style={labelStyle}>Select Month</label>
                <input
                  type="month"
                  value={bmcMonth}
                  onChange={(e) => setBmcMonth(e.target.value)}
                  className="input-3d w-full"
                  style={{ height: '40px', padding: '10px 14px', fontSize: '14px' }}
                />
              </div>
            ) : (<>
            <div style={{ maxWidth: '180px', width: '100%' }}>
              <label style={labelStyle}>From Date</label>
              <input
                type="date"
                value={bmcFromDate}
                max={bmcToDate || undefined}
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
                min={bmcFromDate || undefined}
                onChange={(e) => setBmcToDate(e.target.value)}
                className="input-3d w-full"
                style={{ height: '40px', padding: '10px 14px', fontSize: '14px' }}
              />
            </div>
            </>)}
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
            <p style={{ color: 'var(--ink-2)', fontSize: 15, textAlign: 'center', padding: '32px 0' }}>
              No BMC entries found for the selected range.
            </p>
          </div>
        )}

        {bmcCalculated && bmcEntries.length > 0 && (() => {
          const fmtDMY = (d: string) => {
            if (!d) return '';
            const [y, m, day] = d.split('-');
            return `${day}/${m}/${y}`;
          };
          const fmtDM = (d: string) => {
            const parts = d.split('-');
            return `${parts[2]}-${parts[1]}`;
          };

          // Aggregate per milkType -> date -> shift. Kg.Fat / Kg.SNF are derived
          // at display time (qty*fat/100, qty*snf/100). Value Rs. is the
          // rate-chart amount already computed at entry time (no new rate logic).
          const buildSection = (type: string) => {
            const byDate: any = {};
            bmcEntries
              .filter((e: any) => (e.milkType || 'cow') === type)
              .forEach((e: any) => {
                const d = e.date;
                if (!byDate[d]) byDate[d] = {
                  morning: { qty: 0, kgFat: 0, kgSnf: 0, value: 0 },
                  evening: { qty: 0, kgFat: 0, kgSnf: 0, value: 0 },
                };
                const slot = e.shift === 'evening' ? byDate[d].evening : byDate[d].morning;
                const q = parseFloat(e.quantityKg || 0);
                const f = parseFloat(e.fat || 0);
                const s = parseFloat(e.snf || 0);
                slot.qty += q;
                slot.kgFat += (q * f) / 100;
                slot.kgSnf += (q * s) / 100;
                slot.value += parseFloat(e.amount || 0);
              });
            return { byDate, dates: Object.keys(byDate).sort() };
          };

          const cow = buildSection('cow');
          const buff = buildSection('buffalo');

          const secQty = (sec: any) => sec.dates.reduce((sum: number, d: string) => sum + sec.byDate[d].morning.qty + sec.byDate[d].evening.qty, 0);
          const secVal = (sec: any) => sec.dates.reduce((sum: number, d: string) => sum + sec.byDate[d].morning.value + sec.byDate[d].evening.value, 0);
          const cowQty = secQty(cow);
          const bufQty = secQty(buff);
          const allQty = cowQty + bufQty;
          const grandValue = secVal(cow) + secVal(buff);
          const selectedBmcName = bmcFilter === 'all' ? 'All' : (bmcList.find((b) => b.bmcId === bmcFilter)?.name || '');

          const cellBase: React.CSSProperties = { border: '1px solid #888', fontSize: 9, padding: '2px 4px', color: '#111' };
          const hCell: React.CSSProperties = { ...cellBase, fontWeight: 700, textAlign: 'center', background: '#eee' };
          const nCell: React.CSSProperties = { ...cellBase, textAlign: 'right' };
          const dCell: React.CSSProperties = { ...cellBase, textAlign: 'center', fontWeight: 700 };
          const infoLabel: React.CSSProperties = { fontWeight: 700 };

          const shiftCells = (slot: any) => {
            if (!slot || slot.qty === 0) {
              return (<>
                <td style={nCell} /><td style={nCell} /><td style={nCell} />
                <td style={nCell} /><td style={nCell} /><td style={nCell} />
              </>);
            }
            const fatPct = slot.qty > 0 ? (slot.kgFat * 100) / slot.qty : 0;
            const snfPct = slot.qty > 0 ? (slot.kgSnf * 100) / slot.qty : 0;
            return (<>
              <td style={nCell}>{slot.qty.toFixed(1)}</td>
              <td style={nCell}>{fatPct.toFixed(1)}</td>
              <td style={nCell}>{slot.kgFat.toFixed(3)}</td>
              <td style={nCell}>{snfPct.toFixed(1)}</td>
              <td style={nCell}>{slot.kgSnf.toFixed(3)}</td>
              <td style={nCell}>{slot.value.toFixed(2)}</td>
            </>);
          };

          const renderSection = (label: string, sec: any) => (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#111', margin: '4px 0' }}>{label}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ ...hCell, width: '7%' }} rowSpan={2}>Date</th>
                    <th style={hCell} colSpan={6}>MORNING</th>
                    <th style={hCell} colSpan={6}>EVENING</th>
                  </tr>
                  <tr>
                    {['QTY', 'Fat%', 'Kg.Fat', 'SNF%', 'Kg.SNF', 'Value Rs.', 'QTY', 'Fat%', 'Kg.Fat', 'SNF%', 'Kg.SNF', 'Value Rs.'].map((h, i) => (
                      <th key={i} style={hCell}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.dates.length === 0 ? (
                    <tr><td style={{ ...cellBase, textAlign: 'center' }} colSpan={13}>No {label.toLowerCase()} entries</td></tr>
                  ) : sec.dates.map((d: string) => (
                    <tr key={d}>
                      <td style={dCell}>{fmtDM(d)}</td>
                      {shiftCells(sec.byDate[d].morning)}
                      {shiftCells(sec.byDate[d].evening)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );

          return (
            <div
              id="report-sheet"
              style={{ background: '#fff', maxWidth: '920px', margin: '0 auto', padding: '24px 28px', borderRadius: '4px', boxShadow: '0 12px 48px rgba(0,0,0,0.45)', color: '#111' }}
            >
              {/* Header with logos + union name */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '2px solid #000', paddingBottom: 8 }}>
                <div style={{ width: 88, textAlign: 'center', flexShrink: 0 }}>
                  {COMFED_LOGO
                    ? <img src={COMFED_LOGO} alt="COMFED" style={{ maxWidth: 80, maxHeight: 60 }} />
                    : <div style={{ border: '1px solid #777', borderRadius: '50%', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 9, fontWeight: 700 }}>COMFED</div>}
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, textTransform: 'uppercase' }}>{bmcBill.unionName || dcsInfo.name || 'Union'}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, textDecoration: 'underline', marginTop: 2 }}>Milk Bill</div>
                </div>
                <div style={{ width: 88, textAlign: 'center', flexShrink: 0 }}>
                  {SUDHA_LOGO
                    ? <img src={SUDHA_LOGO} alt="Sudha" style={{ maxWidth: 80, maxHeight: 60 }} />
                    : <div style={{ border: '1px solid #c0392b', borderRadius: 4, padding: '8px 6px', fontSize: 15, fontWeight: 700, color: '#c0392b', fontStyle: 'italic' }}>Sudha</div>}
                </div>
              </div>

              {/* Info lines (no bank / deduction fields) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '8px 2px 0' }}>
                <span><span style={infoLabel}>Society:</span> {dcsInfo.name || ''}{dcsInfo.code ? ` (${dcsInfo.code})` : ''}</span>
                <span><span style={infoLabel}>Page:</span> 1</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '2px 2px' }}>
                <span><span style={infoLabel}>Route:</span> {bmcBill.route || '—'}</span>
                <span><span style={infoLabel}>Bill No.</span> {billNo ?? '—'}</span>
              </div>
              <div style={{ fontSize: 12, margin: '2px 2px' }}>
                <span style={infoLabel}>Milk Bill Date From:</span> {fmtDMY(bmcFromDate)} &nbsp;&nbsp; <span style={infoLabel}>To:</span> {fmtDMY(bmcToDate)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '2px 2px 10px' }}>
                <span><span style={infoLabel}>Sales Sthan:</span> {bmcBill.salesSthan || '—'}{bmcFilter !== 'all' ? ` | BMC: ${selectedBmcName}` : ''}</span>
                <span><span style={infoLabel}>Head Load Rate:</span> {bmcBill.headLoadRate || '—'}</span>
              </div>

              {/* Cow + Buffalo sections (Morning / Evening side-by-side) */}
              {renderSection('Cow Milk', cow)}
              {renderSection('Buff. Milk', buff)}

              {/* Totals — only milk quantity & value (no deduction / net payable) */}
              <div style={{ marginTop: 12, borderTop: '2px solid #000', paddingTop: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 24 }}><span style={{ fontWeight: 700, width: 50 }}>Cow:</span><span>{cowQty.toFixed(1)} Kg</span></div>
                <div style={{ display: 'flex', gap: 24 }}><span style={{ fontWeight: 700, width: 50 }}>Buf:</span><span>{bufQty.toFixed(1)} Kg</span></div>
                <div style={{ display: 'flex', gap: 24, fontWeight: 800, marginTop: 2 }}>
                  <span style={{ width: 50 }}>All:</span>
                  <span>{allQty.toFixed(1)} Kg</span>
                  <span>Value Rs. {grandValue.toFixed(2)}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </>
      )}

      {showQR.show && (
        <div className="modal-overlay">
          <div className="modal-3d animate-fadeIn" style={{ padding: 32, maxWidth: 400, textAlign: 'center' }}>
            <div className="flex justify-between items-center mb-6">
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Scan to Pay</h2>
              <button onClick={() => setShowQR({ ...showQR, show: false })} style={{ color: 'var(--ink-2)' }}>
                <X size={24} />
              </button>
            </div>
            <div style={{ background: 'white', padding: 20, borderRadius: 16, display: 'inline-block', marginBottom: 20 }}>
              <QRCodeSVG value={showQR.data} size={240} />
            </div>
            <p style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 16 }}>{showQR.farmer}</p>
            <p style={{ color: 'var(--ink-2)', fontSize: 12, marginTop: 8 }}>Scan using any UPI App (PhonePe, Google Pay, etc.)</p>
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
