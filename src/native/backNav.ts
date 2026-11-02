import { useEffect, useRef } from 'react';

// Android hardware-back plumbing, kept free of Capacitor imports so pages can
// use it at zero bundle cost. App.tsx's back-button listener consults these in
// order: open overlays first (topmost wins), then the unsaved-entry guard,
// then page navigation / exit.

type BackHandler = () => void;
const handlers: BackHandler[] = [];
let unsaved = false;

// Entry forms flag a half-typed entry so back asks before throwing it away.
export const setUnsavedChanges = (value: boolean): void => { unsaved = value; };
export const hasUnsavedChanges = (): boolean => unsaved;

// Runs the most recently registered overlay handler. Returns false when no
// overlay is open, so the caller falls through to page navigation.
export const runTopBackHandler = (): boolean => {
  const top = handlers[handlers.length - 1];
  if (!top) return false;
  top();
  return true;
};

// While `active`, hardware back calls `onBack` (e.g. close a popup) instead
// of leaving the page.
export function useBackHandler(active: boolean, onBack: BackHandler): void {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    const handler: BackHandler = () => latest.current();
    handlers.push(handler);
    return () => {
      const i = handlers.lastIndexOf(handler);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, [active]);
}
