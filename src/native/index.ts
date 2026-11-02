import { Capacitor, registerPlugin } from '@capacitor/core';

// Bridge between the web app and the Android shell (android/). This code ships
// in the normal web bundle because the APK loads the live site — on the web
// every function here falls back to the browser behaviour. Plugin packages
// are imported dynamically so browsers never download them.
//
// Version skew: the live site can be newer than an installed APK. Every native
// call is wrapped so a missing/old plugin degrades to the web path instead of
// breaking the page.

export const isNative = (): boolean => Capacitor.isNativePlatform();

interface DcsPrintPlugin {
  printHtml(options: { html: string; jobName?: string }): Promise<void>;
  printPage(options?: { jobName?: string }): Promise<void>;
}
// Local plugin: android/app/src/main/java/com/dcspro/society/DcsPrintPlugin.java
const DcsPrint = registerPlugin<DcsPrintPlugin>('DcsPrint');

// Android WebView has no window.print(); hand the document to the system
// print dialog instead. Returns false when not native (caller uses the web path).
export async function nativePrintHtml(html: string, jobName = 'DCS Pro'): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await DcsPrint.printHtml({ html, jobName });
  } catch (e) {
    console.error('Native print failed:', e);
    alert('Print nahi ho paaya. Phone mein printer / "Save as PDF" option check karein.');
  }
  return true;
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Save a generated file (backup JSON, Excel, QR PNG). Browsers download it;
// the Android app (where <a download> silently does nothing) writes it to the
// app cache and opens the share sheet — WhatsApp, Drive, Gmail, Files, etc.
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (isNative()) {
    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      const written = await Filesystem.writeFile({
        path: filename,
        data: await blobToBase64(blob),
        directory: Directory.Cache,
      });
      await Share.share({ title: filename, files: [written.uri], dialogTitle: filename });
    } catch (e: any) {
      // Dismissing the share sheet rejects with "Share canceled" — not an error.
      if (/cancel/i.test(String(e?.message || e))) return;
      console.error('Native file save failed:', e);
      alert('File save / share nahi ho paayi: ' + (e?.message || e));
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// One-time startup for the Android app. Safe to call on the web (no-op).
export function initNative(): void {
  if (!isNative()) return;

  // Whole-page prints (Reports, Cash Book, Deductions, BMC bill) call
  // window.print() directly; route them to the native print of this WebView,
  // which keeps the pages' @media print CSS.
  window.print = () => {
    DcsPrint.printPage({ jobName: document.title || 'DCS Pro' }).catch((e) => {
      console.error('Native page print failed:', e);
      alert('Print nahi ho paaya. Phone mein printer / "Save as PDF" option check karein.');
    });
  };

  // The splash also auto-hides natively (capacitor.config.ts) as a safety net.
  import('@capacitor/splash-screen')
    .then(({ SplashScreen }) => SplashScreen.hide())
    .catch(() => { /* older APK without the plugin */ });
}

// Android hardware back. Returns an unsubscribe function.
export function onBackButton(handler: () => void): () => void {
  if (!isNative()) return () => {};
  let remove: (() => void) | null = null;
  let cancelled = false;
  import('@capacitor/app')
    .then(({ App }) => App.addListener('backButton', handler))
    .then((h) => {
      if (cancelled) h.remove();
      else remove = () => h.remove();
    })
    .catch((e) => console.error('backButton listener failed:', e));
  return () => {
    cancelled = true;
    remove?.();
  };
}

export async function exitApp(): Promise<void> {
  if (!isNative()) return;
  const { App } = await import('@capacitor/app');
  await App.exitApp();
}
