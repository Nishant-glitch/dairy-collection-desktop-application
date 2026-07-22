// Client-side helpers for the public Farmer Passbook (no Cloud Function).
//
// PINs are never stored in plain text — only a salted SHA-256 hash lives in
// users/{societyUid}/passbookData/{farmerCode}.pinHash. Verification happens on
// the client (the PIN gates the UI, not the DB rules), so this is a
// casual-misuse deterrent, not a hard security boundary.

const PASSBOOK_SALT = 'DCSPro::passbook::v1::salt';

// Salted SHA-256 of a PIN, as a lowercase hex string. Uses the Web Crypto API
// (available in all modern browsers over https / localhost).
export const hashPin = async (pin: string): Promise<string> => {
  const bytes = new TextEncoder().encode(PASSBOOK_SALT + '|' + pin.trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const isValidPin = (pin: string): boolean => /^\d{4}$/.test(pin.trim());

// Firebase-safe key for one collection entry (date has hyphens, which are
// allowed; '.', '#', '$', '[', ']', '/' are not, and never appear here).
export const historyKey = (date: string, shift: string): string => `${date}_${shift}`;

// The public passbook URL for a society. Built from the current origin so it
// works on the production domain and any preview/dev host alike.
export const passbookUrl = (societyUid: string): string =>
  `${window.location.origin}/passbook/${societyUid}`;
