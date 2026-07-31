// Print arbitrary HTML without window.open() — popup blockers silently block
// window.open on a click sometimes, breaking "Print" buttons. Instead we append
// a hidden offscreen iframe, write the content into it, print it, then remove
// it. Works in Chrome/Edge/Electron (our desktop + PWA targets).
//
// `onDone` fires once the print dialog has been dismissed so the caller can
// restore focus (e.g. back to the farmer-code input for the next entry). We
// listen for THREE signals and dedupe — whichever fires first wins:
//   1. iframe's `onafterprint` (spec signal, fires reliably in Chrome/Electron)
//   2. main window's `focus` event (fires when the OS returns focus to the app
//      after the OS print dialog closes — belt-and-braces for browsers where
//      onafterprint is flaky)
//   3. a 15s hard-fallback so the caller isn't stranded if both above miss.
export function printHtml(html: string, onDone?: () => void): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  let doneFired = false;
  const fireDone = () => {
    if (doneFired) return;
    doneFired = true;
    window.removeEventListener('focus', onWindowFocus);
    // Small delay so the OS finishes its focus transition BEFORE the caller
    // calls .focus() on an input — otherwise the input can lose focus again
    // milliseconds later when the print dialog fully unwinds.
    if (onDone) window.setTimeout(onDone, 50);
  };

  // Listen ONCE for the main window regaining focus (i.e. the print dialog
  // was dismissed). Registered before print() so we don't miss an early fire.
  const onWindowFocus = () => fireDone();
  window.addEventListener('focus', onWindowFocus);

  // Give the iframe a tick to lay out (SVG/QR, fonts) before printing.
  window.setTimeout(() => {
    const win = iframe.contentWindow;
    if (!win) { cleanup(); fireDone(); return; }
    try {
      win.onafterprint = () => { cleanup(); fireDone(); };
      win.focus();
      win.print();
    } catch (e) {
      console.error('printHtml failed:', e);
      cleanup();
      fireDone();
      return;
    }
    // Hard fallback: some browsers/Electron builds miss both onafterprint AND
    // the window-focus event (e.g. when the app is fullscreen). 15s ensures
    // the caller isn't stuck forever without ever restoring focus.
    window.setTimeout(() => { cleanup(); fireDone(); }, 15000);
  }, 300);
}
