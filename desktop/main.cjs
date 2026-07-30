// DCS Pro desktop wrapper (Electron).
//
// Hybrid strategy: try the live production site (https://dcpro.online) so
// every Vercel deploy is instantly reflected — no new installer per update —
// but fall back to a bundled `dist/index.html` snapshot when the network is
// down. That way the desktop app opens successfully even fully offline; the
// IndexedDB queue then handles milk-collection entries as usual.

const path = require('path');
const { app, BrowserWindow, shell } = require('electron');

const APP_URL = 'https://dcpro.online';
const WINDOW_TITLE = 'DCS Pro - Dairy Collection System';
// The CI workflow copies the built web app into `desktop/dist/` before
// packaging. It's built with `vite --base=./` so relative asset paths work
// under `file://`.
const OFFLINE_FALLBACK = path.join(__dirname, 'dist', 'index.html');

// Chromium command-line switches MUST be set before app.whenReady().
//
// `high-dpi-support=1` explicitly opts in to Chromium's high-DPI rendering so
// text/UI stays crisp on Windows 125%/150%/200% DPI displays (default in
// modern Electron anyway, declared here for clarity).
//
// We deliberately DO NOT set `force-device-scale-factor=1` — that would
// override the user's Windows DPI setting and render the app tiny on 4K /
// high-DPI screens. Let Windows own scaling; Electron respects it.
app.commandLine.appendSwitch('high-dpi-support', '1');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    // Minimum size stops the sidebar-fixed / navbar-flex layout from breaking
    // on small / older screens (e.g. 1024x768 Windows 10 laptops).
    minWidth: 1024,
    minHeight: 700,
    title: WINDOW_TITLE,
    backgroundColor: '#f8faf9',
    autoHideMenuBar: true, // hide the default menu bar on Windows/Linux
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Explicit 1.0 so a stray Ctrl+scroll on a trackpad can't leave the
      // window's Chromium zoom stuck at a fractional level between launches
      // (would clash with our in-app zoom control).
      zoomFactor: 1.0,
    },
  });

  // Keep our fixed title instead of the page's <title>.
  win.on('page-title-updated', (e) => e.preventDefault());

  let offlineMode = false;
  let fallbackTried = false;

  win.loadURL(APP_URL);

  // Live URL failed to load (ERR_INTERNET_DISCONNECTED, DNS failure, etc.) ->
  // load the bundled snapshot. Only handle the main frame's first failure so
  // XHR/fetch errors inside the app don't retrigger.
  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || fallbackTried) return;
    // ERR_ABORTED (-3) fires on normal navigation aborts (e.g. we replaced the
    // URL); it's not a network error.
    if (errorCode === -3) return;
    fallbackTried = true;
    offlineMode = true;
    console.log(`Live URL failed (${errorCode} ${errorDescription} for ${validatedURL}); loading bundled fallback`);
    win.setTitle(`${WINDOW_TITLE} — Offline mode`);
    win.loadFile(OFFLINE_FALLBACK).catch((err) => {
      console.error('Bundled fallback also failed to load:', err);
    });
  });

  // On the offline path, inject a small badge so the user can see they're on
  // the cached snapshot (not the latest deploy). React owns #root only, so
  // appending to <body> is safe from re-renders.
  win.webContents.on('did-finish-load', () => {
    if (!offlineMode) return;
    win.webContents.executeJavaScript(`(() => {
      if (document.getElementById('__dcs_offline_badge')) return;
      const b = document.createElement('div');
      b.id = '__dcs_offline_badge';
      b.textContent = 'Offline mode — cached version';
      Object.assign(b.style, {
        position: 'fixed', bottom: '12px', right: '12px',
        background: '#b45309', color: '#fff',
        padding: '6px 12px', borderRadius: '999px',
        fontSize: '11px', fontWeight: '800',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        zIndex: '2147483647',
        boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
        pointerEvents: 'none',
      });
      document.body.appendChild(b);
    })();`).catch(() => { /* CSP or missing body — non-fatal */ });
  });

  // Open new-window / target=_blank links (and any external origin) in the
  // user's default browser rather than inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    // Allow the offline fallback (file://) to navigate freely; block anything
    // that isn't our live URL or the local snapshot.
    if (url.startsWith(APP_URL) || url.startsWith('file://')) return;
    event.preventDefault();
    shell.openExternal(url);
  });
}

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// macOS convention: stay running (in the dock) until the user explicitly quits
// with Cmd+Q; other platforms quit when the last window closes.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
