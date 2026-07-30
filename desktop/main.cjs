// DCS Pro desktop wrapper (Electron). Option A: the window loads the live
// production site (https://dcpro.online), so every Vercel deploy is instantly
// reflected — no need to ship a new installer per update. Firebase auth/data
// work exactly as in the browser.

const { app, BrowserWindow, shell } = require('electron');

const APP_URL = 'https://dcpro.online';
const WINDOW_TITLE = 'DCS Pro - Dairy Collection System';

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

  win.loadURL(APP_URL);

  // Open new-window / target=_blank links (and any external origin) in the
  // user's default browser rather than inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
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
