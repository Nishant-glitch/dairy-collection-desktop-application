import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, set, get, remove, query, orderByKey, startAt, endAt } from 'firebase/database';
import { database } from '../firebase/config';
import { up, getUid } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { sendSMS } from '../services/sms';
import { X, Edit2, Trash2, CheckCircle, Droplet, Clock, Calendar, Zap, Printer, MessageSquare, History, WifiOff, Eye, Loader2 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { getRateFromMap } from '../utils/rateCalculator';
import { useConnection } from '../hooks/useConnection';
import { printHtml } from '../utils/printHtml';
import { restoreCaret } from '../utils/focus';
import { addToQueue, getQueue, removeFromQueue, QUEUE_CHANGED } from '../services/offlineQueue';

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
  pending?: boolean; // true = durable offline entry, not yet synced to Firebase
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
  const [thermalPaperSize, setThermalPaperSize] = useState<'58mm' | '80mm'>('58mm');
  
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
  // Quick recent-collection history popup
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<{ todayMorning: any; todayEvening: any; last7: any[]; totalQty: number; totalAmount: number } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{show: boolean, message: string}>({show: false, message: ''});

  const [todayEntries, setTodayEntries] = useState<Entry[]>([]);
  const [pendingEntries, setPendingEntries] = useState<Entry[]>([]);
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
    // Thermal printer paper size (Settings). Default 58mm.
    get(ref(database, up('settings/thermalPaperSize'))).then((snap) => {
      const v = snap.exists() ? snap.val() : '58mm';
      if (v === '58mm' || v === '80mm') setThermalPaperSize(v);
    }).catch(() => {});
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!showSessionSetup) {
      const unsubscribe = loadTodayEntries();
      return unsubscribe;
    }
  }, [showSessionSetup, sessionDate, sessionShift]);

  // Durable offline-queued entries for THIS session (IndexedDB). These survive
  // app close/reopen while offline, so on reload they re-appear in Recent
  // Entries with a "pending sync" badge. Refreshes whenever the queue changes
  // (new offline entry saved, or an entry synced & removed).
  useEffect(() => {
    if (showSessionSetup) return;
    let cancelled = false;
    const loadPending = async () => {
      try {
        const q = await getQueue();
        if (cancelled) return;
        const mine = q
          .filter((it) => it.date === sessionDate && it.shift === sessionShift)
          .map((it) => ({ farmerCode: it.farmerCode, ...it.data, pending: true } as Entry));
        setPendingEntries(mine);
      } catch (e) {
        console.error('Load pending queue failed:', e);
      }
    };
    loadPending();
    window.addEventListener(QUEUE_CHANGED, loadPending);
    return () => {
      cancelled = true;
      window.removeEventListener(QUEUE_CHANGED, loadPending);
    };
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
  const RATE_CACHE_KEY = 'dcs_rate_config_cache'; // { history, current } for offline calc

  // Resolve the chart effective on the entry's date from raw history/current.
  const resolveConfigForDate = (history: any, current: any, collectionDate: string) => {
    if (history) {
      const configs = (Object.values(history) as any[])
        .filter((c: any) => c && c.effectiveFrom)
        .sort((a: any, b: any) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
      if (configs.length > 0) {
        // Latest chart whose effectiveFrom is on/before the entry date.
        const valid = [...configs].reverse().find((c: any) => c.effectiveFrom <= collectionDate);
        return valid || configs[0]; // date before all charts -> earliest chart
      }
    }
    return current || null;
  };

  const getConfigForDate = async (collectionDate: string) => {
    try {
      const [historySnap, currentSnap] = await Promise.all([
        get(ref(database, 'globalRateConfig/history')),
        get(ref(database, 'globalRateConfig/current')),
      ]);
      const history = historySnap.exists() ? historySnap.val() : null;
      const current = currentSnap.exists() ? currentSnap.val() : null;
      // Cache the whole rate chart so offline entries can still compute
      // rate & amount (weak village internet). Refreshed on every online read.
      try {
        localStorage.setItem(RATE_CACHE_KEY, JSON.stringify({ history, current }));
      } catch { /* storage full/blocked — non-fatal */ }
      return resolveConfigForDate(history, current, collectionDate);
    } catch (e) {
      // Offline / read failed — fall back to the last cached rate chart.
      console.error('Rate chart read failed, using offline cache:', e);
      try {
        const cached = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || 'null');
        if (cached) return resolveConfigForDate(cached.history, cached.current, collectionDate);
      } catch { /* no/invalid cache */ }
      return null;
    }
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

    if (!isModifying && [...todayEntries, ...pendingEntries].find(e => e.farmerCode === farmerCode)) {
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

    // IMPORTANT (weak village internet): the entry must NEVER be lost.
    if (online) {
      // Online: write straight to Firebase (same path/behaviour as before).
      const entryRef = ref(database, up(`milkCollection/${sessionDate}/${sessionShift}/${farmerCode}`));
      await set(entryRef, entryData);
    } else {
      // Offline: persist to the DURABLE IndexedDB queue (not RTDB's in-memory
      // cache, which is lost on app close). It shows immediately in Recent
      // Entries with a "pending sync" badge and auto-syncs on reconnect. If
      // this farmer already has a queued entry for this session (re-save /
      // modify while still offline), replace it — last write wins.
      try {
        const existing = (await getQueue()).find(
          (it) => it.date === sessionDate && it.shift === sessionShift && it.farmerCode === farmerCode
        );
        if (existing) await removeFromQueue(existing.localId);
        await addToQueue({ uid: getUid(), date: sessionDate, shift: sessionShift, farmerCode, data: entryData });
      } catch (e) {
        console.error('Failed to queue offline entry:', e);
        alert('⚠️ Entry local pe save nahi ho payi. Dobara try karein.');
        return;
      }
    }

    // Print works offline too (totals read from the local cache).
    if (printEnabled) {
      try {
        const monthTotal = await buildMonthTotal(farmerCode);
        printSlip(monthTotal);
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

  // THIS farmer's running total from the 1st of the entry's month up to (and
  // including) the entry's date, across BOTH shifts. Entries are keyed by
  // farmer code (milkCollection/{date}/{shift}/{code}), so each shift bucket is
  // indexed directly — no iteration over other farmers. A key-range query
  // fetches only the relevant date nodes (not the whole milkCollection), so
  // this stays fast even on big months. Guards: strict month window re-check +
  // only genuine entry objects with qty/amount count.
  const buildMonthTotal = async (code: string) => {
    const startDate = `${sessionDate.substring(0, 7)}-01`;
    let count = 0, qty = 0, amount = 0;
    try {
      const q = query(ref(database, up('milkCollection')), orderByKey(), startAt(startDate), endAt(sessionDate));
      const snap = await get(q);
      if (snap.exists()) {
        const data = snap.val();
        Object.keys(data).forEach((date) => {
          // Strict month window: 1st -> the entry's date only.
          if (date < startDate || date > sessionDate) return;
          const shifts = data[date] || {};
          Object.values(shifts).forEach((shift: any) => {
            if (!shift || typeof shift !== 'object') return;
            const e = shift[code]; // only THIS farmer's entry in this shift
            if (!e || typeof e !== 'object' || (e.qty == null && e.amount == null)) return;
            count++;
            qty += safeNum(e.qty);
            amount += safeNum(e.amount);
          });
        });
      }
    } catch (e) {
      console.error('Month total failed:', e);
    }
    return { count, qty, amount };
  };

  const printSlip = (
    monthTotal: { count: number; qty: number; amount: number } | null = null,
  ) => {
    // Thermal printer receipt (58mm default, 80mm optional via Settings).
    const width = thermalPaperSize === '80mm' ? '80mm' : '58mm';
    const dateFmt = (sessionDate || '').split('-').reverse().join('/'); // YYYY-MM-DD -> DD/MM/YYYY
    const shiftAbbr = sessionShift === 'Evening' ? 'Eve' : 'Mor';
    const esc = (s: any) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
    const line = (label: string, value: string) => `<div>${esc(label.padEnd(5, ' '))}: ${esc(value)}</div>`;
    // Slightly inset so the dashed line never touches either printable edge.
    const dash = `<div style="border-top:1px dashed #000;margin:3px 1mm"></div>`;

    // "1-<day> <Mon>" range for the month total (1st -> the entry's date).
    const day = parseInt((sessionDate || '').substring(8, 10), 10) || 0;
    const monthAbbr = (() => { try { return new Date(sessionDate + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' }); } catch { return ''; } })();
    const monthRange = `1-${day} ${monthAbbr}`;

    // Heading with the farmer's name; fall back to the generic label when the
    // name would overflow a 58mm line (~24 monospace chars at 13px bold).
    const namedHeading = `${farmerName} — Month (${monthRange})`;
    const monthHeading = farmerName && namedHeading.length <= 24
      ? namedHeading
      : `Month Total (${monthRange})`;

    const monthHtml = monthTotal ? `
      ${dash}
      <div style="text-align:center;font-weight:bold">${esc(monthHeading)}</div>
      ${line('Entr', String(monthTotal.count))}
      ${line('Qty', `${monthTotal.qty.toFixed(3)} Litre`)}
      ${line('Amt', `₹${monthTotal.amount.toFixed(2)}`)}
    ` : '';

    const body = `
      <div style="text-align:center;font-weight:bold;font-size:16px">${esc(dcsInfo.name || 'DCS Pro')}</div>
      <div style="text-align:center;font-size:13px">Milk Collection Slip</div>
      <div style="height:5px"></div>
      <div>Date : ${esc(dateFmt)}  Shift: ${shiftAbbr}</div>
      ${line('Code', farmerCode)}
      ${line('Name', farmerName)}
      ${line('Qty', `${(parseFloat(qty) || 0).toFixed(3)} Litre`)}
      ${line('FAT', `${(parseFloat(fat) || 0).toFixed(2)} %`)}
      ${line(sessionMode, `${(parseFloat(snfClr) || 0).toFixed(2)} %`)}
      ${line('Rate', `₹${(rate || 0).toFixed(2)} /Litre`)}
      ${dash}
      <div style="font-size:17px;font-weight:900">AMOUNT: ₹${(amount || 0).toFixed(2)}</div>
      ${monthHtml}
      ${dash}
      <div style="height:4px"></div>
      <div style="text-align:center">Thank You! — DCS Pro</div>
    `;

    // Hidden-iframe print (no window.open -> not blocked by popup blockers).
    printHtml(`<html><head><title>Milk Collection Receipt</title>
      <style>
        /* Pure black + bold everywhere — thermal prints come out light, so
           every line is bold and #000 (no grays) for a darker, clearer slip. */
        * { color: #000 !important; -webkit-print-color-adjust: exact; }
        html, body { margin: 0; padding: 0; }
        /* Extra LEFT padding: thermal printers can't print to the very left
           edge, so without it the first letter of each line (D/C/N/A) clips.
           padding: top right bottom left. box-sizing keeps content inside. */
        #slip { font-family: 'Courier New', monospace; font-size: 13px; font-weight: 700; color: #000;
                line-height: 1.55; width: ${width}; box-sizing: border-box; padding: 3mm 4mm 3mm 5mm; }
        #slip div { page-break-inside: avoid; }
        @media print {
          @page { size: ${width} auto; margin: 0; }
          html, body { width: ${width}; margin: 0; padding: 0; }
          #slip { width: ${width}; padding: 3mm 4mm 3mm 5mm; }
        }
      </style></head>
      <body><div id="slip">${body}</div></body></html>`);
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

  const handleDelete = async (entry: Entry) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    if (entry.pending) {
      // Durable offline entry — remove it from the IndexedDB queue so it never
      // syncs. (It was never written to Firebase.)
      try {
        const item = (await getQueue()).find(
          (it) => it.date === sessionDate && it.shift === sessionShift && it.farmerCode === entry.farmerCode
        );
        if (item) await removeFromQueue(item.localId);
      } catch (e) {
        console.error('Failed to delete pending entry:', e);
      }
    } else {
      const entryRef = ref(database, up(`milkCollection/${sessionDate}/${sessionShift}/${entry.farmerCode}`));
      await remove(entryRef);
    }
    setDuplicateWarning({show: false, message: ''});
    restoreCaret(farmerCodeRef.current); // restore cursor (Windows caret bug)
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
          setWarningMessage([...todayEntries, ...pendingEntries].find(ent => ent.farmerCode === code) ? 'Already entered' : '');
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
    // F2 -> quick recent-history popup for the current farmer (speed).
    if (e.key === 'F2') {
      e.preventDefault();
      if (farmerFound) openHistory();
      return;
    }
    if (e.key === 'Enter' && farmerFound) {
      // Check both synced and durable offline-queued entries for a duplicate.
      if ([...todayEntries, ...pendingEntries].find(ent => ent.farmerCode === farmerCode)) {
        setDuplicateWarning({ show: true, message: `⚠️ Entry exists for ${farmerName}!` });
        return;
      }
      qtyRef.current?.focus();
    }
  };

  // ---- Quick recent-collection history popup (read-only) ------------------
  const openHistory = async () => {
    if (!farmerCode || !farmerFound) return;
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const dates = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'));
      const snaps = await Promise.all(dates.map((d) => get(ref(database, up(`milkCollection/${d}`)))));
      const last7: any[] = [];
      let totalQty = 0, totalAmount = 0;
      let todayMorning: any = null, todayEvening: any = null;
      dates.forEach((d, idx) => {
        const dayVal = snaps[idx].exists() ? snaps[idx].val() : {};
        (['Morning', 'Evening'] as const).forEach((shift) => {
          const e = dayVal?.[shift]?.[farmerCode];
          if (!e) return;
          const row = {
            date: d, shift,
            qty: Number(e.qty) || 0, fat: Number(e.fat) || 0,
            snf: e.snf != null ? Number(e.snf) : (e.clr != null ? Number(e.clr) : null),
            rate: Number(e.rate) || 0, amount: Number(e.amount) || 0,
          };
          last7.push(row);
          totalQty += row.qty; totalAmount += row.amount;
          if (d === todayStr && shift === 'Morning') todayMorning = row;
          if (d === todayStr && shift === 'Evening') todayEvening = row;
        });
      });
      last7.sort((a, b) => b.date.localeCompare(a.date) || (a.shift === 'Morning' ? -1 : 1));
      setHistory({ todayMorning, todayEvening, last7, totalQty, totalAmount });
    } catch (err) {
      console.error('History fetch failed:', err);
      setHistory({ todayMorning: null, todayEvening: null, last7: [], totalQty: 0, totalAmount: 0 });
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => {
    setShowHistory(false);
    setTimeout(() => farmerCodeRef.current?.focus(), 50); // focus back to code input
  };

  // ESC closes the history popup.
  useEffect(() => {
    if (!showHistory) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeHistory(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [showHistory]);

  // Synced (Firebase) entries + durable offline-queued entries. A pending
  // entry is hidden once its synced twin appears (post-sync) so there's no
  // flash of duplicate rows during the sync window.
  const syncedCodes = new Set((todayEntries || []).map((e) => e.farmerCode));
  const displayEntries: Entry[] = [
    ...(todayEntries || []),
    ...(pendingEntries || []).filter((p) => !syncedCodes.has(p.farmerCode)),
  ];

  const totalQty = displayEntries.reduce((sum, e) => sum + safeNum(e?.qty), 0);
  const totalAmount = displayEntries.reduce((sum, e) => sum + safeNum(e?.amount), 0);
  const avgFat = displayEntries.length > 0 ? displayEntries.reduce((sum, e) => sum + safeNum(e?.fat), 0) / displayEntries.length : 0;
  const avgSnfClr = displayEntries.length > 0 ? displayEntries.reduce((sum, e) => sum + safeNum(e?.snf || e?.clr), 0) / displayEntries.length : 0;

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

      {/* Quick recent-collection history popup (read-only) */}
      {showHistory && (
        <div
          onClick={closeHistory}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <History size={18} className="text-blue-500" /> Recent Collection
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{farmerName} ({farmerCode})</div>
              </div>
              <button onClick={closeHistory} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={22} /></button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto' }}>
              {historyLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '30px 0', color: '#64748b' }}>
                  <Loader2 size={26} className="text-blue-500" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 13 }}>Loading…</span>
                </div>
              ) : !history ? null : (
                <>
                  {/* Today Morning / Evening */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {([['Morning', history.todayMorning], ['Evening', history.todayEvening]] as const).map(([label, e]) => (
                      <div key={label} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: label === 'Morning' ? '#2563eb' : '#7c3aed', marginBottom: 6 }}>Aaj — {label}</div>
                        {e ? (
                          <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.7 }}>
                            <div><strong>Qty:</strong> {e.qty.toFixed(2)} L</div>
                            <div><strong>FAT:</strong> {e.fat.toFixed(1)} &nbsp; <strong>SNF:</strong> {e.snf != null ? e.snf.toFixed(1) : '—'}</div>
                            <div><strong>Rate:</strong> ₹{e.rate.toFixed(2)}</div>
                            <div style={{ color: '#15803d', fontWeight: 800 }}>{formatIndianCurrency(e.amount)}</div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>Koi entry nahi</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Last 7 days table */}
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Last 7 Days</div>
                  <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
                          <th style={hcTh}>Date</th><th style={hcTh}>Shift</th>
                          <th style={hcThR}>Qty</th><th style={hcThR}>FAT</th><th style={hcThR}>SNF</th><th style={hcThR}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.last7.length === 0 ? (
                          <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Pichhle 7 din koi entry nahi</td></tr>
                        ) : history.last7.map((r, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={hcTd}>{r.date}</td>
                            <td style={hcTd}>{r.shift}</td>
                            <td style={hcTdR}>{r.qty.toFixed(1)}</td>
                            <td style={hcTdR}>{r.fat.toFixed(1)}</td>
                            <td style={hcTdR}>{r.snf != null ? r.snf.toFixed(1) : '—'}</td>
                            <td style={{ ...hcTdR, fontWeight: 700, color: '#15803d' }}>{formatIndianCurrency(r.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, padding: '12px 14px', background: '#f0fdf4', borderRadius: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Total (7 din): {history.totalQty.toFixed(1)} L</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#15803d' }}>{formatIndianCurrency(history.totalAmount)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
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
                <div className="flex gap-2 items-stretch">
                  <div className="relative flex-1">
                    <input
                      ref={farmerCodeRef}
                      type="text"
                      value={farmerCode}
                      onChange={(e) => handleFarmerCodeChange(e.target.value)}
                      onKeyDown={handleFarmerCodeKeyDown}
                      className="input-field w-full"
                      style={{ padding: '11px 14px', fontSize: '14px' }}
                      placeholder="Enter Code"
                    />
                    {farmerFound && <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" size={18} />}
                  </div>
                  {farmerFound && (
                    <button
                      type="button"
                      onClick={openHistory}
                      title="Recent collection history (F2)"
                      className="btn-secondary"
                      style={{ padding: '0 14px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    >
                      <Eye size={18} />
                    </button>
                  )}
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
                {displayEntries.length} Records
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
                  {[...displayEntries].sort((a, b) => safeNum(b?.timestamp) - safeNum(a?.timestamp)).map((entry) => (
                    <tr key={entry.farmerCode} className="hover:bg-black/5 transition-colors" style={entry.pending ? { background: 'rgba(217,119,6,0.06)' } : undefined}>
                      <td style={{ padding: '14px 20px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{entry.farmerCode}</td>
                      <td style={{ padding: '14px 20px', fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>
                        <div className="flex items-center gap-2">
                          <span>{entry.farmerName}</span>
                          {entry.pending && (
                            <span
                              title="Offline entry — internet aane par apne aap sync hogi"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 999, background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.35)', color: '#b45309', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}
                            >
                              ⏳ pending sync
                            </span>
                          )}
                        </div>
                      </td>
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
                            onClick={() => handleDelete(entry)}
                            className="rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-[#11211A] transition-all"
                            style={{ padding: '8px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {displayEntries.length === 0 && (
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

// Recent-history popup table cell styles.
const hcTh: React.CSSProperties = { padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' };
const hcThR: React.CSSProperties = { ...hcTh, textAlign: 'right' };
const hcTd: React.CSSProperties = { padding: '8px 10px', color: '#334155', whiteSpace: 'nowrap' };
const hcTdR: React.CSSProperties = { ...hcTd, textAlign: 'right' };

export default MilkCollection;
