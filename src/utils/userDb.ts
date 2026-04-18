import { auth } from '../firebase/config';

export const getUid = (): string => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.uid;
};

export const up = (path: string): string => `users/${getUid()}/${path}`;
