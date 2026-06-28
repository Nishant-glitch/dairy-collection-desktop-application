import type { KeyboardEvent, RefObject } from 'react';

type FocusTarget = RefObject<HTMLElement | null> | (() => void);

/**
 * Enter-key field navigation, shared by data-entry forms (BMC Entry, Gross
 * Collection, …). On Enter it prevents the default form submit/reload, then
 * either focuses the next field's ref or — for the final field — runs the
 * provided action (e.g. save).
 */
export const handleEnterNav = (e: KeyboardEvent, next: FocusTarget): void => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (typeof next === 'function') next();
  else next.current?.focus();
};
