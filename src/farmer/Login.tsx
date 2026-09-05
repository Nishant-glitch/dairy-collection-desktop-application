import React, { useEffect, useRef, useState } from 'react';
import { Milk, ScanLine, Loader2, LogIn, Globe, X } from 'lucide-react';
import { resolveSocietyUid, fetchPassbook } from './api';
import { saveSession, type FarmerSession } from './session';
import { startQrScan, isQrScanSupported } from './qrScan';

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
    missingFields: 'Sab fields bharein.',
    helpText: 'Society Code + Farmer Code + PIN aapke society se milega. Ek baar login ke baad app apne aap khulegi.',
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
    missingFields: 'Please fill all fields.',
    helpText: 'Society Code + Farmer Code + PIN come from your society. After one login the app opens automatically next time.',
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopScanRef = useRef<(() => void) | null>(null);

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

  // Clean up camera stream when scan modal closes (either from result, cancel,
  // or unmount). Camera light staying on after modal closes is a bug.
  useEffect(() => () => { stopScanRef.current?.(); }, []);

  const openScan = async () => {
    setScanning(true);
    setError('');
    // Give the DOM a tick to render the video element before attaching the stream.
    setTimeout(async () => {
      if (!videoRef.current) return;
      stopScanRef.current = await startQrScan(
        videoRef.current,
        (r) => {
          setScanning(false);
          if (r.societyCode) setSocietyCode(r.societyCode);
          // societyUid-only payload (old-format /passbook/{uid} QR): we can't
          // reverse-lookup to a code cheaply, so just tell the user.
          else if (r.societyUid && !r.societyCode) {
            setError('Society QR pehchan liya. Ab apna farmer code aur PIN daalein.');
          }
        },
        (msg) => { setScanning(false); setError(msg); },
      );
    }, 50);
  };

  const closeScan = () => {
    stopScanRef.current?.();
    stopScanRef.current = null;
    setScanning(false);
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
          <button
            className="farmer-btn farmer-btn-secondary"
            style={{ maxWidth: 220, marginTop: 16 }}
            onClick={closeScan}
          >
            <X size={20} /> {L.scanCancel}
          </button>
        </div>
      )}
    </>
  );
};

export default Login;
