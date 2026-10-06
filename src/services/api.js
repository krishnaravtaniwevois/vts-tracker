import { initialDevices, initialRequests, initialReturns } from '../mockData';
import { calculateDaysRemaining, formatDisplayDate, getRechargeStatus } from '../utils/dateUtils';
import { safeSetItem, safeGetItem, safeGetJson, safeRemoveItem } from '../utils/storage';
import {
  fetchAllFirebaseUsers,
  syncAllUsersToFirestore,
  loginWithFirebase,
  createFirebaseUser,
  updateFirebaseUser,
  deleteFirebaseUser,
  updateFirebasePassword,
  sendFirebasePasswordReset,
  logoutFromFirebase,
  fetchFirestoreRequirements,
  fetchFirestoreReturns,
  addFirestoreRequirement,
  addFirestoreReturn,
  approveFirestoreRequirement,
  rejectFirestoreRequirement,
  approveFirestoreReturn,
  rejectFirestoreReturn,
  bulkApproveFirestoreRequirements,
  bulkRejectFirestoreRecords,
  bulkApproveFirestoreReturns,
  archiveFirestoreRecord,
  deleteFirestoreRecord,
  bulkAddFirestoreRequirements,
  bulkAddFirestoreReturns,
  subscribeToFirestoreRequirements,
  subscribeToFirestoreReturns,
  RAJASTHAN_CITIES,
  VEHICLE_TYPES,
  REQUIREMENT_TYPES,
  RETURN_REASONS
} from './firebase';

export {
  fetchFirestoreRequirements,
  fetchFirestoreReturns,
  addFirestoreRequirement,
  addFirestoreReturn,
  approveFirestoreRequirement,
  rejectFirestoreRequirement,
  approveFirestoreReturn,
  rejectFirestoreReturn,
  bulkApproveFirestoreRequirements,
  bulkRejectFirestoreRecords,
  bulkApproveFirestoreReturns,
  archiveFirestoreRecord,
  deleteFirestoreRecord,
  bulkAddFirestoreRequirements,
  bulkAddFirestoreReturns,
  subscribeToFirestoreRequirements,
  subscribeToFirestoreReturns,
  RAJASTHAN_CITIES,
  VEHICLE_TYPES,
  REQUIREMENT_TYPES,
  RETURN_REASONS
};

const STORAGE_KEY_API_URL = 'vts_tracker_apps_script_url';
const STORAGE_KEY_DEVICES = 'vts_tracker_cached_devices';
const STORAGE_KEY_REQUESTS = 'vts_tracker_cached_requests';
const STORAGE_KEY_RETURNS = 'vts_tracker_cached_returns';
const STORAGE_KEY_RENEWAL_LOGS = 'vts_tracker_renewal_logs';
const STORAGE_KEY_RENEWAL_ARCHIVES = 'vts_tracker_renewal_archives';
const STORAGE_KEY_CURRENT_USER = 'vts_tracker_current_user';
const STORAGE_KEY_DATA_FILL = 'vts_tracker_data_fill';
const STORAGE_KEY_CAMERA_FILL = 'vts_tracker_camera_fill';

export const DEFAULT_API_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APPS_SCRIPT_URL) || '';

export function getStoredApiUrl() {
  return localStorage.getItem(STORAGE_KEY_API_URL) || DEFAULT_API_URL || '';
}

export function saveApiUrl(url) {
  const cleanUrl = url.trim();
  if (cleanUrl) {
    localStorage.setItem(STORAGE_KEY_API_URL, cleanUrl);
  } else {
    localStorage.removeItem(STORAGE_KEY_API_URL);
  }
}

export function clearFleetCache() {
  safeRemoveItem(STORAGE_KEY_DEVICES);
  safeRemoveItem(STORAGE_KEY_REQUESTS);
  safeRemoveItem(STORAGE_KEY_RETURNS);
  safeRemoveItem(STORAGE_KEY_RENEWAL_LOGS);
  safeRemoveItem(STORAGE_KEY_RENEWAL_ARCHIVES);
}

/**
 * Auth & Current User Session
 */
export function getCurrentUser() {
  const saved = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return null;
}

export function setCurrentUser(user) {
  if (!user) {
    localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
  } else {
    localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(user));
  }
}

export async function fetchAllFleetData() {
  const apiUrl = getStoredApiUrl();
  const currentUser = getCurrentUser();
  const firebaseUsers = await fetchAllFirebaseUsers();

  // Primary source of truth for VTS Requirements and Returns: Live Firebase Firestore
  let firestoreRequirements = [];
  let firestoreReturns = [];
  try {
    [firestoreRequirements, firestoreReturns] = await Promise.all([
      fetchFirestoreRequirements(),
      fetchFirestoreReturns()
    ]);
  } catch (err) {
    console.warn("Firestore fetchRequirements/fetchReturns error:", err);
  }

  if (!apiUrl) {
    const localDevices = localStorage.getItem(STORAGE_KEY_DEVICES);
    const localRequests = localStorage.getItem(STORAGE_KEY_REQUESTS);
    const localReturns = localStorage.getItem(STORAGE_KEY_RETURNS);
    const localLogs = localStorage.getItem(STORAGE_KEY_RENEWAL_LOGS);
    const localArchives = localStorage.getItem(STORAGE_KEY_RENEWAL_ARCHIVES);

    let devices = localDevices ? JSON.parse(localDevices) : initialDevices;

    const calculatedDevices = devices.map((d) => {
      const remainingDays = calculateDaysRemaining(d.licenseEnd);
      const computedRechargeStatus = getRechargeStatus(remainingDays);
      const override = d.statusOverride || d.override || '';

      return {
        ...d,
        licenseEnd: formatDisplayDate(d.licenseEnd),
        remainingDays,
        rechargeStatus: computedRechargeStatus,
        status: computedRechargeStatus,
        statusOverride: override,
        displayStatus: override || d.finalStatus || (String(d.roadcastStatus || '').toLowerCase() === 'inactive' ? 'Inactive' : '—'),
        renewalDecision: d.renewalDecision || 'Pending',
        renewalRemark: d.renewalRemark || '',
        inactiveRunningRemark: d.inactiveRunningRemark || ''
      };
    });

    return {
      isMock: true,
      devices: calculatedDevices,
      requests: firestoreRequirements.length > 0 ? firestoreRequirements : (localRequests ? JSON.parse(localRequests) : initialRequests),
      returnRequests: firestoreReturns.length > 0 ? firestoreReturns : (localReturns ? JSON.parse(localReturns) : initialReturns),
      renewalLogs: localLogs ? JSON.parse(localLogs) : [],
      renewalArchives: localArchives ? JSON.parse(localArchives) : [
        { id: 'arc-1', name: 'Renewal List - 26 Aug 2026', url: '#', createdDate: '26 Aug 2026', size: '18 KB' },
        { id: 'arc-2', name: 'Renewal List - 01 Aug 2026', url: '#', createdDate: '01 Aug 2026', size: '24 KB' }
      ],
      users: firebaseUsers,
      currentUser: currentUser,
      damageRecords: []
    };
  }

  try {
    const userEmail = currentUser?.email || '';
    const fetchUrl = apiUrl.includes('?')
      ? `${apiUrl}&action=getAllData&userEmail=${encodeURIComponent(userEmail)}`
      : `${apiUrl}?action=getAllData&userEmail=${encodeURIComponent(userEmail)}`;
    const response = await fetch(fetchUrl, {
      method: 'GET',
      redirect: 'follow'
    });

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        throw new Error("Apps Script returned a Google login page. Please edit your deployment in Apps Script and set 'Who has access' to 'Anyone'.");
      }
      throw new Error("Invalid response from Apps Script: " + text.slice(0, 100));
    }

    if (json.success && json.data) {
      const {
        devices = [],
        requests = [],
        returnRequests = [],
        renewalLogs = [],
        renewalArchives = []
      } = json.data;

      const enrichedDevices = devices.map((d) => {
        const rawLicenseEnd = d.licenseEnd || d['License End'] || d.license_end || d.expiry || '';
        const remainingDays = d.remainingDays !== undefined ? d.remainingDays : calculateDaysRemaining(rawLicenseEnd);
        const computedRechargeStatus = getRechargeStatus(remainingDays);
        const override = d.statusOverride || d.override || '';

        return {
          ...d,
          licenseEnd: rawLicenseEnd ? formatDisplayDate(rawLicenseEnd) : '',
          remainingDays,
          rechargeStatus: computedRechargeStatus,
          status: computedRechargeStatus,
          statusOverride: override,
          displayStatus: override || d.finalStatus || (String(d.roadcastStatus || '').toLowerCase() === 'inactive' ? 'Inactive' : '—'),
          renewalDecision: d.renewalDecision || d.decision || 'Pending',
          renewalRemark: d.renewalRemark || d.remark || '',
          inactiveRunningRemark: d.inactiveRunningRemark || ''
        };
      });

      safeSetItem(STORAGE_KEY_DEVICES, enrichedDevices);
      safeSetItem(STORAGE_KEY_REQUESTS, requests);
      safeSetItem(STORAGE_KEY_RETURNS, returnRequests);
      safeSetItem(STORAGE_KEY_RENEWAL_LOGS, renewalLogs);
      safeSetItem(STORAGE_KEY_RENEWAL_ARCHIVES, renewalArchives);

      const finalRequests = firestoreRequirements.length > 0 ? firestoreRequirements : requests;
      const finalReturns = firestoreReturns.length > 0 ? firestoreReturns : returnRequests;

      safeSetItem(STORAGE_KEY_DEVICES, enrichedDevices);
      safeSetItem(STORAGE_KEY_REQUESTS, finalRequests);
      safeSetItem(STORAGE_KEY_RETURNS, finalReturns);
      safeSetItem(STORAGE_KEY_RENEWAL_LOGS, renewalLogs);
      safeSetItem(STORAGE_KEY_RENEWAL_ARCHIVES, renewalArchives);

      return {
        isMock: false,
        devices: enrichedDevices,
        requests: finalRequests,
        returnRequests: finalReturns,
        renewalLogs,
        renewalArchives,
        users: firebaseUsers,
        currentUser,
        timestamp: json.timestamp
      };
    } else {
      throw new Error(json.error || 'Failed to fetch data from Google Apps Script. Check Sheet IDs or permissions.');
    }
  } catch (error) {
    console.warn('Backend fetch failed, falling back to local cache:', error);
    const localDevices = localStorage.getItem(STORAGE_KEY_DEVICES);
    const localRequests = localStorage.getItem(STORAGE_KEY_REQUESTS);
    const localReturns = localStorage.getItem(STORAGE_KEY_RETURNS);
    const localLogs = localStorage.getItem(STORAGE_KEY_RENEWAL_LOGS);
    const localArchives = localStorage.getItem(STORAGE_KEY_RENEWAL_ARCHIVES);
    return {
      isMock: true,
      isOffline: true,
      error: error.message,
      devices: localDevices ? JSON.parse(localDevices) : initialDevices,
      requests: firestoreRequirements.length > 0 ? firestoreRequirements : (localRequests ? JSON.parse(localRequests) : initialRequests),
      returnRequests: firestoreReturns.length > 0 ? firestoreReturns : (localReturns ? JSON.parse(localReturns) : initialReturns),
      renewalLogs: localLogs ? JSON.parse(localLogs) : [],
      renewalArchives: localArchives ? JSON.parse(localArchives) : [],
      users: firebaseUsers,
      currentUser,
      damageRecords: []
    };
  }
}

