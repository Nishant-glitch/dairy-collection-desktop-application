import { auth, database } from '../firebase/config';
import { ref, get, set, remove } from 'firebase/database';
import { ADMIN_EMAIL } from './userDb';

export interface Subscription {
  plan: string;
  status: 'active' | 'expired' | 'none';
  startedAt: number;
  expiresAt: number;
  note?: string;
  updatedBy?: string;
}

export const subRef = (uid: string) => ref(database, `subscriptions/${uid}`);

// Apni pricing/duration yahan set karo
export const PLANS = {
  monthly:   { label: '1 Month',  days: 30,  price: 199 },
  quarterly: { label: '3 Months', days: 92,  price: 499 },
  yearly:    { label: '1 Year',   days: 365, price: 1499 },
} as const;

export type PlanKey = keyof typeof PLANS;

export const isSubActive = (sub: Subscription | null): boolean =>
  !!sub && sub.status === 'active' && sub.expiresAt > Date.now();

export const daysLeft = (sub: Subscription | null): number =>
  sub ? Math.max(0, Math.ceil((sub.expiresAt - Date.now()) / 86400000)) : 0;

export const getMySubscription = async (): Promise<Subscription | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await get(subRef(user.uid));
  return snap.exists() ? (snap.val() as Subscription) : null;
};

export const hasAccess = async (): Promise<boolean> => {
  if (auth.currentUser?.email === ADMIN_EMAIL) return true; // admin ko hamesha access
  return isSubActive(await getMySubscription());
};

/* ---- Sirf ADMIN ke liye (rules bhi yahi enforce karti hain) ---- */

export const activateSubscription = async (uid: string, plan: PlanKey, note = '') => {
  const days = PLANS[plan].days;
  const existing = (await get(subRef(uid))).val() as Subscription | null;
  const base = existing && existing.expiresAt > Date.now() ? existing.expiresAt : Date.now();
  const sub: Subscription = {
    plan: String(plan),
    status: 'active',
    startedAt: existing?.startedAt || Date.now(),
    expiresAt: base + days * 86400000,
    note,
    updatedBy: auth.currentUser?.email || 'admin',
  };
  await set(subRef(uid), sub);
  return sub;
};

export const revokeSubscription = async (uid: string) => {
  await remove(subRef(uid));
};
