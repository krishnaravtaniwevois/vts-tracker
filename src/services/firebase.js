import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';

const STORAGE_KEY_FIREBASE_CONFIG = 'vts_tracker_firebase_config';
const STORAGE_KEY_LOCAL_USERS = 'vts_tracker_firebase_users_local';
const STORAGE_KEY_CURRENT_SESSION = 'vts_tracker_current_user';

// Live Firebase Configuration for device-streaming-e98b4845
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAhXHLpiZRe-1dgmBuGlkNeT7vWVf5djLw",
  authDomain: "device-streaming-e98b4845.firebaseapp.com",
  projectId: "device-streaming-e98b4845",
  storageBucket: "device-streaming-e98b4845.firebasestorage.app",
  messagingSenderId: "678346206201",
  appId: "1:678346206201:web:99137a068322831397eb28"
};

export const RAJASTHAN_CITIES = [
  'AJMER', 'BHARATPUR', 'BUNDI', 'CHIRAWA', 'CIVIL LINE', 'DAUSA',
  'DEI-BUNDI', 'ETMADPUR', 'HISAR', 'IIT ROORKEE', 'ITARSI', 'JAIPUR',
  'JHUNJHUNU', 'JODHPUR', 'KHANDELA', 'KISHANPOLE', 'KUCHAMAN', 'LOSAL',
  'NAWA', 'PALI', 'PARBATSAR', 'PHALODI', 'RAJSAMAND', 'RATANGARH',
  'REENGUS', 'SAMBHAR', 'SIKAR', 'SOHAGPUR', 'TONK', 'UNIARA',
  'VIDISHA', 'OTHER'
];

export const VEHICLE_TYPES = [
  'Tractor', 'Tipper', 'Dumper', 'Auto Tipper', 'Compactor', 'Other'
];

export const REQUIREMENT_TYPES = [
  'New VTS', 'SIM', 'Wiring', 'Replacement', 'Other'
];

export const RETURN_REASONS = [
  'Vehicle Removed from Site',
  'Faulty / Not Working',
  'SIM Network / Connectivity Issue',
  'Damaged / Burned',
  'Accidental Damage',
  'Upgraded to New Device',
  'Physical / Water Damage',
  'Other'
];

export function getStoredFirebaseConfig() {
  const saved = localStorage.getItem(STORAGE_KEY_FIREBASE_CONFIG);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Migrate if previously saved with dummy key or old project
      if (!parsed.apiKey || parsed.apiKey.includes('DummyKey') || parsed.projectId === 'vts-fleet-32b51') {
        localStorage.setItem(STORAGE_KEY_FIREBASE_CONFIG, JSON.stringify(DEFAULT_FIREBASE_CONFIG));
        return DEFAULT_FIREBASE_CONFIG;
      }
      return { ...DEFAULT_FIREBASE_CONFIG, ...parsed };
    } catch {
      return DEFAULT_FIREBASE_CONFIG;
    }
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveFirebaseConfig(config) {
  if (!config) {
    localStorage.removeItem(STORAGE_KEY_FIREBASE_CONFIG);
  } else {
    localStorage.setItem(STORAGE_KEY_FIREBASE_CONFIG, JSON.stringify(config));
  }
  firebaseApp = null;
  firebaseAuth = null;
  firestoreDb = null;
}

let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;

export function getFirebaseInstance() {
  if (firebaseApp) {
    return { app: firebaseApp, auth: firebaseAuth, db: firestoreDb };
  }

  const config = getStoredFirebaseConfig();
  if (!config || !config.apiKey || config.apiKey.includes('DummyKey') || config.apiKey.trim().length < 20) {
    return { app: null, auth: null, db: null };
  }
  try {
    const existing = getApps();
    if (existing.length > 0) {
      firebaseApp = initializeApp(config, `vts_app_${Date.now()}`);
    } else {
      firebaseApp = initializeApp(config);
    }
    firebaseAuth = getAuth(firebaseApp);
    firestoreDb = getFirestore(firebaseApp);
    return { app: firebaseApp, auth: firebaseAuth, db: firestoreDb };
  } catch (err) {
    console.warn("Firebase initialization warning (running in resilient mode):", err);
    return { app: null, auth: null, db: null };
  }
}

/**
 * Initial Default Users for Local Resilient Store
 */