/**
 * 1. Add New VTS Device
 */
export async function addNewDevice(deviceData) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY_DEVICES) || JSON.stringify(initialDevices));
    const cleanImei = String(deviceData.uniqueid || '').trim();

    if (local.some((d) => String(d.imei || '').trim() === cleanImei)) {
      return {
        success: false,
        error: `A device with IMEI ${cleanImei} already exists in fleet.`
      };
    }

    const newSr = local.length > 0 ? Math.max(...local.map((d) => parseInt(d.sr, 10) || 0)) + 1 : 1;
    const newDevice = {
      sr: newSr,
      vehicle: deviceData.name,
      imei: cleanImei,
      sim: deviceData.phone || '',
      city: deviceData.city || 'Other',
      roadcastStatus: 'Active',
      lastUpdate: '',
      finalStatus: deviceData.finalStatus || '',
      vtsType: deviceData.vtsType || 'VTS Package 4G',
      remark: deviceData.remark || '',
      status: 'Active',
      licenseEnd: deviceData.licenseEnd || '',
      remainingDays: 365,
      rechargeStatus: 'Active',
      renewalDecision: 'Pending',
      renewalRemark: ''
    };

    local.push(newDevice);
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(local));
    return {
      success: true,
      message: `Device ${deviceData.name} (${cleanImei}) added locally (Demo mode).`,
      device: newDevice
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'addDevice',
      ...deviceData
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 2. Roadcast Status Batch Import
 */
export async function submitRoadcastImport(updates) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY_DEVICES) || JSON.stringify(initialDevices));
    const updateMap = {};
    updates.forEach((u) => {
      if (u.uniqueid) updateMap[String(u.uniqueid).trim()] = u;
    });

    let matched = 0;
    const updated = local.map((d) => {
      const imei = String(d.imei || '').trim();
      if (updateMap[imei]) {
        matched++;
        const match = updateMap[imei];
        return {
          ...d,
          vehicle: match.name || d.vehicle,
          sim: match.phone || d.sim,
          roadcastStatus: match.status || d.roadcastStatus,
          lastUpdate: match.lastUpdate || d.lastUpdate,
          licenseEnd: match.licenseEnd || d.licenseEnd
        };
      }
      return d;
    });

    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(updated));
    return {
      success: true,
      updatedCount: matched,
      message: `Updated ${matched} devices locally (Demo mode).`
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateRoadcastStatus',
      updates: updates
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 3. Update Complete Device Details (with userEmail permission check)
 */
export async function updateDeviceDetails(payload) {
  const apiUrl = getStoredApiUrl();
  const currentUser = getCurrentUser();

  if (!apiUrl) {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY_DEVICES) || JSON.stringify(initialDevices));
    const cleanId = String(payload.uniqueid || '').trim();
    const updated = local.map((d) => {
      if (String(d.imei || '').trim() === cleanId) {
        return {
          ...d,
          vehicle: payload.vehicle !== undefined ? payload.vehicle : d.vehicle,
          sim: payload.sim !== undefined ? payload.sim : d.sim,
          city: payload.city !== undefined ? payload.city : d.city,
          finalStatus: payload.finalStatus !== undefined ? payload.finalStatus : d.finalStatus,
          vtsType: payload.vtsType !== undefined ? payload.vtsType : d.vtsType,
          remark: payload.remark !== undefined ? payload.remark : d.remark,
          licenseEnd: payload.licenseEnd !== undefined ? payload.licenseEnd : d.licenseEnd
        };
      }
      return d;
    });
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(updated));

    // Also update any cached renewal sheets in localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('vts_sheet_cache_')) {
          const cached = JSON.parse(localStorage.getItem(key) || 'null');
          if (cached && Array.isArray(cached.sheetDevices)) {
            let changed = false;
            cached.sheetDevices = cached.sheetDevices.map((sd) => {
              if (String(sd.imei || sd.uniqueid || '').trim() === cleanId) {
                changed = true;
                return {
                  ...sd,
                  name: payload.vehicle !== undefined ? payload.vehicle : (sd.name || sd.vehicle),
                  vehicle: payload.vehicle !== undefined ? payload.vehicle : (sd.vehicle || sd.name),
                  city: payload.city !== undefined ? payload.city : sd.city,
                  phone: payload.sim !== undefined ? payload.sim : (sd.phone || sd.sim),
                  sim: payload.sim !== undefined ? payload.sim : (sd.sim || sd.phone)
                };
              }
              return sd;
            });
            if (changed) {
              localStorage.setItem(key, JSON.stringify(cached));
            }
          }
        }
      }
    } catch (e) {}

    return { success: true, message: 'Device details saved locally (Demo mode)' };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateDeviceDetails',
      userEmail: currentUser?.email || '',
      ...payload
    }),
    redirect: 'follow'
  });
  const res = await response.json();

  if (res && res.success) {
    // Update local cache across all views in 0ms
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('vts_sheet_cache_')) {
          const cached = JSON.parse(localStorage.getItem(key) || 'null');
          if (cached && Array.isArray(cached.sheetDevices)) {
            let changed = false;
            cached.sheetDevices = cached.sheetDevices.map((sd) => {
              if (String(sd.imei || sd.uniqueid || '').trim() === cleanId) {
                changed = true;
                return {
                  ...sd,
                  name: payload.vehicle !== undefined ? payload.vehicle : (sd.name || sd.vehicle),
                  vehicle: payload.vehicle !== undefined ? payload.vehicle : (sd.vehicle || sd.name),
                  city: payload.city !== undefined ? payload.city : sd.city,
                  phone: payload.sim !== undefined ? payload.sim : (sd.phone || sd.sim),
                  sim: payload.sim !== undefined ? payload.sim : (sd.sim || sd.phone)
                };
              }
              return sd;
            });
            if (changed) {
              localStorage.setItem(key, JSON.stringify(cached));
            }
          }
        }
      }
    } catch (e) {}
  }

  return res;
}

/**
 * 4. Update Remark (Col J with userEmail permission check)
 */
