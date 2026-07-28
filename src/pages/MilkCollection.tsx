import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, set, get, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { sendSMS } from '../services/sms';
import { X, Edit2, Trash2, CheckCircle, Droplet, Clock, Calendar, Zap, Printer, MessageSquare, History, WifiOff } from 'lucide-react';
import { getRateFromMap } from '../utils/rateCalculator';
import { useConnection } from '../hooks/useConnection';
import { printHtml } from '../utils/printHtml';
import { restoreCaret } from '../utils/focus';

interface Entry {
  farmerCode: string;
  farmerName: string;
  qty: number;
  fat: number;
  snf?: number;
  clr?: number;
  rate: number;
  amount: number;
  timestamp: number;
}

interface MilkCollectionProps {
  onNavigate: (page: string) => void;
}

const MilkCollection: React.FC<MilkCollectionProps> = ({ onNavigate }) => {
  const { t } = useLanguage();
  const [showSessionSetup, setShowSessionSetup] = useState(true);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionShift, setSessionShift] = useState<'Morning' | 'Evening'>('Morning');
  const [sessionMode, setSessionMode] = useState<'SNF' | 'CLR'>('SNF');
  const [printEnabled, setPrintEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  
  const [farmerCode, setFarmerCode] = useState('');
  const [farmerName, setFarmerName] = useState('');
  const [farmerFound, setFarmerFound] = useState(false);
  const [qty, setQty] = useState('');
  const [fat, setFat] = useState('');
  const [snfClr, setSnfClr] = useState('');
  const [rate, setRate] = useState(0);
  const [amount, setAmount] = useState(0);
  const [isModifying, setIsModifying] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [showSavedMessage, setShowSavedMessage] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const online = useConnection();
  const [duplicateWarning, setDuplicateWarning] = useState<{show: boolean, message: string}>({show: false, message: ''});

  const [todayEntries, setTodayEntries] = useState<Entry[]>([]);
  const [activeRateConfig, setActiveRateConfig] = useState<any>(null);
  const [dcsInfo, setDcsInfo] = useState<any>({});
  const [farmers, setFarmers] = useState<any>({});
  const [fatMin, setFatMin] = useState<number>(2.5);
  const [fatMax, setFatMax] = useState<number>(15.0);
  const [snfMin, setSnfMin] = useState<number>(7.5);
  const [snfMax, setSnfMax] = useState<number>(15.0);

  const farmerCodeRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const fatRef = useRef<HTMLInputElement>(null);
  const snfClrRef = useRef<HTMLInputElement>(null);
  const fetchTimerRef = useRef<any>(null);

  const safeNum = (val: any): number => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  useEffect(() => {
    loadDCSInfo();
    const unsubscribe = loadFarmers();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!showSessionSetup) {
      const unsubscribe = loadTodayEntries();
      return unsubscribe;
    }
  }, [showSessionSetup, sessionDate, sessionShift]);

  useEffect(() => {
    if (!qty || !fat || !snfClr || !activeRateConfig) {
      setRate(0);
      setAmount(0);
      return;
    }
    try {
      const r = getRateFromMap(
        parseFloat(fat) || 0,
        parseFloat(snfClr) || 0,
        activeRateConfig
      );
      setRate(r || 0);
      setAmount(safeNum(r) * (parseFloat(qty) || 0));
    } catch (err) {
      console.error('Rate calc error:', err);
      setRate(0);
      setAmount(0);
    }
  }, [qty, fat, snfClr, activeRateConfig]);

  // Pick the rate chart that was effective on the ENTRY's date (not today's).
  // This protects back-dated entries: e.g. a 10-Jun entry always uses the chart
  // effective on 10 Jun, never a chart published later. Uses the versioned
  // globalRateConfig/history; falls back to /current only if no history exists.
  const getConfigForDate = async (collectionDate: string) => {
    const historySnap = await get(ref(database, 'globalRateConfig/history'));
    if (historySnap.exists()) {
      const configs = (Object.values(historySnap.val()) as any[])
        .filter((c: any) => c && c.effectiveFrom)
        .sort((a: any, b: any) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
      if (configs.length > 0) {
        // Latest chart whose effectiveFrom is on/before the entry date.
        const valid = [...configs].reverse().find((c: any) => c.effectiveFrom <= collectionDate);
        return valid || configs[0]; // date before all charts -> earliest chart
      }
    }
    const currentSnap = await get(ref(database, 'globalRateConfig/current'));
    return currentSnap.exists() ? currentSnap.val() : null;
  };

  const loadDCSInfo = async () => {
    const dcsRef = ref(database, up('dcsInfo'));
    const snapshot = await get(dcsRef);
    if (snapshot.exists()) {
      setDcsInfo(snapshot.val());
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

  const loadTodayEntries = () => {
    const entriesRef = ref(database, up(`milkCollection/${sessionDate}/${sessionShift}`));
    return onValue(entriesRef, (snapshot) => {
      const entries: Entry[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach((code) => {
          entries.push({ farmerCode: code, ...data[code] });
        });
      }
      setTodayEntries(entries);
    });
  };

  const handleStartSession = async () => {
    const config = await getConfigForDate(sessionDate);
    if (!config) {
      alert('No rate chart found for this date. Please contact admin to upload a rate chart.');
      return;
    }
    setActiveRateConfig(config);

    const fatVals = (config.fatValues || []).map(Number).filter((n: any) => !isNaN(n)).sort((a: number, b: number) => a - b);
    const snfVals = (config.snfValues || []).map(Number).filter((n: any) => !isNaN(n)).sort((a: number, b: number) => a - b);

    if (fatVals.length > 0) {
      setFatMin(fatVals[0]);
      setFatMax(fatVals[fatVals.length - 1]);
    }
    if (snfVals.length > 0) {
      setSnfMin(snfVals[0]);
      setSnfMax(snfVals[snfVals.length - 1]);
    }

    setShowSessionSetup(false);
    setTimeout(() => {
      farmerCodeRef.current?.focus();
    }, 100);
  };

  const handleSaveOrUpdate = async () => {
    if (!farmerCode || !qty || !fat || !snfClr) {
      alert('All fields are required!');
      return;
    }

    if (!farmerFound) {
      alert('Farmer not found! Please enter a valid farmer code.');
      farmerCodeRef.current?.focus();
      return;
    }

    const fatVal = parseFloat(fat);
    const snfVal = parseFloat(snfClr);

    const FIXED_FAT_MIN = 2.5;
    const FIXED_FAT_MAX = 15.0;
    const FIXED_SNF_MIN = 7.5;
    const FIXED_SNF_MAX = 15.0;

    if (fatVal < FIXED_FAT_MIN || fatVal > FIXED_FAT_MAX) {
      const popup = document.createElement('div');
      popup.innerHTML = `
        <div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px)">
          <div style="background:linear-gradient(145deg,#1a0a0a,#2d1010);border:1px solid rgba(248,113,113,0.4);border-radius:16px;padding:32px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
            <div style="font-size:40px;margin-bottom:12px">❌</div>
            <h3 style="color:#f87171;font-size:18px;font-weight:800;margin-bottom:8px">Invalid FAT Value</h3>
            <p style="color:var(--line);font-size:14px;margin-bottom:6px">Allowed Range: <strong style="color:white">${FIXED_FAT_MIN} – ${FIXED_FAT_MAX}</strong></p>
            <p style="color:var(--line);font-size:13px;margin-bottom:24px">Entered: <strong style="color:#f87171">${fatVal}</strong></p>
            <button onclick="this.closest('div[style*=inset]').remove()" style="background:linear-gradient(135deg,#ef4444,#b91c1c);border:none;border-radius:10px;color:white;font-weight:700;font-size:14px;padding:12px 32px;cursor:pointer;width:100%">OK</button>
          </div>
        </div>`;
      document.body.appendChild(popup.firstElementChild!);
      fatRef.current?.focus();
      return;
    }

    if (snfVal < FIXED_SNF_MIN || snfVal > FIXED_SNF_MAX) {
      const popup = document.createElement('div');
      popup.innerHTML = `
        <div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px)">
          <div style="background:linear-gradient(145deg,#1a0a0a,#2d1010);border:1px solid rgba(248,113,113,0.4);border-radius:16px;padding:32px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
            <div style="font-size:40px;margin-bottom:12px">❌</div>
            <h3 style="color:#f87171;font-size:18px;font-weight:800;margin-bottom:8px">Invalid ${sessionMode} Value</h3>
            <p style="color:var(--line);font-size:14px;margin-bottom:6px">Allowed Range: <strong style="color:white">${FIXED_SNF_MIN} – ${FIXED_SNF_MAX}</strong></p>
            <p style="color:var(--line);font-size:13px;margin-bottom:24px">Entered: <strong style="color:#f87171">${snfVal}</strong></p>
            <button onclick="this.closest('div[style*=inset]').remove()" style="background:linear-gradient(135deg,#ef4444,#b91c1c);border:none;border-radius:10px;color:white;font-weight:700;font-size:14px;padding:12px 32px;cursor:pointer;width:100%">OK</button>
          </div>
        </div>`;
      document.body.appendChild(popup.firstElementChild!);
      snfClrRef.current?.focus();
      return;
    }

    if (!isModifying && todayEntries.find(e => e.farmerCode === farmerCode)) {
      alert('⚠️ Entry already exists! Use Modify button from the table.');
      return;
    }

    const entryData: any = {
      farmerName,
      qty: parseFloat(qty),
      fat: parseFloat(fat),
      rate,
      amount,
      timestamp: Date.now(),
    };

    if (sessionMode === 'SNF') {
      entryData.snf = parseFloat(snfClr);
    } else {
      entryData.clr = parseFloat(snfClr);
    }

    const entryRef = ref(database, up(`milkCollection/${sessionDate}/${sessionShift}/${farmerCode}`));

    // IMPORTANT (weak internet): offline, `set()` does NOT resolve until the
    // connection returns — awaiting it would hang the save and make the clerk
    // think the entry was lost. So we only await when online. Offline, the
    // write is queued in RTDB's local cache (UI updates optimistically) and
    // auto-syncs on reconnect — the entry is safe either way.
    const writePromise = set(entryRef, entryData);
    if (online) {
      await writePromise;
    } else {
      writePromise.catch((e) => console.error('Queued offline write will retry:', e));
    }

    // Print works offline too (buildShiftTotal reads from the local cache).
    if (printEnabled) {
      try {
        const shiftTotal = await buildShiftTotal();
        printSlip(shiftTotal);
      } catch (e) {
        console.error('Print skipped (offline/no cache):', e);
      }
    }

    // SMS only when online — it needs the network.
    if (online && smsEnabled) {
      try {
        const farmerSnap = await get(ref(database, up(`farmers/${farmerCode}`)));
        const farmerMobile = farmerSnap.exists() ? farmerSnap.val().mobileNo : '';
        if (farmerMobile) {
          await sendSMS({
            farmerId: farmerCode,
            mobile: farmerMobile,
            farmerName: farmerName,
            qty: qty,
            fat: fat,
            amount: (amount || 0).toFixed(2),
          });
        }
      } catch (e) {
        console.error('SMS skipped:', e);
      }
    }

    clearForm();
    if (online) {
      setShowSavedMessage(true);
      setTimeout(() => setShowSavedMessage(false), 1500);
    } else {
      setOfflineSaved(true);
      setTimeout(() => setOfflineSaved(false), 4000);
    }
    farmerCodeRef.current?.focus();
  };

  // Running total for the whole DCS for today's date + shift. Read after the
  // entry is saved so the just-saved entry is included. Morning and Evening are
  // separate buckets (different shift key) and each date is its own node, so
  // totals are per-shift and reset fresh each day.
  const buildShiftTotal = async () => {
    const snap = await get(ref(database, up(`milkCollection/${sessionDate}/${sessionShift}`)));
    let count = 0;
    let qty = 0;
    let amount = 0;
    if (snap.exists()) {
      const data = snap.val();
      Object.keys(data).forEach((code) => {
        const e = data[code];
        count++;
        qty += safeNum(e.qty);
        amount += safeNum(e.amount);
      });
    }
    return { count, qty, amount };
  };

  const printSlip = (shiftTotal: { count: number; qty: number; amount: number } | null = null) => {
    const totalHtml = shiftTotal ? `
        <hr/>
        <p><strong>Total Shift :</strong> ${shiftTotal.count}</p>
        <p><strong>Total Qty   :</strong> ${shiftTotal.qty.toFixed(2)}</p>
        <p><strong>Tot Amnt    :</strong> ₹${shiftTotal.amount.toFixed(2)}</p>
    ` : '';

    const printContent = `
      <div id="milk-print-slip" style="padding: 20px; font-family: Arial;">
        <h2 style="text-align: center;">${dcsInfo.name || 'DCS Pro'}</h2>
        <h3 style="text-align: center;">Milk Collection Receipt</h3>
        <hr/>
        <p><strong>Date:</strong> ${sessionDate} | <strong>Shift:</strong> ${sessionShift}</p>
        <p><strong>Farmer Code:</strong> ${farmerCode}</p>
        <p><strong>Farmer Name:</strong> ${farmerName}</p>
        <hr/>
        <p><strong>Quantity:</strong> ${qty} Liters</p>
        <p><strong>FAT:</strong> ${fat}%</p>
        <p><strong>${sessionMode}:</strong> ${snfClr}%</p>
        <p><strong>Rate:</strong> ₹${(rate || 0).toFixed(2)}/Liter</p>
        <p style="font-size: 18px;"><strong>Amount:</strong> ₹${(amount || 0).toFixed(2)}</p>
        ${totalHtml}
        <hr/>
        <p style="text-align: center; font-size: 12px;">Thank you!</p>
      </div>
    `;

    // Hidden-iframe print (no window.open -> not blocked by popup blockers).
    printHtml(`<html><head><title>Milk Collection Receipt</title></head><body>${printContent}</body></html>`);
  };

  const clearForm = () => {
    setFarmerCode('');
    setFarmerName('');
    setFarmerFound(false);
    setQty('');
    setFat('');
    setSnfClr('');
    setRate(0);
    setAmount(0);
    setIsModifying(false);
    setWarningMessage('');
    setDuplicateWarning({show: false, message: ''});
  };

  const handleModify = (entry: Entry) => {
    setFarmerCode(entry.farmerCode);
    setFarmerName(entry.farmerName);
    setFarmerFound(true);
    setQty(entry.qty.toString());
    setFat(entry.fat.toString());
    setSnfClr((entry.snf || entry.clr || '').toString());
    setIsModifying(true);
    setWarningMessage('');
    qtyRef.current?.focus();
  };

  const handleDelete = async (code: string) => {
    if (confirm('Are you sure you want to delete this entry?')) {
      const entryRef = ref(database, up(`milkCollection/${sessionDate}/${sessionShift}/${code}`));
      await remove(entryRef);
      setDuplicateWarning({show: false, message: ''});
      restoreCaret(farmerCodeRef.current); // restore cursor (Windows caret bug)
    }
  };

  const handleFarmerCodeChange = (code: string) => {
    setFarmerCode(code);
    setDuplicateWarning({show: false, message: ''});
    if (code.length >= 1) {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = setTimeout(async () => {
        const snap = await get(ref(database, up(`farmers/${code}`)));
        if (snap.exists()) {
          setFarmerName(snap.val().farmerName || snap.val().name);
          setFarmerFound(true);
          setWarningMessage(todayEntries.find(ent => ent.farmerCode === code) ? 'Already entered' : '');
        } else {
          setFarmerName('');
          setFarmerFound(false);
        }
      }, 300);
    } else {
      setFarmerName('');
      setFarmerFound(false);
    }
  };

  const handleFarmerCodeKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && farmerFound) {
      const snap = await get(ref(database, up(`milkCollection/${sessionDate}/${sessionShift}/${farmerCode}`)));
      if (snap.exists()) {
        setDuplicateWarning({ show: true, message: `⚠️ Entry exists for ${farmerName}!` });
        return;
      }
      qtyRef.current?.focus();
    }
  };

  const totalQty = (todayEntries || []).reduce((sum, e) => sum + safeNum(e?.qty), 0);
  const totalAmount = (todayEntries || []).reduce((sum, e) => sum + safeNum(e?.amount), 0);
  const avgFat = (todayEntries || []).length > 0 ? (todayEntries || []).reduce((sum, e) => sum + safeNum(e?.fat), 0) / todayEntries.length : 0;
  const avgSnfClr = (todayEntries || []).length > 0 ? (todayEntries || []).reduce((sum, e) => sum + safeNum(e?.snf || e?.clr), 0) / todayEntries.length : 0;

  if (showSessionSetup) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 56px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'transparent'
      }}>
        <div className="modal-3d animate-fadeIn" style={{ padding: '32px', maxWidth: '600px', width: '100%' }}>
          <div className="flex justify-between items-center" style={{ marginBottom: '32px' }}>
            <div>
              <h2 className="text-2xl font-black text-[#11211A]" style={{ marginBottom: '4px' }}>Session Setup</h2>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Configure your collection shift</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <Clock className="text-blue-500" size={24} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="grid grid-cols-2 gap-4">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="label-text flex items-center gap-2">
                  <Calendar size={14} className="text-blue-400" />
                  Collection Date
                </label>
                <input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  className="input-3d"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="label-text flex items-center gap-2">
                  <Clock size={14} className="text-amber-400" />
                  Select Shift
                </label>
                <div className="flex gap-2 bg-black/5 rounded-xl border border-slate-200" style={{ padding: '4px' }}>
                  <button
                    onClick={() => setSessionShift('Morning')}
                    style={{ padding: '10px 0' }}
                    className={`flex-1 rounded-lg text-xs font-black transition-all ${sessionShift === 'Morning' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-[#11211A]'}`}
                  >
                    MORNING
                  </button>
                  <button
                    onClick={() => setSessionShift('Evening')}
                    style={{ padding: '10px 0' }}
                    className={`flex-1 rounded-lg text-xs font-black transition-all ${sessionShift === 'Evening' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-[#11211A]'}`}
                  >
                    EVENING
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label className="label-text flex items-center gap-2">
                <Zap size={14} className="text-purple-400" />
                Measurement Mode
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div
                  onClick={() => setSessionMode('SNF')}
                  style={{ padding: '16px' }}
                  className={`cursor-pointer rounded-2xl border-2 transition-all ${sessionMode === 'SNF' ? 'bg-blue-500/10 border-blue-500' : 'bg-black/5 border-transparent hover:border-slate-200'}`}
                >
                  <h4 style={{ marginBottom: '4px' }} className={`text-sm font-black ${sessionMode === 'SNF' ? 'text-blue-400' : 'text-slate-400'}`}>SNF MODE</h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Standard measurement using FAT and SNF values.</p>
                </div>
                <div
                  onClick={() => setSessionMode('CLR')}
                  style={{ padding: '16px' }}
                  className={`cursor-pointer rounded-2xl border-2 transition-all ${sessionMode === 'CLR' ? 'bg-blue-500/10 border-blue-500' : 'bg-black/5 border-transparent hover:border-slate-200'}`}
                >
                  <h4 style={{ marginBottom: '4px' }} className={`text-sm font-black ${sessionMode === 'CLR' ? 'text-blue-400' : 'text-slate-400'}`}>CLR MODE</h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Calculates SNF based on FAT and Lactometer Reading.</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-black/5 border border-slate-200" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-green-500/10" style={{ padding: '8px' }}>
                    <Printer className="text-green-500" size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-[#11211A]">Auto Print Receipt</p>
                    <p className="text-[10px] text-slate-500 font-medium">Print slip after each entry</p>
                  </div>
                </div>
                <button
                  onClick={() => setPrintEnabled(!printEnabled)}
                  className={`w-12 h-6 rounded-full transition-all relative ${printEnabled ? 'bg-green-600' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${printEnabled ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-500/10" style={{ padding: '8px' }}>
                    <MessageSquare className="text-blue-500" size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-[#11211A]">SMS Notifications</p>
                    <p className="text-[10px] text-slate-500 font-medium">Send SMS to farmers on save</p>
                  </div>
                </div>
                <button
                  onClick={() => setSmsEnabled(!smsEnabled)}
                  className={`w-12 h-6 rounded-full transition-all relative ${smsEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${smsEnabled ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
            </div>

            <button
              onClick={handleStartSession}
              className="btn-primary w-full text-sm font-black tracking-widest uppercase shadow-xl"
              style={{ padding: '16px', width: '100%' }}
            >
              Start Collection Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper animate-fadeIn">
      {showSavedMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-green-500 text-white font-black shadow-2xl flex items-center gap-3 animate-bounce" style={{ padding: '12px 24px' }}>
          <CheckCircle size={20} /> ENTRY SAVED SUCCESSFULLY
        </div>
      )}
      {offlineSaved && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 rounded-2xl text-white font-black shadow-2xl flex items-center gap-3" style={{ padding: '12px 24px', background: '#d97706', maxWidth: '92%' }}>
          <WifiOff size={20} /> OFFLINE — Entry local pe save ho gayi, internet aane par apne aap sync hogi
        </div>
      )}

      <div className="flex justify-between items-center no-print" style={{ marginBottom: '32px' }}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Calendar className="text-blue-500" size={20} />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Date</p>
              <p className="text-sm font-bold text-[#11211A]">{new Date(sessionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
          </div>
          <div className="h-8 w-px bg-black/5" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Clock className="text-amber-500" size={20} />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Shift</p>
              <p className="text-sm font-bold text-[#11211A]">{sessionShift.toUpperCase()}</p>
            </div>
          </div>
          <div className="h-8 w-px bg-black/5" />
          <div className="flex items-center gap-3 rounded-xl bg-black/5 border border-slate-200" style={{ padding: '6px 12px' }}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${sessionMode === 'SNF' ? 'bg-blue-500' : 'bg-purple-500'}`} />
            <span className="text-sm font-bold">{sessionMode} Mode</span>
          </div>
        </div>
        <button
          onClick={() => setShowSessionSetup(true)}
          className="rounded-lg border border-slate-200 text-slate-500 text-xs font-bold hover:bg-black/5 transition-all"
          style={{ padding: '8px 16px' }}
        >
          Change Session
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '28px', alignItems: 'start' }}>
        {/* Left Panel: New Entry Form */}
        <div>
          <div className="glass-card" style={{ padding: '28px' }}>
            <h2 className="text-lg font-bold text-[#11211A] flex items-center gap-2" style={{ marginBottom: '24px' }}>
              <Droplet size={20} className="text-blue-500" />
              New Entry
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label className="label-text" style={{ display: 'block', marginBottom: '8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: 'var(--ink-2)' }}>FARMER CODE</label>
                <div className="relative flex gap-2">
                  <input
                    ref={farmerCodeRef}
                    type="text"
                    value={farmerCode}
                    onChange={(e) => handleFarmerCodeChange(e.target.value)}
                    onKeyDown={handleFarmerCodeKeyDown}
                    className="input-field flex-1"
                    style={{ padding: '11px 14px', fontSize: '14px' }}
                    placeholder="Enter Code"
                  />
                  {farmerFound && <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" size={18} />}
                </div>
                {farmerName && (
                  <div className="rounded-lg bg-green-500/10 border border-green-500/20" style={{ marginTop: '8px', padding: '12px' }}>
                    <p className="text-green-400 font-bold text-sm">{farmerName}</p>
                    {warningMessage && <p className="text-amber-400 text-[10px] font-bold uppercase" style={{ marginTop: '4px' }}>{warningMessage}</p>}
                  </div>
                )}
              </div>

              {duplicateWarning.show && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs whitespace-pre-line leading-relaxed animate-bounce" style={{ padding: '12px' }}>
                  {duplicateWarning.message}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="label-text" style={{ display: 'block', marginBottom: '8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: 'var(--ink-2)' }}>QUANTITY (L)</label>
                  <input
                    ref={qtyRef}
                    type="number"
                    step="0.1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fatRef.current?.focus()}
                    className="input-field"
                    style={{ padding: '11px 14px', fontSize: '14px' }}
                    placeholder="0.0"
                  />
                </div>
                <div>
                  <label className="label-text" style={{ display: 'block', marginBottom: '8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: 'var(--ink-2)' }}>FAT (%)</label>
                  <input
                    ref={fatRef}
                    type="number"
                    step="0.1"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && snfClrRef.current?.focus()}
                    className="input-field"
                    style={{ padding: '11px 14px', fontSize: '14px' }}
                    placeholder="0.0"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
                  <label className="label-text" style={{ display: 'block', marginBottom: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: 'var(--ink-2)' }}>{sessionMode} (%)</label>
                  <span className="text-[10px] text-slate-500 font-bold">Range: {snfMin} - {snfMax}</span>
                </div>
                <input
                  ref={snfClrRef}
                  type="number"
                  step="0.1"
                  value={snfClr}
                  onChange={(e) => setSnfClr(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveOrUpdate()}
                  className="input-field"
                  style={{ padding: '11px 14px', fontSize: '14px' }}
                  placeholder="0.0"
                />
              </div>

              <div style={{ padding: '16px 18px', borderRadius: '14px', background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Rate / Liter</span>
                  <span className="text-[#11211A] font-black text-lg">₹{safeNum(rate).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px' }} className="border-t border-slate-200">
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-2)' }}>Total Amount</span>
                  <span className="text-2xl font-black text-green-500">₹{safeNum(amount).toFixed(2)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '14px', paddingTop: '4px' }}>
                <button onClick={clearForm} className="btn-secondary" style={{ flex: 1, padding: '13px', fontSize: '14px', fontWeight: 700 }}>Clear</button>
                <button onClick={handleSaveOrUpdate} className={`btn-primary ${isModifying ? 'from-amber-500 to-orange-600' : ''}`} style={{ flex: 2, padding: '13px', fontSize: '14px', fontWeight: 800 }}>
                  {isModifying ? 'Update Entry' : 'Save Entry'}
                </button>
              </div>
            </div>
          </div>

          {/* Session Summary — OUTSIDE form card, below it */}
          <div className="glass-card" style={{ padding: '20px 24px', marginTop: '20px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Session Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Total QTY</p>
                <p style={{ fontSize: '18px', fontWeight: 900, color: 'var(--ink)' }}>{totalQty.toFixed(2)} <span style={{ fontSize: '11px', color: 'var(--muted)' }}>L</span></p>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Avg FAT</p>
                <p style={{ fontSize: '18px', fontWeight: 900, color: 'var(--ink)' }}>{avgFat.toFixed(2)}%</p>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Avg {sessionMode}</p>
                <p style={{ fontSize: '18px', fontWeight: 900, color: 'var(--ink)' }}>{avgSnfClr.toFixed(2)}%</p>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Total Amount</p>
                <p style={{ fontSize: '18px', fontWeight: 900, color: 'var(--brand)' }}>₹{totalAmount.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Stats & Recent Entries */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Stats Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div className="glass-card" style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Total QTY</p>
              <p style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)' }}>{totalQty.toFixed(2)} <span style={{ fontSize: '12px', color: 'var(--muted)' }}>L</span></p>
            </div>
            <div className="glass-card" style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Total Amount</p>
              <p style={{ fontSize: '22px', fontWeight: 900, color: 'var(--brand)' }}>₹{totalAmount.toFixed(2)}</p>
            </div>
            <div className="glass-card" style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Avg FAT</p>
              <p style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)' }}>{avgFat.toFixed(2)}%</p>
            </div>
            <div className="glass-card" style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Avg {sessionMode}</p>
              <p style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)' }}>{avgSnfClr.toFixed(2)}%</p>
            </div>
          </div>

          {/* Recent Entries Table */}
          <div className="glass-card overflow-hidden">
            <div className="border-b border-slate-200 flex justify-between items-center" style={{ padding: '20px' }}>
              <h2 className="text-md font-bold text-[#11211A] flex items-center gap-2">
                <History size={18} className="text-amber-500" />
                Recent Entries
              </h2>
              <span className="rounded-md bg-black/5 text-slate-500 text-[10px] font-bold uppercase tracking-wider" style={{ padding: '4px 10px' }}>
                {todayEntries.length} Records
              </span>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
              <table className="w-full text-left border-collapse">
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr className="bg-[#F8FAF9]">
                    <th style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Code</th>
                    <th style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Farmer Name</th>
                    <th style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Qty (L)</th>
                    <th style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>FAT/SNF</th>
                    <th style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rate</th>
                    <th style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</th>
                    <th style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }} className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {todayEntries.sort((a, b) => safeNum(b?.timestamp) - safeNum(a?.timestamp)).map((entry) => (
                    <tr key={entry.farmerCode} className="hover:bg-black/5 transition-colors">
                      <td style={{ padding: '14px 20px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{entry.farmerCode}</td>
                      <td style={{ padding: '14px 20px', fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>{entry.farmerName}</td>
                      <td style={{ padding: '14px 20px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{safeNum(entry?.qty).toFixed(2)}</td>
                      <td style={{ padding: '14px 20px', fontSize: '15px' }}>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-400 font-bold">{safeNum(entry?.fat).toFixed(1)}</span>
                          <span className="text-slate-500">/</span>
                          <span className="text-green-400 font-bold">{safeNum(entry?.snf || entry?.clr).toFixed(1)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: '15px', color: 'var(--ink-2)' }}>₹{safeNum(entry?.rate).toFixed(2)}</td>
                      <td style={{ padding: '14px 20px', fontSize: '15px', fontWeight: 800, color: 'var(--brand)' }}>₹{safeNum(entry?.amount).toFixed(2)}</td>
                      <td style={{ padding: '14px 20px' }} className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleModify(entry)}
                            className="rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-[#11211A] transition-all"
                            style={{ padding: '8px' }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.farmerCode)}
                            className="rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-[#11211A] transition-all"
                            style={{ padding: '8px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {todayEntries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-slate-500 text-sm font-medium" style={{ padding: '48px' }}>
                        No entries found for this session
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MilkCollection;
