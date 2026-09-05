import React, { useEffect, useRef, useState } from 'react';
import { Milk, ScanLine, Loader2, LogIn, Globe, X, Zap, ZapOff, CheckCircle2 } from 'lucide-react';
import { resolveSocietyUid, fetchPassbook } from './api';
import { saveSession, type FarmerSession } from './session';
import { startQrScan, isQrScanSupported, type QrScanHandle } from './qrScan';

// One-time login for the farmer lite app. Reuses the existing
// getFarmerPassbook Cloud Function to verify + fetch first-month data in a
// single round-trip. On success the session (with the plaintext PIN — see the
// threat-model note in session.ts) is saved so subsequent opens skip this
// screen entirely.
//
// Auto-fill: honours ?society=CODE in the URL so society admins can hand out a
// printable link/QR that pre-fills the society-code input.

const t = {
  hi: {
    title: 'Farmer Passbook',
    subtitle: 'Apna history dekhein — bina baar baar login kiye',
    societyLabel: 'Society Code',
    societyPh: 'e.g. 001',
    farmerLabel: 'Aapka Farmer Code',
    farmerPh: 'e.g. 42',
    pinLabel: '4-digit PIN',
    pinPh: '● ● ● ●',
    login: 'Login karein',
    verifying: 'Verify kar raha…',
    scan: 'Society QR scan karein',
    scanCancel: 'Cancel',
    scanInstr: 'Society ka QR camera ke saamne rakhein',
    invalidSociety: 'Society code galat hai. Society se sahi code lein.',
    invalidQr: 'Ye DCS Pro ka QR nahi hai. Society se sahi QR lein ya society code manually daalein.',
    missingFields: 'Sab fields bharein.',
    helpText: 'Society Code + Farmer Code + PIN aapke society se milega. Ek baar login ke baad app apne aap khulegi.',
    qrRecognized: 'QR se pehchane',
    torchOn: 'Light on',
    torchOff: 'Light off',
  },
  en: {
    title: 'Farmer Passbook',
    subtitle: 'View your history — no repeated logins',
    societyLabel: 'Society Code',
    societyPh: 'e.g. 001',
    farmerLabel: 'Your Farmer Code',
    farmerPh: 'e.g. 42',
    pinLabel: '4-digit PIN',
    pinPh: '● ● ● ●',
    login: 'Log in',
    verifying: 'Verifying…',
    scan: 'Scan society QR',
    scanCancel: 'Cancel',
    scanInstr: 'Point camera at your society QR',
    invalidSociety: 'Invalid society code. Please get the correct code from your society.',
    invalidQr: 'This is not a DCS Pro QR. Get the correct QR from your society, or enter the code manually.',
    missingFields: 'Please fill all fields.',
    helpText: 'Society Code + Farmer Code + PIN come from your society. After one login the app opens automatically next time.',
    qrRecognized: 'Recognised from QR',
    torchOn: 'Light on',
    torchOff: 'Light off',
  },
} as const;