export async function updateDeviceRemark(uniqueid, remark) {
  const apiUrl = getStoredApiUrl();
  const currentUser = getCurrentUser();

  if (!apiUrl) {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY_DEVICES) || JSON.stringify(initialDevices));
    const cleanId = String(uniqueid || '').trim();
    const updated = local.map((d) => {
      if (String(d.imei || '').trim() === cleanId) {
        return { ...d, remark: remark };
      }
      return d;
    });
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(updated));
    return { success: true, message: 'Remark saved locally (Demo mode)' };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateRemark',
      uniqueid: uniqueid,
      remark: remark,
      userEmail: currentUser?.email || ''
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 5. Update License End Date (Col L)
 */
export async function updateDeviceLicenseEnd(uniqueid, licenseEnd) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY_DEVICES) || JSON.stringify(initialDevices));
    const cleanId = String(uniqueid || '').trim();
    const updated = local.map((d) => {
      if (String(d.imei || '').trim() === cleanId) {
        return { ...d, licenseEnd: licenseEnd };
      }
      return d;
    });
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(updated));
    return { success: true, message: 'License End date saved locally (Demo mode)' };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateLicenseEnd',
      uniqueid,
      licenseEnd
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 6. Update Renewal Decision & Remark (Col M & N + Renewal Log)
 */
export async function updateRenewalDecision(param1, param2, param3 = '') {
  let uniqueid = '';
  let decision = 'Pending';
  let remark = '';
  let activeTab = '';
  let newLicenseEnd = '';

  if (typeof param1 === 'object' && param1 !== null) {
    uniqueid = param1.uniqueid || param1.imei || '';
    decision = param1.decision !== undefined ? param1.decision : (param1.renewalDecision !== undefined ? param1.renewalDecision : 'Pending');
    remark = param1.remark !== undefined ? param1.remark : (param1.renewalRemark || '');
    activeTab = param1.activeTab || param1.tabName || '';
    newLicenseEnd = param1.newLicenseEnd || '';
  } else {
    uniqueid = param1 || '';
    decision = param2 !== undefined ? param2 : 'Pending';
    remark = param3 || '';
  }

  const cleanId = String(uniqueid || '').trim();
  const apiUrl = getStoredApiUrl();
  const currentUser = getCurrentUser();

  if (!apiUrl) {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY_DEVICES) || JSON.stringify(initialDevices));
    let targetDevice = null;

    const updated = local.map((d) => {
      if (String(d.imei || '').trim() === cleanId) {
        targetDevice = d;
        const curLic = d.displayLicenseEnd || d.licenseEnd || '';
        let finalNewLic = '';
        let statusDone = 'Pending';
        if (decision === 'No') {
          finalNewLic = '';
          statusDone = 'Not Done';
        } else if (decision === 'Yes') {
          const cand = newLicenseEnd || d.newLicenseEnd || '';
          if (cand && cand !== curLic) {
            finalNewLic = cand;
            statusDone = 'Done';
          } else {
            finalNewLic = '';
            statusDone = 'Not Done';
          }
        } else {
          finalNewLic = '';
          statusDone = 'Pending';
        }
        return {
          ...d,
          renewalDecision: decision,
          decision: decision,
          renewalRemark: remark || d.renewalRemark || '',
          newLicenseEnd: finalNewLic,
          statusDone: statusDone
        };
      }
      return d;
    });
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(updated));

    if (decision === 'No' && targetDevice) {
      const logs = JSON.parse(localStorage.getItem(STORAGE_KEY_RENEWAL_LOGS) || '[]');
      logs.unshift({
        id: 'LOG-' + (logs.length + 1),
        uniqueid: cleanId,
        vehicle: targetDevice.vehicle,
        oldLicenseEnd: targetDevice.licenseEnd,
        newLicenseEnd: targetDevice.licenseEnd,
        dateLogged: new Date().toLocaleDateString('en-GB'),
        monthLabel: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
        decision: 'No',
        remark: remark
      });
      localStorage.setItem(STORAGE_KEY_RENEWAL_LOGS, JSON.stringify(logs));
    }

    return { success: true, message: `Decision "${decision}" saved locally (Demo mode)` };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateRenewalDecision',
      uniqueid: cleanId,
      imei: cleanId,
      decision,
      remark,
      activeTab,
      newLicenseEnd,
      userEmail: currentUser?.email || ''
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 7. Mark Device as Renewed
 */
export async function markDeviceRenewed(payload) {
  const apiUrl = getStoredApiUrl();
  const cleanId = String(payload.uniqueid || payload.imei || '').trim();

  if (!apiUrl) {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY_DEVICES) || JSON.stringify(initialDevices));
    let oldDate = '';
    let deviceName = '';

    const updated = local.map((d) => {
      if (String(d.imei || '').trim() === cleanId) {
        oldDate = d.licenseEnd || '';
        deviceName = d.vehicle || '';
        return {
          ...d,
          licenseEnd: payload.newLicenseEnd,
          renewalDecision: 'Yes',
          renewalRemark: payload.remark || 'Renewed'
        };
      }
      return d;
    });
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(updated));

    const logs = JSON.parse(localStorage.getItem(STORAGE_KEY_RENEWAL_LOGS) || '[]');
    logs.unshift({
      id: 'LOG-' + (logs.length + 1),
      uniqueid: cleanId,
      vehicle: deviceName,
      oldLicenseEnd: oldDate,
      newLicenseEnd: payload.newLicenseEnd,
      dateLogged: new Date().toLocaleDateString('en-GB'),
      monthLabel: new Date(payload.newLicenseEnd).toLocaleString('default', { month: 'long', year: 'numeric' }),
      decision: 'Yes',
      remark: payload.remark || 'Renewed'
    });
    localStorage.setItem(STORAGE_KEY_RENEWAL_LOGS, JSON.stringify(logs));

    return {
      success: true,
      message: `Device ${deviceName} renewed till ${payload.newLicenseEnd} (Demo mode)!`
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'markDeviceRenewed',
      uniqueid: cleanId,
      imei: cleanId,
      ...payload
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 8. Archive Renewal List to Google Drive
 */
export async function archiveRenewalList(items = []) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    const archives = JSON.parse(localStorage.getItem(STORAGE_KEY_RENEWAL_ARCHIVES) || '[]');
    const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const newEntry = {
      id: 'arc-' + (archives.length + 1),
      name: `Renewal List - ${todayStr}`,
      url: '#',
      createdDate: todayStr,
      size: '22 KB'
    };
    archives.unshift(newEntry);
    localStorage.setItem(STORAGE_KEY_RENEWAL_ARCHIVES, JSON.stringify(archives));

    return {
      success: true,
      fileId: newEntry.id,
      fileName: newEntry.name,
      fileUrl: newEntry.url,
      createdDate: newEntry.createdDate,
      message: `Renewal List snapshot archived locally (Demo mode).`
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'archiveRenewalList',
      items
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 9. Get Archived Renewal Lists from Google Drive
 */
export async function getRenewalArchiveList() {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_RENEWAL_ARCHIVES) || '[]');
  }
  const fetchUrl = apiUrl.includes('?') ? `${apiUrl}&action=getRenewalArchiveList` : `${apiUrl}?action=getRenewalArchiveList`;
  const response = await fetch(fetchUrl, { method: 'GET', redirect: 'follow' });
  const json = await response.json();
  return json.data || [];
}

/**
 * 10. User Management (Firebase Auth & Firestore)
 */
export async function fetchUsers() {
  return await fetchAllFirebaseUsers();
}

export async function loginUser(email, password) {
  return await loginWithFirebase(email, password);
}

export async function saveUser(userData) {
  let result;
  if (userData.uid) {
    result = await updateFirebaseUser(userData.uid, userData);
  } else {
    // Check if user already exists
    const users = await fetchAllFirebaseUsers();
    const existing = users.find((u) => u.email.toLowerCase().trim() === userData.email.toLowerCase().trim());
    if (existing) {
      result = await updateFirebaseUser(existing.uid, userData);
    } else {
      result = await createFirebaseUser(userData);

      // Trigger Welcome Email to new user's email ID
      const apiUrl = getStoredApiUrl();
      if (apiUrl) {
        try {
          fetch(apiUrl, {
            method: 'POST',
            body: JSON.stringify({
              action: 'sendWelcomeEmail',
              ...userData
            }),
            redirect: 'follow'
          });
        } catch {
          // ignore
        }
      }
    }
  }

  // Also sync to Google Sheets if configured (optional backup)
  const apiUrl = getStoredApiUrl();
  if (apiUrl) {
    try {
      fetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify({
          action: 'saveUser',
          ...userData
        }),
        redirect: 'follow'
      });
    } catch {
      // ignore
    }
  }

  return result;
}

export async function deleteUser(email, uid) {
  const result = await deleteFirebaseUser(uid, email);

  // Sync delete to Google Sheets if configured
  const apiUrl = getStoredApiUrl();
  if (apiUrl) {
    try {
      fetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify({
          action: 'deleteUser',
          email
        }),
        redirect: 'follow'
      });
    } catch {
      // ignore
    }
  }

  return result;
}

export async function updateProfilePassword(newPassword) {
  return await updateFirebasePassword(newPassword);
}

