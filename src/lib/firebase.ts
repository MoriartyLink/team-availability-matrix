import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  doc, 
  getDocFromServer,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with settings to handle potential environment connectivity issues
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  experimentalForceLongPolling: true, // Force long polling if streaming is blocked
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Connectivity check
async function testConnection() {
  try {
    // Only test if we are not in a server environment
    if (typeof window !== 'undefined') {
      await getDocFromServer(doc(db, 'test', 'connection'));
      console.log("Firestore connection established.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore is operating in offline mode. Changes will sync when online.");
    } else {
      console.error("Firestore connectivity error:", error);
    }
  }
}
testConnection();
