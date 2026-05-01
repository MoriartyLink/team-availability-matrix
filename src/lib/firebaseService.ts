import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
  getDocs
} from 'firebase/firestore';
import { db, auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const syncUserData = (userId: string, callback: (data: any) => void) => {
  const path = `users/${userId}`;
  return onSnapshot(doc(db, 'users', userId), 
    (snapshot) => {
      callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
};

export const syncGroupAvailability = (groupId: string, callback: (data: any[]) => void) => {
  const path = 'availability';
  const q = query(collection(db, path), where('groupId', '==', groupId));
  return onSnapshot(q, 
    (snapshot) => {
      const slots = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(slots);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
};

export const createProfile = async (uid: string, data: any) => {
  const path = `users/${uid}`;
  try {
    await setDoc(doc(db, 'users', uid), {
      ...data,
      uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const addAvailability = async (data: any) => {
  const path = 'availability';
  try {
    await addDoc(collection(db, path), {
      ...data,
      userId: auth.currentUser?.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const updateAvailability = async (id: string, data: any) => {
  const path = `availability/${id}`;
  try {
    await updateDoc(doc(db, 'availability', id), {
      ...data,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const deleteAvailability = async (id: string) => {
  const path = `availability/${id}`;
  try {
    await deleteDoc(doc(db, 'availability', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const duplicateAvailabilityToWeeks = async (sourceDate: string, sourceAvailability: any[], numWeeks: number = 1) => {
  const path = 'availability';
  const batch = writeBatch(db);
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const userSlots = sourceAvailability.filter(a => a.userId === userId && a.date === sourceDate);
  
  // repeat for the specified number of weeks
  for (let i = 1; i <= numWeeks * 7; i++) {
    const nextDate = new Date(sourceDate);
    nextDate.setDate(nextDate.getDate() + i);
    const dateStr = nextDate.toISOString().split('T')[0];
    
    userSlots.forEach(slot => {
      // Safely remove id and old timestamps before creating new records
      const { id, createdAt, updatedAt, ...cleanSlot } = slot;
      const newRef = doc(collection(db, 'availability'));
      batch.set(newRef, {
        ...cleanSlot,
        date: dateStr,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const adminToggleUserVisibility = async (userId: string, isHidden: boolean) => {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      isHidden,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const adminDeleteUser = async (userId: string) => {
  if (!userId) throw new Error("Invalid User ID provided for deletion");
  const userPath = `users/${userId}`;
  
  console.log(`[Admin] Attempting to purge user: ${userId}`);
  
  try {
    const batch = writeBatch(db);
    
    // 1. Queue user document deletion
    batch.delete(doc(db, 'users', userId));

    // 2. Queue all availability deletions
    const q = query(collection(db, 'availability'), where('userId', '==', userId));
    const snapshots = await getDocs(q);
    
    console.log(`[Admin] Found ${snapshots.size} availability entries to purge for ${userId}`);
    snapshots.forEach(d => batch.delete(d.ref));

    // 3. Commit the atomic batch
    await batch.commit();
    console.log(`[Admin] Purge complete for user ${userId}.`);
  } catch (error) {
    console.error("[Admin] Deletion strategy failed:", error);
    handleFirestoreError(error, OperationType.DELETE, userPath);
  }
};

export const purgeAllGroupData = async (groupId: string) => {
  if (!groupId) throw new Error("Group ID required for master purge");
  
  try {
    const batch = writeBatch(db);
    
    // 1. Get all users in group
    const usersQ = query(collection(db, 'users'), where('groupId', '==', groupId));
    const usersSnap = await getDocs(usersQ);
    usersSnap.forEach(d => batch.delete(d.ref));

    // 2. Get all availability in group
    const availQ = query(collection(db, 'availability'), where('groupId', '==', groupId));
    const availSnap = await getDocs(availQ);
    availSnap.forEach(d => batch.delete(d.ref));

    await batch.commit();
    return { usersRemoved: usersSnap.size, recordsRemoved: availSnap.size };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}/purge`);
  }
};

export const requestAdminPrivileges = async (code: string) => {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error("Authentication required");
  
  const path = `admins/${userId}`;
  try {
    await setDoc(doc(db, 'admins', userId), {
      code,
      email: auth.currentUser?.email,
      promotedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const checkAdminStatus = async () => {
  const userId = auth.currentUser?.uid;
  if (!userId) return false;
  const snapshot = await getDoc(doc(db, 'admins', userId));
  return snapshot.exists();
};

export const syncAllUsersInGroup = (groupId: string, callback: (data: any[]) => void) => {
  const path = 'users';
  const q = query(collection(db, path), where('groupId', '==', groupId));
  return onSnapshot(q,
    (snapshot) => {
      const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(users);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
};