export async function sendPasswordResetLink(email) {
  return await sendFirebasePasswordReset(email);
}

export async function syncUsersToFirebase(usersList) {
  return await syncAllUsersToFirestore(usersList);
}

export async function logoutUser() {
  return await logoutFromFirebase();
}

/**
 * 11. Send Renewal Reminders (MailApp)
 */
export async function sendRenewalReminders(options = {}) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    return {
      success: true,
      emailCount: 2,
      managers: ['Ramesh Sharma (ajmer.manager@wevois.com)', 'Vikram Singh (jaipur.manager@wevois.com)'],
      message: 'Simulated email reminders sent to 2 manager(s) (Demo mode).'
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'sendRenewalReminders',
      appUrl: window.location.origin,
      ...options
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 12. Submit Damage Report
 */
export async function submitDamage(payload) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    return { success: true, message: 'Damage reported locally (Demo mode)' };
  }
  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'reportDamage',
      ...payload
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 13. Submit Quick Recharge
 */
export async function submitRecharge(payload) {
  return markDeviceRenewed(payload);
}

/**
 * 14. Submit New VTS / SIM Requirement Request
 * Stores directly in Firebase Firestore 'requirements'
 */
export async function submitRequirementRequest(payload) {
  const currentUser = getCurrentUser();
  let firestoreResult = null;
  try {
    firestoreResult = await addFirestoreRequirement(payload, currentUser);
  } catch (fbErr) {
    console.warn("Firestore requirement save attempt:", fbErr);
  }

  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_REQUESTS) || JSON.stringify(initialRequests));
    const newEntry = {
      sr: list.length + 1,
      id: firestoreResult?.id || `req_${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      requester: payload.requester || currentUser?.email || 'User',
      city: payload.city || '',
      vehicleNumber: payload.vehicleNumber || '',
      vehicleType: payload.vehicleType || 'Tipper',
      requirementType: payload.requirementType || 'New VTS',
      reason: payload.reason || '',
      isTampered: payload.isTampered || 'No',
      isPenaltyImposed: payload.isPenaltyImposed || 'No',
      penaltyMarkedAt: payload.penaltyMarkedAt || 'N/A',
      penaltyDetails: payload.penaltyDetails || '',
      remarks: payload.remarks || '',
      status: 'pending'
    };
    list.unshift(newEntry);
    localStorage.setItem(STORAGE_KEY_REQUESTS, JSON.stringify(list));
    return {
      success: true,
      id: firestoreResult?.id,
      message: firestoreResult?.message || 'New requirement request submitted successfully and saved in Firebase!'
    };
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'submitRequirementRequest',
        ...payload
      }),
      redirect: 'follow'
    });
    const json = await response.json();
    return { ...json, id: firestoreResult?.id || json.id };
  } catch (err) {
    if (firestoreResult?.success) {
      return { success: true, id: firestoreResult.id, message: 'Saved to Firebase Firestore (Sheet sync offline)' };
    }
    throw err;
  }
}

/**
 * 15. Submit VTS Return Form
 * Stores directly in Firebase Firestore 'returns'
 * (Auto-generates replacement in 'requirements' if needsReplacement is true)
 */
export async function submitReturnRequest(payload) {
  const currentUser = getCurrentUser();
  let firestoreResult = null;
  try {
    firestoreResult = await addFirestoreReturn(payload, currentUser);
  } catch (fbErr) {
    console.warn("Firestore return save attempt:", fbErr);
  }

  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_RETURNS) || JSON.stringify(initialReturns));
    const newEntry = {
      sr: list.length + 1,
      id: firestoreResult?.id || `ret_${Date.now()}`,
      timestamp: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      vehicleNumber: payload.vehicleNumber || '',
      imei: payload.imei || '',
      sim: payload.simNumber || payload.sim || '',
      city: payload.city || '',
      returnReason: payload.returnReason || 'Faulty Device',
      condition: payload.condition || 'Good / Reusable',
      courierInfo: payload.courierInfo || payload.remarks || 'Handover',
      status: 'pending'
    };
    list.unshift(newEntry);
    localStorage.setItem(STORAGE_KEY_RETURNS, JSON.stringify(list));
    return {
      success: true,
      id: firestoreResult?.id,
      autoRequirementId: firestoreResult?.autoRequirementId,
      message: firestoreResult?.message || 'VTS Return submitted successfully and saved in Firebase!'
    };
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'submitReturnRequest',
        ...payload
      }),
      redirect: 'follow'
    });
    const json = await response.json();
    return { ...json, id: firestoreResult?.id || json.id };
  } catch (err) {
    if (firestoreResult?.success) {
      return { success: true, id: firestoreResult.id, message: 'Saved to Firebase Firestore (Sheet sync offline)' };
    }
    throw err;
  }
}

/**
 * 15B. Search Vehicle History & Downtime Insights from Daily CSV Folder
 */
export async function fetchVehicleHistory(params) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    // Demo Mode: generate realistic timeline and insights from local devices
    const rawSearch = (params.searchTerm || '').trim();
    const searchField = (params.searchField || 'all').toLowerCase();

    // 1. Parse Multi-Search Terms
    let multiTerms = [];
    if (rawSearch) {
      const splits = rawSearch.split(/[,;\n|\t]+/);
      if (splits.length > 1) {
        multiTerms = splits.map((s) => s.trim().toLowerCase()).filter(Boolean);
      } else if (searchField === 'imei' || /^\d{10,20}(\s+\d{10,20})+$/.test(rawSearch)) {
        multiTerms = rawSearch.split(/\s+/).filter((s) => s.length >= 6);
      }
    }
    const isMultiTerm = multiTerms.length > 1;

    // 2. Parse Selected Cities / Sites
    let selectedCities = [];
    if (Array.isArray(params.cities) && params.cities.length > 0) {
      selectedCities = params.cities.map((c) => String(c).trim().toLowerCase()).filter(Boolean);
    } else if (params.cityFilter) {
      selectedCities = params.cityFilter.split(/[,;\n|]+/).map((c) => c.trim().toLowerCase()).filter(Boolean);
    } else if (params.selectedCity) {
      selectedCities = [params.selectedCity.trim().toLowerCase()].filter(Boolean);
    }

    const localDevs = safeGetJson(STORAGE_KEY_DEVICES) || initialDevices;
    
    let matchedDevices = localDevs.filter((d) => {
      // City filter
      if (selectedCities.length > 0) {
        const dCity = (d.city || '').toLowerCase();
        const cityMatch = selectedCities.some((c) => dCity.includes(c));
        if (!cityMatch) return false;
      }

      if (!rawSearch) return true;

      if (isMultiTerm) {
        return multiTerms.some((term) => {
          if (searchField === 'imei') {
            return (d.imei && String(d.imei).toLowerCase().includes(term)) || (d.sim && String(d.sim).toLowerCase().includes(term));
          }
          if (searchField === 'vehicle') {
            return d.vehicle && String(d.vehicle).toLowerCase().includes(term);
          }
          if (searchField === 'city') {
            return d.city && String(d.city).toLowerCase().includes(term);
          }
          const combined = `${d.vehicle || ''} ${d.imei || ''} ${d.city || ''} ${d.sim || ''} ${d.remark || ''}`.toLowerCase();
          return combined.includes(term);
        });
      }

      const q = rawSearch.toLowerCase();
      const isImeiExplicit = searchField === 'imei' || (/^\d{6,20}$/.test(q) && searchField !== 'vehicle');
      if (isImeiExplicit) {
        return (d.imei && String(d.imei).toLowerCase().includes(q)) || (d.sim && String(d.sim).toLowerCase().includes(q));
      }
      if (searchField === 'vehicle') {
        return d.vehicle && String(d.vehicle).toLowerCase().includes(q);
      }
      if (searchField === 'city') {
        return d.city && String(d.city).toLowerCase().includes(q);
      }
      const combined = `${d.vehicle || ''} ${d.imei || ''} ${d.city || ''} ${d.sim || ''} ${d.remark || ''} ${d.finalStatus || ''}`.toLowerCase();
      return combined.includes(q);
    });

    // If zero matches, synthesize mock devices based on terms so users can test any input immediately
    if (matchedDevices.length === 0) {
      if (isMultiTerm) {
        const isNumeric = multiTerms.every((t) => /^\d+$/.test(t));
        matchedDevices = multiTerms.map((t, idx) => ({
          vehicle: isNumeric ? `RJ-14-GP-${5000 + idx * 111}` : t.toUpperCase(),
          imei: isNumeric ? t : `8674400661147${90 + idx}`,
          city: ['Jaipur', 'Jodhpur', 'Ajmer', 'Kota'][idx % 4],
          sim: `98290${10000 + idx}`,
          finalStatus: idx % 2 === 0 ? 'RUNNING' : 'AT Site',
          remark: 'Fleet inspection record'
        }));
      } else {
        const isImei = searchField === 'imei' || /^\d{6,20}$/.test(rawSearch);
        matchedDevices = [{
          vehicle: isImei ? 'EV-1010' : (rawSearch || 'RJ14 GP 5469'),
          imei: isImei ? rawSearch : '867440066114794',
          city: selectedCities[0] ? selectedCities[0].toUpperCase() : 'Jaipur',
          sim: '9829012345',
          finalStatus: 'RUNNING',
          remark: 'Wire issue reported'
        }];
      }
    }

    const start = params.startDate ? new Date(params.startDate) : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const end = params.endDate ? new Date(params.endDate) : new Date();
    const dayDiff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))) + 1;
    const cappedDays = Math.min(dayDiff, 45);

    const mockResults = [];
    let sr = 1;

    const isImeiContext = searchField === 'imei' || (isMultiTerm && multiTerms.every((t) => /^\d{6,20}$/.test(t))) || /^\d{6,20}$/.test(rawSearch);

    if (isImeiContext) {
      // Simulate dynamic timeline for each matched IMEI
      const targetDevs = matchedDevices.slice(0, 10);
      targetDevs.forEach((dev, devIdx) => {
        const targetImei = dev.imei || `8674400661147${90 + devIdx}`;
        const vehicle1 = dev.vehicle ? `TATA-${dev.vehicle.replace(/[^A-Za-z0-9]/g, '')}` : `TATA-AT-${5400 + devIdx}`;
        const city1 = ['Ajmer', 'Kota', 'Alwar', 'Bikaner'][devIdx % 4];
        const vehicle2 = dev.vehicle || `EV-${1010 + devIdx}`;
        const city2 = dev.city || 'Jodhpur';
        const phone = dev.sim || '5754204455676';

        const splitDay = Math.max(2, Math.floor(cappedDays * (0.35 + (devIdx % 3) * 0.15)));

        for (let i = cappedDays - 1; i >= 0; i--) {
          const d = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
          const dateStr = d.toISOString().split('T')[0];
          const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

          const isPhase1 = i >= splitDay;
          const currentVeh = isPhase1 ? vehicle1 : vehicle2;
          const currentCity = isPhase1 ? city1 : city2;
          const isSwapDay = i === splitDay - 1;

          const isInactive = (i % (4 + devIdx) === 0) || (i >= splitDay && i <= splitDay + 1);
          let remark = isInactive ? 'Wire issue / intermittent GPS signal' : 'Normal movement';
          if (isSwapDay) {
            remark = `Device uninstalled from ${vehicle1} and reassigned to ${vehicle2}`;
          }

          mockResults.push({
            sr: sr++,
            date: dateStr,
            displayDate,
            vehicleName: currentVeh,
            imei: targetImei,
            city: currentCity,
            phone,
            roadcastStatus: isInactive ? 'Inactive' : 'Active',
            finalStatus: isInactive ? 'DAMAGED' : 'RUNNING',
            remark,
            matchedIn: 'IMEI',
            isTransitionRow: isSwapDay,
            prevVehicle: isSwapDay ? vehicle1 : null,
            prevCity: isSwapDay ? city1 : null,
            transitionType: isSwapDay ? 'both' : null,
            isStaleRemark: isInactive && i <= 3
          });
        }
      });
    } else {
      const targetVehicles = matchedDevices.slice(0, 8);

      for (let i = cappedDays - 1; i >= 0; i--) {
        const d = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().split('T')[0];
        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        targetVehicles.forEach((veh, vIdx) => {
          const isInactive = (i + vIdx) % 4 === 0 || (i >= 2 && i <= 4);
          const remark = isInactive ? (veh.remark || 'Wire issue reported') : 'Normal movement';

          mockResults.push({
            sr: sr++,
            date: dateStr,
            displayDate,
            vehicleName: veh.vehicle || 'RJ14 GP 5469',
            imei: veh.imei || '867440066114794',
            city: veh.city || 'Jaipur',
            phone: veh.sim || '9829012345',
            roadcastStatus: isInactive ? 'Inactive' : 'Active',
            finalStatus: veh.finalStatus || '—',
            remark,
            isStaleRemark: isInactive && i <= 4
          });
        });
      }
    }

    // Build dynamic IMEI lifecycle analysis for ALL detected IMEIs
    const imeiHistoryMap = {};
    mockResults.forEach((r) => {
      const imei = (r.imei || '').trim();
      if (imei) {
        if (!imeiHistoryMap[imei]) imeiHistoryMap[imei] = [];
        imeiHistoryMap[imei].push(r);
      }
    });

    function buildImeiAnalysisFor(targetImeiKey, imeiRows) {
      if (!imeiRows || imeiRows.length === 0) return null;
      const sorted = [...imeiRows].sort((a, b) => new Date(a.date) - new Date(b.date));

      const distinctVehiclesMap = {};
      const distinctCitiesMap = {};
      const phases = [];
      const transitions = [];
      let currentPhase = null;
      let prevRow = null;

      sorted.forEach((r) => {
        const vName = r.vehicleName || 'Unknown Vehicle';
        const cName = r.city || 'Unassigned';
        const isAct = (r.roadcastStatus || '').toLowerCase() === 'active';

        if (!distinctVehiclesMap[vName]) {
          distinctVehiclesMap[vName] = {
            vehicleName: vName,
            cities: {},
            firstSeen: r.displayDate || r.date,
            lastSeen: r.displayDate || r.date,
            firstDateRaw: r.date,
            lastDateRaw: r.date,
            daysCount: 0,
            activeDays: 0,
            inactiveDays: 0,
            latestStatus: r.roadcastStatus,
            remarks: []
          };
        }
        const dv = distinctVehiclesMap[vName];
        dv.cities[cName] = true;
        dv.lastSeen = r.displayDate || r.date;
        dv.lastDateRaw = r.date;
        dv.daysCount++;
        if (isAct) dv.activeDays++; else dv.inactiveDays++;
        dv.latestStatus = r.roadcastStatus;
        if (r.remark && !dv.remarks.includes(r.remark)) dv.remarks.push(r.remark);

        if (!distinctCitiesMap[cName]) {
          distinctCitiesMap[cName] = {
            city: cName,
            vehicles: {},
            firstSeen: r.displayDate || r.date,
            lastSeen: r.displayDate || r.date,
            daysCount: 0,
            activeDays: 0,
            inactiveDays: 0
          };
        }
        const dc = distinctCitiesMap[cName];
        dc.vehicles[vName] = true;
        dc.lastSeen = r.displayDate || r.date;
        dc.daysCount++;
        if (isAct) dc.activeDays++; else dc.inactiveDays++;

        if (!currentPhase || currentPhase.vehicle !== vName || currentPhase.city !== cName) {
          if (prevRow) {
            const tType = (prevRow.vehicleName !== vName && prevRow.city !== cName) ? 'both' : (prevRow.vehicleName !== vName ? 'vehicle_swap' : 'city_transfer');
            transitions.push({
              date: r.displayDate || r.date,
              dateRaw: r.date,
              fromVehicle: prevRow.vehicleName,
              toVehicle: vName,
              fromCity: prevRow.city,
              toCity: cName,
              type: tType
            });
            r.isTransitionRow = true;
            r.prevVehicle = prevRow.vehicleName;
            r.prevCity = prevRow.city;
            r.transitionType = tType;
          }

          currentPhase = {
            phaseIndex: phases.length + 1,
            vehicle: vName,
            city: cName,
            startDate: r.displayDate || r.date,
            endDate: r.displayDate || r.date,
            startDateRaw: r.date,
            endDateRaw: r.date,
            daysCount: 1,
            activeDays: isAct ? 1 : 0,
            inactiveDays: isAct ? 0 : 1,
            latestStatus: r.roadcastStatus,
            remarks: r.remark ? [r.remark] : []
          };
          phases.push(currentPhase);
        } else {
          currentPhase.endDate = r.displayDate || r.date;
          currentPhase.endDateRaw = r.date;
          currentPhase.daysCount++;
          if (isAct) currentPhase.activeDays++; else currentPhase.inactiveDays++;
          currentPhase.latestStatus = r.roadcastStatus;
          if (r.remark && !currentPhase.remarks.includes(r.remark)) currentPhase.remarks.push(r.remark);
        }

        prevRow = r;
      });

      const vehicleList = Object.keys(distinctVehiclesMap).map((k) => {
        const obj = distinctVehiclesMap[k];
        obj.cities = Object.keys(obj.cities);
        obj.uptimePct = obj.daysCount > 0 ? ((obj.activeDays / obj.daysCount) * 100).toFixed(1) : '0.0';
        return obj;
      });

      const cityList = Object.keys(distinctCitiesMap).map((k) => {
        const obj = distinctCitiesMap[k];
        obj.vehicles = Object.keys(obj.vehicles);
        obj.uptimePct = obj.daysCount > 0 ? ((obj.activeDays / obj.daysCount) * 100).toFixed(1) : '0.0';
        return obj;
      });

      const latestRow = sorted[sorted.length - 1];
      const firstRow = sorted[0];
      const totalActive = sorted.filter((x) => (x.roadcastStatus || '').toLowerCase() === 'active').length;

      return {
        targetImei: targetImeiKey,
        totalTrackedDays: sorted.length,
        activeDays: totalActive,
        inactiveDays: sorted.length - totalActive,
        uptimePct: sorted.length > 0 ? ((totalActive / sorted.length) * 100).toFixed(1) : '0.0',
        distinctVehiclesCount: vehicleList.length,
        distinctCitiesCount: cityList.length,
        isDynamicSwap: vehicleList.length > 1,
        isInterCityMovement: cityList.length > 1,
        vehicles: vehicleList,
        cities: cityList,
        phases,
        transitions,
        firstSeenDate: firstRow ? (firstRow.displayDate || firstRow.date) : null,
        lastSeenDate: latestRow ? (latestRow.displayDate || latestRow.date) : null,
        latestVehicle: latestRow ? latestRow.vehicleName : null,
        latestCity: latestRow ? latestRow.city : null,
        latestStatus: latestRow ? latestRow.roadcastStatus : null,
        latestPhone: latestRow ? latestRow.phone : null
      };
    }

    const imeiAnalyses = {};
    const allFoundImeis = Object.keys(imeiHistoryMap);
    allFoundImeis.forEach((im) => {
      imeiAnalyses[im] = buildImeiAnalysisFor(im, imeiHistoryMap[im]);
    });

    const primaryImei = allFoundImeis[0] || null;
    const imeiAnalysis = primaryImei ? imeiAnalyses[primaryImei] : null;

    const totalRecords = mockResults.length;
    const activeRecords = mockResults.filter((r) => r.roadcastStatus === 'Active').length;
    const inactiveRecords = totalRecords - activeRecords;
    const downtimePct = totalRecords > 0 ? ((inactiveRecords / totalRecords) * 100).toFixed(1) : '0.0';

    const uniqueVehiclesSet = new Set(mockResults.map((r) => r.vehicleName).filter(Boolean));

    // City Breakdown Scorecard
    const cityMap = {};
    mockResults.forEach((r) => {
      const c = r.city || 'Unassigned';
      if (!cityMap[c]) cityMap[c] = { total: 0, active: 0, inactive: 0, vehicles: new Set() };
      cityMap[c].total++;
      if (r.roadcastStatus === 'Active') cityMap[c].active++;
      else cityMap[c].inactive++;
      cityMap[c].vehicles.add(r.vehicleName);
    });

    const cityBreakdown = Object.keys(cityMap).map((cName) => {
      const c = cityMap[cName];
      const upPct = c.total > 0 ? ((c.active / c.total) * 100).toFixed(1) : '0.0';
      return {
        city: cName,
        vehicles: c.vehicles.size,
        totalDays: c.total,
        activeDays: c.active,
        inactiveDays: c.inactive,
        uptimePct: upPct,
        downtimePct: (100 - parseFloat(upPct)).toFixed(1)
      };
    });

    return {
      searchTerm: params.searchTerm,
      searchField: params.searchField || 'all',
      selectedCity: params.cityFilter || params.selectedCity || '',
      selectedCities,
      isMultiTermSearch: isMultiTerm,
      searchedTerms: isMultiTerm ? multiTerms : (rawSearch ? [rawSearch] : []),
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      totalDays: totalRecords,
      totalRecords,
      uniqueVehicles: uniqueVehiclesSet.size,
      activeDays: activeRecords,
      inactiveDays: inactiveRecords,
      downtimePct,
      longestStreak: 3,
      chronicInactiveCount: 0,
      chronicVehicles: [],
      cityBreakdown,
      repeatedRemarkWarning: null,
      imeiAnalysis,
      imeiAnalyses,
      results: mockResults
    };
  }

  let cityFilterVal = '';
  if (Array.isArray(params.cities) && params.cities.length > 0) {
    cityFilterVal = params.cities.join(',');
  } else if (params.cityFilter) {
    cityFilterVal = params.cityFilter;
  } else if (params.selectedCity) {
    cityFilterVal = params.selectedCity;
  }

  const queryParams = new URLSearchParams({
    action: 'searchVehicleHistory',
    searchTerm: params.searchTerm || '',
    searchField: params.searchField || 'all',
    cityFilter: cityFilterVal,
    statusFilter: params.statusFilter || 'all',
    exactMatch: params.exactMatch ? 'true' : 'false',
    startDate: params.startDate || '',
    endDate: params.endDate || ''
  });

  const url = apiUrl.includes('?') ? `${apiUrl}&${queryParams.toString()}` : `${apiUrl}?${queryParams.toString()}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.success && json.data) {
    return json.data;
  }
  throw new Error(json.error || 'Failed to search vehicle history');
}

