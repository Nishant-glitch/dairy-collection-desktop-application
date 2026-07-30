import React, { useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

// UI zoom for the whole app (helpful for older clerks / small screens). Applies
// document.body.style.zoom — well supported in Chrome/Edge/Electron (our desktop
// + PWA targets). Persisted in localStorage. Print is forced back to 100% via an
// @media print rule so reports print at their normal size.

const MIN = 70;
const MAX = 150;
const STEP = 10;
const KEY = 'dcs_zoom';

const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z));

const ZoomControls: React.FC = () => {
  const [zoom, setZoom] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem(KEY) || '100', 10);
    return isNaN(saved) ? 100 : clamp(saved);
  });

  useEffect(() => {
    const frac = zoom / 100;
    (document.body.style as any).zoom = `${zoom}%`;
    // `zoom` scales the body visually, so a `min-height: 100vh` body renders
    // as only `zoom%` of the viewport — leaving a blank strip below when zoomed
    // out. Counter it by setting the body's min-height to 100/frac vh, which
    // after scaling by `frac` lands back at exactly 100vh at ANY zoom level
    // (e.g. 70% -> 142.8vh -> fills the screen). html carries the same dotted
    // background as a backstop for any sub-pixel gap.
    document.body.style.minHeight = `${100 / frac}vh`;
    // Belt-and-braces: ensure the root element always fills + paints the
    // viewport even if the stylesheet load order changes.
    document.documentElement.style.minHeight = '100vh';
    document.documentElement.style.background = 'var(--bg)';
    localStorage.setItem(KEY, String(zoom));
  }, [zoom]);

  const dec = useCallback(() => setZoom((z) => clamp(z - STEP)), []);
  const inc = useCallback(() => setZoom((z) => clamp(z + STEP)), []);
  const reset = useCallback(() => setZoom(100), []);

  // Ctrl/Cmd + / − / 0 shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); inc(); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); dec(); }
      else if (e.key === '0') { e.preventDefault(); reset(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [inc, dec, reset]);

  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 26, height: 26, border: 'none', background: 'transparent',
    color: 'var(--ink-2)', cursor: 'pointer', borderRadius: 6,
  };

  return (
    <div
      className="hidden md:flex"
      style={{ alignItems: 'center', gap: 2, border: '1px solid var(--line)', borderRadius: 8, padding: 2, background: 'var(--surface)' }}
      title="Zoom (Ctrl +/− , Ctrl 0 = reset)"
    >
      <button onClick={dec} disabled={zoom <= MIN} style={{ ...btn, opacity: zoom <= MIN ? 0.4 : 1 }} title="Zoom out (Ctrl −)"><ZoomOut size={15} /></button>
      <button onClick={reset} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink)', fontSize: 11, fontWeight: 700, minWidth: 38 }} title="Reset zoom">{zoom}%</button>
      <button onClick={inc} disabled={zoom >= MAX} style={{ ...btn, opacity: zoom >= MAX ? 0.4 : 1 }} title="Zoom in (Ctrl +)"><ZoomIn size={15} /></button>
    </div>
  );
};

export default ZoomControls;
