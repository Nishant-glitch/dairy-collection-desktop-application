// Print arbitrary HTML without window.open() — popup blockers silently block
// window.open on a click sometimes, breaking "Print" buttons. Instead we append
// a hidden offscreen iframe, write the content into it, print it, then remove
// it. Works in Chrome/Edge/Electron (our desktop + PWA targets).
export function printHtml(html: string): void {
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

  // Give the iframe a tick to lay out (SVG/QR, fonts) before printing.
  window.setTimeout(() => {
    const win = iframe.contentWindow;
    if (!win) { cleanup(); return; }
    try {
      win.onafterprint = cleanup;
      win.focus();
      win.print();
    } catch (e) {
      console.error('printHtml failed:', e);
      cleanup();
      return;
    }
    // Fallback removal in case onafterprint never fires (leave time for the
    // print dialog to capture the content first).
    window.setTimeout(cleanup, 60000);
  }, 300);
}