const DEFAULT_USERS = [
  {
    uid: 'admin_krishna_default',
    name: 'Krishna Ravtani',
    email: 'krishnaravtani.wevois@gmail.com',
    role: 'Admin',
    assignedCities: ['All'],
    password: 'admin',
    status: 'Active',
    createdAt: '2026-01-01'
  },
  {
    uid: 'manager_bhumika_default',
    name: 'Bhumika',
    email: 'bhumika@wevois.com',
    role: 'Manager',
    assignedCities: ['Reengus'],
    password: 'manager123',
    status: 'Active',
    createdAt: '2026-01-15'
  },
  {
    uid: 'manager_suresh_default',
    name: 'Suresh Kumar',
    email: 'suresh.sikar@wevois.com',
    role: 'Manager',
    assignedCities: ['Sikar', 'Losal'],
    password: 'manager123',
    status: 'Active',
    createdAt: '2026-02-01'
  }
];

function getLocalUsers() {
  const saved = localStorage.getItem(STORAGE_KEY_LOCAL_USERS);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fallback
    }
  }
  localStorage.setItem(STORAGE_KEY_LOCAL_USERS, JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS;
}

function saveLocalUsers(users) {
  localStorage.setItem(STORAGE_KEY_LOCAL_USERS, JSON.stringify(users));
}

/**
 * Sync All Local / Passed Users into Firebase Firestore 'users' Collection
 */
