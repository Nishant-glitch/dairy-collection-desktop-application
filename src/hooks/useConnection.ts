import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase/config';

// Tracks the Realtime Database connection via the special `.info/connected`
// ref (more accurate than navigator.onLine — it reflects the actual RTDB
// socket). While disconnected, RTDB still serves reads from its in-memory
// cache and queues writes locally, syncing them automatically on reconnect.
export function useConnection(): boolean {
  const [online, setOnline] = useState<boolean>(true);
  useEffect(() => {
    const connRef = ref(database, '.info/connected');
    return onValue(connRef, (snap) => setOnline(snap.val() === true));
  }, []);
  return online;
}