/**
 * Send welcome email with login credentials to a new user
 */
export async function sendWelcomeEmail(payload) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    console.log('[Demo Mode] Would send welcome email to:', payload.email, '| Password:', payload.password);
    return { success: true, message: 'Demo mode: email not sent (no API connected)' };
  }
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'sendWelcomeEmail',
        ...payload
      }),
      redirect: 'follow'
    });
    return await response.json();
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * 16. Refresh Final Status (Global Scan of Source A & Source B)
 */
export async function refreshFinalStatus() {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    return {
      success: true,
      message: 'Simulated Final Status refresh completed across Source A & B (Demo mode).',
      matchedCount: 28,
      totalCount: 30,
      refreshedAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({ action: 'refreshFinalStatus' }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 17. Update Status Override
 */
export async function updateStatusOverride(uniqueid, override) {
  const apiUrl = getStoredApiUrl();
  const cleanId = String(uniqueid || '').trim();

  if (!apiUrl) {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY_DEVICES) || JSON.stringify(initialDevices));
    const updated = local.map((d) => {
      if (String(d.imei || '').trim() === cleanId) {
        return {
          ...d,
          statusOverride: override,
          displayStatus: override || d.finalStatus || (String(d.roadcastStatus || '').toLowerCase() === 'inactive' ? 'Inactive' : '—')
        };
      }
      return d;
    });
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(updated));
    return { success: true, message: 'Status override updated locally (Demo mode)' };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateStatusOverride',
      uniqueid: cleanId,
      override: override
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 18. Data-Fill Status Monitoring
 */
export async function getDataFillStatus() {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    const cached = localStorage.getItem(STORAGE_KEY_DATA_FILL);
    if (cached) return JSON.parse(cached);
    const demoData = [
      { city: 'Ajmer', lastEntryDate: '01 Sep 2026', filledToday: true, daysSinceLastEntry: 0 },
      { city: 'Bundi', lastEntryDate: '01 Sep 2026', filledToday: true, daysSinceLastEntry: 0 },
      { city: 'Sikar', lastEntryDate: '31 Aug 2026', filledToday: false, daysSinceLastEntry: 1 },
      { city: 'Vidisha', lastEntryDate: '01 Sep 2026', filledToday: true, daysSinceLastEntry: 0 },
      { city: 'Civil Lines', lastEntryDate: '31 Aug 2026', filledToday: false, daysSinceLastEntry: 1 },
      { city: 'Hisar', lastEntryDate: '01 Sep 2026', filledToday: true, daysSinceLastEntry: 0 },
      { city: 'Bhartpur', lastEntryDate: '01 Sep 2026', filledToday: true, daysSinceLastEntry: 0 },
      { city: 'Jhunjhunun', lastEntryDate: '28 Aug 2026', filledToday: false, daysSinceLastEntry: 4 },
      { city: 'Kishanpole', lastEntryDate: '01 Sep 2026', filledToday: true, daysSinceLastEntry: 0 },
      { city: 'Kuchaman', lastEntryDate: '01 Sep 2026', filledToday: true, daysSinceLastEntry: 0 },
      { city: 'Tonk', lastEntryDate: '30 Aug 2026', filledToday: false, daysSinceLastEntry: 2 }
    ];
    localStorage.setItem(STORAGE_KEY_DATA_FILL, JSON.stringify(demoData));
    return demoData;
  }

  const fetchUrl = apiUrl.includes('?') ? `${apiUrl}&action=getDataFillStatus` : `${apiUrl}?action=getDataFillStatus`;
  const response = await fetch(fetchUrl, { method: 'GET', redirect: 'follow' });
  const json = await response.json();
  return json.data || [];
}

/**
 * 19. Camera Sheet Monitoring
 */
export async function getCameraFillStatus() {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    const cached = localStorage.getItem(STORAGE_KEY_CAMERA_FILL);
    if (cached) return JSON.parse(cached);
    const demoCamera = [
      { city: 'Phalodi', totalCameras: 2, working: 0, notWorking: 2, lastDate: '01 Sep 2026', filledToday: true },
      { city: 'Ratangarh', totalCameras: 8, working: 6, notWorking: 2, lastDate: '01 Sep 2026', filledToday: true },
      { city: 'Reengus', totalCameras: 4, working: 4, notWorking: 0, lastDate: '01 Sep 2026', filledToday: true },
      { city: 'Sewapura MRF', totalCameras: 8, working: 8, notWorking: 0, lastDate: '01 Sep 2026', filledToday: true },
      { city: 'Sikar', totalCameras: 7, working: 7, notWorking: 0, lastDate: '31 Aug 2026', filledToday: false }
    ];
    localStorage.setItem(STORAGE_KEY_CAMERA_FILL, JSON.stringify(demoCamera));
    return demoCamera;
  }

  const fetchUrl = apiUrl.includes('?') ? `${apiUrl}&action=getCameraFillStatus` : `${apiUrl}?action=getCameraFillStatus`;
  const response = await fetch(fetchUrl, { method: 'GET', redirect: 'follow' });
  const json = await response.json();
  return json.data || [];
}

