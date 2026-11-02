import type { CapacitorConfig } from '@capacitor/cli';

// DCS Pro society app (Android). The APK is a native shell around the LIVE
// site: every Vercel deploy reaches phones instantly, no new APK needed.
//
// Offline: dcpro.online's service worker (vite-plugin-pwa) runs inside the
// WebView and serves the cached app shell on the SAME origin, so the cached
// Firebase login, subscription/rate-chart caches and the IndexedDB offline
// milk queue all keep working. A bundled copy of the app would load from a
// different origin (https://localhost) with separate storage — the clerk
// would look logged-out exactly when offline — so we deliberately DON'T
// bundle the web app. `capacitor-www/` only holds the first-launch-offline
// error page (shown before the service worker has ever been installed).
//
// Capacitor injects its native bridge into the server.url origin via
// addDocumentStartJavaScript, so native plugins work on the live site and on
// service-worker-served offline loads alike.
const config: CapacitorConfig = {
  appId: 'com.dcspro.society',
  appName: 'DCS Pro',
  webDir: 'capacitor-www',
  server: {
    url: 'https://dcpro.online',
    cleartext: false,
    androidScheme: 'https',
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    // Android 15+ forces edge-to-edge. 'native' pads the WebView inside the
    // system bars so the existing web layout (no safe-area CSS) never slides
    // under them. 'DARK' = light status-bar icons on the green bar.
    SystemBars: {
      insetsHandling: 'native',
      style: 'DARK',
    },
    SplashScreen: {
      // Auto-hide is a safety net: the offline error page has no plugin access,
      // so it could never hide a splash itself. The web app also hides it as
      // soon as React mounts (src/native/index.ts).
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
  },
};

export default config;