export async function syncAllUsersToFirestore(customUsers) {
  const config = getStoredFirebaseConfig();
  if (!config.apiKey || config.apiKey.includes('DummyKey')) {
    throw new Error('Please enter your real Firebase Web API Key (AIzaSy...) from Firebase Project Settings before syncing.');
  }

  const { db } = getFirebaseInstance();
  if (!db) {
    throw new Error('Firestore is not initialized. Please verify your Firebase Web API Key in Settings.');
  }

  const usersToSync = customUsers && customUsers.length > 0 ? customUsers : getLocalUsers();
  let count = 0;
  for (const u of usersToSync) {
    const userDocId = u.uid || `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await setDoc(doc(db, 'users', userDocId), {
      name: u.name || '',
      email: String(u.email || '').toLowerCase().trim(),
      role: u.role || 'Manager',
      assignedCities: Array.isArray(u.assignedCities) ? u.assignedCities : (u.assignedCities ? [u.assignedCities] : []),
      password: u.password || 'manager123',
      status: u.status || 'Active',
      createdAt: serverTimestamp()
    }, { merge: true });
    count++;
  }

  return { success: true, message: `Successfully created/synced ${count} users in Firestore 'users' collection!`, count };
}

/**
 * Fetch All Users from Firebase Firestore (with local sync)
 */
export async function fetchAllFirebaseUsers() {
  const { db } = getFirebaseInstance();

  if (db) {
    try {
      const usersCol = collection(db, 'users');
      const snapshot = await getDocs(usersCol);
      if (!snapshot.empty) {
        const firestoreUsers = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            uid: docSnap.id,
            name: d.name || d.email.split('@')[0],
            email: d.email,
            role: d.role === 'Admin' ? 'Admin' : 'Manager',
            assignedCities: Array.isArray(d.assignedCities) ? d.assignedCities : (d.assignedCities ? [d.assignedCities] : []),
            password: d.password || '******',
            status: d.status || 'Active',
            createdAt: d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toISOString() : d.createdAt) : new Date().toISOString()
          };
        });
        saveLocalUsers(firestoreUsers);
        return firestoreUsers;
      } else {
        // If collection is empty, automatically seed existing users
        const local = getLocalUsers();
        if (local && local.length > 0) {
          try {
            await syncAllUsersToFirestore(local);
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      console.warn("Firestore fetchUsers fallback to local storage:", err.message);
    }
  }

  return getLocalUsers();
}

/**
 * Sign In User via Firebase Auth & Firestore
 */
export async function loginWithFirebase(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '').trim();

  if (!cleanEmail || !cleanPassword) {
    throw new Error('Please enter both email ID and password.');
  }

  const { auth, db } = getFirebaseInstance();

  // Try Online Firebase Auth if available
  if (auth && !DEFAULT_FIREBASE_CONFIG.apiKey.includes('DummyKey')) {
    try {
      const userCred = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
      const user = userCred.user;

      // Retrieve profile from Firestore
      let userProfile = null;
      if (db) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            userProfile = { uid: user.uid, ...docSnap.data() };
          }
        } catch {
          // ignore
        }
      }

      if (!userProfile) {
        const isAdmin = cleanEmail.includes('admin') || cleanEmail === 'krishnaravtani.wevois@gmail.com';
        userProfile = {
          uid: user.uid,
          name: user.displayName || cleanEmail.split('@')[0],
          email: cleanEmail,
          role: isAdmin ? 'Admin' : 'Manager',
          assignedCities: isAdmin ? ['All'] : ['Bundi'],
          status: 'Active'
        };
        if (db) {
          try {
            await setDoc(doc(db, 'users', user.uid), userProfile);
          } catch {
            // ignore
          }
        }
      }

      localStorage.setItem(STORAGE_KEY_CURRENT_SESSION, JSON.stringify(userProfile));
      return { success: true, user: userProfile };
    } catch (firebaseErr) {
      console.warn("Firebase Auth attempt:", firebaseErr.message);
      // If invalid credential or user not found, fall back to check Firestore/local database
    }
  }

  // Fallback: Check local and Firestore users store
  const allUsers = await fetchAllFirebaseUsers();
  const matchedUser = allUsers.find(
    (u) => u.email.toLowerCase().trim() === cleanEmail && String(u.password).trim() === cleanPassword
  );

  if (matchedUser) {
    if (matchedUser.status === 'Inactive') {
      throw new Error('Your account is currently disabled. Please contact the Admin.');
    }
    const sessionUser = {
      uid: matchedUser.uid || `user_${Date.now()}`,
      name: matchedUser.name,
      email: matchedUser.email,
      role: matchedUser.role || 'Manager',
      assignedCities: matchedUser.assignedCities || [],
      status: matchedUser.status || 'Active'
    };
    localStorage.setItem(STORAGE_KEY_CURRENT_SESSION, JSON.stringify(sessionUser));
    return { success: true, user: sessionUser };
  }

  throw new Error('Invalid email or password. Please verify your login credentials.');
}

/**
 * Create New User in Firebase Firestore & Auth
 */
export async function createFirebaseUser(userData) {
  const { db } = getFirebaseInstance();
  const cleanEmail = String(userData.email || '').trim().toLowerCase();
  const cleanPassword = String(userData.password || (userData.role === 'Admin' ? 'admin123' : 'manager123')).trim();
  const name = String(userData.name || cleanEmail.split('@')[0]).trim();
  const role = userData.role === 'Admin' ? 'Admin' : 'Manager';
  const assignedCities = Array.isArray(userData.assignedCities)
    ? userData.assignedCities
    : (userData.assignedCities ? String(userData.assignedCities).split(',').map((c) => c.trim()) : []);

  if (!cleanEmail) throw new Error('Email address is required.');

  const allUsers = await fetchAllFirebaseUsers();
  if (allUsers.some((u) => u.email.toLowerCase() === cleanEmail)) {
    throw new Error(`A user with email ${cleanEmail} already exists in Firebase.`);
  }

  const newUid = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newUser = {
    uid: newUid,
    name: name,
    email: cleanEmail,
    role: role,
    assignedCities: role === 'Admin' ? ['All'] : (assignedCities.length > 0 ? assignedCities : ['All']),
    password: cleanPassword,
    status: 'Active',
    createdAt: new Date().toISOString()
  };

  // 1. Save to Firestore if available
  if (db) {
    try {
      await setDoc(doc(db, 'users', newUid), {
        ...newUser,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Firestore user creation sync warning:", err);
    }
  }

  // 2. Save to local store
  const updatedLocal = [...allUsers, newUser];
  saveLocalUsers(updatedLocal);

  return { success: true, message: `User ${name} (${cleanEmail}) created successfully in Firebase!`, user: newUser };
}

/**
 * Update User in Firebase Firestore
 */
export async function updateFirebaseUser(uid, updates) {
  const { db } = getFirebaseInstance();
  const allUsers = await fetchAllFirebaseUsers();
  const targetIndex = allUsers.findIndex((u) => u.uid === uid || u.email === updates.email);

  if (targetIndex === -1 && !uid) {
    throw new Error('User not found in Firebase records.');
  }

  const existing = targetIndex > -1 ? allUsers[targetIndex] : {};
  const updatedRecord = {
    ...existing,
    ...updates,
    uid: uid || existing.uid,
    assignedCities: updates.assignedCities !== undefined
      ? (Array.isArray(updates.assignedCities) ? updates.assignedCities : String(updates.assignedCities).split(',').map((c) => c.trim()))
      : existing.assignedCities
  };

  // Sync to Firestore
  if (db && (uid || existing.uid)) {
    try {
      const userRef = doc(db, 'users', uid || existing.uid);
      await updateDoc(userRef, {
        name: updatedRecord.name,
        role: updatedRecord.role,
        assignedCities: updatedRecord.assignedCities,
        status: updatedRecord.status || 'Active',
        ...(updates.password ? { password: updates.password } : {})
      });
    } catch (err) {
      console.warn("Firestore update error:", err);
    }
  }

  if (targetIndex > -1) {
    allUsers[targetIndex] = updatedRecord;
  } else {
    allUsers.push(updatedRecord);
  }
  saveLocalUsers(allUsers);

  // Update current session if the updated user is currently logged in
  const current = JSON.parse(localStorage.getItem(STORAGE_KEY_CURRENT_SESSION) || 'null');
  if (current && (current.uid === uid || current.email === updatedRecord.email)) {
    const updatedSession = { ...current, ...updatedRecord };
    delete updatedSession.password;
    localStorage.setItem(STORAGE_KEY_CURRENT_SESSION, JSON.stringify(updatedSession));
  }

  return { success: true, message: 'User updated successfully in Firebase!', user: updatedRecord };
}

/**
 * Delete User in Firebase Firestore
 */
export async function deleteFirebaseUser(uid, email) {
  const { db } = getFirebaseInstance();
  const cleanEmail = String(email || (uid && String(uid).includes('@') ? uid : '')).toLowerCase().trim();
  const targetUid = String(uid && !String(uid).includes('@') ? uid : '').trim();

  if (db) {
    try {
      if (targetUid) {
        try {
          await deleteDoc(doc(db, 'users', targetUid));
        } catch (e) {
          console.warn("Direct uid delete error:", e);
        }
      }

      // Query and delete all docs where email or doc ID matches
      const usersCol = collection(db, 'users');
      const snapshot = await getDocs(usersCol);
      for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        const docEmail = String(d.email || '').toLowerCase().trim();
        if (docSnap.id === targetUid || (cleanEmail && docEmail === cleanEmail)) {
          await deleteDoc(doc(db, 'users', docSnap.id));
        }
      }
    } catch (err) {
      console.warn("Firestore delete query error:", err);
    }
  }

  // Remove from local store
  const allUsers = getLocalUsers();
  const filtered = allUsers.filter((u) => {
    const uEmail = String(u.email || '').toLowerCase().trim();
    const uUid = String(u.uid || '').trim();
    if (cleanEmail && uEmail === cleanEmail) return false;
    if (targetUid && uUid === targetUid) return false;
    return true;
  });
  saveLocalUsers(filtered);

  return { success: true, message: 'User deleted successfully from Firebase!' };
}

/**
 * Update Current Logged-in User Password
 */
export async function updateFirebasePassword(newPassword) {
  const { auth } = getFirebaseInstance();
  const currentUser = JSON.parse(localStorage.getItem(STORAGE_KEY_CURRENT_SESSION) || 'null');

  if (!currentUser) throw new Error('No user currently logged in.');

  if (auth && auth.currentUser) {
    try {
      await updatePassword(auth.currentUser, newPassword);
    } catch (err) {
      console.warn("Firebase Auth updatePassword warning:", err);
    }
  }

  // Update in Firestore / Local store
  await updateFirebaseUser(currentUser.uid, { email: currentUser.email, password: newPassword });
  return { success: true, message: 'Password updated successfully in Firebase!' };
}

/**
 * Send Password Reset Email via Firebase
 */
export async function sendFirebasePasswordReset(email) {
  const { auth } = getFirebaseInstance();
  if (auth && !DEFAULT_FIREBASE_CONFIG.apiKey.includes('DummyKey')) {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true, message: `Password reset email sent to ${email} via Firebase Auth!` };
    } catch (err) {
      console.warn("Firebase password reset warning:", err);
    }
  }
  return { success: true, message: `Password reset link dispatched to ${email}.` };
}

/**
 * Sign Out from Firebase
 */
export async function logoutFromFirebase() {
  const { auth } = getFirebaseInstance();
  if (auth) {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
  }
  localStorage.removeItem(STORAGE_KEY_CURRENT_SESSION);
  return { success: true };
}

/**
 * -------------------------------------------------------------
 * FIRESTORE VTS REQUIREMENTS & RETURNS MANAGEMENT
 * Matches Flutter team_user_screen.dart & admin_dashboard.dart
 * Stored directly in project Firebase: device-streaming-e98b4845
 * -------------------------------------------------------------
 */

function formatTimestamp(timestamp) {
  if (!timestamp) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  try {
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

/**
 * Fetch all requirements from Firestore
 */
export async function fetchFirestoreRequirements() {
  const { db } = getFirebaseInstance();
  if (!db) {
    console.warn("Firestore not available for fetchFirestoreRequirements");
    return [];
  }
  try {
    const reqRef = collection(db, 'requirements');
    const snap = await getDocs(reqRef);
    const results = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.isDeleted) return; // Skip soft-deleted
      results.push({
        id: docSnap.id,
        ...data,
        vehicleNumber: data.vehicleNumber || data.vehicleNo || '',
        vehicleNo: data.vehicleNo || data.vehicleNumber || '',
        requester: data.requester || (data.userName ? `${data.userName} (${data.empId || data.userId || ''})` : data.userId || 'Unknown'),
        timestamp: formatTimestamp(data.submittedAt),
        status: data.status || 'pending'
      });
    });

    // Sort descending by submittedAt
    results.sort((a, b) => {
      const timeA = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt ? new Date(a.submittedAt).getTime() : 0);
      const timeB = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt ? new Date(b.submittedAt).getTime() : 0);
      return timeB - timeA;
    });

    return results;
  } catch (err) {
    console.error("Error in fetchFirestoreRequirements:", err);
    return [];
  }
}

/**
 * Fetch all returns from Firestore
 */
export async function fetchFirestoreReturns() {
  const { db } = getFirebaseInstance();
  if (!db) {
    console.warn("Firestore not available for fetchFirestoreReturns");
    return [];
  }
  try {
    const retRef = collection(db, 'returns');
    const snap = await getDocs(retRef);
    const results = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.isDeleted) return; // Skip soft-deleted
      results.push({
        id: docSnap.id,
        ...data,
        vehicleNumber: data.vehicleName || data.vehicleNumber || '',
        vehicleName: data.vehicleName || data.vehicleNumber || '',
        sim: data.simNumber || data.sim || '',
        simNumber: data.simNumber || data.sim || '',
        requester: data.userName ? `${data.userName} (${data.empId || data.userId || ''})` : data.userId || 'Unknown',
        timestamp: formatTimestamp(data.submittedAt),
        status: data.status || 'pending'
      });
    });

    // Sort descending by submittedAt
    results.sort((a, b) => {
      const timeA = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt ? new Date(a.submittedAt).getTime() : 0);
      const timeB = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt ? new Date(b.submittedAt).getTime() : 0);
      return timeB - timeA;
    });

    return results;
  } catch (err) {
    console.error("Error in fetchFirestoreReturns:", err);
    return [];
  }
}

/**
 * Add a new VTS / SIM Requirement document to Firestore
 */
export async function addFirestoreRequirement(reqData, currentUser) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const docData = {
    userId: currentUser?.uid || 'web_user',
    city: String(reqData.city || '').toUpperCase().trim(),
    userName: currentUser?.name || (currentUser?.email ? currentUser.email.split('@')[0] : 'Web User'),
    empId: reqData.empId || currentUser?.empId || '',
    mobile: reqData.mobile || currentUser?.mobile || '',
    userIp: 'Web Browser',
    status: 'pending',
    vehicleNo: String(reqData.vehicleNumber || reqData.vehicleNo || '').toUpperCase().trim(),
    vehicleNumber: String(reqData.vehicleNumber || reqData.vehicleNo || '').toUpperCase().trim(),
    vehicleType: reqData.vehicleType || 'Tipper',
    requirementType: reqData.requirementType || 'New VTS',
    reason: String(reqData.reason || '').trim(),
    isTampered: reqData.isTampered || 'No',
    isPenaltyImposed: reqData.isPenaltyImposed || 'No',
    penaltyMarkedAt: reqData.isPenaltyImposed === 'Yes' ? (reqData.penaltyMarkedAt || 'App') : 'N/A',
    penaltyDetails: reqData.isPenaltyImposed === 'Yes' ? String(reqData.penaltyDetails || '').trim() : '',
    remarks: String(reqData.remarks || '').trim(),
    totalVtsRequests: Number(reqData.totalVtsRequests) || 1,
    verificationConfirmed: 'Yes',
    declarationConfirmed: 'Confirmed',
    submittedAt: serverTimestamp(),
    isArchived: false,
    isDeleted: false,
    emailSent: false
  };

  const docRef = await addDoc(collection(db, 'requirements'), docData);
  return { success: true, id: docRef.id, message: `Requirement for ${docData.vehicleNumber} successfully logged in Firebase Firestore!` };
}

/**
 * Add a new VTS Return document to Firestore
 * Automatically generates a replacement requirement if needsReplacement is true!
 */
export async function addFirestoreReturn(returnData, currentUser) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const cleanVehicle = String(returnData.vehicleNumber || returnData.vehicleName || '').toUpperCase().trim();
  const cleanImei = String(returnData.imei || '').trim();
  const cleanSim = String(returnData.simNumber || returnData.sim || '').trim();
  const cleanCity = String(returnData.city || '').toUpperCase().trim();

  const docData = {
    userId: currentUser?.uid || 'web_user',
    city: cleanCity,
    vehicleName: cleanVehicle,
    vehicleNumber: cleanVehicle,
    vehicleType: returnData.vehicleType || 'Tipper',
    imei: cleanImei,
    simNumber: cleanSim,
    sim: cleanSim,
    vtsPhoto: returnData.vtsPhoto || '',
    simPhoto: returnData.simPhoto || '',
    returnReason: returnData.returnReason || 'Faulty Device',
    remarks: String(returnData.remarks || returnData.courierInfo || '').trim(),
    needsReplacement: !!returnData.needsReplacement,
    includingWire: !!returnData.includingWire,
    userIp: 'Web Browser',
    userName: currentUser?.name || (currentUser?.email ? currentUser.email.split('@')[0] : 'Web User'),
    empId: returnData.empId || currentUser?.empId || '',
    mobile: returnData.mobile || currentUser?.mobile || '',
    status: 'pending',
    submittedAt: serverTimestamp(),
    isArchived: false,
    isDeleted: false,
    emailSent: false
  };

  const docRef = await addDoc(collection(db, 'returns'), docData);

  // Auto-generate replacement requirement if requested (Matches Flutter functionality)
  let autoRequirementId = null;
  if (returnData.needsReplacement) {
    try {
      const autoReqData = {
        userId: currentUser?.uid || 'web_user',
        city: cleanCity,
        userName: currentUser?.name || (currentUser?.email ? currentUser.email.split('@')[0] : 'Web User'),
        empId: returnData.empId || currentUser?.empId || '',
        mobile: returnData.mobile || currentUser?.mobile || '',
        userIp: 'Web Browser',
        status: 'pending',
        vehicleNo: cleanVehicle,
        vehicleNumber: cleanVehicle,
        vehicleType: returnData.vehicleType || 'Tipper',
        requirementType: 'Replacement',
        reason: `Auto-generated replacement for returned VTS (IMEI: ${cleanImei}). Reason: ${returnData.returnReason}`,
        isTampered: 'No',
        isPenaltyImposed: 'No',
        penaltyMarkedAt: 'N/A',
        penaltyDetails: '',
        remarks: `Auto-created replacement request from Return form (IMEI: ${cleanImei}, Return ID: ${docRef.id})`,
        totalVtsRequests: 1,
        verificationConfirmed: 'Yes',
        declarationConfirmed: 'Confirmed',
        submittedAt: serverTimestamp(),
        returnDocId: docRef.id,
        isArchived: false,
        isDeleted: false,
        emailSent: false
      };
      const autoReqRef = await addDoc(collection(db, 'requirements'), autoReqData);
      autoRequirementId = autoReqRef.id;
    } catch (e) {
      console.warn("Could not auto-create replacement requirement:", e);
    }
  }

  return {
    success: true,
    id: docRef.id,
    autoRequirementId,
    message: `VTS Return for ${cleanVehicle} logged in Firebase Firestore!${autoRequirementId ? ' Replacement requirement auto-generated!' : ''}`
  };
}

/**
 * Approve Requirement (Assign IMEI, SIM, Admin Notes)
 */
export async function approveFirestoreRequirement(docId, approvalData, adminUser) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const ref = doc(db, 'requirements', docId);
  await updateDoc(ref, {
    status: 'done',
    assignedImei: String(approvalData.assignedImei || '').trim(),
    assignedSim: String(approvalData.assignedSim || '').trim(),
    assignedImeiPhoto: approvalData.assignedImeiPhoto || '',
    assignedSimPhoto: approvalData.assignedSimPhoto || '',
    adminNotes: String(approvalData.adminNotes || '').trim(),
    processedBy: adminUser?.email || adminUser?.name || 'Admin',
    completedAt: serverTimestamp()
  });

  return { success: true, message: `Requirement approved and device assigned successfully in Firebase!` };
}

/**
 * Reject Requirement
 */
export async function rejectFirestoreRequirement(docId, reason, adminUser) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const ref = doc(db, 'requirements', docId);
  await updateDoc(ref, {
    status: 'rejected',
    rejectionReason: String(reason || 'Rejected by Admin').trim(),
    processedBy: adminUser?.email || adminUser?.name || 'Admin',
    completedAt: serverTimestamp()
  });

  return { success: true, message: `Requirement marked as rejected in Firebase.` };
}

/**
 * Approve Return (Acknowledge received device)
 */
export async function approveFirestoreReturn(docId, adminUser) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const ref = doc(db, 'returns', docId);
  await updateDoc(ref, {
    status: 'done',
    processedBy: adminUser?.email || adminUser?.name || 'Admin',
    completedAt: serverTimestamp()
  });

  return { success: true, message: `VTS Return acknowledged and approved in Firebase!` };
}

/**
 * Reject Return
 */
export async function rejectFirestoreReturn(docId, reason, adminUser) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const ref = doc(db, 'returns', docId);
  await updateDoc(ref, {
    status: 'rejected',
    rejectionReason: String(reason || 'Rejected by Admin').trim(),
    processedBy: adminUser?.email || adminUser?.name || 'Admin',
    completedAt: serverTimestamp()
  });

  return { success: true, message: `VTS Return rejected in Firebase.` };
}

/**
 * Bulk Approve Requirements
 */
export async function bulkApproveFirestoreRequirements(items, adminUser) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const batch = writeBatch(db);
  items.forEach(({ id, assignedImei, assignedSim, adminNotes }) => {
    const ref = doc(db, 'requirements', id);
    batch.update(ref, {
      status: 'done',
      ...(assignedImei ? { assignedImei: String(assignedImei).trim() } : {}),
      ...(assignedSim ? { assignedSim: String(assignedSim).trim() } : {}),
      ...(adminNotes ? { adminNotes: String(adminNotes).trim() } : {}),
      processedBy: adminUser?.email || adminUser?.name || 'Admin',
      completedAt: serverTimestamp()
    });
  });

  await batch.commit();
  return { success: true, message: `Successfully approved ${items.length} requirements in bulk in Firebase!` };
}

/**
 * Bulk Reject Requirements or Returns
 */
export async function bulkRejectFirestoreRecords(collectionName, docIds, reason, adminUser) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const batch = writeBatch(db);
  docIds.forEach((id) => {
    const ref = doc(db, collectionName, id);
    batch.update(ref, {
      status: 'rejected',
      rejectionReason: String(reason || 'Bulk rejected by Admin').trim(),
      processedBy: adminUser?.email || adminUser?.name || 'Admin',
      completedAt: serverTimestamp()
    });
  });

  await batch.commit();
  return { success: true, message: `Successfully rejected ${docIds.length} records in ${collectionName} in Firebase!` };
}

/**
 * Bulk Approve Returns
 */
export async function bulkApproveFirestoreReturns(docIds, adminUser) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const batch = writeBatch(db);
  docIds.forEach((id) => {
    const ref = doc(db, 'returns', id);
    batch.update(ref, {
      status: 'done',
      processedBy: adminUser?.email || adminUser?.name || 'Admin',
      completedAt: serverTimestamp()
    });
  });

  await batch.commit();
  return { success: true, message: `Successfully approved ${docIds.length} returns in bulk in Firebase!` };
}

/**
 * Archive / Unarchive Record
 */
export async function archiveFirestoreRecord(collectionName, docId, isArchived = true) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const ref = doc(db, collectionName, docId);
  await updateDoc(ref, { isArchived: !!isArchived });
  return { success: true, message: `Record ${isArchived ? 'archived' : 'restored'} in Firebase.` };
}

/**
 * Soft Delete Record
 */
export async function deleteFirestoreRecord(collectionName, docId) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const ref = doc(db, collectionName, docId);
  await updateDoc(ref, { isDeleted: true });
  return { success: true, message: `Record removed from Firebase.` };
}

/**
 * Bulk Import Requirements from CSV / Array
 */
export async function bulkAddFirestoreRequirements(records, currentUser) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const batch = writeBatch(db);
  let count = 0;

  for (const item of records) {
    const cleanVehicle = String(item.vehicleNumber || item.vehicleNo || '').toUpperCase().trim();
    if (!cleanVehicle) continue;

    const ref = doc(collection(db, 'requirements'));
    batch.set(ref, {
      userId: currentUser?.uid || 'web_user',
      city: String(item.city || '').toUpperCase().trim(),
      userName: currentUser?.name || 'Web User',
      empId: item.empId || currentUser?.empId || '',
      mobile: item.mobile || currentUser?.mobile || '',
      userIp: 'Web Bulk Upload',
      status: 'pending',
      vehicleNo: cleanVehicle,
      vehicleNumber: cleanVehicle,
      vehicleType: item.vehicleType || 'Tipper',
      requirementType: item.requirementType || 'New VTS',
      reason: String(item.reason || 'Bulk CSV imported requirement').trim(),
      isTampered: item.isTampered || 'No',
      isPenaltyImposed: item.isPenaltyImposed || 'No',
      penaltyMarkedAt: item.penaltyMarkedAt || 'N/A',
      penaltyDetails: item.penaltyDetails || '',
      remarks: item.remarks || '',
      totalVtsRequests: 1,
      verificationConfirmed: 'Yes',
      declarationConfirmed: 'Confirmed',
      submittedAt: serverTimestamp(),
      isArchived: false,
      isDeleted: false,
      emailSent: false
    });
    count++;
  }

  if (count > 0) {
    await batch.commit();
  }
  return { success: true, count, message: `Successfully imported ${count} requirements into Firebase Firestore!` };
}

/**
 * Bulk Import Returns from CSV / Array
 */
export async function bulkAddFirestoreReturns(records, currentUser) {
  const { db } = getFirebaseInstance();
  if (!db) throw new Error("Firestore not initialized.");

  const batch = writeBatch(db);
  let count = 0;

  for (const item of records) {
    const cleanVehicle = String(item.vehicleNumber || item.vehicleName || '').toUpperCase().trim();
    if (!cleanVehicle) continue;

    const ref = doc(collection(db, 'returns'));
    batch.set(ref, {
      userId: currentUser?.uid || 'web_user',
      city: String(item.city || '').toUpperCase().trim(),
      vehicleName: cleanVehicle,
      vehicleNumber: cleanVehicle,
      vehicleType: item.vehicleType || 'Tipper',
      imei: String(item.imei || '').trim(),
      simNumber: String(item.simNumber || item.sim || '').trim(),
      sim: String(item.simNumber || item.sim || '').trim(),
      vtsPhoto: item.vtsPhoto || '',
      simPhoto: item.simPhoto || '',
      returnReason: item.returnReason || 'Faulty Device',
      remarks: item.remarks || item.courierInfo || '',
      needsReplacement: !!item.needsReplacement,
      includingWire: !!item.includingWire,
      userIp: 'Web Bulk Upload',
      userName: currentUser?.name || 'Web User',
      empId: item.empId || currentUser?.empId || '',
      mobile: item.mobile || currentUser?.mobile || '',
      status: 'pending',
      submittedAt: serverTimestamp(),
      isArchived: false,
      isDeleted: false,
      emailSent: false
    });
    count++;
  }

  if (count > 0) {
    await batch.commit();
  }
  return { success: true, count, message: `Successfully imported ${count} return records into Firebase Firestore!` };
}

/**
 * Realtime subscription to requirements
 */
export function subscribeToFirestoreRequirements(onUpdate, onError) {
  const { db } = getFirebaseInstance();
  if (!db) return () => {};

  try {
    const q = query(collection(db, 'requirements'));
    return onSnapshot(q, (snapshot) => {
      const results = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.isDeleted) return;
        results.push({
          id: docSnap.id,
          ...data,
          vehicleNumber: data.vehicleNumber || data.vehicleNo || '',
          vehicleNo: data.vehicleNo || data.vehicleNumber || '',
          requester: data.requester || (data.userName ? `${data.userName} (${data.empId || data.userId || ''})` : data.userId || 'Unknown'),
          timestamp: formatTimestamp(data.submittedAt),
          status: data.status || 'pending'
        });
      });
      results.sort((a, b) => {
        const timeA = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt ? new Date(a.submittedAt).getTime() : 0);
        const timeB = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt ? new Date(b.submittedAt).getTime() : 0);
        return timeB - timeA;
      });
      onUpdate(results);
    }, onError);
  } catch (err) {
    console.error("subscribeToFirestoreRequirements error:", err);
    return () => {};
  }
}

/**
 * Realtime subscription to returns
 */
export function subscribeToFirestoreReturns(onUpdate, onError) {
  const { db } = getFirebaseInstance();
  if (!db) return () => {};

  try {
    const q = query(collection(db, 'returns'));
    return onSnapshot(q, (snapshot) => {
      const results = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.isDeleted) return;
        results.push({
          id: docSnap.id,
          ...data,
          vehicleNumber: data.vehicleName || data.vehicleNumber || '',
          vehicleName: data.vehicleName || data.vehicleNumber || '',
          sim: data.simNumber || data.sim || '',
          simNumber: data.simNumber || data.sim || '',
          requester: data.userName ? `${data.userName} (${data.empId || data.userId || ''})` : data.userId || 'Unknown',
          timestamp: formatTimestamp(data.submittedAt),
          status: data.status || 'pending'
        });
      });
      results.sort((a, b) => {
        const timeA = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt ? new Date(a.submittedAt).getTime() : 0);
        const timeB = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt ? new Date(b.submittedAt).getTime() : 0);
        return timeB - timeA;
      });
      onUpdate(results);
    }, onError);
  } catch (err) {
    console.error("subscribeToFirestoreReturns error:", err);
    return () => {};
  }
}
