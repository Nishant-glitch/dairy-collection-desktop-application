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
        ? <History session={session} onLogout={() => setSession(null)} language={language} onToggleLanguage={toggleLanguage} />
        : <Login onLoggedIn={setSession} language={language} onToggleLanguage={toggleLanguage} />}
    </div>
  );
};

export default FarmerApp;
