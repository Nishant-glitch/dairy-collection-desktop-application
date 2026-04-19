import { auth } from '../firebase/config';

export const ADMIN_EMAIL = 'admin@nishant.com';

export const isAdmin = (): boolean => {
  const user = auth.currentUser;
  return user?.email === ADMIN_EMAIL;
};

export const getUid = (): string => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.uid;
};

export const up = (path: string): string => `users/${getUid()}/${path}`;
