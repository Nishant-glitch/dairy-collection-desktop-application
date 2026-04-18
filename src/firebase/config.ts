import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCTliTeD9vAv1Di5paG6v_ovoJaKHdNgbI",
  authDomain: "farmerdb-ba9b0.firebaseapp.com",
  databaseURL: "https://farmerdb-ba9b0-default-rtdb.firebaseio.com",
  projectId: "farmerdb-ba9b0",
  storageBucket: "farmerdb-ba9b0.firebasestorage.app",
  messagingSenderId: "703428321974",
  appId: "1:703428321974:web:7ba472d25d062dc1027c17"
};

const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Database
export const database = getDatabase(app);
export const db = database; // Alias for convenience

export default app;