/**
 * 20. Inactive + Running Vehicle Anomaly Engine
 */
export async function getInactiveRunningDevices() {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY_DEVICES) || JSON.stringify(initialDevices));
    return local
      .filter((d) => String(d.roadcastStatus || '').toLowerCase() === 'inactive' && String(d.finalStatus || '').toUpperCase() === 'RUNNING')
      .map((d) => ({
        date: new Date().toLocaleDateString('en-GB'),
        uniqueid: d.imei,
        name: d.vehicle,
        phone: d.sim,
        city: d.city,
        vtsStatus: 'Inactive',
        vehicleStatus: 'RUNNING',
        lastUpdate: d.lastUpdate || '20 Aug 2026',
        vtsType: d.vtsType || 'VTS Package 4G',
        remark: d.inactiveRunningRemark || '',
        lastRemarkUpdate: d.lastRemarkUpdate || ''
      }));
  }

  const fetchUrl = apiUrl.includes('?') ? `${apiUrl}&action=getInactiveRunningDevices` : `${apiUrl}?action=getInactiveRunningDevices`;
  const response = await fetch(fetchUrl, { method: 'GET', redirect: 'follow' });
  const json = await response.json();
  return json.data || [];
}

export async function updateInactiveRunningRemark(uniqueid, remark) {
  const apiUrl = getStoredApiUrl();
  const cleanId = String(uniqueid || '').trim();

  if (!apiUrl) {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY_DEVICES) || JSON.stringify(initialDevices));
    const todayStr = new Date().toLocaleDateString('en-GB');
    const updated = local.map((d) => {
      if (String(d.imei || '').trim() === cleanId) {
        return {
          ...d,
          inactiveRunningRemark: remark,
          lastRemarkUpdate: todayStr
        };
      }
      return d;
    });
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(updated));
    return { success: true, message: 'Inactive-running remark saved locally (Demo mode)' };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateInactiveRunningRemark',
      uniqueid: cleanId,
      remark: remark
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 21. Dynamic Notification Center Dispatch
 */
