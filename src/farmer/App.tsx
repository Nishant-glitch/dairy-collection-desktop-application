import React, { useEffect, useState } from 'react';
import { loadSession, updateSession, type FarmerSession } from './session';
import Login from './Login';
import History from './History';
import './farmer.css';

// Root of the DCS Pro Farmer lite app (route: /farmer). Lazy-loaded from the
// main App so society users never pay for this bundle. Session in localStorage
// -> jump straight to History; otherwise show Login. Language toggle lives at
// this level so both screens stay in sync.

const LANG_KEY = 'dcs_farmer_lang';

const FarmerApp: React.FC = () => {
  const [session, setSession] = useState<FarmerSession | null>(() => loadSession());
  // Set when History forces a logout (PIN changed / farmer removed / locked):
  // the login screen explains why and pre-fills the codes.
  const [logoutNotice, setLogoutNotice] = useState<{ text: string; societyCode: string; farmerCode: string } | null>(null);
  const [language, setLanguage] = useState<'hi' | 'en'>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === 'en' || saved === 'hi') return saved;
    } catch { /* ignore */ }
    return session?.language || 'hi';
  });

  const toggleLanguage = () => {
    const next = language === 'hi' ? 'en' : 'hi';
    setLanguage(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* ignore */ }
    if (session) updateSession({ language: next });
  };

  // Register the farmer-scoped web manifest at runtime by swapping the <link
  // rel="manifest"> href. vite-plugin-pwa injects the society manifest by
  // default; overriding here means "Add to Home Screen" from /farmer shows
  // "DCS Pro Farmer" as the app name, with its own icons/theme.
  // New deploy -> new service worker. registerType "autoUpdate" makes it
  // take control right away (skipWaiting + clientsClaim), but the page keeps
  // running the old JS until it reloads, and an installed PWA is usually
  // resumed rather than reopened, so it can stay on an old bundle for days.
  // Check for an update whenever the app comes to the foreground, and reload
  // once the new worker takes over. Safe here: this app is read-only, so a
  // reload never loses typed input. (Not done in the society app, where it
  // could wipe an unsaved milk entry.)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    const hadController = !!sw.controller; // first install also fires controllerchange — don't reload for that
    let reloading = false;
    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    const checkForUpdate = () => {
      if (document.visibilityState !== 'visible') return;
      sw.getRegistration().then((r) => r?.update()).catch(() => { /* offline — try next time */ });
    };
    sw.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', checkForUpdate);
    checkForUpdate();
    return () => {
      sw.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', checkForUpdate);
    };
  }, []);

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const prev = link?.href || null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = '/farmer.webmanifest';
    // Match theme-color to the farmer app's green so the OS status bar looks
    // right when installed as a standalone PWA.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prevTheme = meta?.content || null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = '#f7fbf9';
    document.title = 'DCS Pro Farmer';
    return () => {
      if (link && prev) link.href = prev;
      if (meta && prevTheme) meta.content = prevTheme;
    };
  }, []);

  return (
    <div className="farmer-root">
      {session
        ? <History
            session={session}
            onLogout={(notice) => {
              setLogoutNotice(notice
                ? { text: notice, societyCode: session.societyCode, farmerCode: session.farmerCode }
                : null);
              setSession(null);
            }}
            language={language}
            onToggleLanguage={toggleLanguage}
          />
        : <Login
            onLoggedIn={(s) => { setLogoutNotice(null); setSession(s); }}
            language={language}
            onToggleLanguage={toggleLanguage}
            notice={logoutNotice?.text}
            prefillSocietyCode={logoutNotice?.societyCode}
            prefillFarmerCode={logoutNotice?.farmerCode}
          />}
    </div>
  );
};

export default FarmerApp;
