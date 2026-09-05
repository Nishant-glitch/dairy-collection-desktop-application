// Dependency-free QR scanning for the farmer login screen.
//
// Uses the native BarcodeDetector API (Chromium — Android Chrome, Edge,
// desktop Chrome). Silently unsupported on iOS Safari; the login screen
// hides the Scan button in that case and the farmer types the society code.
//
// Accepts two QR payload shapes:
//   1. https://dcpro.online/farmer?society=CODE      (preferred — direct)
//   2. https://dcpro.online/passbook/{societyUid}    (existing society QR;
//      we hit societyCodeIndex reverse-lookup later isn't wired here — the
//      caller resolves it by taking whatever CODE it can extract)
//
// Returns whatever it extracted so the login screen can populate its input.

export interface ScanResult {
  societyCode?: string;
  societyUid?: string;
  raw: string;
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
    // /farmer?society=CODE
    const soc = u.searchParams.get('society');
    if (soc) return { societyCode: soc.trim(), raw };
    // /passbook/{uid}
    const pb = u.pathname.match(/^\/passbook\/([^/]+)\/?$/);
    if (pb) return { societyUid: decodeURIComponent(pb[1]), raw };
  } catch { /* not a URL — fall through */ }
  // Bare short code, e.g. "001"
  if (/^[A-Za-z0-9_-]{1,32}$/.test(raw)) return { societyCode: raw, raw };
  return { raw };
};

// Runs the camera + detector loop until `stop()` returns, or one QR is found.
// Caller supplies a <video> element to render the preview in.
export const startQrScan = async (
  video: HTMLVideoElement,
  onResult: (r: ScanResult) => void,
  onError?: (msg: string) => void,
): Promise<() => void> => {
  if (!isQrScanSupported()) {
    onError?.('QR scan is browser mein kaam nahi karta. Society code manually daalein.');
    return () => { /* no-op */ };
  }

  let stopped = false;
  let stream: MediaStream | null = null;
  let raf = 0;

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
  } catch (e) {
    onError?.('Camera permission chahiye. Browser settings mein allow karein.');
    stop();
    return stop;
  }

  const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });

  const tick = async () => {
    if (stopped) return;
    try {
      const codes = await detector.detect(video);
      if (codes && codes.length > 0) {
        const value = codes[0].rawValue || '';
        stop();
        onResult(parsePayload(value));
        return;
      }
    } catch { /* transient — try again */ }
    raf = requestAnimationFrame(tick);
  };
  tick();

  return stop;
};