export async function sendCustomNotification(payload) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    console.log('[Demo Mode] Sending custom notification:', payload);
    return {
      success: true,
      sentCount: (payload.recipients || []).length,
      message: `Simulated notification sent to ${(payload.recipients || []).length} manager(s) (Demo mode).`
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'sendNotification',
      ...payload
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 22. Dynamic Monthly Renewal Cycles & Multi-Tab Sync with 'Renewal done month wise' Sheet
 * Sheet ID: 1GjJ8ewJPz_1F6xiI8qdklgTRHsDe21xtbw5-dt2x2Ug
 */
export const RENEWAL_DONE_SHEET_ID = '1GjJ8ewJPz_1F6xil8qdklgTRHsDe21xtbw5-dt2x2Ug';
export const RENEWAL_DONE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${RENEWAL_DONE_SHEET_ID}/edit`;

const STORAGE_KEY_ACTIVE_CYCLE_TAB = 'vts_tracker_active_cycle_tab';
const STORAGE_KEY_CYCLE_TABS = 'vts_tracker_cycle_tabs';
const STORAGE_KEY_NEXT_SESSION_CARRYOVER = 'vts_tracker_next_session_carryover';

const DEFAULT_CYCLE_TABS = [
  '24 aug 2026',
  'Auguest 12aug 2026',
  'August 2026',
  'July 2026',
  'June 2026',
  'May 2026 2nd half',
  'May 2026 1st half',
  'April 2026',
  '13 Expired VTS',
  '9 VTS'
];

export async function fetchRenewalCycleTabs(targetTab = null) {
  // Clear any corrupted localStorage URL containing TRIHs typo
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = safeGetItem('vts_tracker_renewal_sheet_url');
    if (stored && (stored.includes('TRIHs') || stored.includes('1GjJ8ewJPz_1F6xil8qdklgTRIHsDe21xtbw5-dt2x2Ug'))) {
      safeRemoveItem('vts_tracker_renewal_sheet_url');
    }
  }

  const apiUrl = getStoredApiUrl();
  let savedTabs = safeGetJson(STORAGE_KEY_CYCLE_TABS) || DEFAULT_CYCLE_TABS;

  // Sanitize: If accidentally corrupted with Master Sheet tabs ('950', '900', 'VTS Data', etc.), reset to Renewal tabs
  if (savedTabs.includes('900') || savedTabs.includes('950') || savedTabs.includes('VTS Data') || savedTabs.includes('Users')) {
    savedTabs = DEFAULT_CYCLE_TABS;
    safeSetItem(STORAGE_KEY_CYCLE_TABS, DEFAULT_CYCLE_TABS);
    safeSetItem(STORAGE_KEY_ACTIVE_CYCLE_TAB, savedTabs[savedTabs.length - 1] || '');
  }

  let userPreferredTab = targetTab || safeGetItem('vts_user_selected_cycle_tab') || safeGetItem(STORAGE_KEY_ACTIVE_CYCLE_TAB) || '';

  if (!apiUrl) {
    const activeTab = (userPreferredTab && savedTabs.includes(userPreferredTab)) ? userPreferredTab : (savedTabs[savedTabs.length - 1] || '');
    const carryoverImeis = safeGetJson(STORAGE_KEY_NEXT_SESSION_CARRYOVER, []);
    return {
      success: false,
      isOffline: true,
      error: 'Apps Script Web App URL is not connected. Please click "API Settings" to connect your Google Sheets.',
      spreadsheetId: RENEWAL_DONE_SHEET_ID,
      spreadsheetUrl: RENEWAL_DONE_SHEET_URL,
      tabs: savedTabs,
      activeTab,
      carryoverCount: carryoverImeis.length,
      carryoverImeis,
      recordsByImei: {},
      decisions: {},
      sheetDevices: []
    };
  }

  try {
    const tabParam = userPreferredTab ? `&tab=${encodeURIComponent(userPreferredTab)}` : '';
    const fetchUrl = apiUrl.includes('?') ? `${apiUrl}&action=getRenewalCycleTabs${tabParam}` : `${apiUrl}?action=getRenewalCycleTabs${tabParam}`;
    const response = await fetch(fetchUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(12000)
    });
    const json = await response.json();

    if (json.data && json.data.error) {
      return {
        success: false,
        error: json.data.error,
        spreadsheetId: RENEWAL_DONE_SHEET_ID,
        spreadsheetUrl: RENEWAL_DONE_SHEET_URL,
        tabs: savedTabs,
        activeTab: userPreferredTab || (savedTabs[savedTabs.length - 1] || ''),
        recordsByImei: {},
        decisions: {},
        sheetDevices: []
      };
    }

    let remoteTabs = (json.data && json.data.tabs) || [];
    // Filter out master tabs
    remoteTabs = remoteTabs.filter(t => !['900', '950', 'VTS Data', 'Users', 'City_Email_Contacts', 'Search_History', 'Pivot Table 5', 'Search', 'Vendor Vehicles', 'analysis'].includes(t));
    
    if (remoteTabs.length > 0) {
      safeSetItem(STORAGE_KEY_CYCLE_TABS, remoteTabs);

      const normalizeTabStr = (t) => String(t || '').trim().toLowerCase().replace(/sept/g, 'sep').replace(/\s+/g, ' ');
      const matchTab = (name, list) => {
        if (!name || !list) return null;
        const c = normalizeTabStr(name);
        return list.find(t => normalizeTabStr(t) === c) || null;
      };

      const matchedPreferred = matchTab(userPreferredTab, remoteTabs);
      const matchedRemoteActive = matchTab(json.data && json.data.activeTab, remoteTabs);

      const chosenActiveTab = matchedPreferred ||
                              matchedRemoteActive ||
                              userPreferredTab ||
                              remoteTabs[remoteTabs.length - 1];

      safeSetItem(STORAGE_KEY_ACTIVE_CYCLE_TAB, chosenActiveTab);
      return {
        ...json.data,
        success: true,
        spreadsheetUrl: RENEWAL_DONE_SHEET_URL,
        tabs: remoteTabs,
        activeTab: chosenActiveTab,
        sheetDevices: (json.data && json.data.sheetDevices) || []
      };
    }
    const fallbackTab = userPreferredTab || (savedTabs.length > 0 ? savedTabs[savedTabs.length - 1] : '');
    return { ...(json.data || {}), success: true, spreadsheetUrl: RENEWAL_DONE_SHEET_URL, tabs: savedTabs, activeTab: fallbackTab, sheetDevices: (json.data && json.data.sheetDevices) || [] };
  } catch (err) {
    console.warn('Could not fetch renewal cycle tabs:', err);
    return {
      success: false,
      error: err.message || 'Network error fetching renewal cycle tabs.',
      spreadsheetId: RENEWAL_DONE_SHEET_ID,
      spreadsheetUrl: RENEWAL_DONE_SHEET_URL,
      tabs: savedTabs,
      activeTab: (userPreferredTab && savedTabs.includes(userPreferredTab)) ? userPreferredTab : (savedTabs[savedTabs.length - 1] || ''),
      recordsByImei: {},
      decisions: {},
      sheetDevices: []
    };
  }
}

export async function batchUpdateLicenseDates({ updates = [], tabName = '' }) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY_DEVICES) || JSON.stringify(initialDevices));
    const updateMap = {};
    updates.forEach(u => {
      const imei = String(u.imei || u.uniqueid || '').trim();
      if (imei) updateMap[imei] = u.newLicenseEnd;
    });

    const updated = local.map(d => {
      const imei = String(d.imei || '').trim();
      if (updateMap[imei]) {
        return {
          ...d,
          licenseEnd: updateMap[imei],
          newLicenseEnd: updateMap[imei],
          renewalDecision: 'Yes',
          statusDone: 'Done'
        };
      }
      return d;
    });
    safeSetItem(STORAGE_KEY_DEVICES, updated);
    return { success: true, message: `Updated ${updates.length} license end dates locally (Demo mode)!` };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'batchUpdateLicenseDates',
      updates,
      tabName
    }),
    redirect: 'follow'
  });
  return await response.json();
}

export async function setActiveRenewalCycleTab(tabName) {
  safeSetItem(STORAGE_KEY_ACTIVE_CYCLE_TAB, tabName);
  safeSetItem('vts_user_selected_cycle_tab', tabName);
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    return { success: true, activeTab: tabName, message: `Active cycle set to ${tabName}` };
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'setActiveRenewalCycleTab',
        tabName
      }),
      redirect: 'follow'
    });
    return await response.json();
  } catch (_err) {
    return { success: true, activeTab: tabName };
  }
}

export async function updateRenewalSheetUrl(urlOrId) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    return { success: true, message: 'URL saved locally (Demo Mode)!' };
  }
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'setRenewalSheetUrl',
        url: urlOrId
      }),
      redirect: 'follow'
    });
    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function extractRenewalCycleBatch({ tabName, devices = [], includeDeclined = false, targetMode = 'new' }) {
  safeSetItem(STORAGE_KEY_ACTIVE_CYCLE_TAB, tabName);
  safeSetItem('vts_user_selected_cycle_tab', tabName);

  // Update tabs cache
  const currentTabs = safeGetJson(STORAGE_KEY_CYCLE_TABS) || DEFAULT_CYCLE_TABS;
  if (!currentTabs.includes(tabName)) {
    currentTabs.unshift(tabName);
    safeSetItem(STORAGE_KEY_CYCLE_TABS, currentTabs);
  }

  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    return {
      success: true,
      message: targetMode === 'existing'
        ? `Added ${devices.length} devices to existing tab "${tabName}" (Demo Mode)!`
        : `Extracted ${devices.length} devices into tab "${tabName}" (Demo Mode)!`,
      tabName,
      spreadsheetUrl: RENEWAL_DONE_SHEET_URL,
      rowCount: devices.length
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'extractRenewalCycleBatch',
      tabName,
      devices,
      includeDeclined,
      targetMode
    }),
    redirect: 'follow'
  });
  return await response.json();
}

export async function finalizeRenewalSession({ activeTab, newLicenseEnd, note, approvedImeis = [], declinedImeis = [] }) {
  // Store declined IMEIs locally for next session carryover
  safeSetItem(STORAGE_KEY_NEXT_SESSION_CARRYOVER, declinedImeis);

  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    // In local demo mode, update local devices
    const local = safeGetJson(STORAGE_KEY_DEVICES, []);
    const normApproved = approvedImeis.map(String);
    const updated = local.map((d) => {
      if (normApproved.includes(String(d.imei))) {
        return {
          ...d,
          licenseEnd: newLicenseEnd,
          renewalDecision: 'Renewed',
          remainingDays: 365,
          status: 'Safe',
          rechargeStatus: 'Safe'
        };
      }
      return d;
    });
    safeSetItem(STORAGE_KEY_DEVICES, updated);

    return {
      success: true,
      message: `Session finalized! ${approvedImeis.length} devices renewed to ${newLicenseEnd}. ${declinedImeis.length} declined devices queued for next session.`,
      renewedCount: approvedImeis.length,
      carryoverCount: declinedImeis.length
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'finalizeRenewalSession',
      activeTab,
      newLicenseEnd,
      note,
      approvedImeis,
      declinedImeis
    }),
    redirect: 'follow'
  });
  return await response.json();
}

export async function applyBatchRenewals({ tabName }) {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    return {
      success: true,
      message: 'Updated License End dates for approved devices (Demo Mode)!',
      updatedCount: 0
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'applyBatchRenewals',
      tabName
    }),
    redirect: 'follow'
  });
  return await response.json();
}

/**
 * 23. Morning Fleet Inspection & City-wise WhatsApp Digest
 */
export async function fetchMorningFleetDigest() {
  const apiUrl = getStoredApiUrl();
  if (!apiUrl) {
    const devices = safeGetJson(STORAGE_KEY_DEVICES) || initialDevices;
    const cityMap = {};
    let totalInactive = 0;
    let totalNoRemark = 0;

    devices.forEach((d) => {
      const city = d.city || 'Other';
      if (!cityMap[city]) {
        cityMap[city] = {
          city,
          total: 0,
          inactive: 0,
          noRemark: 0,
          inactiveVehicles: []
        };
      }
      cityMap[city].total++;
      const isInactive = String(d.roadcastStatus || '').toLowerCase() === 'inactive';
      if (isInactive) {
        totalInactive++;
        cityMap[city].inactive++;
        const hasRemark = !!(d.remark && String(d.remark).trim());
        if (!hasRemark) {
          totalNoRemark++;
          cityMap[city].noRemark++;
        }
        cityMap[city].inactiveVehicles.push({
          vehicle: d.vehicle || 'Unknown',
          imei: d.imei || '',
          lastUpdate: d.lastUpdate || '—',
          remark: d.remark || '',
          sim: d.sim || ''
        });
      }
    });

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const byCity = Object.values(cityMap).map((c) => {
      let wa = `🚨 *WeVois Morning Fleet Inspection - ${c.city} Site*\n`;
      wa += `📅 *Time:* ${dateStr} | *Total Fleet:* ${c.total} | *Inactive VTS:* ${c.inactive}\n`;
      if (c.noRemark > 0) {
        wa += `⚠️ *${c.noRemark} Inactive vehicles have NO REMARK!*\n\n`;
      } else {
        wa += `\n`;
      }
      wa += `*Vehicles requiring immediate site check:*\n`;
      const limit = Math.min(c.inactiveVehicles.length, 12);
      for (let v = 0; v < limit; v++) {
        const iv = c.inactiveVehicles[v];
        wa += `${v + 1}. *${iv.vehicle}* (${iv.imei}) - Last: ${iv.lastUpdate} | Remark: ${iv.remark ? iv.remark : '[BLANK - PLEASE FILL]'}\n`;
      }
      if (c.inactiveVehicles.length > 12) {
        wa += `...and ${c.inactiveVehicles.length - 12} more.\n`;
      }
      wa += `\n_Please verify wire connector & GPS power before 10:00 AM municipal cutoff._`;

      return {
        ...c,
        whatsappText: wa
      };
    });

    byCity.sort((a, b) => b.inactive - a.inactive);

    return {
      success: true,
      inspectedAt: dateStr,
      totalVehicles: devices.length,
      totalInactive,
      totalNoRemark,
      byCity
    };
  }

  try {
    const fetchUrl = apiUrl.includes('?') ? `${apiUrl}&action=getMorningFleetDigest` : `${apiUrl}?action=getMorningFleetDigest`;
    const response = await fetch(fetchUrl, { method: 'GET', redirect: 'follow' });
    const json = await response.json();
    if (json.data && json.data.byCity) {
      return json.data;
    }
    return json.data || { byCity: [] };
  } catch (err) {
    console.warn('Failed to fetch morning fleet digest from Google Sheet, falling back to local computation:', err);
    return { success: false, error: err.message, byCity: [] };
  }
}



