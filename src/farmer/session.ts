// Local session for the DCS Pro Farmer lite app. One farmer per device — the
// idea is a farmer logs in ONCE, then the app opens straight into history for
// every subsequent open. Auth is a "remembered PIN" per Option A of the
// pre-build discussion: the server (Cloud Function getFarmerPassbook) is the
// source of truth on every call, and localStorage just remembers what to send.
//
// Threat model note: the PIN is stored plaintext. Anyone with physical device
// access can read it. That's an accepted trade-off — the passbook is
// read-only, contains only that farmer's own milk/deductions/net records, and
// the lockout logic (3 wrong tries -> 15 min) is server-enforced. If we ever
// let farmers TRIGGER money movement from the lite app, this needs to change.

const KEY = 'dcs_farmer_session';

export interface FarmerSession {
  societyUid: string;
  societyCode: string;   // for display + shown in header
  societyName: string;   // for display
  farmerCode: string;
  farmerName: string;
  pin: string;           // sent server-side on every fetch (see comment above)
  savedAt: number;
  language?: 'hi' | 'en';
}

export const loadSession = (): FarmerSession | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.societyUid || !s?.farmerCode || typeof s?.pin !== 'string') return null;
    return s as FarmerSession;
  } catch { return null; }
};

export const saveSession = (s: FarmerSession): void => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full/blocked */ }
};

export const clearSession = (): void => {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};

export const updateSession = (patch: Partial<FarmerSession>): void => {
  const cur = loadSession();
  if (!cur) return;
  saveSession({ ...cur, ...patch });
};
