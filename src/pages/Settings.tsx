import React, { useState, useEffect, useRef } from 'react';
import { ref, get, set, update } from 'firebase/database';
import { database } from '../firebase/config';
import { up, isAdmin, getUid } from '../utils/userDb';
import { MessageSquare, Save, RefreshCw, Shield, Send, Download, FileSpreadsheet, RotateCcw, AlertTriangle, Database, QrCode, Printer, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../firebase/config';
import { passbookUrl } from '../utils/passbook';
import { printHtml } from '../utils/printHtml';
import * as XLSX from 'xlsx';
import axios from 'axios';

const sendBackupNowFn = httpsCallable(getFunctions(app, 'us-central1'), 'sendBackupNow');

const Settings: React.FC = () => {
  const [smsApiKey, setSmsApiKey] = useState(import.meta.env.VITE_MSG91_AUTH_KEY || '');
  const [smsTemplateId, setSmsTemplateId] = useState(import.meta.env.VITE_MSG91_TEMPLATE_ID || '');
  const [testMobile, setTestMobile] = useState('');
  const [testingSMS, setTestingSMS] = useState(false);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState('English');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [bmcBill, setBmcBill] = useState({ unionName: '', route: '', salesSthan: '', headLoadRate: '', nextBillNo: 1 });
  const [savingBill, setSavingBill] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const restoreFileRef = useRef<HTMLInputElement>(null);
  const [societies, setSocieties] = useState<{ uid: string; label: string }[]>([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [societyName, setSocietyName] = useState('');
  const qrBoxRef = useRef<HTMLDivElement>(null);
  const [thermalPaperSize, setThermalPaperSize] = useState<'58mm' | '80mm'>('58mm');
  const [autoBackup, setAutoBackup] = useState({ enabled: false, email: '' });
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);
  const [savingBackup, setSavingBackup] = useState(false);
  const [sendingBackup, setSendingBackup] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    loadSettings();
    if (isAdmin()) loadSocieties();
  }, []);

  // Admin has read access to the whole users node — list every society so the
  // admin can back up / export any of them.
  const loadSocieties = async () => {
    try {
      const snap = await get(ref(database, 'users'));
      if (!snap.exists()) return;
      const users = snap.val();
      const list = Object.keys(users).map((uid) => {
        const u = users[uid] || {};
        const name = u.dcsInfo?.name || u.name || u.farmerName || 'Unknown Society';
        const code = u.dcsInfo?.code ? ` (${u.dcsInfo.code})` : '';
        const mobile = u.mobileNumber ? ` · ${u.mobileNumber}` : '';
        return { uid, label: `${name}${code}${mobile}` };
      }).sort((a, b) => a.label.localeCompare(b.label));
      setSocieties(list);
      // Default selection: the admin's own society if present, else the first.
      const myUid = getUid();
      setSelectedUid(list.some((s) => s.uid === myUid) ? myUid : (list[0]?.uid || ''));
    } catch (e) {
      console.error('Failed to load societies:', e);
    }
  };

  const loadSettings = async () => {
    try {
      const snap = await get(ref(database, up('settings/sms')));
      if (snap.exists()) {
        setSmsApiKey(snap.val().apiKey || import.meta.env.VITE_MSG91_AUTH_KEY || '');
        setSmsTemplateId(snap.val().templateId || import.meta.env.VITE_MSG91_TEMPLATE_ID || '');
      }
      const prefSnap = await get(ref(database, up('settings/preferences')));
      if (prefSnap.exists()) {
        setLanguage(prefSnap.val().language || 'English');
        setDateFormat(prefSnap.val().dateFormat || 'DD/MM/YYYY');
      }
      const billSnap = await get(ref(database, up('settings/bmcBill')));
      if (billSnap.exists()) {
        setBmcBill({ unionName: '', route: '', salesSthan: '', headLoadRate: '', nextBillNo: 1, ...billSnap.val() });
      }
      const dcsSnap = await get(ref(database, up('dcsInfo')));
      const dcs = dcsSnap.exists() ? dcsSnap.val() : {};
      if (dcsSnap.exists()) setSocietyName(dcs.name || dcs.societyName || '');
      const backupSnap = await get(ref(database, up('settings/backup')));
      const b = backupSnap.exists() ? backupSnap.val() : {};
      setAutoBackup({ enabled: !!b.enabled, email: b.email || dcs.email || '' });
      setLastBackupAt(typeof b.lastBackupAt === 'number' ? b.lastBackupAt : null);
      const tpsSnap = await get(ref(database, up('settings/thermalPaperSize')));
      if (tpsSnap.exists() && (tpsSnap.val() === '58mm' || tpsSnap.val() === '80mm')) setThermalPaperSize(tpsSnap.val());
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  const handleSaveBmcBill = async () => {
    setSavingBill(true);
    try {
      await set(ref(database, up('settings/bmcBill')), {
        unionName: bmcBill.unionName,
        route: bmcBill.route,
        salesSthan: bmcBill.salesSthan,
        headLoadRate: bmcBill.headLoadRate,
        nextBillNo: parseInt(String(bmcBill.nextBillNo)) || 1,
        updatedAt: Date.now(),
      });
      alert('✅ BMC Bill settings saved!');
    } catch (err) {
      alert('❌ Failed to save BMC Bill settings');
    } finally {
      setSavingBill(false);
    }
  };

  const handleSaveSMS = async () => {
    setSaving(true);
    try {
      await set(ref(database, up('settings/sms')), {
        apiKey: smsApiKey,
        templateId: smsTemplateId,
        updatedAt: Date.now(),
      });
      alert('✅ SMS Settings saved!');
    } catch (err) {
      alert('❌ Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      await set(ref(database, up('settings/preferences')), {
        language,
        dateFormat,
        updatedAt: Date.now(),
      });
      alert('✅ Preferences saved!');
    } catch (err) {
      alert('❌ Failed to save preferences');
    }
  };

  // ---- Backup & Data (admin only) ----------------------------------------

  const today = () => new Date().toISOString().split('T')[0];

  // Filename tag: a from_to range when either bound is set, else today's date.
  const dateTag = (from: string, to: string) =>
    (from || to) ? `${from || 'start'}_to_${to || 'end'}` : today();

  const inRange = (date: string, from: string, to: string) =>
    (!from || date >= from) && (!to || date <= to);

  // Narrow only the transactional nodes (milkCollection, grossEntries,
  // bmcEntries) to the date range. Master/date-independent data — farmers,
  // dcsInfo, settings, farmerBalances, smsLog — is always kept whole. A blank
  // range returns the data untouched (full backup).
  const filterDataByDate = (data: any, from: string, to: string) => {
    if (!data || (!from && !to)) return data;
    const out = { ...data };

    // milkCollection/{date}/{shift}/{code} — date is the object key.
    if (data.milkCollection) {
      const mc: any = {};
      Object.keys(data.milkCollection).forEach((date) => {
        if (inRange(date, from, to)) mc[date] = data.milkCollection[date];
      });
      out.milkCollection = mc;
    }

    // grossEntries: nested {code}/{entryId}={date,..} or flat {entryId}={date,..}.
    if (data.grossEntries) {
      const ge: any = {};
      Object.keys(data.grossEntries).forEach((key) => {
        const bucket = data.grossEntries[key];
        if (!bucket || typeof bucket !== 'object') return;
        if (typeof bucket.date === 'string') {
          if (inRange(bucket.date, from, to)) ge[key] = bucket; // flat entry
        } else {
          const kept: any = {};
          Object.keys(bucket).forEach((eid) => {
            const entry = bucket[eid];
            // Keep entries in range; keep date-less entries to avoid data loss.
            if (entry && typeof entry === 'object' && (!entry.date || inRange(entry.date, from, to))) {
              kept[eid] = entry;
            }
          });
          if (Object.keys(kept).length) ge[key] = kept;
        }
      });
      out.grossEntries = ge;
    }

    // bmcEntries/{id}={date,..}.
    if (data.bmcEntries) {
      const be: any = {};
      Object.keys(data.bmcEntries).forEach((id) => {
        const entry = data.bmcEntries[id];
        if (entry && typeof entry === 'object' && inRange(entry.date, from, to)) be[id] = entry;
      });
      out.bmcEntries = be;
    }

    return out;
  };

  // Fetch the whole users/{uid} node and wrap it with metadata. societyUid is
  // embedded so a restore can verify the file belongs to the importing user.
  // Optional date range narrows transactional nodes only.
  const buildBackup = async (uid: string, from = '', to = '') => {
    const raw = (await get(ref(database, `users/${uid}`))).val();
    const data = filterDataByDate(raw, from, to);
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      societyCode: raw?.dcsInfo?.code || 'unknown',
      societyUid: uid,
      ...(from || to ? { dateRange: { from: from || null, to: to || null } } : {}),
      data: data || {},
    };
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Part 1 — Full JSON backup download (admin picks the society via selectedUid).
  const downloadBackup = async () => {
    if (!selectedUid) { alert('Pehle society select karein.'); return; }
    setBackingUp(true);
    try {
      const backup = await buildBackup(selectedUid, fromDate, toDate);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      triggerDownload(blob, `DCS_Backup_${backup.societyCode}_${dateTag(fromDate, toDate)}.json`);
      alert('✅ Full backup download ho gaya. Isse safe rakhein / society owner ko dein.');
    } catch (err: any) {
      alert('❌ Backup failed: ' + err.message);
    } finally {
      setBackingUp(false);
    }
  };

  // Part 2 — Multi-sheet Excel export (readable reports) for the selected society.
  const exportExcel = async () => {
    if (!selectedUid) { alert('Pehle society select karein.'); return; }
    setExportingExcel(true);
    try {
      const uid = selectedUid;
      const raw = (await get(ref(database, `users/${uid}`))).val() || {};
      // Same date-range narrowing as the JSON backup (transactional nodes only).
      const data = filterDataByDate(raw, fromDate, toDate) || {};
      const wb = XLSX.utils.book_new();

      // Sheet 1 — Farmers
      const farmers = Object.values<any>(data.farmers || {}).map((f) => ({
        Code: f.farmerCode || '',
        Name: f.farmerName || '',
        Mobile: f.mobileNo || '',
        Address: f.address || '',
        Aadhar: f.aadharNo || '',
        'Bank Name': f.bankName || '',
        'Account No': f.bankAC || '',
        IFSC: f.ifscCode || '',
        UPI: f.upiId || '',
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(farmers.length ? farmers : [{ Code: 'No data' }]),
        'Farmers'
      );

      // Sheet 2 — Milk Collection (milkCollection/{date}/{shift}/{code})
      const milkRows: any[] = [];
      const mc = data.milkCollection || {};
      Object.keys(mc).forEach((date) => {
        Object.keys(mc[date] || {}).forEach((shift) => {
          Object.keys(mc[date][shift] || {}).forEach((code) => {
            const e = mc[date][shift][code] || {};
            milkRows.push({
              Date: date,
              Shift: shift,
              'Farmer Code': code,
              'Farmer Name': e.farmerName || '',
              Qty: Number(e.qty) || 0,
              FAT: Number(e.fat) || 0,
              SNF: e.snf ?? '',
              CLR: e.clr ?? '',
              Rate: Number(e.rate) || 0,
              Amount: Number(e.amount) || 0,
            });
          });
        });
      });
      milkRows.sort((a, b) => String(a.Date).localeCompare(String(b.Date)) || String(a.Shift).localeCompare(String(b.Shift)));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(milkRows.length ? milkRows : [{ Date: 'No data' }]),
        'Milk Collection'
      );

      // Sheet 3 — Gross / Deductions (grossEntries/{code}/{entryId} nested,
      // plus legacy flat grossEntries/{entryId}).
      const grossRows: any[] = [];
      const ge = data.grossEntries || {};
      Object.keys(ge).forEach((key) => {
        const bucket = ge[key];
        if (!bucket || typeof bucket !== 'object') return;
        if (typeof bucket.date === 'string') {
          // Flat entry keyed directly by entryId.
          grossRows.push({
            Date: bucket.date,
            'Farmer Code': bucket.farmerCode || key,
            Item: bucket.item || '',
            Category: bucket.category || '',
            Pcs: Number(bucket.pcs) || 0,
            Rate: Number(bucket.rate) || 0,
            Amount: Number(bucket.amount) || 0,
          });
        } else {
          // Nested bucket: key is the farmer code.
          Object.values<any>(bucket).forEach((entry) => {
            if (!entry || typeof entry !== 'object') return;
            grossRows.push({
              Date: entry.date || '',
              'Farmer Code': key,
              Item: entry.item || '',
              Category: entry.category || '',
              Pcs: Number(entry.pcs) || 0,
              Rate: Number(entry.rate) || 0,
              Amount: Number(entry.amount) || 0,
            });
          });
        }
      });
      grossRows.sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(grossRows.length ? grossRows : [{ Date: 'No data' }]),
        'Gross Deductions'
      );

      // Sheet 4 — BMC Entries
      const bmcRows = Object.values<any>(data.bmcEntries || {}).map((e) => ({
        Date: e.date || '',
        Shift: e.shift || '',
        BMC: e.bmcName || '',
        'Milk Type': e.milkType || '',
        'Qty (Kg)': Number(e.quantityKg) || 0,
        FAT: Number(e.fat) || 0,
        SNF: Number(e.snf) || 0,
        Rate: Number(e.rate) || 0,
        Amount: Number(e.amount) || 0,
      }));
      bmcRows.sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(bmcRows.length ? bmcRows : [{ Date: 'No data' }]),
        'BMC Entries'
      );

      const code = raw?.dcsInfo?.code || 'society';
      XLSX.writeFile(wb, `DCS_Export_${code}_${dateTag(fromDate, toDate)}.xlsx`);
      alert('✅ Excel export ho gaya.');
    } catch (err: any) {
      alert('❌ Excel export failed: ' + err.message);
    } finally {
      setExportingExcel(false);
    }
  };

  // Part 3 — Restore from a JSON backup (DANGER: replaces all current data).
  const handleRestoreFile = async (file: File | null) => {
    if (!file) return;
    if (restoreConfirmText.trim().toUpperCase() !== 'RESTORE') {
      alert('Restore karne ke liye pehle "RESTORE" type karein.');
      if (restoreFileRef.current) restoreFileRef.current.value = '';
      return;
    }

    setRestoring(true);
    try {
      const text = await file.text();
      let backup: any;
      try {
        backup = JSON.parse(text);
      } catch {
        alert('❌ File corrupt hai ya valid JSON nahi hai.');
        return;
      }

      // Validate it's a real DCS backup.
      if (!backup || !backup.version || !backup.data || typeof backup.data !== 'object') {
        alert('❌ Ye valid DCS backup file nahi hai (version/data missing).');
        return;
      }

      const myUid = getUid();

      // Ownership check — does this backup belong to the importing user?
      if (backup.societyUid && backup.societyUid !== myUid) {
        const proceed = window.confirm(
          '⚠️ Ye backup file kisi aur society ki lag rahi hai. Phir bhi restore karein?\n\n' +
          '(Isse aapka current data us backup se replace ho jaayega)'
        );
        if (!proceed) return;
      }

      const confirmed = window.confirm(
        '⚠️ Ye aapka current data REPLACE kar dega. Ye action wapas nahi ho sakta.\n\n' +
        'Restore se pehle current data ka backup auto-download hoga.\n\nContinue?'
      );
      if (!confirmed) return;

      // Safety: auto-download the CURRENT user's data before overwriting it.
      try {
        const safety = await buildBackup(myUid);
        const blob = new Blob([JSON.stringify(safety, null, 2)], { type: 'application/json' });
        triggerDownload(blob, `DCS_Backup_BEFORE_RESTORE_${safety.societyCode}_${today()}.json`);
      } catch {
        // Even if the safety backup fails to build, warn but let the user decide.
        if (!window.confirm('Safety backup nahi ban paaya. Phir bhi restore continue karein?')) return;
      }

      await set(ref(database, `users/${myUid}`), backup.data);
      alert('✅ Data restore ho gaya. Page reload ho raha hai.');
      window.location.reload();
    } catch (err: any) {
      alert('❌ Restore failed: ' + err.message);
    } finally {
      setRestoring(false);
      setRestoreConfirmText('');
      if (restoreFileRef.current) restoreFileRef.current.value = '';
    }
  };

  // ---- Farmer Passbook (QR + sync) ---------------------------------------

  const myPassbookUrl = (() => { try { return passbookUrl(getUid()); } catch { return ''; } })();

  const copyPassbookUrl = async () => {
    try { await navigator.clipboard.writeText(myPassbookUrl); alert('✅ Passbook link copy ho gaya.'); }
    catch { alert('Copy nahi ho paaya: ' + myPassbookUrl); }
  };

  const printQR = () => {
    const svg = qrBoxRef.current?.querySelector('svg')?.outerHTML || '';
    if (!svg) return;
    // Hidden-iframe print (no window.open -> not blocked by popup blockers).
    printHtml(
      `<html><head><title>Passbook QR</title></head>
       <body style="text-align:center;font-family:system-ui,sans-serif;padding:40px">
         <h2 style="margin-bottom:4px">${societyName || 'DCS Pro'}</h2>
         <div style="font-size:15px;color:#166534;font-weight:700;margin-bottom:24px">Farmer Passbook — Apni Doodh History Dekhein</div>
         <div style="display:inline-block;padding:16px;border:2px solid #16a34a;border-radius:16px">${svg}</div>
         <p style="font-size:13px;word-break:break-all;margin-top:20px;color:#374151">${myPassbookUrl}</p>
         <p style="color:#6b7280;font-size:14px;margin-top:16px">📱 QR scan karein → apna Code + 4-digit PIN daalein</p>
       </body></html>`
    );
  };

  // ---- Auto Daily Backup (email via Resend Cloud Function) ----------------

  const saveBackupSettings = async (next: { enabled: boolean; email: string }) => {
    setSavingBackup(true);
    try {
      // Merge — never clobber lastBackupAt written by the Cloud Function.
      await update(ref(database, up('settings/backup')), { enabled: next.enabled, email: next.email.trim() });
    } catch (err: any) {
      alert('❌ Backup settings save nahi hui: ' + err.message);
    } finally {
      setSavingBackup(false);
    }
  };

  const sendBackupNow = async () => {
    setSendingBackup(true);
    try {
      const resp: any = await sendBackupNowFn({ email: autoBackup.email.trim() });
      const r = resp?.data || {};
      if (r.success) { alert('✅ ' + (r.message || 'Backup email bhej diya.')); setLastBackupAt(Date.now()); }
      else alert('❌ ' + (r.message || 'Backup nahi bhej paaye.'));
    } catch (err: any) {
      alert('❌ Backup email failed: ' + (err?.message || 'unknown'));
    } finally {
      setSendingBackup(false);
    }
  };

  const saveThermalPaperSize = async (size: '58mm' | '80mm') => {
    setThermalPaperSize(size);
    try { await set(ref(database, up('settings/thermalPaperSize')), size); }
    catch (err: any) { alert('❌ Paper size save nahi hui: ' + err.message); }
  };

  const handleTestSMS = async () => {
    if (!testMobile.trim() || !/^\d{10}$/.test(testMobile.trim())) {
      alert('Please enter valid 10-digit number!');
      return;
    }
    setTestingSMS(true);
    try {
      const authKey = smsApiKey.trim() || import.meta.env.VITE_MSG91_AUTH_KEY || '';
      const templateId = smsTemplateId.trim() || import.meta.env.VITE_MSG91_TEMPLATE_ID || '';
      if (!authKey || !templateId) {
        alert('❌ SMS API Key / Template ID not set. Please enter and save them first.');
        setTestingSMS(false);
        return;
      }
      await fetch('https://api.msg91.com/api/v5/flow/', {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'authkey': authKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_id: templateId,
          short_url: '0',
          mobiles: '91' + testMobile.trim(),
          name: 'Test Farmer',
          qty: '5.00',
          fat: '4.5',
          amount: '100.00',
        }),
      });
      alert('✅ SMS request sent! Check your phone.');
    } catch (err: any) {
      alert('❌ Error: ' + err.message);
    } finally {
      setTestingSMS(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: 'var(--ink)', fontSize: 26, fontWeight: 800, marginBottom: 24 }}>
        ⚙️ Settings
      </h1>

      {/* Farmer Passbook QR — this society's public passbook link */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <QrCode style={{ color: 'var(--brand)', width: 22, height: 22 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700 }}>Farmer Passbook QR</h2>
        </div>
        <p style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 20 }}>
          Is society ka apna QR. Farmer scan kare → apna Code + 4-digit PIN daal ke apni doodh history dekhe.
          PIN <strong>Farmer Master</strong> se set hota hai. Har society ka QR alag hai.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          <div ref={qrBoxRef} style={{ padding: 14, background: '#fff', border: '2px solid var(--brand)', borderRadius: 14, flexShrink: 0 }}>
            {myPassbookUrl
              ? <QRCodeSVG value={myPassbookUrl} size={200} level="M" includeMargin />
              : <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>—</div>}
          </div>

          <div style={{ flex: '1 1 260px', minWidth: 240 }}>
            <label className="label-text" style={{ fontSize: 11 }}>PUBLIC PASSBOOK LINK</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input readOnly value={myPassbookUrl} className="input-field" style={{ fontSize: 13 }} onFocus={(e) => e.currentTarget.select()} />
              <button onClick={copyPassbookUrl} className="btn-secondary" style={{ padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} title="Copy link">
                <Copy size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <button onClick={printQR} className="btn-primary" style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Printer size={16} /> Print QR (board ke liye)
              </button>
            </div>
            <p style={{ color: 'var(--ink-2)', fontSize: 12, marginTop: 12 }}>
              Passbook <strong>real-time</strong> hai — milk, gross/deductions aur PIN/name ke changes turant dikhte hain, koi sync nahi chahiye.
              Har farmer ka <strong>4-digit PIN Farmer Master</strong> se set/reset karein.
            </p>
          </div>
        </div>
      </div>

      {/* Auto Daily Backup (email) */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <Database style={{ color: 'var(--brand)', width: 22, height: 22 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700 }}>Auto Daily Backup</h2>
        </div>
        <p style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 18 }}>
          Har raat (11:00 PM) aapke poore data ka backup JSON aapke email par apne aap chala jayega. Manual backup bhoolne ka risk khatam.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoBackup.enabled}
              onChange={(e) => { const next = { ...autoBackup, enabled: e.target.checked }; setAutoBackup(next); saveBackupSettings(next); }}
              style={{ width: 18, height: 18, accentColor: 'var(--brand)' }}
            />
            <span style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 14 }}>{autoBackup.enabled ? 'ON' : 'OFF'} — Auto Daily Backup</span>
          </label>
          {savingBackup && <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--ink-2)' }} />}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, alignItems: 'end', maxWidth: 560 }}>
          <div>
            <label className="label-text" style={{ fontSize: 11 }}>BACKUP EMAIL</label>
            <input
              type="email"
              value={autoBackup.email}
              onChange={(e) => setAutoBackup({ ...autoBackup, email: e.target.value })}
              onBlur={() => saveBackupSettings(autoBackup)}
              placeholder="owner@example.com"
              className="input-field"
            />
          </div>
          <button
            onClick={sendBackupNow}
            disabled={sendingBackup || !autoBackup.email.trim()}
            className="btn-primary"
            style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {sendingBackup ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            {sendingBackup ? 'Bhej rahe…' : 'Backup ab bhejo'}
          </button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
          Last backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleString('en-IN') : 'Abhi tak nahi'}
        </p>
      </div>

      {/* SMS Configuration */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <MessageSquare style={{ color: 'var(--brand)', width: 22, height: 22 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700 }}>SMS Configuration</h2>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="label-text">SMS API KEY</label>
          <input
            type="password"
            value={smsApiKey}
            onChange={(e) => setSmsApiKey(e.target.value)}
            placeholder="Paste your Fast2SMS API Key"
            className="input-field"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label className="label-text">SMS TEMPLATE ID</label>
            <input
              type="text"
              value={smsTemplateId}
              onChange={(e) => setSmsTemplateId(e.target.value)}
              placeholder="Paste your MSG91 Template ID"
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">TEST SMS TO</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={testMobile}
                onChange={(e) => setTestMobile(e.target.value)}
                placeholder="10-digit mobile"
                className="input-field"
                style={{ flex: 1 }}
              />
              <button
                onClick={handleTestSMS}
                disabled={testingSMS}
                title="Send Test SMS"
                style={{
                  background: 'rgba(74,222,128,0.2)',
                  border: '1px solid rgba(74,222,128,0.4)',
                  borderRadius: 10, padding: '0 14px',
                  color: 'var(--brand)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                }}
              >
                {testingSMS ? <RefreshCw style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} /> : <Send style={{ width: 18, height: 18 }} />}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveSMS}
          disabled={saving}
          className="btn-primary"
          style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}
        >
          <Save style={{ width: 16, height: 16 }} />
          {saving ? 'Saving...' : 'Save SMS Settings'}
        </button>
      </div>

      {/* Thermal Printer */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <Printer style={{ color: 'var(--brand)', width: 22, height: 22 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700 }}>Thermal Printer</h2>
        </div>
        <p style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 16 }}>
          Milk Collection slip ki paper width. (Default 58mm)
        </p>
        <label className="label-text" style={{ fontSize: 11 }}>PAPER SIZE</label>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          {(['58mm', '80mm'] as const).map((size) => (
            <button
              key={size}
              onClick={() => saveThermalPaperSize(size)}
              style={{
                flex: 1, maxWidth: 160, padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 14,
                border: thermalPaperSize === size ? '2px solid var(--brand)' : '1px solid var(--line)',
                background: thermalPaperSize === size ? 'var(--brand-soft)' : 'var(--surface)',
                color: thermalPaperSize === size ? 'var(--brand-strong)' : 'var(--ink-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <span style={{ width: 14, height: 14, borderRadius: '50%', border: thermalPaperSize === size ? '4px solid var(--brand)' : '2px solid var(--line)', display: 'inline-block' }} />
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* App Preferences */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
        <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>
          🌐 App Preferences
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
          <div>
            <label className="label-text">LANGUAGE</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input-field">
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
            </select>
          </div>
          <div>
            <label className="label-text">DATE FORMAT</label>
            <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className="input-field">
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
        </div>
        <button
          onClick={handleSavePreferences}
          className="btn-primary"
          style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}
        >
          <Save style={{ width: 16, height: 16 }} />
          Save Preferences
        </button>
      </div>

      {/* BMC Bill Header Settings */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
        <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          🧾 BMC Bill (Union Format) Settings
        </h2>
        <p style={{ color: 'var(--ink-2)', fontSize: 12, marginBottom: 20 }}>
          Header fields for the BMC Payment Register printout. Society name/code come from DCS Master.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
          <div>
            <label className="label-text">UNION NAME</label>
            <input
              type="text"
              value={bmcBill.unionName}
              onChange={(e) => setBmcBill({ ...bmcBill, unionName: e.target.value })}
              placeholder="e.g. Mithila Dugdh Utpadak Sahkari Sangh Ltd."
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">ROUTE</label>
            <input
              type="text"
              value={bmcBill.route}
              onChange={(e) => setBmcBill({ ...bmcBill, route: e.target.value })}
              placeholder="Route name / number"
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">SALES STHAN / LOCATION CODE</label>
            <input
              type="text"
              value={bmcBill.salesSthan}
              onChange={(e) => setBmcBill({ ...bmcBill, salesSthan: e.target.value })}
              placeholder="Sales sthan / location code"
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">HEAD LOAD RATE</label>
            <input
              type="text"
              value={bmcBill.headLoadRate}
              onChange={(e) => setBmcBill({ ...bmcBill, headLoadRate: e.target.value })}
              placeholder="Display only — no calculation"
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">NEXT BILL NO.</label>
            <input
              type="number"
              value={bmcBill.nextBillNo}
              onChange={(e) => setBmcBill({ ...bmcBill, nextBillNo: parseInt(e.target.value) || 1 })}
              placeholder="1"
              className="input-field"
            />
            <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
              Auto-increments each time a BMC bill is generated.
            </p>
          </div>
        </div>
        <button
          onClick={handleSaveBmcBill}
          disabled={savingBill}
          className="btn-primary"
          style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}
        >
          <Save style={{ width: 16, height: 16 }} />
          {savingBill ? 'Saving...' : 'Save BMC Bill Settings'}
        </button>
      </div>

      {/* Backup & Export — Admin only (any society via selector; no restore) */}
      {isAdmin() && (
        <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <Database style={{ color: 'var(--brand)', width: 22, height: 22 }} />
            <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700 }}>Backup &amp; Data (Admin)</h2>
          </div>
          <p style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 20 }}>
            Kisi bhi society ka poora data backup (JSON) ya export (Excel) karein. Backup file society owner ko dein — wo apni ID se login karke Restore kar sakta hai.
          </p>

          {/* Society selector */}
          <div style={{ marginBottom: 20 }}>
            <label className="label-text" style={{ fontSize: 11 }}>SELECT SOCIETY</label>
            <select
              value={selectedUid}
              onChange={(e) => setSelectedUid(e.target.value)}
              className="input-field"
            >
              {societies.length === 0 && <option value="">Loading societies…</option>}
              {societies.map((s) => (
                <option key={s.uid} value={s.uid}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Date range (blank = poora data). Master data always full. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 8 }}>
            <div>
              <label className="label-text" style={{ fontSize: 11 }}>FROM DATE</label>
              <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label-text" style={{ fontSize: 11 }}>TO DATE</label>
              <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="input-field" />
            </div>
          </div>
          <p style={{ color: 'var(--ink-2)', fontSize: 12, marginBottom: 20 }}>
            Date range = sirf us period ka collection / deductions / gross / BMC data.
            Farmers, Rate Chart, DCS Info &amp; Settings hamesha poora rehta hai.
            {(fromDate || toDate) && (
              <button
                onClick={() => { setFromDate(''); setToDate(''); }}
                style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontWeight: 600, fontSize: 12, textDecoration: 'underline' }}
              >
                Clear (poora data)
              </button>
            )}
          </p>

          {/* JSON backup + Excel export */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
              <button
                onClick={downloadBackup}
                disabled={backingUp || !selectedUid}
                className="btn-primary"
                style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center' }}
              >
                {backingUp ? <RefreshCw style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Download style={{ width: 16, height: 16 }} />}
                {backingUp ? 'Preparing...' : 'Download Full Backup'}
              </button>
              <p style={{ color: 'var(--ink-2)', fontSize: 12, marginTop: 10 }}>
                Selected society ka poora data ek JSON file mein download hoga. Isse safe rakhein.
              </p>
            </div>

            <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
              <button
                onClick={exportExcel}
                disabled={exportingExcel || !selectedUid}
                className="btn-secondary"
                style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center' }}
              >
                {exportingExcel ? <RefreshCw style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <FileSpreadsheet style={{ width: 16, height: 16 }} />}
                {exportingExcel ? 'Exporting...' : 'Export to Excel'}
              </button>
              <p style={{ color: 'var(--ink-2)', fontSize: 12, marginTop: 10 }}>
                Office/accountant ke liye readable multi-sheet Excel (Farmers, Collection, Deductions, BMC).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Restore Data — Normal user only (writes to own users/{uid}) */}
      {!isAdmin() && (
        <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ border: '1.5px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.05)', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <AlertTriangle style={{ color: '#ef4444', width: 20, height: 20 }} />
              <h3 style={{ color: '#ef4444', fontSize: 15, fontWeight: 800 }}>⚠️ Restore Data (Danger Zone)</h3>
            </div>
            <p style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 14 }}>
              Admin se mili backup (.json) file yahan restore karein. <strong style={{ color: '#ef4444' }}>Aapka current data poora replace ho jaayega</strong> aur ye action wapas nahi ho sakta. Restore se pehle current data ka backup auto-download hoga.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: '1 1 220px' }}>
                <label className="label-text" style={{ fontSize: 11 }}>CONFIRM: TYPE "RESTORE"</label>
                <input
                  type="text"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder='RESTORE'
                  className="input-field"
                  style={{ borderColor: restoreConfirmText.trim().toUpperCase() === 'RESTORE' ? 'rgba(74,222,128,0.6)' : undefined }}
                />
              </div>
              <input
                ref={restoreFileRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => handleRestoreFile(e.target.files?.[0] || null)}
              />
              <button
                onClick={() => restoreFileRef.current?.click()}
                disabled={restoring || restoreConfirmText.trim().toUpperCase() !== 'RESTORE'}
                style={{
                  marginTop: 18,
                  background: restoreConfirmText.trim().toUpperCase() === 'RESTORE' ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : 'rgba(148,163,184,0.3)',
                  color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px',
                  fontWeight: 700, fontSize: 14,
                  cursor: (restoring || restoreConfirmText.trim().toUpperCase() !== 'RESTORE') ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  opacity: (restoring || restoreConfirmText.trim().toUpperCase() !== 'RESTORE') ? 0.6 : 1,
                }}
              >
                {restoring ? <RefreshCw style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <RotateCcw style={{ width: 16, height: 16 }} />}
                {restoring ? 'Restoring...' : 'Restore from Backup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Info — Admin only */}
      {isAdmin() && (
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <Shield style={{ color: '#f59e0b', width: 22, height: 22 }} />
            <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700 }}>Account Information</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="label-text">EMAIL</label>
              <input type="text" value="admin@nishant.com" readOnly className="input-field" style={{ opacity: 0.7 }} />
            </div>
            <div>
              <label className="label-text">ROLE</label>
              <input type="text" value="Administrator" readOnly className="input-field" style={{ opacity: 0.7 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
