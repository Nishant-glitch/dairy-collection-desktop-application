// Windows (Electron/Chromium) can lose the text caret after a native confirm()
// dialog — the blinking cursor stops rendering in inputs until the app is
// restarted. Blurring the currently-focused element and then focusing a real
// input forces the caret to re-render. Runs on a short timeout so it happens
// after the dialog has fully closed. Harmless on Mac/mobile.
export function restoreCaret(target?: HTMLElement | null): void {
  setTimeout(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof active.blur === 'function') active.blur();
    if (target && typeof target.focus === 'function') target.focus();
  }, 100);
}
