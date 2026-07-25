// DCS Pro desktop wrapper (Electron). Option A: the window loads the live
// production site (https://dcpro.online), so every Vercel deploy is instantly
// reflected — no need to ship a new installer per update. Firebase auth/data
// work exactly as in the browser.

const { app, BrowserWindow, shell } = require('electron');

const APP_URL = 'https://dcpro.online';
const WINDOW_TITLE = 'DCS Pro - Dairy Collection System';

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: WINDOW_TITLE,
    backgroundColor: '#f8faf9',
    autoHideMenuBar: true, // hide the default menu bar on Windows/Linux
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
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