interface LoginProps {
  onLoggedIn: (session: FarmerSession) => void;
  language: 'hi' | 'en';
  onToggleLanguage: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoggedIn, language, onToggleLanguage }) => {
  const L = t[language];
  const [societyCode, setSocietyCode] = useState('');
  const [farmerCode, setFarmerCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Set to true when the Society Code field was filled from an old-format
  // /passbook/{uid} QR — the value is a long Firebase uid rather than a
  // human-friendly 3-digit code, so we show a green chip explaining it.
  const [scannedFromUid, setScannedFromUid] = useState(false);
  // Torch state — only meaningful when the scan modal is open and the device
  // supports it (Android Chrome, rear camera with flash).
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanHandleRef = useRef<QrScanHandle | null>(null);

  // Auto-fill from URL parameter — enables the "share a link with society
  // pre-filled" flow. Runs once on mount.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('society');
      if (s && !societyCode) setSocietyCode(s.trim());
    } catch { /* URL parse issue — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up camera stream when the component unmounts. Camera light staying
  // on after modal closes is a real bug we saw during development.
  useEffect(() => () => { scanHandleRef.current?.stop(); }, []);

  // Whenever the user hand-edits the Society Code, drop the "from QR" chip.
  useEffect(() => { if (scannedFromUid) setScannedFromUid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societyCode]);

  const openScan = async () => {
    setScanning(true);
    setError('');
    setTorchOn(false);
    setTorchSupported(false);
    // Give the DOM a tick to render the video element before attaching the stream.
    setTimeout(async () => {
      if (!videoRef.current) return;
      const handle = await startQrScan(
        videoRef.current,
        (r) => {
          // Haptic feedback on successful scan — Android supports vibrate;
          // iOS ignores. Guarded because some browsers throw on strict
          // permission policies.
          try { navigator.vibrate?.(60); } catch { /* ignore */ }
          setScanning(false);
          setTorchOn(false);
          if (r.societyCode) {
            // New-format QR — clean short code goes straight into the field.
            setSocietyCode(r.societyCode);
            setScannedFromUid(false);
            // Nudge focus to the next field so the farmer keeps typing.
            setTimeout(() => document.getElementById('fc')?.focus(), 100);
            return;
          }
          if (r.societyUid) {
            // Old-format /passbook/{uid} QR — populate with the uid so
            // resolveSocietyUid's fallback branch can use it. Chip explains
            // the long string so the farmer isn't confused.
            setSocietyCode(r.societyUid);
            setScannedFromUid(true);
            setTimeout(() => document.getElementById('fc')?.focus(), 100);
            return;
          }
          // Unrecognised QR — was silently a no-op before this fix.
          setError(L.invalidQr);
        },
        (msg) => { setScanning(false); setTorchOn(false); setError(msg); },
      );
      scanHandleRef.current = handle;
      setTorchSupported(handle.torchSupported);
    }, 50);
  };

  const closeScan = () => {
    scanHandleRef.current?.stop();
    scanHandleRef.current = null;
    setScanning(false);
    setTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!scanHandleRef.current) return;
    const next = !torchOn;
    const ok = await scanHandleRef.current.setTorch(next);
    if (ok) setTorchOn(next);
  };

  const handleLogin = async () => {
    setError('');
    const sc = societyCode.trim();
    const fc = farmerCode.trim();
    const p = pin.trim();
    if (!sc || !fc || !p) { setError(L.missingFields); return; }

    setBusy(true);
    try {
      const uid = await resolveSocietyUid(sc);
      if (!uid) {
        setError(L.invalidSociety);
        setBusy(false);
        return;
      }
      // Reuse the passbook Cloud Function: it verifies PIN, enforces the
      // 3-tries lockout, and returns current-month data in one round-trip.
      const thisMonth = new Date().toISOString().substring(0, 7);
      const res = await fetchPassbook(uid, fc, p, thisMonth);
      if (!res.ok) {
        setError(res.error.message);
        setBusy(false);
        return;
      }
      const session: FarmerSession = {
        societyUid: uid,
        societyCode: sc,
        societyName: res.result.data.societyName,
        farmerCode: fc,
        farmerName: res.result.data.farmerName,
        pin: p,
        savedAt: Date.now(),
        language,
      };
      saveSession(session);
      onLoggedIn(session);
    } catch (e) {
      console.error(e);
      setError('Kuch gadbad ho gayi. Dobara try karein.');
      setBusy(false);
    }
  };

  return (
    <>
      <header className="farmer-header">
        <div className="farmer-logo">
          <div className="farmer-logo-mark">🥛</div>
          <span>DCS Farmer</span>
        </div>
        <button className="farmer-btn farmer-btn-ghost" style={{ width: 'auto', padding: '8px 12px' }} onClick={onToggleLanguage}>
          <Globe size={16} /> {language === 'hi' ? 'EN' : 'हि'}
        </button>
      </header>

      <div className="farmer-container">
        <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 20 }}>
          <div style={{
            width: 76, height: 76, margin: '0 auto 12px',
            background: 'linear-gradient(135deg, #4ade80, #15803d)',
            borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 12px 24px rgba(22,163,74,0.35)',
          }}>
            <Milk size={40} color="#06231a" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>{L.title}</h1>
          <p style={{ color: 'var(--f-ink-2)', fontSize: 14 }}>{L.subtitle}</p>
        </div>

        <div className="farmer-card">
          <div style={{ marginBottom: 16 }}>
            <label className="farmer-label" htmlFor="soc">{L.societyLabel}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="soc"
                className="farmer-input"
                value={societyCode}
                onChange={(e) => setSocietyCode(e.target.value)}
                placeholder={L.societyPh}
                autoComplete="off"
                inputMode="text"
                autoCapitalize="characters"
                // Old-format uid QR fills a 28-char string; smaller font so
                // it doesn't overflow visually and become alarming.
                style={scannedFromUid ? { fontSize: 13, letterSpacing: 0, fontFamily: 'monospace' } : undefined}
              />
              {isQrScanSupported() && (
                <button
                  type="button"
                  className="farmer-btn farmer-btn-secondary"
                  style={{ width: 60, minHeight: 52, flexShrink: 0, padding: 0 }}
                  onClick={openScan}
                  aria-label={L.scan}
                  title={L.scan}
                >
                  <ScanLine size={22} color="var(--f-brand)" />
                </button>
              )}
            </div>
            {scannedFromUid && (
              <div className="farmer-input-chip" style={{ marginTop: 6 }}>
                <CheckCircle2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                {L.qrRecognized}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="farmer-label" htmlFor="fc">{L.farmerLabel}</label>
            <input
              id="fc"
              className="farmer-input"
              value={farmerCode}
              onChange={(e) => setFarmerCode(e.target.value)}
              placeholder={L.farmerPh}
              autoComplete="off"
              inputMode="text"
              autoCapitalize="characters"
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label className="farmer-label" htmlFor="pin">{L.pinLabel}</label>
            <input
              id="pin"
              className="farmer-input pin"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={L.pinPh}
              type="password"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="farmer-error" style={{ marginBottom: 14 }}>{error}</div>
          )}

          <button
            className="farmer-btn farmer-btn-primary"
            onClick={handleLogin}
            disabled={busy}
          >
            {busy ? (<><Loader2 size={20} className="farmer-spinner" /> {L.verifying}</>)
                  : (<><LogIn size={20} /> {L.login}</>)}
          </button>

          <p style={{ marginTop: 16, fontSize: 13, color: 'var(--f-muted)', lineHeight: 1.6, textAlign: 'center' }}>
            {L.helpText}
          </p>
        </div>
      </div>

      {scanning && (
        <div className="farmer-scan-modal" role="dialog" aria-modal="true">
          <video ref={videoRef} className="farmer-scan-video" playsInline muted />
          <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginTop: 16, textAlign: 'center' }}>
            {L.scanInstr}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, width: '100%', maxWidth: 320, justifyContent: 'center' }}>
            {torchSupported && (
              <button
                type="button"
                className="farmer-btn farmer-btn-secondary"
                style={{ flex: 1, background: torchOn ? '#fef3c7' : '#fff' }}
                onClick={toggleTorch}
                aria-pressed={torchOn}
                title={torchOn ? L.torchOff : L.torchOn}
              >
                {torchOn ? <ZapOff size={20} /> : <Zap size={20} color="#d97706" />}
                {torchOn ? L.torchOff : L.torchOn}
              </button>
            )}
            <button
              className="farmer-btn farmer-btn-secondary"
              style={{ flex: 1 }}
              onClick={closeScan}
            >
              <X size={20} /> {L.scanCancel}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Login;
