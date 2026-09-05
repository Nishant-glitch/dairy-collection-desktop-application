// Dependency-free QR scanning for the farmer login screen.
//
// Uses the native BarcodeDetector API (Chromium — Android Chrome, Edge,
// desktop Chrome). Silently unsupported on iOS Safari; the login screen
// hides the Scan button in that case and the farmer types the society code.
//
// Accepts three QR payload shapes so both old and new society QRs work:
//   1. https://dcpro.online/farmer?society=CODE   (new — short code)
//   2. https://dcpro.online/passbook/{uid}        (old — Firebase uid; still
//      valid because resolveSocietyUid also accepts uid directly)
//   3. Bare short code, e.g. "001"                (typed / handwritten)

export interface ScanResult {
  societyCode?: string;
  societyUid?: string;
  raw: string;
}

// Handle returned by startQrScan — lets the caller stop the camera AND toggle
// the torch (Android Chrome only) when the room is dark.
export interface QrScanHandle {
  stop: () => void;
  setTorch: (on: boolean) => Promise<boolean>;
  torchSupported: boolean;
}

export const isQrScanSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'BarcodeDetector' in window &&
  typeof (window as any).BarcodeDetector === 'function' &&
  !!navigator.mediaDevices?.getUserMedia;

const parsePayload = (text: string): ScanResult => {
  const raw = String(text || '').trim();
  try {
    const u = new URL(raw);
    // /farmer?society=CODE (new format)
    const soc = u.searchParams.get('society');
    if (soc) return { societyCode: soc.trim(), raw };
    // /passbook/{uid} (old format — still supported)
    const pb = u.pathname.match(/^\/passbook\/([^/]+)\/?$/);
    if (pb) return { societyUid: decodeURIComponent(pb[1]), raw };
  } catch { /* not a URL — fall through */ }
  // Bare short code
  if (/^[A-Za-z0-9_-]{1,32}$/.test(raw)) return { societyCode: raw, raw };
  return { raw };
};

export const startQrScan = async (
  video: HTMLVideoElement,
  onResult: (r: ScanResult) => void,
  onError?: (msg: string) => void,
): Promise<QrScanHandle> => {
  const noop: QrScanHandle = {
    stop: () => { /* no-op */ },
    setTorch: async () => false,
    torchSupported: false,
  };

  if (!isQrScanSupported()) {
    onError?.('QR scan is browser mein kaam nahi karta. Society code manually daalein.');
    return noop;
  }

  let stopped = false;
  let stream: MediaStream | null = null;
  let raf = 0;
  let track: MediaStreamTrack | null = null;

  const stop = () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => { /* autoplay policy — ignore */ });
    track = stream.getVideoTracks()[0] || null;
  } catch (e) {
    onError?.('Camera permission chahiye. Browser settings mein allow karein.');
    stop();
    return noop;
  }

  // Torch capability — Android Chrome exposes it on rear cameras that support
  // hardware flash. iOS Safari never does. Guarded with `any` because the DOM
  // typings don't include `torch` yet.
  const caps: any = (track as any)?.getCapabilities?.() || {};
  const torchSupported = !!caps.torch;

  const setTorch = async (on: boolean): Promise<boolean> => {
    if (!track || !torchSupported) return false;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: on }] });
      return true;
    } catch (e) {
      console.warn('torch toggle failed:', e);
      return false;
    }
  };

  const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });

  const tick = async () => {
    if (stopped) return;
    try {
      const codes = await detector.detect(video);
      if (codes && codes.length > 0) {
        const value = codes[0].rawValue || '';
        // Log the raw payload once — helps admins debug their own QRs by
        // opening chrome://inspect on the phone.
        console.debug('[DCS Farmer QR]', value);
        stop();
        onResult(parsePayload(value));
        return;
      }
    } catch { /* transient — try again */ }
    raf = requestAnimationFrame(tick);
  };
  tick();

  return { stop, setTorch, torchSupported };
};
