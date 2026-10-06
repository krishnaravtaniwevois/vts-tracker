/**
 * ============================================================================
 * VTS TRACKER — GOOGLE APPS SCRIPT BACKEND API (MASTER SPEC — FULL SPEC)
 * ============================================================================
 * Master Sheet: "900" tab (Single Source of Truth)
 * Users Sheet: "Users" tab (Site Manager Access & Roles)
 * Renewal Log: "Renewal Log" tab (Permanent Audit Trail)
 * Drive Archives: "VTS Renewal Archives" folder
 * ============================================================================
 */

var VTS_CONFIG = {
  MASTER_SHEET: '1kb5Jue6W8fkAJ4pLoS_lsNbVFf4a1ZYzduyph3KKEtQ',
  MASTER_TAB_NAME: '900',
  USERS_TAB_NAME: 'Users',
  RENEWAL_LOG_TAB_NAME: 'Renewal Log',
  REQUESTS_TAB_NAME: 'Form Responses 1',
  RETURNS_TAB_NAME: 'VTS Returns',
  DRIVE_ARCHIVE_FOLDER_NAME: 'VTS Renewal Archives',
  SOURCE_A_VENDOR_SHEET_ID: '1pEkpv1wAZpKE5PKsOzaHsVFC2X5XQM6phfq1cGipuYw',
  SOURCE_B_OPERATION_SHEET_ID: '1kb5Jue6W8fkAJ4pLoS_lsNbVFf4a1ZYzduyph3KKEtQ',
  VEHICLE_RECORD_SHEET_ID: '1MFKeBqIWJhPg-UjzoEbRwlb-romMxnpWSUZrAXOqojs',
  VEHICLE_RECORD_TAB_NAME: 'Sitewise Vehicle Record',
  RENEWAL_MONTH_WISE_SHEET_ID: '1GjJ8ewJPz_1F6xil8qdklgTRHsDe21xtbw5-dt2x2Ug',
  DAILY_REPORTS_FOLDER_ID: '1WqrIXW7abqYzCug_xz4LbzVag2plBDnB',
  EXPIRY_ALERT_DAYS: 15,
  SHARED_SECRET_TOKEN: '' // Optional token security
};

function authTest() {
  Logger.log("✅ Apps Script Engine is Healthy! User: " + Session.getActiveUser().getEmail());
}

function testRun() {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    var masterSheet = getMasterSheetStrict(ss);
    Logger.log("Master Sheet Found: " + (masterSheet ? masterSheet.getName() : "NOT FOUND") + " | Rows: " + (masterSheet ? masterSheet.getLastRow() : 0));
    var data = getAllFleetData({});
    Logger.log("SUCCESS! Total devices loaded: " + (data && data.devices ? data.devices.length : 0));
    if (data && data.devices && data.devices.length > 0) {
      Logger.log("First device: " + JSON.stringify(data.devices[0]));
    }
    return data;
  } catch (err) {
    Logger.log("ERROR in testRun: " + err.toString() + (err.stack ? ("\n" + err.stack) : ""));
    throw err;
  }
}

function testRenewalTabs() {
  try {
    var res = getRenewalCycleTabs('14 sept 2026');
    Logger.log("SUCCESS! Active Tab: " + res.activeTab + " | Total Tabs: " + (res.tabs ? res.tabs.length : 0));
    Logger.log("Sheet Devices Count: " + (res.sheetDevices ? res.sheetDevices.length : 0));
    if (res.sheetDevices && res.sheetDevices.length > 0) {
      Logger.log("First row from sheet: " + JSON.stringify(res.sheetDevices[0]));
    }
    return res;
  } catch (err) {
    Logger.log("ERROR in testRenewalTabs: " + err.toString() + (err.stack ? ("\n" + err.stack) : ""));
    throw err;
  }
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getAllData';
  try {
    var result = {};
    if (action === 'getAllData') result = getAllFleetData(e ? e.parameter : {});
    else if (action === 'getDevices') result = getMasterDevices();
    else if (action === 'getUsers') result = getUsersList();
    else if (action === 'getRequests') result = getFormRequests();
    else if (action === 'getReturnRequests') result = getReturnRequests();
    else if (action === 'getRenewalLogs') result = getRenewalLogs();
    else if (action === 'getRenewalArchiveList') result = getRenewalArchiveList();
    else if (action === 'getRenewalCycleTabs') result = getRenewalCycleTabs((e && e.parameter) ? (e.parameter.tab || e.parameter.tabName) : null);
    else if (action === 'getDataFillStatus') result = getDataFillStatus();
    else if (action === 'getCameraFillStatus') result = getCameraFillStatus();
    else if (action === 'getInactiveRunningDevices') result = getInactiveRunningDevices();
    else if (action === 'getGroundVehicleRecords' || action === 'getGroundAudit') result = getGroundVehicleRecords();
    else if (action === 'getMorningFleetDigest') result = getMorningFleetDigest();
    else if (action === 'searchVehicleHistory') result = searchVehicleHistoryApi(e ? e.parameter : {});
    else result = { status: 'error', message: 'Unknown action: ' + action };

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      data: result
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    if (VTS_CONFIG.SHARED_SECRET_TOKEN) {
      var clientToken = payload.token || (e && e.parameter && e.parameter.token);
      if (clientToken !== VTS_CONFIG.SHARED_SECRET_TOKEN) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: 'Unauthorized: Invalid security token'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var action = payload.action;
    var response = {};

    var mutatingActions = [
      'addDevice', 'updateRoadcastStatus', 'updateRemark', 'updateDeviceDetails',
      'updateLicenseEnd', 'updateRenewalDecision', 'markDeviceRenewed', 'archiveRenewalList',
      'applyBatchRenewals', 'batchUpdateLicenseDates', 'finalizeRenewalSession', 'saveUser',
      'deleteUser', 'submitRequirementRequest', 'submitReturnRequest', 'refreshFinalStatus',
      'protectColumnH', 'updateStatusOverride', 'updateInactiveRunningRemark', 'setActiveRenewalCycleTab',
      'setRenewalSheetUrl'
    ];

    var executeAction = function() {
      if (action === 'addDevice') return addNewDevice(payload);
      if (action === 'updateRoadcastStatus') return updateRoadcastStatusBatch(payload);
      if (action === 'updateRemark') return updateDeviceRemark(payload);
      if (action === 'updateDeviceDetails') return updateDeviceDetails(payload);
      if (action === 'updateLicenseEnd') return updateDeviceLicenseEnd(payload);
      if (action === 'updateRenewalDecision') return updateRenewalDecision(payload);
      if (action === 'markDeviceRenewed') return markDeviceRenewed(payload);
      if (action === 'archiveRenewalList') return archiveRenewalList(payload);
      if (action === 'extractRenewalCycleBatch') return extractRenewalCycleBatch(payload);
      if (action === 'getRenewalCycleTabs') return getRenewalCycleTabs(payload.tab || payload.tabName);
      if (action === 'setActiveRenewalCycleTab') return setActiveRenewalCycleTab(payload);
      if (action === 'setRenewalSheetUrl') return setRenewalSheetUrl(payload);
      if (action === 'applyBatchRenewals') return applyBatchRenewals(payload);
      if (action === 'batchUpdateLicenseDates') return batchUpdateLicenseDates(payload);
      if (action === 'finalizeRenewalSession') return finalizeRenewalSession(payload);
      if (action === 'saveUser') return saveUser(payload);
      if (action === 'deleteUser') return deleteUser(payload);
      if (action === 'sendRenewalReminders') return sendRenewalReminders(payload);
      if (action === 'sendWelcomeEmail') return sendWelcomeEmailToUser(payload);
      if (action === 'submitRequirementRequest') return submitRequirementRequest(payload);
      if (action === 'submitReturnRequest') return submitReturnRequest(payload);
      if (action === 'refreshFinalStatus') return refreshFinalStatus();
      if (action === 'protectColumnH') return protectColumnH();
      if (action === 'updateStatusOverride') return updateStatusOverride(payload);
      if (action === 'updateInactiveRunningRemark') return updateInactiveRunningRemark(payload);
      if (action === 'sendNotification') return sendCustomNotification(payload);
      if (action === 'searchVehicleHistory') return searchVehicleHistoryApi(payload);
      if (action === 'setupMorningFleetTrigger') return setupMorningFleetTrigger();
      return { success: false, message: 'Invalid action: ' + action };
    };

    if (mutatingActions.indexOf(action) !== -1) {
      response = withScriptLock(executeAction, 25000);
    } else {
      response = executeAction();
    }

    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Executes a callback protected by LockService script lock.
 * Prevents race conditions and Google Sheet overwrites during concurrent site manager updates.
 */
function withScriptLock(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  var timeout = timeoutMs || 25000;
  var hasLock = false;
  try {
    hasLock = lock.tryLock(timeout);
  } catch (e) {
    hasLock = false;
  }
  if (!hasLock) {
    return {
      success: false,
      error: 'Lock contention: Another site coordinator is currently saving updates to the Google Sheet. Please retry in a few seconds.'
    };
  }
  try {
    return fn();
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function safeOpenSpreadsheet(idOrUrl) {
  var target = idOrUrl || VTS_CONFIG.MASTER_SHEET || VTS_CONFIG.SOURCE_B_OPERATION_SHEET_ID;
  if (!target) {
    try { return SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { return null; }
  }
  var str = String(target).trim();
  try {
    if (str.indexOf('http') === 0) return SpreadsheetApp.openByUrl(str);
    var match = str.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? SpreadsheetApp.openById(match[1]) : SpreadsheetApp.openById(str);
  } catch (err) {
    try {
      return SpreadsheetApp.getActiveSpreadsheet();
    } catch (e2) {
      return null;
    }
  }
}

/**
 * Strict resolver for Master Fleet tab ('950' or '900')
 * PREVENTS falling back to 'VTS Data' (which contains 26,653 raw log rows)
 */
function getMasterSheetStrict(ss) {
  if (!ss) return null;

  // 1. Primary candidate from VTS_CONFIG
  if (VTS_CONFIG.MASTER_TAB_NAME) {
    var primary = ss.getSheetByName(VTS_CONFIG.MASTER_TAB_NAME);
    if (primary) return primary;
  }

  // 2. High priority named candidates ('950', '900', etc.)
  var candidates = ['950', '950 VTS', '950 tab', 'Fleet 950', '900', '900 VTS', 'Fleet 900', 'Master', 'Devices'];
  for (var i = 0; i < candidates.length; i++) {
    var s = ss.getSheetByName(candidates[i]);
    if (s) return s;
  }

  // 3. Case-insensitive & trimmed search across all tabs
  var allSheets = ss.getSheets();
  for (var j = 0; j < allSheets.length; j++) {
    var clean = allSheets[j].getName().trim().toLowerCase();
    if (clean === '950' || clean === '900' || clean.indexOf('950') > -1 || clean.indexOf('900') > -1) {
      return allSheets[j];
    }
  }

  // 4. Fallback filter: MUST NEVER select raw logs or non-fleet tabs!
  var excludedTabs = [
    'vts data', 'form responses', 'form responses 1', 'vts returns', 'users',
    'city_email_contacts', 'search_history', 'pivot table 5', 'search',
    'vendor vehicles', 'analysis', 'pivot table'
  ];

  for (var k = 0; k < allSheets.length; k++) {
    var sName = allSheets[k].getName().trim().toLowerCase();
    var isExcluded = false;
    for (var x = 0; x < excludedTabs.length; x++) {
      if (sName === excludedTabs[x] || sName.indexOf(excludedTabs[x]) > -1) {
        isExcluded = true;
        break;
      }
    }
    if (!isExcluded) {
      // Choose tab with reasonable fleet count (< 5,000 rows)
      if (allSheets[k].getLastRow() < 5000) {
        return allSheets[k];
      }
    }
  }

  return allSheets[0];
}

function normalizeUniqueid(val) {
  if (val === null || val === undefined) return '';
  var s = String(val).trim();
  if (s.indexOf('e') > -1 || s.indexOf('E') > -1) {
    var num = Number(val);
    if (!isNaN(num)) s = num.toFixed(0);
  }
  if (s.slice(-2) === '.0') s = s.slice(0, -2);
  return s.replace(/\s+/g, '');
}

function formatSheetDate(dateVal) {
  if (!dateVal) return '';
  var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
  };
  var d = null;

  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    d = dateVal;
  } else {
    var s = String(dateVal).trim();
    if (!s) return '';

    // Match "29-Aug-2026", "8-Sep-2026", "11 Sep 2026", "1 Nov 2025"
    var textMatch = s.match(/^(\d{1,2})[-/\s]+([A-Za-z]{3,9})[-/\s]+(\d{2,4})$/);
    if (textMatch) {
      var day = parseInt(textMatch[1], 10);
      var mKey = textMatch[2].toLowerCase().slice(0, 3);
      var mNum = monthMap[mKey];
      var yr = parseInt(textMatch[3], 10);
      if (yr < 100) yr += 2000;
      if (mNum !== undefined) {
        d = new Date(yr, mNum, day);
      }
    }

    if (!d) {
      var isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (isoMatch) {
        d = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
      }
    }

    if (!d) {
      var dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
      if (dmyMatch) {
        var y = parseInt(dmyMatch[3], 10);
        if (y < 100) y += 2000;
        d = new Date(y, parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
      }
    }

    if (!d) {
      var parsed = Date.parse(s);
      if (!isNaN(parsed)) d = new Date(parsed);
    }
  }

  if (d && !isNaN(d.getTime())) {
    return ('0' + d.getDate()).slice(-2) + ' ' + (monthNames[d.getMonth()] || 'Jan') + ' ' + d.getFullYear();
  }

  return String(dateVal).trim();
}

function getMonthYearLabel(dateVal) {
  var d = parseSheetDate(dateVal);
  if (!d) return '';
  var monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return monthNames[d.getMonth()] + ' ' + d.getFullYear();
}

function findColIndex(headers, variations) {
  if (!headers || !headers.length) return -1;
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    for (var v = 0; v < variations.length; v++) {
      if (h === variations[v].toLowerCase().trim()) return i;
    }
  }
  for (var j = 0; j < headers.length; j++) {
    var hj = headers[j];
    for (var k = 0; k < variations.length; k++) {
      if (hj.indexOf(variations[k].toLowerCase().trim()) > -1) return j;
    }
  }
  return -1;
}

function isUserAllowedForCity(userEmail, targetCity) {
  if (!userEmail) return true;
  var users = getUsersList();
  var email = userEmail.toLowerCase().trim();
  for (var i = 0; i < users.length; i++) {
    if (users[i].email.toLowerCase().trim() === email) {
      if (users[i].role === 'Admin') return true;
      var assigned = users[i].assignedCities.map(function(c) { return c.toLowerCase().trim(); });
      return assigned.indexOf(targetCity.toLowerCase().trim()) > -1;
    }
  }
  return true;
}

function getUsersList() {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return [];
    var sheet = ss.getSheetByName(VTS_CONFIG.USERS_TAB_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(VTS_CONFIG.USERS_TAB_NAME);
      sheet.appendRow(['Name', 'Email', 'Role', 'Assigned Cities', 'Password']);
      sheet.appendRow(['Krishna (Admin)', 'krishnaravtani.wevois@gmail.com', 'Admin', 'All', 'admin123']);
      sheet.appendRow(['Bhumika', 'bhumika@wevois.com', 'Manager', 'Reengus', 'manager123']);
    }
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    var users = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var name = String(row[0] || '').trim();
      var email = String(row[1] || '').trim();
      var role = String(row[2] || 'Manager').trim();
      var rawCities = String(row[3] || '').trim();
      var assignedCities = rawCities ? rawCities.split(',').map(function(c) { return c.trim(); }).filter(Boolean) : [];
      var password = String(row[4] || (role === 'Admin' ? 'admin123' : 'manager123')).trim();

      if (email) {
        users.push({
          name: name || email.split('@')[0],
          email: email,
          role: role === 'Admin' ? 'Admin' : 'Manager',
          assignedCities: assignedCities,
          password: password
        });
      }
    }
    return users;
  } catch (err) {
    return [];
  }
}

function saveUser(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = ss.getSheetByName(VTS_CONFIG.USERS_TAB_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(VTS_CONFIG.USERS_TAB_NAME);
      sheet.appendRow(['Name', 'Email', 'Role', 'Assigned Cities', 'Password']);
    }

    var targetEmail = String(payload.oldEmail || payload.email || '').toLowerCase().trim();
    var newEmail = String(payload.email || '').trim();
    var name = String(payload.name || '').trim();
    var role = payload.role === 'Admin' ? 'Admin' : 'Manager';
    var cities = Array.isArray(payload.assignedCities) ? payload.assignedCities.join(', ') : String(payload.assignedCities || '').trim();
    var password = String(payload.password || (role === 'Admin' ? 'admin123' : 'manager123')).trim();

    var data = sheet.getDataRange().getValues();
    var foundRow = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1] || '').toLowerCase().trim() === targetEmail) {
        foundRow = i + 1;
        break;
      }
    }

    if (foundRow > -1) {
      sheet.getRange(foundRow, 1, 1, 5).setValues([[name, newEmail, role, cities, password]]);
      return { success: true, message: 'User updated successfully!' };
    } else {
      sheet.appendRow([name, newEmail, role, cities, password]);
      return { success: true, message: 'User created successfully!' };
    }
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function sendWelcomeEmailToUser(payload) {
  try {
    var email = String(payload.email || '').trim();
    var name = String(payload.name || email).trim();
    var password = String(payload.password || 'manager123').trim();
    var role = String(payload.role || 'Manager').trim();
    var cities = Array.isArray(payload.assignedCities) ? payload.assignedCities.join(', ') : 'All Cities';
    var portalUrl = 'https://wevois-vts-fleet.web.app/';

    if (!email) return { success: false, error: 'No email provided' };

    var subject = '🚗 Your WeVois VTS Portal Access Credentials';
    var body = [
      'Dear ' + name + ',',
      '',
      'Your WeVois VTS Fleet Management Portal account has been created by the Admin.',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '  PORTAL LOGIN DETAILS',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '  Portal URL : ' + portalUrl,
      '  Email ID   : ' + email,
      '  Password   : ' + password,
      '  Role       : ' + role,
      (role === 'Manager' ? '  Cities     : ' + cities : '  Access     : Full Fleet (All Cities)'),
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'Please sign in and you will only see data for your assigned cities.',
      '',
      'If you have any issues, contact: krishnaravtani.wevois@gmail.com',
      '',
      'Regards,',
      'WeVois VTS Team'
    ].join('\n');

    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body
    });

    return { success: true, message: 'Welcome email sent to ' + email };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function deleteUser(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = ss.getSheetByName(VTS_CONFIG.USERS_TAB_NAME);
    if (!sheet) return { success: false, error: 'Users sheet not found' };

    var email = String(payload.email || '').toLowerCase().trim();
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1] || '').toLowerCase().trim() === email) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'User deleted successfully!' };
      }
    }
    return { success: false, error: 'User not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function addNewDevice(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = getMasterSheetStrict(ss);

    var cleanImei = normalizeUniqueid(payload.imei || payload.uniqueid);
    var cleanSim = normalizeUniqueid(payload.sim || payload.phone);
    if (!cleanImei) return { success: false, error: 'IMEI (Uniqueid) is required' };

    var data = sheet.getDataRange().getValues();
    var headers = data.length > 0 ? data[0].map(function(h) { return String(h).trim().toLowerCase(); }) : [];
    var idxImei = findColIndex(headers, ['uniqueid', 'imei', 'device id']);
    if (idxImei === -1) idxImei = 2;

    for (var i = 1; i < data.length; i++) {
      if (normalizeUniqueid(data[i][idxImei]) === cleanImei) {
        return { success: false, error: 'A device with IMEI ' + cleanImei + ' already exists in row ' + (i + 1) };
      }
    }

    var nextSr = sheet.getLastRow();
    var newRow = sheet.getLastRow() + 1;

    sheet.getRange(newRow, 3).setNumberFormat('@');
    if (cleanSim) sheet.getRange(newRow, 4).setNumberFormat('@');

    sheet.getRange(newRow, 1, 1, 12).setValues([[
      nextSr,
      String(payload.vehicle || payload.name || '').trim(),
      cleanImei,
      cleanSim,
      String(payload.city || 'Other').trim(),
      'New (Not on Roadcast)',
      formatSheetDate(new Date()),
      '', // Col H (Final Status): preserved with formula below
      String(payload.vtsType || 'VTS Package 4G').trim(),
      String(payload.remark || 'Added via Web App').trim(),
      'RUNNING',
      payload.licenseEnd ? formatSheetDate(payload.licenseEnd) : ''
    ]]);

    // Preserve Column H formula from the row above if present
    try {
      if (newRow > 2) {
        var prevFormulaR1C1 = sheet.getRange(newRow - 1, 8).getFormulaR1C1();
        if (prevFormulaR1C1) {
          sheet.getRange(newRow, 8).setFormulaR1C1(prevFormulaR1C1);
        } else {
          sheet.getRange(newRow, 8).setValue('RUNNING');
        }
      }
    } catch (fErr) {
      Logger.log('Could not copy Column H formula: ' + fErr);
    }

    return {
      success: true,
      message: 'Device ' + cleanImei + ' added successfully!',
      device: {
        sr: nextSr,
        vehicle: payload.vehicle || payload.name,
        imei: cleanImei,
        sim: cleanSim,
        city: payload.city,
        licenseEnd: payload.licenseEnd ? formatSheetDate(payload.licenseEnd) : ''
      }
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function updateRoadcastStatusBatch(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = getMasterSheetStrict(ss);
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: false, error: 'Master Sheet is empty' };

    var updates = payload.updates || [];
    var updateMap = {};
    for (var u = 0; u < updates.length; u++) {
      var item = updates[u];
      if (item && item.uniqueid) {
        var cleanId = normalizeUniqueid(item.uniqueid);
        if (cleanId) {
          updateMap[cleanId] = {
            status: item.status || 'Active',
            lastUpdate: item.lastUpdate || '',
            name: item.name ? String(item.name).trim() : '',
            phone: item.phone ? String(item.phone).trim() : '',
            licenseEnd: item.licenseEnd ? formatSheetDate(item.licenseEnd) : ''
          };
        }
      }
    }

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxName = findColIndex(headers, ['name', 'vehicle']);
    var idxImei = findColIndex(headers, ['uniqueid', 'imei']);
    var idxPhone = findColIndex(headers, ['phone', 'sim']);
    var idxRoadcast = findColIndex(headers, ['status on roadcast', 'roadcast status']);
    var idxLastUpdate = findColIndex(headers, ['last update', 'last updated']);
    var idxLicenseEnd = findColIndex(headers, ['license end', 'end date', 'expiry']);

    if (idxName === -1) idxName = 1;
    if (idxImei === -1) idxImei = 2;
    if (idxPhone === -1) idxPhone = 3;
    if (idxRoadcast === -1) idxRoadcast = 5;
    if (idxLastUpdate === -1) idxLastUpdate = 6;
    if (idxLicenseEnd === -1) idxLicenseEnd = 11;

    var updatedCount = 0;
    var renewedLicenseCount = 0;
    var numRows = data.length - 1;
    var nameCols = [], phoneCols = [], statusCols = [], dateCols = [], licenseCols = [];
    var hasName = false, hasPhone = false, hasLicense = false;

    for (var r = 1; r < data.length; r++) {
      var rowImei = normalizeUniqueid(data[r][idxImei]);
      var cName = data[r][idxName], cPhone = data[r][idxPhone], cStatus = data[r][idxRoadcast];
      var cDate = data[r][idxLastUpdate];
      var cLicense = idxLicenseEnd < data[r].length ? data[r][idxLicenseEnd] : '';
      var cLicenseFormatted = formatSheetDate(cLicense);

      if (rowImei && updateMap.hasOwnProperty(rowImei)) {
        var m = updateMap[rowImei];
        var nStatus = m.status;
        var nDate = m.lastUpdate || cDate;
        var nName = m.name || cName;
        var nPhone = m.phone || cPhone;
        var nLicense = m.licenseEnd || cLicenseFormatted;

        if (m.name && m.name !== cName) hasName = true;
        if (m.phone && m.phone !== cPhone) hasPhone = true;
        if (m.licenseEnd && m.licenseEnd !== cLicenseFormatted) {
          hasLicense = true;
          renewedLicenseCount++;
        }

        nameCols.push([nName]);
        phoneCols.push([nPhone]);
        statusCols.push([nStatus]);
        dateCols.push([nDate]);
        licenseCols.push([nLicense]);
        updatedCount++;
      } else {
        nameCols.push([cName]);
        phoneCols.push([cPhone]);
        statusCols.push([cStatus]);
        dateCols.push([cDate]);
        licenseCols.push([cLicenseFormatted]);
      }
    }

    if (numRows > 0) {
      if (hasName) sheet.getRange(2, idxName + 1, numRows, 1).setValues(nameCols);
      if (hasPhone) sheet.getRange(2, idxPhone + 1, numRows, 1).setValues(phoneCols);
      sheet.getRange(2, idxRoadcast + 1, numRows, 1).setValues(statusCols);
      sheet.getRange(2, idxLastUpdate + 1, numRows, 1).setValues(dateCols);
      if (hasLicense) sheet.getRange(2, idxLicenseEnd + 1, numRows, 1).setValues(licenseCols);
    }

    // Auto-update 'Renewal done month wise' sheet tab if any renewed licenses are present
    var cycleUpdatedCount = 0;
    try {
      if (hasLicense) {
        var cycleSS = openRenewalSheetStrict();
        if (cycleSS) {
          var activeTab = PropertiesService.getScriptProperties().getProperty('ACTIVE_RENEWAL_CYCLE_TAB');
          var sheetsToScan = [];
          if (activeTab) {
            var activeS = cycleSS.getSheetByName(activeTab);
            if (activeS) sheetsToScan.push(activeS);
          }
          var allSheets = cycleSS.getSheets();
          for (var sh = allSheets.length - 1; sh >= 0; sh--) {
            if (sheetsToScan.indexOf(allSheets[sh]) === -1) {
              sheetsToScan.push(allSheets[sh]);
            }
          }

          var alreadyUpdatedImeis = {};
          for (var sIdx = 0; sIdx < sheetsToScan.length; sIdx++) {
            var cycleSheet = sheetsToScan[sIdx];
            var cycleData = cycleSheet.getDataRange().getValues();
            if (cycleData.length <= 1) continue;

            var cycleHeaders = cycleData[0].map(function(h) { return String(h).trim().toLowerCase(); });
            var idxCycleImei = findColIndex(cycleHeaders, ['uniqueid', 'imei']);
            var idxCycleRecharge = findColIndex(cycleHeaders, ['rechage status', 'recharge status']);
            var idxCycleNewLic = findColIndex(cycleHeaders, ['new license end', 'new lic end']);
            var idxCycleStatus = findColIndex(cycleHeaders, ['status', 'done status']);
            if (idxCycleImei === -1) idxCycleImei = 2;
            if (idxCycleRecharge === -1) idxCycleRecharge = 7;
            if (idxCycleNewLic === -1) idxCycleNewLic = 8;
            if (idxCycleStatus === -1) idxCycleStatus = 9;

            for (var cr = 1; cr < cycleData.length; cr++) {
              var cImei = normalizeUniqueid(cycleData[cr][idxCycleImei]);
              if (cImei && updateMap.hasOwnProperty(cImei) && updateMap[cImei].licenseEnd && !alreadyUpdatedImeis[cImei]) {
                var freshLic = updateMap[cImei].licenseEnd;
                // Update Renewal Sheet: Col H: 'Yes', Col I: New License End, Col J: 'Done'
                cycleSheet.getRange(cr + 1, idxCycleRecharge + 1).setValue('Yes');
                cycleSheet.getRange(cr + 1, idxCycleNewLic + 1).setValue(freshLic);
                cycleSheet.getRange(cr + 1, idxCycleStatus + 1).setValue('Done');
                alreadyUpdatedImeis[cImei] = true;
                cycleUpdatedCount++;
              }
            }
          }
        }
      }
    } catch (cycleErr) {
      Logger.log('Notice: Auto renewal sheet sync skipped: ' + cycleErr);
    }

    var resultMsg = 'Successfully updated ' + updatedCount + ' devices on Master Sheet.';
    if (renewedLicenseCount > 0) {
      resultMsg += ' Updated ' + renewedLicenseCount + ' License End date(s) (Col L).';
    }
    if (cycleUpdatedCount > 0) {
      resultMsg += ' Marked ' + cycleUpdatedCount + ' renewed vehicle(s) as "Done" in Renewal Month Sheet!';
    }

    return {
      success: true,
      message: resultMsg,
      updatedCount: updatedCount,
      renewedLicenseCount: renewedLicenseCount,
      cycleUpdatedCount: cycleUpdatedCount
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function updateDeviceRemark(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = getMasterSheetStrict(ss);
    var data = sheet.getDataRange().getValues();

    var targetImei = normalizeUniqueid(payload.uniqueid || payload.imei);
    var newRemark = String(payload.remark || '').trim();

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxImei = findColIndex(headers, ['uniqueid', 'imei']);
    var idxRemark = findColIndex(headers, ['remark', 'remarks', 'general remark']);

    if (idxImei === -1) idxImei = 2;
    if (idxRemark === -1) idxRemark = 9;

    for (var i = 1; i < data.length; i++) {
      if (normalizeUniqueid(data[i][idxImei]) === targetImei) {
        sheet.getRange(i + 1, idxRemark + 1).setValue(newRemark);
        return { success: true, message: 'Remark updated successfully for device ' + targetImei };
      }
    }
    return { success: false, error: 'Device ' + targetImei + ' not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function updateDeviceDetails(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = getMasterSheetStrict(ss);
    var data = sheet.getDataRange().getValues();

    var targetImei = normalizeUniqueid(payload.uniqueid || payload.imei);
    if (!targetImei) return { success: false, error: 'IMEI is required' };

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxName = findColIndex(headers, ['name', 'vehicle']);
    var idxImei = findColIndex(headers, ['uniqueid', 'imei']);
    var idxPhone = findColIndex(headers, ['phone', 'sim']);
    var idxCity = findColIndex(headers, ['city', 'site', 'project']);
    var idxVtsType = findColIndex(headers, ['vts type', 'type']);
    var idxRemark = findColIndex(headers, ['remark', 'remarks']);

    if (idxName === -1) idxName = 1;
    if (idxImei === -1) idxImei = 2;
    if (idxPhone === -1) idxPhone = 3;
    if (idxCity === -1) idxCity = 4;
    if (idxVtsType === -1) idxVtsType = 8;
    if (idxRemark === -1) idxRemark = 9;

    for (var i = 1; i < data.length; i++) {
      if (normalizeUniqueid(data[i][idxImei]) === targetImei) {
        var rowNum = i + 1;
        if (payload.vehicle !== undefined) sheet.getRange(rowNum, idxName + 1).setValue(String(payload.vehicle).trim());
        if (payload.sim !== undefined) {
          var cleanSim = normalizeUniqueid(payload.sim);
          sheet.getRange(rowNum, idxPhone + 1).setNumberFormat('@').setValue(cleanSim);
        }
        if (payload.city !== undefined) sheet.getRange(rowNum, idxCity + 1).setValue(String(payload.city).trim());
        if (payload.vtsType !== undefined) sheet.getRange(rowNum, idxVtsType + 1).setValue(String(payload.vtsType).trim());
        if (payload.remark !== undefined) sheet.getRange(rowNum, idxRemark + 1).setValue(String(payload.remark).trim());

        // Multi-Tab Sync: Also update this vehicle's Name, Phone, and City across all Renewal Sheets!
        var syncedCycleTabs = [];
        try {
          var cycleSS = openRenewalSheetStrict();
          if (cycleSS) {
            var cycleSheets = cycleSS.getSheets();
            for (var s = 0; s < cycleSheets.length; s++) {
              var cSheet = cycleSheets[s];
              var cName = cSheet.getName();
              if (['900', 'Users', 'Renewal Log', 'Form Responses 1', 'VTS Returns'].indexOf(cName) > -1) continue;

              var cData = cSheet.getDataRange().getValues();
              if (cData.length <= 1) continue;

              // Standard Renewal Sheet Columns: Col B: Name, Col C: Uniqueid, Col D: Phone, Col F: City
              for (var cr = 1; cr < cData.length; cr++) {
                if (normalizeUniqueid(cData[cr][2]) === targetImei) {
                  var cRowNum = cr + 1;
                  if (payload.vehicle !== undefined) {
                    cSheet.getRange(cRowNum, 2).setValue(String(payload.vehicle).trim());
                  }
                  if (payload.sim !== undefined) {
                    cSheet.getRange(cRowNum, 4).setNumberFormat('@').setValue(normalizeUniqueid(payload.sim));
                  }
                  if (payload.city !== undefined) {
                    cSheet.getRange(cRowNum, 6).setValue(String(payload.city).trim());
                  }
                  syncedCycleTabs.push(cName);
                  break;
                }
              }
            }
          }
        } catch (cycleErr) {
          Logger.log('Notice syncing renewal sheets: ' + cycleErr.toString());
        }

        var extraInfo = syncedCycleTabs.length > 0 ? (' & synced to renewal tabs: ' + syncedCycleTabs.join(', ')) : '';
        return { success: true, message: 'Details updated successfully for device ' + targetImei + ' in Master 900 tab' + extraInfo };
      }
    }
    return { success: false, error: 'Device ' + targetImei + ' not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function updateDeviceLicenseEnd(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = getMasterSheetStrict(ss);
    var data = sheet.getDataRange().getValues();

    var targetImei = normalizeUniqueid(payload.uniqueid || payload.imei);
    var formattedDate = formatSheetDate(payload.licenseEnd);

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxImei = findColIndex(headers, ['uniqueid', 'imei']);
    var idxLicenseEnd = findColIndex(headers, ['license end', 'license end date', 'expiry']);

    if (idxImei === -1) idxImei = 2;
    if (idxLicenseEnd === -1) idxLicenseEnd = 11;

    for (var i = 1; i < data.length; i++) {
      if (normalizeUniqueid(data[i][idxImei]) === targetImei) {
        sheet.getRange(i + 1, idxLicenseEnd + 1).setValue(formattedDate);
        return { success: true, message: 'License End updated for ' + targetImei + ' to ' + formattedDate };
      }
    }
    return { success: false, error: 'Device ' + targetImei + ' not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function updateRenewalDecision(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = getMasterSheetStrict(ss);
    var data = sheet.getDataRange().getValues();

    var targetImei = normalizeUniqueid(payload.uniqueid || payload.imei);
    var decision = String(payload.decision || payload.renewalDecision || 'Pending').trim();
    var remark = String(payload.remark || payload.renewalRemark || '').trim();

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxImei = findColIndex(headers, ['uniqueid', 'imei']);
    var idxDecision = findColIndex(headers, ['renewal decision', 'decision']);
    var idxDecisionRemark = findColIndex(headers, ['renewal remark', 'decision remark']);
    var idxLastCol = headers.length;

    if (idxImei === -1) idxImei = 2;
    if (idxDecision === -1) {
      idxDecision = idxLastCol;
      sheet.getRange(1, idxDecision + 1).setValue('Renewal Decision');
      idxLastCol++;
    }
    if (idxDecisionRemark === -1) {
      idxDecisionRemark = idxLastCol;
      sheet.getRange(1, idxDecisionRemark + 1).setValue('Renewal Remark');
    }

    for (var i = 1; i < data.length; i++) {
      if (normalizeUniqueid(data[i][idxImei]) === targetImei) {
        var rowNum = i + 1;
        sheet.getRange(rowNum, idxDecision + 1).setValue(decision);
        if (remark) sheet.getRange(rowNum, idxDecisionRemark + 1).setValue(remark);

        if (decision === 'No' && remark) {
          appendRenewalLogEntry(ss, {
            uniqueid: targetImei,
            vehicle: String(data[i][1] || '').trim(),
            oldLicenseEnd: formatSheetDate(data[i][11]),
            newLicenseEnd: 'RENEWAL DECLINED',
            dateLogged: formatSheetDate(new Date()),
            monthLabel: getMonthYearLabel(data[i][11] || new Date()),
            decision: 'No',
            remark: remark
          });
        }

        // Live reflect decision in active cycle tab of 'Renewal done month wise' spreadsheet
        try {
          var cycleSS = openRenewalSheetStrict();
          if (cycleSS) {
            var activeTabName = payload.activeTab || payload.tabName || PropertiesService.getScriptProperties().getProperty('ACTIVE_RENEWAL_CYCLE_TAB');
            var cycleSheet = activeTabName ? cycleSS.getSheetByName(activeTabName) : null;
            if (!cycleSheet) {
              var allTabs = cycleSS.getSheets();
              if (allTabs.length > 0) cycleSheet = allTabs[allTabs.length - 1];
            }
            if (cycleSheet) {
              var cycleData = cycleSheet.getDataRange().getValues();
              var foundInCycle = false;
              for (var cr = 1; cr < cycleData.length; cr++) {
                var cImei = normalizeUniqueid(cycleData[cr][2]); // Col C (Uniqueid)
                if (cImei === targetImei) {
                  foundInCycle = true;
                  if (remark !== undefined && remark !== null && remark !== '') {
                    cycleSheet.getRange(cr + 1, 7).setValue(remark); // Col G (Remark - fresh remark)
                  }
                  if (decision) {
                    cycleSheet.getRange(cr + 1, 8).setValue(decision); // Col H (Rechage status)
                  }
                  if (decision === 'Yes') {
                    var curLicRaw = formatSheetDate(cycleData[cr][4]); // Col E (Col 5): License End
                    var providedNewLic = payload.newLicenseEnd ? formatSheetDate(payload.newLicenseEnd) : '';
                    var existingNewLic = cycleData[cr][8] ? formatSheetDate(cycleData[cr][8]) : '';
                    var candidateLic = providedNewLic || existingNewLic;

                    if (candidateLic && candidateLic !== curLicRaw) {
                      cycleSheet.getRange(cr + 1, 9).setValue(candidateLic); // Col I (New License End)
                      cycleSheet.getRange(cr + 1, 10).setValue('Done'); // Col J (Status)
                    } else {
                      cycleSheet.getRange(cr + 1, 9).setValue(''); // Col I is blank until genuine new date arrives
                      cycleSheet.getRange(cr + 1, 10).setValue('Not Done'); // Col J is 'Not Done' until genuine new date arrives
                    }
                  } else if (decision === 'No') {
                    cycleSheet.getRange(cr + 1, 9).setValue(''); // Col I (blank when denied)
                    cycleSheet.getRange(cr + 1, 10).setValue('Not Done'); // Col J (Not Done)
                  } else if (decision === 'Pending') {
                    cycleSheet.getRange(cr + 1, 9).setValue('');
                    cycleSheet.getRange(cr + 1, 10).setValue('Pending');
                  }
                  break;
                }
              }

              // If vehicle was NOT found in active renewal cycle sheet, append it automatically!
              if (!foundInCycle && activeTabName) {
                var nextSr = cycleData.length;
                var devName = String(data[i][1] || '').trim();
                var devPhone = normalizeUniqueid(data[i][3] || data[i][4] || '');
                var devLicEnd = formatSheetDate(data[i][11] || '');
                var devCity = String(data[i][6] || data[i][5] || '').trim();
                var providedNewLic = payload.newLicenseEnd ? formatSheetDate(payload.newLicenseEnd) : '';
                var candidateLic = (providedNewLic && providedNewLic !== devLicEnd) ? providedNewLic : '';
                var appendStatusDone = 'Pending';
                if (decision === 'Yes') {
                  appendStatusDone = candidateLic ? 'Done' : 'Not Done';
                } else if (decision === 'No') {
                  appendStatusDone = 'Not Done';
                  candidateLic = '';
                }

                cycleSheet.appendRow([
                  nextSr,
                  devName,
                  targetImei,
                  devPhone,
                  devLicEnd,
                  devCity,
                  remark || '',
                  decision || 'Pending',
                  candidateLic || '',
                  appendStatusDone
                ]);

                var lastRow = cycleSheet.getLastRow();
                cycleSheet.getRange(lastRow, 3).setNumberFormat('@');
                cycleSheet.getRange(lastRow, 4).setNumberFormat('@');
              }
            }
          }
        } catch (syncErr) {
          Logger.log('Notice: Could not sync to renewal cycle tab: ' + syncErr);
        }

        return { success: true, message: 'Renewal decision recorded for ' + targetImei + ': ' + decision };
      }
    }
    return { success: false, error: 'Device ' + targetImei + ' not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function markDeviceRenewed(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = getMasterSheetStrict(ss);
    var data = sheet.getDataRange().getValues();

    var targetImei = normalizeUniqueid(payload.uniqueid || payload.imei);
    var newLicenseEnd = formatSheetDate(payload.newLicenseEnd);
    var note = String(payload.note || '').trim();

    if (!targetImei || !newLicenseEnd) {
      return { success: false, error: 'Uniqueid and new License End date are required' };
    }

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxImei = findColIndex(headers, ['uniqueid', 'imei']);
    var idxName = findColIndex(headers, ['name', 'vehicle']);
    var idxLicenseEnd = findColIndex(headers, ['license end', 'license end date', 'expiry']);
    var idxDecision = findColIndex(headers, ['renewal decision', 'decision']);
    var idxDecisionRemark = findColIndex(headers, ['renewal remark', 'decision remark']);

    if (idxImei === -1) idxImei = 2;
    if (idxName === -1) idxName = 1;
    if (idxLicenseEnd === -1) idxLicenseEnd = 11;

    for (var i = 1; i < data.length; i++) {
      if (normalizeUniqueid(data[i][idxImei]) === targetImei) {
        var rowNum = i + 1;
        var vehicleName = String(data[i][idxName] || '').trim();
        var oldLicenseEnd = formatSheetDate(data[i][idxLicenseEnd]);

        sheet.getRange(rowNum, idxLicenseEnd + 1).setValue(newLicenseEnd);

        if (idxDecision > -1) sheet.getRange(rowNum, idxDecision + 1).setValue('Renewed');
        if (idxDecisionRemark > -1 && note) sheet.getRange(rowNum, idxDecisionRemark + 1).setValue(note);

        appendRenewalLogEntry(ss, {
          uniqueid: targetImei,
          vehicle: vehicleName,
          oldLicenseEnd: oldLicenseEnd,
          newLicenseEnd: newLicenseEnd,
          dateLogged: formatSheetDate(new Date()),
          monthLabel: getMonthYearLabel(oldLicenseEnd || new Date()),
          decision: 'Renewed',
          remark: note || 'Renewed with Roadcast'
        });

        return {
          success: true,
          message: 'Device ' + targetImei + ' marked renewed. License End updated to ' + newLicenseEnd + '.',
          oldLicenseEnd: oldLicenseEnd,
          newLicenseEnd: newLicenseEnd
        };
      }
    }
    return { success: false, error: 'Device ' + targetImei + ' not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function appendRenewalLogEntry(ss, entry) {
  try {
    var logSheet = ss.getSheetByName(VTS_CONFIG.RENEWAL_LOG_TAB_NAME);
    if (!logSheet) {
      logSheet = ss.insertSheet(VTS_CONFIG.RENEWAL_LOG_TAB_NAME);
      logSheet.appendRow(['Uniqueid', 'Vehicle Name', 'Old License End', 'New License End', 'Date Logged', 'Batch Month', 'Decision', 'Remark']);
    }
    var cleanImei = normalizeUniqueid(entry.uniqueid);
    var newRow = logSheet.getLastRow() + 1;
    logSheet.getRange(newRow, 1).setNumberFormat('@');
    logSheet.getRange(newRow, 1, 1, 8).setValues([[
      cleanImei,
      String(entry.vehicle || '').trim(),
      formatSheetDate(entry.oldLicenseEnd),
      formatSheetDate(entry.newLicenseEnd),
      formatSheetDate(entry.dateLogged || new Date()),
      String(entry.monthLabel || '').trim(),
      String(entry.decision || 'Yes').trim(),
      String(entry.remark || '').trim()
    ]]);
  } catch (e) {}
}

function archiveRenewalList(payload) {
  try {
    var devices = payload.devices || [];
    var monthLabel = String(payload.monthLabel || getMonthYearLabel(new Date())).trim();
    var folderName = VTS_CONFIG.DRIVE_ARCHIVE_FOLDER_NAME;

    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var fileName = 'VTS Renewal Snapshot — ' + monthLabel + ' (' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy-MM-dd HHmm') + ')';
    var newSS = SpreadsheetApp.create(fileName);
    var newSheet = newSS.getSheets()[0];
    newSheet.setName(monthLabel);

    var headers = ['SR.', 'Vehicle Name', 'Uniqueid (IMEI)', 'Phone (SIM)', 'City', 'License End Date', 'Decision', 'Manager / Decision Remark', 'Status on Roadcast', 'Final Status'];
    newSheet.appendRow(headers);

    var rows = [];
    for (var i = 0; i < devices.length; i++) {
      var d = devices[i];
      rows.push([
        i + 1,
        String(d.vehicle || d.name || '').trim(),
        normalizeUniqueid(d.imei || d.uniqueid),
        normalizeUniqueid(d.sim || d.phone),
        String(d.city || '').trim(),
        formatSheetDate(d.licenseEnd),
        String(d.renewalDecision || d.decision || 'Pending').trim(),
        String(d.renewalRemark || d.remark || '').trim(),
        String(d.roadcastStatus || 'Active').trim(),
        String(d.finalStatus || '—').trim()
      ]);
    }

    if (rows.length > 0) {
      newSheet.getRange(2, 3, rows.length, 1).setNumberFormat('@');
      newSheet.getRange(2, 4, rows.length, 1).setNumberFormat('@');
      newSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }

    var driveFile = DriveApp.getFileById(newSS.getId());
    folder.addFile(driveFile);
    DriveApp.getRootFolder().removeFile(driveFile);

    return {
      success: true,
      message: 'Renewal batch archived to Google Drive successfully!',
      fileUrl: newSS.getUrl(),
      fileName: fileName,
      rowCount: devices.length
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function getRenewalArchiveList() {
  try {
    var folderName = VTS_CONFIG.DRIVE_ARCHIVE_FOLDER_NAME;
    var folders = DriveApp.getFoldersByName(folderName);
    if (!folders.hasNext()) return [];
    var folder = folders.next();
    var files = folder.getFiles();
    var list = [];

    while (files.hasNext()) {
      var f = files.next();
      list.push({
        id: f.getId(),
        name: f.getName(),
        url: f.getUrl(),
        createdDate: Utilities.formatDate(f.getDateCreated(), Session.getScriptTimeZone() || 'Asia/Kolkata', 'dd MMM yyyy HH:mm'),
        size: Math.round(f.getSize() / 1024) + ' KB'
      });
    }
    list.sort(function(a, b) { return b.name.localeCompare(a.name); });
    return list;
  } catch (err) {
    return [];
  }
}

/**
 * Strict opener for 'Renewal done month wise' Google Sheet
 * Automatically tests common OCR permutations (lowercase l vs uppercase I vs 1, etc.)
 */
function openRenewalSheetStrict() {
  var props = PropertiesService.getScriptProperties();
  var storedUrl = props.getProperty('RENEWAL_MONTH_WISE_SHEET_URL') || props.getProperty('RENEWAL_MONTH_WISE_SHEET_ID');
  if (storedUrl && storedUrl.indexOf('TRIHs') > -1) {
    props.deleteProperty('RENEWAL_MONTH_WISE_SHEET_URL');
    props.deleteProperty('RENEWAL_MONTH_WISE_SHEET_ID');
    storedUrl = null;
  }
  
  var candidateList = [];
  if (storedUrl) candidateList.push(storedUrl);
  if (VTS_CONFIG.RENEWAL_MONTH_WISE_SHEET_ID) candidateList.push(VTS_CONFIG.RENEWAL_MONTH_WISE_SHEET_ID);
  
  // OCR permutations to test automatically:
  candidateList.push('1GjJ8ewJPz_1F6xil8qdklgTRHsDe21xtbw5-dt2x2Ug'); // with lowercase 'l'
  candidateList.push('1GjJ8ewJPz_1F6xiI8qdklgTRHsDe21xtbw5-dt2x2Ug'); // with uppercase 'I'
  candidateList.push('1GjJ8ewJPz_1F6xi18qdklgTRHsDe21xtbw5-dt2x2Ug'); // with digit '1'
  candidateList.push('1GjJ8ewJPz_1F6xIL8qdklgTRHsDe21xtbw5-dt2x2Ug');
  candidateList.push('1GjJ8ewJPz_1F6xIl8qdklgTRHsDe21xtbw5-dt2x2Ug');
  candidateList.push('1GjJ8ewJPz-1F6xil8qdklgTRHsDe21xtbw5-dt2x2Ug');
  candidateList.push('1GjJ8ewJPz-1F6xiI8qdklgTRHsDe21xtbw5-dt2x2Ug');
  candidateList.push('1GjJ8ewJPz_1F6xil8qdklgTRHsDe21xtbw5_dt2x2Ug');

  var lastErr = null;
  for (var i = 0; i < candidateList.length; i++) {
    var raw = String(candidateList[i]).trim();
    if (!raw) continue;
    try {
      var ss = null;
      if (raw.indexOf('http') === 0) {
        ss = SpreadsheetApp.openByUrl(raw);
      } else {
        var match = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
        var cleanId = match ? match[1] : raw;
        ss = SpreadsheetApp.openById(cleanId);
      }
      if (ss) {
        // Save the working URL into ScriptProperties so it's cached permanently!
        props.setProperty('RENEWAL_MONTH_WISE_SHEET_URL', ss.getUrl());
        props.setProperty('RENEWAL_MONTH_WISE_SHEET_ID', ss.getId());
        return ss;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error('Could not open "Renewal done month wise" Google Sheet. Please paste the full URL from your browser address bar into VTS_CONFIG.RENEWAL_MONTH_WISE_SHEET_ID in Code.gs. Last error: ' + (lastErr ? lastErr.toString() : 'Unknown'));
}

/**
 * 1-Click Test Function to verify connection to 'Renewal done month wise' sheet
 */
function testOpenRenewalSheet() {
  var ss = openRenewalSheetStrict();
  var sheets = ss.getSheets();
  var names = sheets.map(function(s) { return s.getName(); });
  Logger.log("🎉 SUCCESS! Connected to: " + ss.getName() + " (URL: " + ss.getUrl() + ")");
  Logger.log("Existing Tabs (" + names.length + "): " + names.join(", "));
  return { success: true, name: ss.getName(), url: ss.getUrl(), tabs: names };
}

/**
 * Helper to manually set the URL from Apps Script editor or API
 */
function testSetRenewalSheetUrl(url) {
  var targetUrl = url || 'https://docs.google.com/spreadsheets/d/1GjJ8ewJPz_1F6xil8qdklgTRHsDe21xtbw5-dt2x2Ug/edit';
  return setRenewalSheetUrl({ url: targetUrl });
}

function setRenewalSheetUrl(payload) {
  try {
    var rawUrl = String(payload.url || payload.sheetUrl || payload.id || '').trim();
    if (!rawUrl) return { success: false, error: 'URL or ID is required' };
    var ss = null;
    if (rawUrl.indexOf('http') === 0) {
      ss = SpreadsheetApp.openByUrl(rawUrl);
    } else {
      var match = rawUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      var cleanId = match ? match[1] : rawUrl;
      ss = SpreadsheetApp.openById(cleanId);
    }
    if (!ss) return { success: false, error: 'Failed to open spreadsheet' };

    var props = PropertiesService.getScriptProperties();
    props.setProperty('RENEWAL_MONTH_WISE_SHEET_URL', ss.getUrl());
    props.setProperty('RENEWAL_MONTH_WISE_SHEET_ID', ss.getId());

    return {
      success: true,
      message: 'Successfully linked to spreadsheet: "' + ss.getName() + '"!',
      name: ss.getName(),
      id: ss.getId(),
      url: ss.getUrl(),
      tabs: ss.getSheets().map(function(s) { return s.getName(); })
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Get all available tabs and active tab decisions from 'Renewal done month wise' sheet
 */
function getRenewalCycleTabs(targetTabName) {
  try {
    var ss = openRenewalSheetStrict();
    if (!ss) return { success: false, error: 'Could not open Renewal Month Wise Sheet' };

    var sheets = ss.getSheets();
    var tabNames = [];
    for (var i = 0; i < sheets.length; i++) {
      var sName = sheets[i].getName();
      // Exclude any Master Sheet tabs
      if (['900', 'VTS Data', 'Users', 'City_Email_Contacts', 'Search_History', 'Pivot Table 5', 'Search', 'Vendor Vehicles', 'analysis'].indexOf(sName) === -1) {
        tabNames.push(sName);
      }
    }

    var props = PropertiesService.getScriptProperties();
    var savedActiveTab = props.getProperty('ACTIVE_RENEWAL_CYCLE_TAB');

    function matchTabName(name, list) {
      if (!name || !list) return null;
      var clean = String(name).trim().toLowerCase().replace(/sept/g, 'sep').replace(/\s+/g, ' ');
      for (var i = 0; i < list.length; i++) {
        var cand = String(list[i]).trim().toLowerCase().replace(/sept/g, 'sep').replace(/\s+/g, ' ');
        if (cand === clean) return list[i];
      }
      return null;
    }

    var matchedTarget = matchTabName(targetTabName, tabNames);
    var matchedSaved = matchTabName(savedActiveTab, tabNames);

    var activeTab = matchedTarget || matchedSaved || (tabNames.length > 0 ? tabNames[tabNames.length - 1] : '');
    if (activeTab) {
      props.setProperty('ACTIVE_RENEWAL_CYCLE_TAB', activeTab);
    }

    var carryoverRaw = props.getProperty('NEXT_SESSION_CARRYOVER_IMEIS') || '[]';
    var carryoverImeis = [];
    try { carryoverImeis = JSON.parse(carryoverRaw); } catch(e) {}

    // Read active sheet decisions (Col C: Uniqueid, Col G: Remark, Col H: Rechage status, Col I: New License End, Col J: Status)
    var decisions = {};
    var recordsByImei = {};
    var sheetCounts = { yes: 0, no: 0, blank: 0, total: 0 };
    var activeSheet = activeTab ? ss.getSheetByName(activeTab) : null;

    if (activeSheet) {
      var data = activeSheet.getDataRange().getValues();
      if (data.length > 1) {
        var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
        var idxSr = findColIndex(headers, ['sr.', 'sr', 'sr no', 's.no']);
        var idxName = findColIndex(headers, ['name', 'vehicle']);
        var idxImei = findColIndex(headers, ['uniqueid', 'imei', 'device id', 'unique id']);
        var idxPhone = findColIndex(headers, ['phone', 'sim']);
        var idxLicEnd = findColIndex(headers, ['license end', 'license end date', 'expiry']);
        var idxCity = findColIndex(headers, ['city']);
        var idxRemark = findColIndex(headers, ['remark', 'remarks', 'city remark', 'manager remark']);
        var idxStatus = findColIndex(headers, ['rechage status', 'recharge status', 'recharge', 'decision']);
        var idxNewLic = findColIndex(headers, ['new license end', 'new lic end', 'new license']);
        var idxDone = findColIndex(headers, ['status', 'done status']);

        if (idxSr === -1) idxSr = 0;
        if (idxName === -1) idxName = 1;
        if (idxImei === -1) idxImei = 2; // default Col C
        if (idxPhone === -1) idxPhone = 3;
        if (idxLicEnd === -1) idxLicEnd = 4;
        if (idxCity === -1) idxCity = 5;
        if (idxRemark === -1 && headers.length >= 7) idxRemark = 6; // Col G
        if (idxStatus === -1 && headers.length >= 8) idxStatus = 7; // Col H
        if (idxNewLic === -1 && headers.length >= 9) idxNewLic = 8; // Col I
        if (idxDone === -1 && headers.length >= 10) idxDone = 9; // Col J

        var sheetDevices = [];
        for (var r = 1; r < data.length; r++) {
          var imei = normalizeUniqueid(data[r][idxImei]);
          if (!imei) continue;
          var raw = idxStatus > -1 ? String(data[r][idxStatus] || '').trim().toLowerCase() : '';
          var dec = 'Pending';
          if (raw === 'yes' || raw === 'approved') {
            dec = 'Yes';
            sheetCounts.yes++;
          } else if (raw === 'no' || raw === 'declined' || raw === 'rejected') {
            dec = 'No';
            sheetCounts.no++;
          } else {
            sheetCounts.blank++;
          }
          sheetCounts.total++;
          decisions[imei] = dec;

          var newLicRaw = idxNewLic > -1 ? formatSheetDate(data[r][idxNewLic]) : '';
          var curLicRaw = idxLicEnd > -1 ? formatSheetDate(data[r][idxLicEnd]) : '';

          // If decision is No or newLicRaw equals current license date, it is NOT a new date
          var finalNewLic = (dec === 'No' || newLicRaw === curLicRaw) ? '' : newLicRaw;

          var statusDoneVal = 'Pending';
          if (dec === 'No') {
            statusDoneVal = 'Not Done';
            finalNewLic = '';
          } else if (dec === 'Yes') {
            if (finalNewLic && finalNewLic !== curLicRaw) {
              statusDoneVal = 'Done';
            } else {
              statusDoneVal = 'Not Done';
              finalNewLic = '';
            }
          } else {
            statusDoneVal = 'Pending';
            finalNewLic = '';
          }

          var rowObj = {
            sr: r,
            name: idxName > -1 ? String(data[r][idxName] || '').trim() : '',
            vehicle: idxName > -1 ? String(data[r][idxName] || '').trim() : '',
            uniqueid: imei,
            imei: imei,
            phone: idxPhone > -1 ? normalizeUniqueid(data[r][idxPhone]) : '',
            sim: idxPhone > -1 ? normalizeUniqueid(data[r][idxPhone]) : '',
            licenseEnd: curLicRaw,
            displayLicenseEnd: curLicRaw,
            city: idxCity > -1 ? String(data[r][idxCity] || '').trim() : '',
            renewalRemark: idxRemark > -1 ? String(data[r][idxRemark] || '').trim() : '',
            renewalDecision: dec,
            rechargeStatus: dec,
            newLicenseEnd: finalNewLic,
            statusDone: statusDoneVal
          };
          recordsByImei[imei] = {
            decision: dec,
            remark: rowObj.renewalRemark,
            newLicenseEnd: finalNewLic,
            statusDone: statusDoneVal
          };
          sheetDevices.push(rowObj);
        }
      }
    }

    return {
      success: true,
      spreadsheetId: VTS_CONFIG.RENEWAL_MONTH_WISE_SHEET_ID,
      spreadsheetUrl: ss.getUrl(),
      tabs: tabNames,
      activeTab: activeTab,
      carryoverCount: carryoverImeis.length,
      carryoverImeis: carryoverImeis,
      decisions: decisions,
      recordsByImei: recordsByImei,
      sheetDevices: sheetDevices || [],
      sheetCounts: sheetCounts
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Set active cycle tab in ScriptProperties
 */
function setActiveRenewalCycleTab(payload) {
  try {
    var tabName = String(payload.tabName || '').trim();
    if (!tabName) return { success: false, error: 'tabName is required' };
    var props = PropertiesService.getScriptProperties();
    props.setProperty('ACTIVE_RENEWAL_CYCLE_TAB', tabName);
    return { success: true, activeTab: tabName, message: 'Active renewal cycle tab set to: ' + tabName };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Extract filtered renewal devices into a brand new tab in 'Renewal done month wise' sheet
 * Exact 10 Columns Matching Image 3:
 * SR. | Name | Uniqueid | Phone | License End | City | Remark | Rechage status | New License End | Status
 */
function extractRenewalCycleBatch(payload) {
  try {
    var ss = openRenewalSheetStrict();
    if (!ss) return { success: false, error: 'Could not open Renewal Month Wise Sheet' };

    var targetMode = String(payload.targetMode || payload.mode || 'new').toLowerCase().trim();
    var tabName = String(payload.tabName || '').trim();
    if (!tabName) {
      tabName = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Kolkata', 'd MMM yyyy').toLowerCase();
    }

    var sheet = ss.getSheetByName(tabName);
    var isExisting = (targetMode === 'existing' || targetMode === 'append') && !!sheet;
    var headers = ['SR.', 'Name', 'Uniqueid', 'Phone', 'License End', 'City', 'Remark', 'Rechage status', 'New License End', 'Status'];
    var existingImeis = [];
    var startSr = 1;

    if (!isExisting) {
      // BRAND NEW SHEET MODE
      if (!sheet) {
        sheet = ss.insertSheet(tabName);
      } else {
        sheet.clear();
      }
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#e69138')
        .setFontColor('#000000')
        .setFontWeight('bold')
        .setHorizontalAlignment('center');
      startSr = 1;
    } else {
      // EXISTING SHEET MODE - READ EXISTING IMEIS TO PREVENT DUPLICATES!
      var existingData = sheet.getDataRange().getValues();
      for (var r = 1; r < existingData.length; r++) {
        var eImei = normalizeUniqueid(existingData[r][2]); // Col C (Uniqueid)
        if (eImei) existingImeis.push(eImei);
      }
      startSr = existingData.length; // Next sequential SR number
    }

    var devices = payload.devices || [];
    var rows = [];
    var skippedDuplicates = 0;
    var currentSr = startSr;

    for (var i = 0; i < devices.length; i++) {
      var d = devices[i];
      var cleanImei = normalizeUniqueid(d.imei || d.uniqueid || d.Uniqueid);
      if (!cleanImei) continue;

      // REMOVE DUPLICATE IMEI IF ADDING TO EXISTING SHEET
      if (isExisting && existingImeis.indexOf(cleanImei) > -1) {
        skippedDuplicates++;
        continue;
      }
      // Also prevent duplicates within the incoming list itself
      if (existingImeis.indexOf(cleanImei) > -1) {
        skippedDuplicates++;
        continue;
      }
      existingImeis.push(cleanImei);

      var cleanPhone = normalizeUniqueid(d.phone || d.sim || d.Phone || '');
      var licenseEndVal = formatSheetDate(d.licenseEnd || d['License End'] || d.license_end || '');
      var rawDecision = String(d.renewalDecision || d.decision || d.rechargeStatus || d['Recharge status'] || 'Pending').trim();
      var remarkVal = String(d.renewalRemark || d.renewal_remark || '').trim();

      // When extracting renewal sheet, default all vehicles to 'Yes' as explicitly requested
      var statusVal = 'Yes';

      var newLicenseEndVal = d.newLicenseEnd ? formatSheetDate(d.newLicenseEnd) : '';
      if (newLicenseEndVal && newLicenseEndVal === licenseEndVal) {
        newLicenseEndVal = '';
      }

      var statusDoneVal = 'Pending';
      if (statusVal === 'Yes') {
        if (newLicenseEndVal && newLicenseEndVal !== licenseEndVal) {
          statusDoneVal = 'Done';
        } else {
          statusDoneVal = 'Not Done';
          newLicenseEndVal = '';
        }
      } else if (statusVal === 'No') {
        statusDoneVal = 'Not Done';
        newLicenseEndVal = '';
      } else {
        statusDoneVal = 'Pending';
        newLicenseEndVal = '';
      }

      rows.push([
        currentSr,
        String(d.vehicle || d.name || d.Name || '').trim(),
        cleanImei,
        cleanPhone,
        licenseEndVal,
        String(d.city || d.City || '').trim(),
        remarkVal,
        statusVal,
        newLicenseEndVal,
        statusDoneVal
      ]);
      currentSr++;
    }

    if (rows.length > 0) {
      var startRow = isExisting ? (sheet.getLastRow() + 1) : 2;
      var dataRange = sheet.getRange(startRow, 1, rows.length, headers.length);
      dataRange.setValues(rows);

      sheet.getRange(startRow, 3, rows.length, 1).setNumberFormat('@');
      sheet.getRange(startRow, 4, rows.length, 1).setNumberFormat('@');

      // Col H Dropdown Data Validation: ['Yes', 'No']
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Yes', 'No'], true)
        .setAllowInvalid(false)
        .build();
      sheet.getRange(startRow, 8, rows.length, 1).setDataValidation(rule);

      if (!isExisting) {
        var statusRange = sheet.getRange(2, 8, rows.length, 1);
        var ruleYes = SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo('Yes')
          .setBackground('#137333')
          .setFontColor('#ffffff')
          .setRanges([statusRange])
          .build();

        var ruleNo = SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo('No')
          .setBackground('#a50e0e')
          .setFontColor('#ffffff')
          .setRanges([statusRange])
          .build();

        var doneRange = sheet.getRange(2, 10, rows.length, 1);
        var ruleDone = SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo('Done')
          .setBackground('#d9ead3')
          .setFontColor('#274e13')
          .setRanges([doneRange])
          .build();

        var ruleNotDone = SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo('Not Done')
          .setBackground('#f4cccc')
          .setFontColor('#990000')
          .setRanges([doneRange])
          .build();

        var currentRules = sheet.getConditionalFormatRules() || [];
        currentRules.push(ruleYes, ruleNo, ruleDone, ruleNotDone);
        sheet.setConditionalFormatRules(currentRules);

        for (var col = 1; col <= headers.length; col++) {
          sheet.autoResizeColumn(col);
        }
      }
    }

    var props = PropertiesService.getScriptProperties();
    props.setProperty('ACTIVE_RENEWAL_CYCLE_TAB', tabName);

    var successMsg = isExisting
      ? ('Successfully added ' + rows.length + ' new vehicles to existing sheet "' + tabName + '".' + (skippedDuplicates > 0 ? ' (' + skippedDuplicates + ' duplicate IMEIs skipped)' : ''))
      : ('Successfully created new renewal tab "' + tabName + '" with ' + rows.length + ' vehicles.');

    return {
      success: true,
      message: successMsg,
      tabName: tabName,
      spreadsheetUrl: ss.getUrl() + '#gid=' + sheet.getSheetId(),
      rowCount: rows.length,
      addedCount: rows.length,
      skippedDuplicates: skippedDuplicates
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Apply batch renewals:
 * Reads approved ('Yes') vehicles in the active renewal cycle sheet tab,
 * updates their License End dates in the Master Sheet to New License End,
 * and marks Status as 'Done' in the renewal sheet tab.
 */
function applyBatchRenewals(payload) {
  try {
    var ssMaster = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ssMaster) return { success: false, error: 'Could not open Master Sheet' };
    var masterSheet = getMasterSheetStrict(ssMaster);
    var masterData = masterSheet.getDataRange().getValues();
    var headers = masterData[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxImei = findColIndex(headers, ['uniqueid', 'imei', 'device id', 'unique id']);
    var idxLicEnd = findColIndex(headers, ['license end', 'license end date', 'end date', 'expiry', 'licence end']);

    if (idxImei === -1 || idxLicEnd === -1) {
      return { success: false, error: 'Could not find Uniqueid or License End column in Master Sheet' };
    }

    var cycleSS = openRenewalSheetStrict();
    var tabName = String(payload.tabName || '').trim() || PropertiesService.getScriptProperties().getProperty('ACTIVE_RENEWAL_CYCLE_TAB');
    var cycleSheet = cycleSS ? cycleSS.getSheetByName(tabName) : null;
    if (!cycleSheet) return { success: false, error: 'Could not find renewal cycle tab: ' + tabName };

    var cycleData = cycleSheet.getDataRange().getValues();
    var updatedCount = 0;

    for (var cr = 1; cr < cycleData.length; cr++) {
      var imei = normalizeUniqueid(cycleData[cr][2]); // Col C: Uniqueid
      var rechargeStatus = String(cycleData[cr][7] || '').trim().toLowerCase(); // Col H: Rechage status
      var newLic = String(cycleData[cr][8] || '').trim(); // Col I: New License End

      if (rechargeStatus === 'yes' && newLic) {
        for (var mr = 1; mr < masterData.length; mr++) {
          if (normalizeUniqueid(masterData[mr][idxImei]) === imei) {
            masterSheet.getRange(mr + 1, idxLicEnd + 1).setValue(newLic);
            updatedCount++;
            break;
          }
        }
        cycleSheet.getRange(cr + 1, 10).setValue('Done'); // Col J: Status
      } else if (rechargeStatus === 'no') {
        cycleSheet.getRange(cr + 1, 10).setValue('Not Done');
      }
    }

    return {
      success: true,
      message: 'Successfully updated License End dates for ' + updatedCount + ' renewed vehicles in Master Sheet!',
      updatedCount: updatedCount,
      tabName: tabName
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Update New License End dates in batch (from Excel upload or manual input)
 * Updates Master Sheet, Active Cycle Sheet Tab, Col H ('Yes'), Col I (new date), Col J ('Done')
 */
function batchUpdateLicenseDates(payload) {
  try {
    var updates = payload.updates || [];
    var tabName = String(payload.tabName || payload.activeTab || '').trim() || PropertiesService.getScriptProperties().getProperty('ACTIVE_RENEWAL_CYCLE_TAB');
    if (!updates.length) return { success: false, error: 'No updates provided' };

    var masterSS = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    var masterSheet = getMasterSheetStrict(masterSS);
    var masterData = masterSheet ? masterSheet.getDataRange().getValues() : [];
    var masterHeaders = masterData.length > 0 ? masterData[0].map(function(h) { return String(h).trim().toLowerCase(); }) : [];
    var idxMasterImei = findColIndex(masterHeaders, ['uniqueid', 'imei']);
    var idxMasterLic = findColIndex(masterHeaders, ['license end', 'license end date', 'expiry']);
    if (idxMasterImei === -1) idxMasterImei = 2;
    if (idxMasterLic === -1) idxMasterLic = 11;

    var cycleSS = openRenewalSheetStrict();
    var cycleSheet = cycleSS ? (tabName ? cycleSS.getSheetByName(tabName) : cycleSS.getSheets()[0]) : null;
    var cycleData = cycleSheet ? cycleSheet.getDataRange().getValues() : [];
    var cycleHeaders = cycleData.length > 0 ? cycleData[0].map(function(h) { return String(h).trim().toLowerCase(); }) : [];
    var idxCycleImei = findColIndex(cycleHeaders, ['uniqueid', 'imei']);
    var idxCycleRecharge = findColIndex(cycleHeaders, ['rechage status', 'recharge status']);
    var idxCycleNewLic = findColIndex(cycleHeaders, ['new license end', 'new lic end']);
    var idxCycleStatus = findColIndex(cycleHeaders, ['status', 'done status']);
    if (idxCycleImei === -1) idxCycleImei = 2;
    if (idxCycleRecharge === -1) idxCycleRecharge = 7;
    if (idxCycleNewLic === -1) idxCycleNewLic = 8;
    if (idxCycleStatus === -1) idxCycleStatus = 9;

    var updatedCount = 0;
    for (var u = 0; u < updates.length; u++) {
      var item = updates[u];
      var targetImei = normalizeUniqueid(item.imei || item.uniqueid);
      var newDate = formatSheetDate(item.newLicenseEnd || item.newDate);
      if (!targetImei || !newDate) continue;

      // 1. Update Master Sheet (tab 900)
      if (masterSheet && masterData.length > 1) {
        for (var mr = 1; mr < masterData.length; mr++) {
          if (normalizeUniqueid(masterData[mr][idxMasterImei]) === targetImei) {
            masterSheet.getRange(mr + 1, idxMasterLic + 1).setValue(newDate);
            break;
          }
        }
      }

      // 2. Update Cycle Sheet Tab (Col H: 'Yes', Col I: new date, Col J: 'Done')
      if (cycleSheet && cycleData.length > 1) {
        for (var cr = 1; cr < cycleData.length; cr++) {
          if (normalizeUniqueid(cycleData[cr][idxCycleImei]) === targetImei) {
            cycleSheet.getRange(cr + 1, idxCycleRecharge + 1).setValue('Yes');
            cycleSheet.getRange(cr + 1, idxCycleNewLic + 1).setValue(newDate);
            cycleSheet.getRange(cr + 1, idxCycleStatus + 1).setValue('Done');
            break;
          }
        }
      }

      updatedCount++;
    }

    return {
      success: true,
      message: 'Successfully updated ' + updatedCount + ' vehicle(s) with new license end dates and marked as Done!',
      updatedCount: updatedCount,
      tabName: tabName
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Finalize session: update License End for Yes devices and queue No devices for next session
 */
function finalizeRenewalSession(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = getMasterSheetStrict(ss);
    var data = sheet.getDataRange().getValues();

    var approvedImeis = payload.approvedImeis || [];
    var declinedImeis = payload.declinedImeis || [];
    var newLicenseEnd = formatSheetDate(payload.newLicenseEnd);
    var note = String(payload.note || 'Renewed in batch session').trim();

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxImei = findColIndex(headers, ['uniqueid', 'imei']);
    var idxName = findColIndex(headers, ['name', 'vehicle']);
    var idxLicenseEnd = findColIndex(headers, ['license end', 'license end date', 'expiry']);
    var idxDecision = findColIndex(headers, ['renewal decision', 'decision']);

    if (idxImei === -1) idxImei = 2;
    if (idxName === -1) idxName = 1;
    if (idxLicenseEnd === -1) idxLicenseEnd = 11;
    if (idxDecision === -1) idxDecision = 12;

    var updatedCount = 0;
    var normApproved = approvedImeis.map(function(im) { return normalizeUniqueid(im); });
    var normDeclined = declinedImeis.map(function(im) { return normalizeUniqueid(im); });

    for (var i = 1; i < data.length; i++) {
      var rowImei = normalizeUniqueid(data[i][idxImei]);
      if (normApproved.indexOf(rowImei) > -1) {
        var rowNum = i + 1;
        var oldDate = formatSheetDate(data[i][idxLicenseEnd]);
        if (newLicenseEnd) {
          sheet.getRange(rowNum, idxLicenseEnd + 1).setValue(newLicenseEnd);
        }
        sheet.getRange(rowNum, idxDecision + 1).setValue('Renewed');
        appendRenewalLogEntry(ss, {
          uniqueid: rowImei,
          vehicle: String(data[i][idxName] || '').trim(),
          oldLicenseEnd: oldDate,
          newLicenseEnd: newLicenseEnd || 'Renewed',
          dateLogged: formatSheetDate(new Date()),
          monthLabel: getMonthYearLabel(oldDate || new Date()),
          decision: 'Renewed',
          remark: note
        });
        updatedCount++;
      }
    }

    // Store declined 'No' devices for next session carryover
    var props = PropertiesService.getScriptProperties();
    props.setProperty('NEXT_SESSION_CARRYOVER_IMEIS', JSON.stringify(normDeclined));

    return {
      success: true,
      message: 'Session finalized! ' + updatedCount + ' devices marked renewed with new License End (' + newLicenseEnd + '). ' + normDeclined.length + ' declined devices queued for next session.',
      renewedCount: updatedCount,
      carryoverCount: normDeclined.length
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function sendRenewalReminders(payload) {
  try {
    var users = getUsersList();
    var devices = getMasterDevices();
    var appUrl = payload && payload.appUrl ? payload.appUrl : 'https://wevois-vts-fleet.web.app';
    var targetMonth = payload && payload.monthLabel ? payload.monthLabel : getMonthYearLabel(new Date());

    var emailsSent = 0;
    var details = [];

    for (var u = 0; u < users.length; u++) {
      var user = users[u];
      if (user.role !== 'Manager' || !user.email) continue;

      var cities = user.assignedCities.map(function(c) { return c.toLowerCase().trim(); });
      var userDevices = devices.filter(function(d) {
        return cities.indexOf(String(d.city || '').toLowerCase().trim()) > -1;
      });

      if (userDevices.length === 0) continue;

      var htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b;">'
        + '<h2 style="color: #2563eb;">VTS Renewal Action Required — ' + targetMonth + '</h2>'
        + '<p>Dear <strong>' + user.name + '</strong>,</p>'
        + '<p>You have <strong>' + userDevices.length + ' VTS device(s)</strong> due for subscription renewal in your assigned cities (<strong>' + user.assignedCities.join(', ') + '</strong>).</p>'
        + '<p>Please review each vehicle and mark your <strong>Yes / No</strong> renewal decision on the portal:</p>'
        + '<p style="text-align: center; margin: 24px 0;">'
        + '<a href="' + appUrl + '" style="background: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Open VTS Renewal Portal</a>'
        + '</p>'
        + '<table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px;">'
        + '<tr style="background: #f1f5f9; text-align: left;"><th style="padding: 8px; border: 1px solid #cbd5e1;">Vehicle</th><th style="padding: 8px; border: 1px solid #cbd5e1;">Uniqueid (IMEI)</th><th style="padding: 8px; border: 1px solid #cbd5e1;">City</th><th style="padding: 8px; border: 1px solid #cbd5e1;">License End</th></tr>';

      for (var d = 0; d < Math.min(userDevices.length, 10); d++) {
        var dev = userDevices[d];
        htmlBody += '<tr>'
          + '<td style="padding: 8px; border: 1px solid #cbd5e1;">' + dev.vehicle + '</td>'
          + '<td style="padding: 8px; border: 1px solid #cbd5e1; font-family: monospace;">' + dev.imei + '</td>'
          + '<td style="padding: 8px; border: 1px solid #cbd5e1;">' + dev.city + '</td>'
          + '<td style="padding: 8px; border: 1px solid #cbd5e1;">' + dev.licenseEnd + '</td>'
          + '</tr>';
      }

      if (userDevices.length > 10) {
        htmlBody += '<tr><td colspan="4" style="padding: 8px; text-align: center; color: #64748b;">...and ' + (userDevices.length - 10) + ' more devices</td></tr>';
      }

      htmlBody += '</table>'
        + '<p style="margin-top: 20px; font-size: 12px; color: #64748b;">This is an automated notification from VTS Tracker System.</p>'
        + '</div>';

      MailApp.sendEmail({
        to: user.email,
        subject: '🚨 VTS Renewal Decision Required — ' + targetMonth + ' (' + user.assignedCities.join(', ') + ')',
        htmlBody: htmlBody
      });

      emailsSent++;
      details.push({ manager: user.name, email: user.email, deviceCount: userDevices.length });
    }

    return {
      success: true,
      message: 'Sent renewal notification emails to ' + emailsSent + ' site managers.',
      emailsSent: emailsSent,
      details: details
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function setupDailyReminderTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyScheduledReminders') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('sendDailyScheduledReminders')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  return { success: true, message: 'Daily 8:00 AM renewal reminder trigger configured!' };
}

function sendDailyScheduledReminders() {
  sendRenewalReminders({ appUrl: 'https://wevois-vts-fleet.web.app' });
}

function parseSheetDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) return dateVal;
  var s = String(dateVal).trim();
  if (!s) return null;
  var monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
  };
  var textMatch = s.match(/^(\d{1,2})[-/\s]+([A-Za-z]{3,9})[-/\s]+(\d{2,4})$/);
  if (textMatch) {
    var day = parseInt(textMatch[1], 10);
    var mKey = textMatch[2].toLowerCase().slice(0, 3);
    var mNum = monthMap[mKey];
    var yr = parseInt(textMatch[3], 10);
    if (yr < 100) yr += 2000;
    if (mNum !== undefined) return new Date(yr, mNum, day);
  }
  var isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
  var dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmyMatch) {
    var y = parseInt(dmyMatch[3], 10);
    if (y < 100) y += 2000;
    return new Date(y, parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
  }
  var parsed = Date.parse(s);
  if (!isNaN(parsed)) return new Date(parsed);
  return null;
}

/**
 * Vehicle Record & Ground Reality Matching Engine
 * Spreadsheet: 1MFKeBqIWJhPg-UjzoEbRwlb-romMxnpWSUZrAXOqojs
 * Tab: Sitewise Vehicle Record
 */
function cleanMatchKey(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getGroundVehicleRecords() {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.VEHICLE_RECORD_SHEET_ID);
    if (!ss) return { compositeMap: {}, fallbackVehMap: {}, list: [], stats: {}, duplicateConflicts: [] };
    var sheet = ss.getSheetByName(VTS_CONFIG.VEHICLE_RECORD_TAB_NAME);
    if (!sheet) {
      var allSheets = ss.getSheets();
      for (var s = 0; s < allSheets.length; s++) {
        if (allSheets[s].getName().toLowerCase().indexOf('vehicle record') > -1) {
          sheet = allSheets[s];
          break;
        }
      }
    }
    if (!sheet) return { compositeMap: {}, fallbackVehMap: {}, list: [], stats: {}, duplicateConflicts: [] };

    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { compositeMap: {}, fallbackVehMap: {}, list: [], stats: {}, duplicateConflicts: [] };

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxCity = findColIndex(headers, ['city', 'site', 'project']);
    var idxBgVeh = findColIndex(headers, ['vehicle no as per bg service', 'vehicle no', 'vehicle name']);
    var idxRegNo = findColIndex(headers, ['vehicle registration number', 'vehicle registration', 'registration no', 'reg no']);
    var idxCategory = findColIndex(headers, ['vehicle category', 'category']);
    var idxVehType = findColIndex(headers, ['vehicle type', 'type']);
    var idxFuel = findColIndex(headers, ['fuel type', 'fuel']);
    var idxOwner = findColIndex(headers, ['owner name', 'owner']);
    var idxMaintenance = findColIndex(headers, ['maintenance', 'maintained by']);
    var idxReceivedDate = findColIndex(headers, ['received date', 'date']);
    var idxStatus = findColIndex(headers, ['status', 'vehicle status']);
    var idxVts = findColIndex(headers, ['vts', 'vts status']);
    var idxRemark = findColIndex(headers, ['remark', 'remarks']);

    if (idxCity === -1) idxCity = 1;
    if (idxBgVeh === -1) idxBgVeh = 2;
    if (idxRegNo === -1) idxRegNo = 3;
    if (idxCategory === -1) idxCategory = 4;
    if (idxVehType === -1) idxVehType = 5;
    if (idxFuel === -1) idxFuel = 6;
    if (idxOwner === -1) idxOwner = 7;
    if (idxMaintenance === -1) idxMaintenance = 8;
    if (idxReceivedDate === -1) idxReceivedDate = 9;
    if (idxStatus === -1) idxStatus = 10;
    if (idxVts === -1) idxVts = 11;
    if (idxRemark === -1) idxRemark = 12;

    var list = [];
    var compositeMap = {};
    var fallbackVehMap = {};
    var duplicateConflicts = [];

    var stats = {
      total: 0,
      active: 0,
      inactive: 0,
      vendor: 0,
      wevois: 0,
      vtsInstalled: 0,
      vtsRemoved: 0,
      vtsNotInstalled: 0
    };

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var city = String(row[idxCity] || '').trim();
      var bgVeh = String(row[idxBgVeh] || '').trim();
      var regNo = String(row[idxRegNo] || '').trim();
      if (!city && !bgVeh && !regNo) continue;

      var maintenanceRaw = String(row[idxMaintenance] || '').trim();
      var mLower = maintenanceRaw.toLowerCase();
      var maintenanceClean = 'Unspecified';
      if (mLower.indexOf('vendor') > -1) maintenanceClean = 'Vendor';
      else if (mLower.indexOf('wevois') > -1 || mLower.indexOf('operation') > -1) maintenanceClean = 'WeVois';
      else if (maintenanceRaw) maintenanceClean = maintenanceRaw;

      var statusRaw = String(row[idxStatus] || '').trim();
      var sLower = statusRaw.toLowerCase();
      var vehicleStatusClean = 'Active';
      if (sLower.indexOf('in-active') > -1 || sLower.indexOf('in active') > -1 || sLower.indexOf('inactive') > -1) {
        vehicleStatusClean = 'In-Active';
      } else if (sLower.indexOf('active') > -1) {
        vehicleStatusClean = 'Active';
      } else if (statusRaw) {
        vehicleStatusClean = statusRaw;
      }

      var vtsRaw = String(row[idxVts] || '').trim();
      var vLower = vtsRaw.toLowerCase();
      var vtsClean = 'Installed';
      if (vLower.indexOf('not installed') > -1) vtsClean = 'Not Installed';
      else if (vLower.indexOf('removed') > -1) vtsClean = 'Removed';
      else if (vLower.indexOf('installed') > -1) vtsClean = 'Installed';
      else if (vLower.indexOf('in-active') > -1 || vLower.indexOf('inactive') > -1) vtsClean = 'In-Active';
      else if (vtsRaw) vtsClean = vtsRaw;

      var remark = String(row[idxRemark] || '').trim();
      var receivedDate = formatSheetDate(row[idxReceivedDate]);

      var item = {
        rowNumber: r + 1,
        city: city,
        bgVehicle: bgVeh,
        regNumber: regNo,
        category: String(row[idxCategory] || '').trim(),
        vehicleType: String(row[idxVehType] || '').trim(),
        fuelType: String(row[idxFuel] || '').trim(),
        ownerName: String(row[idxOwner] || '').trim(),
        maintenance: maintenanceClean,
        vehicleStatus: vehicleStatusClean,
        vtsStatus: vtsClean,
        receivedDate: receivedDate,
        remark: remark
      };

      list.push(item);
      stats.total++;
      if (vehicleStatusClean === 'Active') stats.active++;
      else stats.inactive++;
      if (maintenanceClean === 'Vendor') stats.vendor++;
      else if (maintenanceClean === 'WeVois') stats.wevois++;
      if (vtsClean === 'Installed') stats.vtsInstalled++;
      else if (vtsClean === 'Removed') stats.vtsRemoved++;
      else if (vtsClean === 'Not Installed') stats.vtsNotInstalled++;

      var cCity = cleanMatchKey(city);
      var cBg = cleanMatchKey(bgVeh);
      var cReg = cleanMatchKey(regNo);

      var registerEntry = function(key) {
        if (!key) return;
        if (!compositeMap[key]) {
          compositeMap[key] = item;
        } else {
          var existing = compositeMap[key];
          // Rule A: Active priority
          if (existing.vehicleStatus !== 'Active' && item.vehicleStatus === 'Active') {
            compositeMap[key] = item;
          } else if (existing.vehicleStatus === item.vehicleStatus) {
            // Rule B: Newer row index
            compositeMap[key] = item;
          }
          duplicateConflicts.push({
            city: city,
            vehicle: bgVeh || regNo,
            rowA: existing.rowNumber,
            rowB: item.rowNumber,
            statusA: existing.vehicleStatus,
            statusB: item.vehicleStatus,
            vtsA: existing.vtsStatus,
            vtsB: item.vtsStatus,
            remarkA: existing.remark,
            remarkB: item.remark,
            chosenRow: compositeMap[key].rowNumber
          });
        }
      };

      if (cCity && cBg) registerEntry(cCity + '_' + cBg);
      if (cCity && cReg) registerEntry(cCity + '_' + cReg);

      if (cBg) {
        if (!fallbackVehMap[cBg]) fallbackVehMap[cBg] = item;
        else fallbackVehMap[cBg] = 'DUPLICATE_GLOBAL';
      }
      if (cReg) {
        if (!fallbackVehMap[cReg]) fallbackVehMap[cReg] = item;
        else fallbackVehMap[cReg] = 'DUPLICATE_GLOBAL';
      }
    }

    return {
      compositeMap: compositeMap,
      fallbackVehMap: fallbackVehMap,
      list: list,
      stats: stats,
      duplicateConflicts: duplicateConflicts
    };
  } catch (err) {
    Logger.log('Error reading Vehicle Record sheet: ' + err);
    return { compositeMap: {}, fallbackVehMap: {}, list: [], stats: {}, duplicateConflicts: [] };
  }
}

function getAllFleetData(params) {
  var masterDevices = getMasterDevices();
  var renewalLogs = getRenewalLogs();
  var archiveList = getRenewalArchiveList();
  var usersList = getUsersList();
  var groundData = getGroundVehicleRecords();
  var compositeMap = groundData.compositeMap || {};
  var fallbackVehMap = groundData.fallbackVehMap || {};

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var userEmail = params && params.userEmail ? String(params.userEmail).toLowerCase().trim() : '';
  var managerCities = null;

  if (userEmail) {
    for (var u = 0; u < usersList.length; u++) {
      if (usersList[u].email.toLowerCase().trim() === userEmail) {
        if (usersList[u].role === 'Manager') {
          managerCities = usersList[u].assignedCities.map(function(c) { return c.toLowerCase().trim(); });
        }
        break;
      }
    }
  }

  var ghostLicenses = [];
  var trackingGaps = [];

  var merged = masterDevices.map(function(device) {
    var licenseEnd = device.licenseEnd || '';
    var remainingDays = undefined;

    if (licenseEnd) {
      var end = parseSheetDate(licenseEnd);
      if (end && !isNaN(end.getTime())) {
        end.setHours(0, 0, 0, 0);
        remainingDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    var calculatedStatus = 'Active';
    if (device.finalStatus === 'DAMAGED') {
      calculatedStatus = 'Damaged';
    } else if (remainingDays !== undefined && remainingDays < 0) {
      calculatedStatus = 'Expired';
    } else if (remainingDays !== undefined && remainingDays <= VTS_CONFIG.EXPIRY_ALERT_DAYS) {
      calculatedStatus = 'Recharge Soon';
    } else if (device.roadcastStatus && device.roadcastStatus.toLowerCase() === 'inactive') {
      calculatedStatus = 'Inactive';
    }

    // Match ground vehicle record (City + BG Name OR City + Reg Number)
    var cCity = cleanMatchKey(device.city);
    var cVeh = cleanMatchKey(device.vehicle);
    var matchedGround = null;

    if (cCity && cVeh && compositeMap[cCity + '_' + cVeh]) {
      matchedGround = compositeMap[cCity + '_' + cVeh];
    } else if (cVeh && fallbackVehMap[cVeh] && fallbackVehMap[cVeh] !== 'DUPLICATE_GLOBAL') {
      matchedGround = fallbackVehMap[cVeh];
    }

    var ownership = matchedGround ? matchedGround.maintenance : 'Unmatched';
    var groundVehicleStatus = matchedGround ? matchedGround.vehicleStatus : 'Unmatched';
    var groundVtsStatus = matchedGround ? matchedGround.vtsStatus : 'Unmatched';
    var groundRemark = matchedGround ? matchedGround.remark : '';
    var groundRegNo = matchedGround ? (matchedGround.regNumber || '') : '';
    var groundOwner = matchedGround ? (matchedGround.ownerName || '') : '';
    var groundRow = matchedGround ? matchedGround.rowNumber : null;

    // Check Billing Leakage (Ghost License)
    // Vehicle is In-Active or VTS Removed on ground, but Active on Roadcast
    var isRoadcastActive = String(device.roadcastStatus || '').toLowerCase() === 'active';
    var isGroundDead = (groundVehicleStatus === 'In-Active' || groundVtsStatus === 'Removed');
    var isGhost = isGroundDead && isRoadcastActive;

    if (isGhost) {
      ghostLicenses.push({
        vehicle: device.vehicle,
        imei: device.imei,
        sim: device.sim,
        city: device.city,
        roadcastStatus: device.roadcastStatus,
        groundVehicleStatus: groundVehicleStatus,
        groundVtsStatus: groundVtsStatus,
        groundRemark: groundRemark,
        ownership: ownership,
        licenseEnd: licenseEnd
      });
    }

    // Check Tracking Gap (Active on site, but VTS Removed / Not Installed)
    if (groundVehicleStatus === 'Active' && (groundVtsStatus === 'Removed' || groundVtsStatus === 'Not Installed')) {
      trackingGaps.push({
        vehicle: device.vehicle,
        imei: device.imei,
        city: device.city,
        groundVtsStatus: groundVtsStatus,
        groundRemark: groundRemark,
        ownership: ownership
      });
    }

    return {
      sr: device.sr,
      vehicle: device.vehicle,
      imei: device.imei,
      sim: device.sim,
      city: device.city,
      roadcastStatus: device.roadcastStatus,
      lastUpdate: device.lastUpdate,
      finalStatus: device.finalStatus,
      vtsType: device.vtsType,
      remark: device.remark,
      status: calculatedStatus,
      licenseEnd: licenseEnd,
      remainingDays: remainingDays,
      rechargeStatus: calculatedStatus,
      renewalDecision: device.renewalDecision || 'Pending',
      renewalRemark: device.renewalRemark || '',
      statusOverride: device.statusOverride || '',
      displayStatus: device.statusOverride || device.finalStatus || (String(device.roadcastStatus || '').toLowerCase() === 'inactive' ? 'Inactive' : '—'),
      inactiveRunningRemark: device.inactiveRunningRemark || '',
      // Ground Truth Fields
      ownership: ownership,
      groundVehicleStatus: groundVehicleStatus,
      groundVtsStatus: groundVtsStatus,
      groundRemark: groundRemark,
      groundRegNo: groundRegNo,
      groundOwner: groundOwner,
      groundRow: groundRow,
      isGhostLicense: isGhost
    };
  });

  if (managerCities) {
    merged = merged.filter(function(d) {
      return managerCities.indexOf(String(d.city || '').toLowerCase().trim()) > -1;
    });
  }

  return {
    devices: merged,
    totalCount: merged.length,
    requests: getFormRequests(),
    returnRequests: getReturnRequests(),
    renewalLogs: renewalLogs,
    renewalArchives: archiveList,
    users: usersList,
    groundRecordAudit: {
      stats: groundData.stats || {},
      ghostLicenses: ghostLicenses,
      trackingGaps: trackingGaps,
      duplicateConflicts: groundData.duplicateConflicts || [],
      totalGroundRecords: (groundData.list || []).length
    },
    renewalCycleInfo: {
      spreadsheetId: VTS_CONFIG.RENEWAL_MONTH_WISE_SHEET_ID,
      activeTab: PropertiesService.getScriptProperties().getProperty('ACTIVE_RENEWAL_CYCLE_TAB') || '',
      carryoverImeis: (function() {
        try {
          return JSON.parse(PropertiesService.getScriptProperties().getProperty('NEXT_SESSION_CARRYOVER_IMEIS') || '[]');
        } catch(e) {
          return [];
        }
      })()
    }
  };
}

function getMasterDevices() {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return [];
    var sheet = getMasterSheetStrict(ss);
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxName = findColIndex(headers, ['name', 'vehicle', 'vehicle name']);
    var idxImei = findColIndex(headers, ['uniqueid', 'imei', 'device id', 'unique id']);
    var idxPhone = findColIndex(headers, ['phone', 'sim', 'sim no', 'mobile', 'phone number']);
    var idxCity = findColIndex(headers, ['city', 'site', 'project', 'location', 'site name']);
    var idxRoadcast = findColIndex(headers, ['status on roadcast', 'roadcast status', 'roadcast']);
    var idxLastUpdate = findColIndex(headers, ['last update', 'last updated', 'roadcast update']);
    var idxFinalStatus = findColIndex(headers, ['final status', 'status', 'vehicle status']);
    var idxVtsType = findColIndex(headers, ['vts type', 'type', 'device type', 'package']);
    var idxRemark = findColIndex(headers, ['remark', 'remarks', 'general remark']);
    var idxFinalStatusDj = findColIndex(headers, ['final status dj', 'status dj']);
    var idxLicenseEnd = findColIndex(headers, ['license end', 'license end date', 'end date', 'expiry', 'expiry date', 'licence end', 'license_end', 'lic end']);
    var idxDecision = findColIndex(headers, ['renewal decision', 'decision', 'recharge decision']);
    var idxDecisionRemark = findColIndex(headers, ['renewal remark', 'decision remark']);

    var idxStatusOverride = findColIndex(headers, ['status override', 'override', 'manual override']);
    var idxInactiveRunningRemark = findColIndex(headers, ['inactive-running remark', 'inactive running remark', 'anomaly remark']);

    // Positional fallback for updated Sheet layout:
    // A(0):Sr, B(1):Name, C(2):Uniqueid, D(3):Phone, E(4):City, F(5):Status on Roadcast, G(6):Last update, H(7):Final Status, I(8):VTS Type, J(9):Remark, K(10):Final Status DJ, L(11):License End, M(12):Renewal Decision, N(13):Renewal Remark, O(14):Status Override, P(15):Inactive-Running Remark
    if (idxName === -1) idxName = 1;
    if (idxImei === -1) idxImei = 2;
    if (idxPhone === -1) idxPhone = 3;
    if (idxCity === -1) idxCity = 4;
    if (idxRoadcast === -1) idxRoadcast = 5;
    if (idxLastUpdate === -1) idxLastUpdate = 6;
    if (idxFinalStatus === -1) idxFinalStatus = 7;
    if (idxVtsType === -1) idxVtsType = 8;
    if (idxRemark === -1) idxRemark = 9;
    if (idxLicenseEnd === -1) idxLicenseEnd = 11;
    if (idxStatusOverride === -1 && headers.length > 14) idxStatusOverride = 14;
    if (idxInactiveRunningRemark === -1 && headers.length > 15) idxInactiveRunningRemark = 15;

    var devices = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var name = idxName >= 0 && row[idxName] !== undefined ? String(row[idxName] || '').trim() : String(row[1] || '').trim();
      var imei = idxImei >= 0 && row[idxImei] !== undefined ? normalizeUniqueid(row[idxImei]) : normalizeUniqueid(row[2]);
      if (!name && !imei) continue;

      var sim = idxPhone >= 0 && row[idxPhone] !== undefined ? String(row[idxPhone] || '').trim() : '';
      var city = idxCity >= 0 && row[idxCity] !== undefined ? String(row[idxCity] || '').trim() : (row.length > 4 ? String(row[4] || '').trim() : 'Other');
      var roadcastStatus = idxRoadcast >= 0 && row[idxRoadcast] !== undefined ? String(row[idxRoadcast] || 'Active').trim() : 'Active';
      var lastUpdate = idxLastUpdate >= 0 && row[idxLastUpdate] !== undefined ? formatSheetDate(row[idxLastUpdate]) : '';
      var finalStatus = idxFinalStatus >= 0 && row[idxFinalStatus] !== undefined ? String(row[idxFinalStatus] || '').trim() : '';
      var vtsType = idxVtsType >= 0 && row[idxVtsType] !== undefined ? String(row[idxVtsType] || 'VTS Package 4G').trim() : 'VTS Package 4G';
      var remark = idxRemark >= 0 && row[idxRemark] !== undefined ? String(row[idxRemark] || '').trim() : '';
      var rawLic = idxLicenseEnd >= 0 && row[idxLicenseEnd] !== undefined ? row[idxLicenseEnd] : (row.length > 11 ? row[11] : '');
      var licenseEnd = formatSheetDate(rawLic);
      var decision = idxDecision >= 0 && row[idxDecision] !== undefined ? String(row[idxDecision] || 'Pending').trim() : 'Pending';
      var decisionRemark = idxDecisionRemark >= 0 && row[idxDecisionRemark] !== undefined ? String(row[idxDecisionRemark] || '').trim() : '';
      var statusOverride = idxStatusOverride >= 0 && row[idxStatusOverride] !== undefined ? String(row[idxStatusOverride] || '').trim() : (row.length > 14 ? String(row[14] || '').trim() : '');
      var inactiveRunningRemark = idxInactiveRunningRemark >= 0 && row[idxInactiveRunningRemark] !== undefined ? String(row[idxInactiveRunningRemark] || '').trim() : (row.length > 15 ? String(row[15] || '').trim() : '');

      devices.push({
        sr: row[0] || i,
        vehicle: name,
        imei: imei,
        sim: sim,
        city: city || 'Other',
        roadcastStatus: roadcastStatus,
        lastUpdate: lastUpdate,
        finalStatus: finalStatus,
        vtsType: vtsType,
        remark: remark,
        licenseEnd: licenseEnd,
        renewalDecision: decision || 'Pending',
        renewalRemark: decisionRemark,
        statusOverride: statusOverride,
        inactiveRunningRemark: inactiveRunningRemark
      });
    }
    return devices;
  } catch (err) {
    return [];
  }
}

function getRenewalLogs() {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return [];
    var sheet = ss.getSheetByName(VTS_CONFIG.RENEWAL_LOG_TAB_NAME);
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    var list = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      list.push({
        id: 'LOG-' + i,
        uniqueid: normalizeUniqueid(row[0]),
        vehicle: String(row[1] || '').trim(),
        oldLicenseEnd: formatSheetDate(row[2]),
        newLicenseEnd: formatSheetDate(row[3]),
        dateLogged: formatSheetDate(row[4]),
        monthLabel: String(row[5] || '').trim(),
        decision: String(row[6] || 'Yes').trim(),
        remark: String(row[7] || '').trim()
      });
    }
    return list;
  } catch (err) {
    return [];
  }
}

function submitRequirementRequest(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = ss.getSheetByName(VTS_CONFIG.REQUESTS_TAB_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(VTS_CONFIG.REQUESTS_TAB_NAME);
      sheet.appendRow(['Timestamp', 'Requester Email', 'City', 'Vehicle Number', 'Vehicle Type', 'Requirement Type', 'Reason', 'Damaged', 'Penalty']);
    }

    sheet.appendRow([
      formatSheetDate(new Date()),
      String(payload.requester || '').trim(),
      String(payload.city || '').trim(),
      String(payload.vehicleNumber || '').trim().toUpperCase(),
      String(payload.vehicleType || 'Tipper').trim(),
      String(payload.requirementType || 'New VTS').trim(),
      String(payload.reason || '').trim(),
      String(payload.isDamaged || 'No').trim(),
      String(payload.penaltyInfo || 'NA').trim()
    ]);

    return { success: true, message: 'Requirement request logged successfully!' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function submitReturnRequest(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = ss.getSheetByName(VTS_CONFIG.RETURNS_TAB_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(VTS_CONFIG.RETURNS_TAB_NAME);
      sheet.appendRow(['Timestamp', 'Vehicle Number', 'Uniqueid (IMEI)', 'Phone (SIM)', 'City', 'Return Reason', 'Condition', 'Courier / Dispatch Info', 'Status']);
    }

    var cleanImei = normalizeUniqueid(payload.imei);
    var cleanSim = normalizeUniqueid(payload.sim);

    var newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 3).setNumberFormat('@');
    if (cleanSim) sheet.getRange(newRow, 4).setNumberFormat('@');

    sheet.getRange(newRow, 1, 1, 9).setValues([[
      formatSheetDate(new Date()),
      String(payload.vehicleNumber || '').trim().toUpperCase(),
      cleanImei,
      cleanSim,
      String(payload.city || '').trim(),
      String(payload.returnReason || 'Faulty Device').trim(),
      String(payload.condition || 'Good / Reusable').trim(),
      String(payload.courierInfo || '').trim(),
      'Submitted / In Transit'
    ]]);

    return { success: true, message: 'VTS Return logged successfully!' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function getFormRequests() {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return [];
    var sheet = ss.getSheetByName(VTS_CONFIG.REQUESTS_TAB_NAME);
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    var list = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var city = String(row[2] || '').trim();
      var vehicleNo = String(row[3] || '').trim();
      if (!city && !vehicleNo) continue;

      list.push({
        sr: i,
        timestamp: formatSheetDate(row[0]),
        requester: String(row[1] || '').trim(),
        city: city,
        vehicleNumber: vehicleNo,
        vehicleType: String(row[4] || 'Tipper').trim(),
        requirementType: String(row[5] || 'New VTS').trim(),
        reason: String(row[6] || '').trim(),
        isDamaged: String(row[7] || 'No').trim(),
        penaltyInfo: String(row[8] || 'NA').trim()
      });
    }
    return list;
  } catch (err) {
    return [];
  }
}

function getReturnRequests() {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return [];
    var sheet = ss.getSheetByName(VTS_CONFIG.RETURNS_TAB_NAME);
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    var list = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var vehicleNo = String(row[1] || '').trim();
      if (!vehicleNo) continue;

      list.push({
        sr: i,
        timestamp: formatSheetDate(row[0]),
        vehicleNumber: vehicleNo,
        imei: normalizeUniqueid(row[2]),
        sim: normalizeUniqueid(row[3]),
        city: String(row[4] || '').trim(),
        returnReason: String(row[5] || 'Faulty Device').trim(),
        condition: String(row[6] || 'Good / Reusable').trim(),
        courierInfo: String(row[7] || '').trim(),
        status: String(row[8] || 'Submitted / In Transit').trim()
      });
    }
    return list;
  } catch (err) {
    return [];
  }
}

/**
 * 16. Refresh Final Status (Global Scan of Source A & Source B)
 */
function refreshFinalStatus() {
  try {
    var vehicleMap = {};

    // Read Source A ("Vendor City Vehicle Data")
    if (VTS_CONFIG.SOURCE_A_VENDOR_SHEET_ID) {
      try {
        var ssA = safeOpenSpreadsheet(VTS_CONFIG.SOURCE_A_VENDOR_SHEET_ID);
        if (ssA) {
          var sheetsA = ssA.getSheets();
          for (var s = 0; s < sheetsA.length; s++) {
            var tab = sheetsA[s];
            var tabName = tab.getName();
            if (tabName.toLowerCase() === 'status summary') continue;

            var dataA = tab.getDataRange().getValues();
            if (dataA.length <= 1) continue;

            var headersA = dataA[0].map(function(h) { return String(h).trim().toLowerCase(); });
            var idxDateA = findColIndex(headersA, ['date']);
            var idxVehA = findColIndex(headersA, ['vechile', 'vehicle', 'vehicle no', 'name']);
            var idxStatusA = findColIndex(headersA, ['operation status', 'status']);
            var idxCityA = findColIndex(headersA, ['city']);

            if (idxDateA === -1) idxDateA = 1;
            if (idxVehA === -1) idxVehA = 2;
            if (idxStatusA === -1) idxStatusA = 3;
            if (idxCityA === -1) idxCityA = 4;

            for (var r = 1; r < dataA.length; r++) {
              var vName = String(dataA[r][idxVehA] || '').trim().toUpperCase();
              var rawDate = dataA[r][idxDateA];
              var opStatus = String(dataA[r][idxStatusA] || '').trim();
              if (!vName || !opStatus) continue;

              var parsedDate = parseDateValue(rawDate);
              if (!vehicleMap[vName] || parsedDate > vehicleMap[vName].date) {
                vehicleMap[vName] = {
                  date: parsedDate,
                  rawDate: rawDate,
                  status: opStatus,
                  city: String(dataA[r][idxCityA] || tabName).trim()
                };
              }
            }
          }
        }
      } catch (errA) {
        Logger.log('Error reading Source A: ' + errA);
      }
    }

    // Read Source B ("VTS +camera Off" / "Operation Vehicle Maintenance")
    if (VTS_CONFIG.SOURCE_B_OPERATION_SHEET_ID) {
      try {
        var ssB = safeOpenSpreadsheet(VTS_CONFIG.SOURCE_B_OPERATION_SHEET_ID);
        if (ssB) {
          var sheetsB = ssB.getSheets();
          for (var s2 = 0; s2 < sheetsB.length; s2++) {
            var tabB = sheetsB[s2];
            var tabNameB = tabB.getName();
            var dataB = tabB.getDataRange().getValues();
            if (dataB.length <= 1) continue;

            var headersB = dataB[0].map(function(h) { return String(h).trim().toLowerCase(); });
            var idxDateB = findColIndex(headersB, ['date']);
            var idxVehB = findColIndex(headersB, ['vehicle no./ garage camera name', 'vehicle no', 'vehicle', 'name', 'vechile']);
            var idxStatusB = findColIndex(headersB, ['vehicle/garage status', 'operation status', 'status']);
            var idxCityB = findColIndex(headersB, ['city']);

            if (idxDateB === -1) idxDateB = 1;
            if (idxVehB === -1) idxVehB = 4;
            if (idxStatusB === -1) idxStatusB = 5;
            if (idxCityB === -1) idxCityB = 2;

            for (var r2 = 1; r2 < dataB.length; r2++) {
              var vNameB = String(dataB[r2][idxVehB] || '').trim().toUpperCase();
              var rawDateB = dataB[r2][idxDateB];
              var opStatusB = String(dataB[r2][idxStatusB] || '').trim();
              if (!vNameB || !opStatusB) continue;

              var parsedDateB = parseDateValue(rawDateB);
              if (!vehicleMap[vNameB] || parsedDateB > vehicleMap[vNameB].date) {
                vehicleMap[vNameB] = {
                  date: parsedDateB,
                  rawDate: rawDateB,
                  status: opStatusB,
                  city: String(dataB[r2][idxCityB] || tabNameB).trim()
                };
              }
            }
          }
        }
      } catch (errB) {
        Logger.log('Error reading Source B: ' + errB);
      }
    }

    // Update Master Sheet ("900")
    var ssMaster = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ssMaster) return { success: false, error: 'Master sheet not found' };
    var sheet = getMasterSheetStrict(ssMaster);
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: false, error: 'Master sheet has no rows' };

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxName = findColIndex(headers, ['name', 'vehicle']);
    var idxFinalStatus = findColIndex(headers, ['final status']);
    var idxStatusOverride = findColIndex(headers, ['status override', 'override']);

    if (idxName === -1) idxName = 1;
    if (idxFinalStatus === -1) idxFinalStatus = 7;
    if (idxStatusOverride === -1) {
      idxStatusOverride = headers.length;
      sheet.getRange(1, idxStatusOverride + 1).setValue('Status Override');
    }

    var updatedCount = 0;
    for (var i = 1; i < data.length; i++) {
      var rowName = String(data[i][idxName] || '').trim().toUpperCase();
      if (rowName && vehicleMap.hasOwnProperty(rowName)) {
        updatedCount++;
      }
    }

    // [USER REQUIREMENT]: Column H ('Final Status') contains live Google Sheet formulas (=IFNA(...)).
    // DO NOT OVERWRITE COLUMN H! Formulas must stay locked and untouched.
    ensureColumnHProtected(sheet);

    var refreshTime = new Date().toLocaleString('en-GB');
    return {
      success: true,
      message: 'Column H (Final Status) is LOCKED & PROTECTED. All live sheet formulas (=IFNA) remain untouched and valid.',
      matchedCount: updatedCount,
      totalCount: data.length - 1,
      refreshedAt: refreshTime
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * 17. Update Status Override (Inline editable manual override)
 */
function updateStatusOverride(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = getMasterSheetStrict(ss);
    var data = sheet.getDataRange().getValues();

    var targetImei = normalizeUniqueid(payload.uniqueid || payload.imei);
    var overrideValue = String(payload.override || '').trim();

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxImei = findColIndex(headers, ['uniqueid', 'imei']);
    var idxOverride = findColIndex(headers, ['status override', 'override']);
    var idxFinalStatus = findColIndex(headers, ['final status']);

    if (idxImei === -1) idxImei = 2;
    if (idxFinalStatus === -1) idxFinalStatus = 7;
    if (idxOverride === -1) {
      idxOverride = headers.length;
      sheet.getRange(1, idxOverride + 1).setValue('Status Override');
    }

    for (var i = 1; i < data.length; i++) {
      if (normalizeUniqueid(data[i][idxImei]) === targetImei) {
        var rowNum = i + 1;
        sheet.getRange(rowNum, idxOverride + 1).setValue(overrideValue);
        // Column H ('Final Status') is LOCKED: Never overwrite Column H formulas!
        return { success: true, message: 'Status override updated for device ' + targetImei };
      }
    }
    return { success: false, error: 'Device ' + targetImei + ' not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * 17b. Lock & Protect Column H (Final Status) in Google Sheets
 */
function protectColumnH() {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Master sheet not found' };
    var sheet = getMasterSheetStrict(ss);
    ensureColumnHProtected(sheet);
    return { success: true, message: 'Column H (Final Status) has been locked and protected in Google Sheets.' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function ensureColumnHProtected(sheet) {
  try {
    var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    var colHRange = sheet.getRange('H:H');
    var alreadyProtected = false;
    for (var p = 0; p < protections.length; p++) {
      var r = protections[p].getRange();
      if (r && r.getA1Notation().indexOf('H') > -1) {
        alreadyProtected = true;
        break;
      }
    }
    if (!alreadyProtected) {
      var prot = colHRange.protect().setDescription('Column H: Final Status (Live Formulas - Locked & Protected)');
      prot.setWarningOnly(true);
    }
  } catch (pErr) {
    Logger.log('Notice on range protection: ' + pErr);
  }
}

/**
 * 18. Data-Fill Status Monitoring (Vendor City Vehicle Data)
 */
function getDataFillStatus() {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.SOURCE_A_VENDOR_SHEET_ID);
    if (!ss) return [];
    var sheets = ss.getSheets();
    var result = [];
    var todayStr = formatSheetDate(new Date());

    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var name = sheet.getName();
      if (name.toLowerCase() === 'status summary') continue;

      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        result.push({
          city: name,
          lastEntryDate: 'No Data',
          filledToday: false,
          daysSinceLastEntry: 999
        });
        continue;
      }

      var data = sheet.getRange(2, 2, Math.min(lastRow - 1, 100), 1).getValues();
      var latestDate = new Date(0);
      var latestDateStr = '';

      for (var r = 0; r < data.length; r++) {
        var cellDate = data[r][0];
        if (!cellDate) continue;
        var pDate = parseDateValue(cellDate);
        if (pDate > latestDate) {
          latestDate = pDate;
          latestDateStr = formatSheetDate(cellDate);
        }
      }

      var daysDiff = latestDate.getTime() > 0 ? Math.floor((new Date().getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)) : 999;
      var isToday = (daysDiff === 0 || latestDateStr === todayStr);

      result.push({
        city: name,
        lastEntryDate: latestDateStr || 'No Data',
        filledToday: isToday,
        daysSinceLastEntry: Math.max(0, daysDiff)
      });
    }

    return result;
  } catch (err) {
    Logger.log('getDataFillStatus error: ' + err);
    return [];
  }
}

/**
 * 19. Camera Sheet Monitoring (Source B)
 */
function getCameraFillStatus() {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.SOURCE_B_OPERATION_SHEET_ID);
    if (!ss) return [];
    var tab = ss.getSheetByName('Vehicle./Parking Camera') || ss.getSheets()[0];
    var data = tab.getDataRange().getValues();
    if (data.length <= 1) return [];

    var cityMap = {};
    var todayStr = formatSheetDate(new Date());

    for (var i = 1; i < data.length; i++) {
      var rowDate = formatSheetDate(data[i][1]);
      var city = String(data[i][2] || '').trim();
      var cameraStatus = String(data[i][6] || '').trim().toLowerCase();

      if (!city) continue;
      if (!cityMap[city]) {
        cityMap[city] = {
          city: city,
          totalCameras: 0,
          working: 0,
          notWorking: 0,
          lastDate: rowDate,
          filledToday: false
        };
      }

      cityMap[city].totalCameras++;
      if (cameraStatus === 'working') cityMap[city].working++;
      else if (cameraStatus.includes('not')) cityMap[city].notWorking++;

      if (rowDate === todayStr) cityMap[city].filledToday = true;
    }

    var list = [];
    for (var c in cityMap) list.push(cityMap[c]);
    return list;
  } catch (err) {
    return [];
  }
}

/**
 * 20. Inactive + Running Vehicle Anomaly Engine
 */
function getInactiveRunningDevices() {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return [];
    var sheet = getMasterSheetStrict(ss);
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxName = findColIndex(headers, ['name', 'vehicle']);
    var idxImei = findColIndex(headers, ['uniqueid', 'imei']);
    var idxPhone = findColIndex(headers, ['phone', 'sim']);
    var idxCity = findColIndex(headers, ['city']);
    var idxRoadcast = findColIndex(headers, ['status on roadcast', 'roadcast status']);
    var idxFinalStatus = findColIndex(headers, ['final status']);
    var idxLastUpdate = findColIndex(headers, ['last update']);
    var idxVtsType = findColIndex(headers, ['vts type']);
    var idxInactiveRemark = findColIndex(headers, ['inactive-running remark', 'inactive running remark']);
    var idxLastRemarkUpdate = findColIndex(headers, ['last remark update']);

    if (idxName === -1) idxName = 1;
    if (idxImei === -1) idxImei = 2;
    if (idxPhone === -1) idxPhone = 3;
    if (idxCity === -1) idxCity = 4;
    if (idxRoadcast === -1) idxRoadcast = 5;
    if (idxLastUpdate === -1) idxLastUpdate = 6;
    if (idxFinalStatus === -1) idxFinalStatus = 7;
    if (idxVtsType === -1) idxVtsType = 8;

    var list = [];
    for (var i = 1; i < data.length; i++) {
      var rRoadcast = String(data[i][idxRoadcast] || '').trim().toLowerCase();
      var rFinal = String(data[i][idxFinalStatus] || '').trim().toUpperCase();

      if (rRoadcast === 'inactive' && rFinal === 'RUNNING') {
        list.push({
          date: formatSheetDate(new Date()),
          uniqueid: normalizeUniqueid(data[i][idxImei]),
          name: String(data[i][idxName] || '').trim(),
          phone: normalizeUniqueid(data[i][idxPhone]),
          city: String(data[i][idxCity] || '').trim(),
          vtsStatus: 'Inactive',
          vehicleStatus: 'RUNNING',
          lastUpdate: formatSheetDate(data[i][idxLastUpdate]),
          vtsType: String(data[i][idxVtsType] || 'VTS Package 4G').trim(),
          remark: idxInactiveRemark > -1 ? String(data[i][idxInactiveRemark] || '').trim() : '',
          lastRemarkUpdate: idxLastRemarkUpdate > -1 ? formatSheetDate(data[i][idxLastRemarkUpdate]) : ''
        });
      }
    }
    return list;
  } catch (err) {
    return [];
  }
}

function updateInactiveRunningRemark(payload) {
  try {
    var ss = safeOpenSpreadsheet(VTS_CONFIG.MASTER_SHEET);
    if (!ss) return { success: false, error: 'Could not open Master Sheet' };
    var sheet = getMasterSheetStrict(ss);
    var data = sheet.getDataRange().getValues();

    var targetImei = normalizeUniqueid(payload.uniqueid || payload.imei);
    var remark = String(payload.remark || '').trim();
    var todayStr = formatSheetDate(new Date());

    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var idxImei = findColIndex(headers, ['uniqueid', 'imei']);
    var idxInactiveRemark = findColIndex(headers, ['inactive-running remark', 'inactive running remark']);
    var idxLastRemarkUpdate = findColIndex(headers, ['last remark update']);
    var idxLastCol = headers.length;

    if (idxImei === -1) idxImei = 2;
    if (idxInactiveRemark === -1) {
      idxInactiveRemark = idxLastCol;
      sheet.getRange(1, idxInactiveRemark + 1).setValue('Inactive-Running Remark');
      idxLastCol++;
    }
    if (idxLastRemarkUpdate === -1) {
      idxLastRemarkUpdate = idxLastCol;
      sheet.getRange(1, idxLastRemarkUpdate + 1).setValue('Last Remark Update');
    }

    for (var i = 1; i < data.length; i++) {
      if (normalizeUniqueid(data[i][idxImei]) === targetImei) {
        var rowNum = i + 1;
        sheet.getRange(rowNum, idxInactiveRemark + 1).setValue(remark);
        sheet.getRange(rowNum, idxLastRemarkUpdate + 1).setValue(todayStr);
        return { success: true, message: 'Inactive-running remark saved for ' + targetImei };
      }
    }
    return { success: false, error: 'Device ' + targetImei + ' not found' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * 21. Dynamic Notification Center (MailApp Personalized Dispatch)
 */
function sendCustomNotification(payload) {
  try {
    var recipients = payload.recipients || [];
    var notificationType = payload.notificationType || 'General Notification';
    var customMessage = payload.message || '';
    var items = payload.items || [];
    var portalUrl = 'https://wevois-vts-fleet.web.app/';

    if (!recipients || recipients.length === 0) {
      return { success: false, error: 'No recipients selected' };
    }

    var sentCount = 0;
    for (var i = 0; i < recipients.length; i++) {
      var recipientEmail = String(recipients[i]).trim();
      if (!recipientEmail) continue;

      var subject = '⚠️ WeVois VTS Alert: ' + notificationType;
      var body = [
        'Hello,',
        '',
        'You have a new action required from the WeVois VTS Fleet Management Portal.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '  NOTIFICATION DETAILS',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '  Type            : ' + notificationType,
        (customMessage ? '  Message         : ' + customMessage : ''),
        '  Total Items     : ' + items.length,
        '  Portal Direct   : ' + portalUrl,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        'Please log in to review and take action for your assigned city/devices.',
        '',
        'Regards,',
        'WeVois VTS Admin'
      ].join('\n');

      MailApp.sendEmail({
        to: recipientEmail,
        subject: subject,
        body: body
      });
      sentCount++;
    }

    return {
      success: true,
      sentCount: sentCount,
      message: 'Notification successfully emailed to ' + sentCount + ' manager(s)!'
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function parseDateValue(val) {
  if (!val) return new Date(0);
  if (val instanceof Date) return val;
  var str = String(val).trim();
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;
  var parts = str.split(/[-/]/);
  if (parts.length === 3) {
    var day = parseInt(parts[0], 10);
    var monthStr = parts[1];
    var year = parseInt(parts[2], 10);
    var monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(monthStr.toLowerCase().slice(0, 3));
    if (monthIdx >= 0) return new Date(year, monthIdx, day);
    var month = parseInt(parts[1], 10) - 1;
    if (!isNaN(month) && !isNaN(day) && !isNaN(year)) return new Date(year, month, day);
  }
  return new Date(0);
}

/**
 * Simple Trigger: onEdit(e)
 * Automatically syncs 'Rechage status', 'New License End', and 'Status' (Done / Not Done / Pending)
 * when edits occur directly in the Google Sheet.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var range = e.range;
    var sheet = range.getSheet();
    var sName = sheet.getName();

    // Ignore master or non-cycle sheets
    if (['900', 'VTS Data', 'Users', 'City_Email_Contacts', 'Search_History', 'Pivot Table 5', 'Search', 'Vendor Vehicles', 'analysis'].indexOf(sName) > -1) {
      return;
    }

    var row = range.getRow();
    var col = range.getColumn();
    if (row < 2) return; // ignore header row

    // Only handle edits in Col H (Col 8: Rechage status) or Col I (Col 9: New License End)
    if (col === 8 || col === 9) {
      var rowValues = sheet.getRange(row, 1, 1, 10).getValues()[0];
      var curLic = formatSheetDate(rowValues[4]); // Col E (Col 5): License End
      var decRaw = String(rowValues[7] || '').trim().toLowerCase(); // Col H (Col 8): Rechage status
      var newLicRaw = formatSheetDate(rowValues[8]); // Col I (Col 9): New License End

      var isYes = decRaw === 'yes' || decRaw === 'approved';
      var isNo = decRaw === 'no' || decRaw === 'declined' || decRaw === 'rejected';

      if (col === 8) {
        // User edited Rechage status
        if (isYes) {
          if (newLicRaw && newLicRaw !== curLic) {
            sheet.getRange(row, 10).setValue('Done');
          } else {
            sheet.getRange(row, 9).setValue(''); // Col I stays blank until genuine new date arrives
            sheet.getRange(row, 10).setValue('Not Done');
          }
        } else if (isNo) {
          sheet.getRange(row, 9).setValue(''); // Col I is blank when denied
          sheet.getRange(row, 10).setValue('Not Done');
        } else {
          sheet.getRange(row, 9).setValue('');
          sheet.getRange(row, 10).setValue('Pending');
        }
      } else if (col === 9) {
        // User edited New License End date
        if (newLicRaw && newLicRaw !== curLic) {
          sheet.getRange(row, 8).setValue('Yes');
          sheet.getRange(row, 10).setValue('Done');
        } else {
          sheet.getRange(row, 9).setValue('');
          if (isYes) {
            sheet.getRange(row, 10).setValue('Not Done');
          } else if (isNo) {
            sheet.getRange(row, 10).setValue('Not Done');
          } else {
            sheet.getRange(row, 10).setValue('Pending');
          }
        }
      }
    }
  } catch (err) {
    Logger.log('onEdit error: ' + err);
  }
}

/**
 * ============================================================================
 * VEHICLE HISTORY & DOWNTIME AUDIT ENGINE
 * Searches historical daily CSV reports in Drive folder: 1WqrIXW7abqYzCug_xz4LbzVag2plBDnB
 * Calculates: Downtime %, Longest Inactive Streak, Repeated Stale Remarks, Color Coding
 * ============================================================================
 */

/**
 * 1. Web API Endpoint for Web App: searchVehicleHistoryApi
 * Supports targeted field search, strict city filtering, chronic inactive detection,
 * device swap tracking, and site-wise uptime scorecards.
 */
function searchVehicleHistoryApi(params) {
  var rawSearchTerm = (params.searchTerm || params.search || params.vehicle || params.imei || params.city || params.phone || params.remark || '').toString().trim();
  var searchField = (params.searchField || params.field || 'all').toString().trim().toLowerCase();
  var selectedCity = (params.cityFilter || params.selectedCity || '').toString().trim().toLowerCase();
  var statusFilter = (params.statusFilter || 'all').toString().trim().toLowerCase();
  var exactMatch = params.exactMatch === true || params.exactMatch === 'true';
  var startDateStr = params.startDate;
  var endDateStr = params.endDate;

  // 1. Parse Search Terms (Single vs Multiple / Batch OR-search)
  var multiTerms = [];
  if (rawSearchTerm) {
    var rawSplits = rawSearchTerm.split(/[,;\n|\t]+/);
    if (rawSplits.length > 1) {
      multiTerms = rawSplits.map(function(s) { return s.trim().toLowerCase(); }).filter(function(s) { return s.length > 0; });
    } else if (searchField === 'imei' || /^\d{10,20}(\s+\d{10,20})+$/.test(rawSearchTerm.trim())) {
      multiTerms = rawSearchTerm.trim().toLowerCase().split(/\s+/).filter(function(s) { return s.length >= 6; });
    }
  }

  var isMultiTermSearch = multiTerms.length > 1;
  var searchTokens = !isMultiTermSearch ? rawSearchTerm.toLowerCase().split(/\s+/).filter(function(t) { return t.length > 0; }) : [];

  // 2. Parse Multiple Selected Cities / Sites
  var selectedCities = [];
  if (params.cities && Array.isArray(params.cities)) {
    selectedCities = params.cities.map(function(c) { return String(c).trim().toLowerCase(); }).filter(Boolean);
  } else if (selectedCity) {
    selectedCities = selectedCity.split(/[,;\n|]+/).map(function(c) { return c.trim().toLowerCase(); }).filter(Boolean);
  }

  if (!rawSearchTerm && selectedCities.length === 0) {
    throw new Error("Please enter a Search Term or select a City.");
  }

  var startDate = startDateStr ? new Date(startDateStr) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  var endDate = endDateStr ? new Date(endDateStr) : new Date();

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error("Invalid startDate or endDate format.");
  }

  var dailyFolderId = VTS_CONFIG.DAILY_REPORTS_FOLDER_ID || '1WqrIXW7abqYzCug_xz4LbzVag2plBDnB';
  var folder = DriveApp.getFolderById(dailyFolderId);
  var results = [];
  var serialNumber = 1;
  var uniqueVehicleMap = {};
  var cityMap = {};
  var vehicleImeiMap = {}; // vehicleName -> { imei: count }
  var imeiVehicleMap = {};  // imei -> { vehicleName: count }

  // HIGH PERFORMANCE OPTIMIZATION 1:
  // Pre-index daily CSV files in ONE pass instead of making N separate Drive search network calls!
  var fileMap = {};
  var folderFiles = folder.getFiles();
  while (folderFiles.hasNext()) {
    var f = folderFiles.next();
    var fName = f.getName();
    if (fName.indexOf("VTS_Report_") === 0) {
      fileMap[fName] = f;
    }
  }

  var currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    var formattedDate = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), "d_MMM_yyyy");
    var targetFileName = "VTS_Report_" + formattedDate + ".csv";

    var file = fileMap[targetFileName];
    if (file) {
      var rawBlobText = file.getBlob().getDataAsString();
      var lowerRawBlob = rawBlobText.toLowerCase();

      // Quick file-level check
      var fileMightMatch = true;
      if (selectedCities.length > 0) {
        var cityMatchInBlob = selectedCities.some(function(c) { return lowerRawBlob.indexOf(c) !== -1; });
        if (!cityMatchInBlob) fileMightMatch = false;
      }

      if (fileMightMatch) {
        if (isMultiTermSearch) {
          var anyTermInBlob = multiTerms.some(function(term) { return lowerRawBlob.indexOf(term) !== -1; });
          if (!anyTermInBlob) fileMightMatch = false;
        } else if (searchTokens.length > 0) {
          if (exactMatch) {
            if (lowerRawBlob.indexOf(rawSearchTerm.toLowerCase()) === -1) fileMightMatch = false;
          } else {
            var hasAllTokens = searchTokens.every(function(token) {
              return lowerRawBlob.indexOf(token) !== -1;
            });
            if (!hasAllTokens) fileMightMatch = false;
          }
        }
      }

      if (fileMightMatch) {
        var lines = rawBlobText.split(/\r?\n/);
        if (lines.length > 1) {
          var headerLine = lines[0];
          var headers = Utilities.parseCsv(headerLine)[0];

          var nameIdx     = headers.findIndex(function(h) { return h.toString().toLowerCase().trim() === "name"; });
          var imeiIdx     = headers.findIndex(function(h) { var s = h.toString().toLowerCase().trim(); return s === "uniqueid" || s === "imei"; });
          var cityIdx     = headers.findIndex(function(h) { var s = h.toString().toLowerCase().trim(); return s === "city(user)" || s === "city"; });
          var phoneIdx    = headers.findIndex(function(h) { var s = h.toString().toLowerCase().trim(); return s === "sim" || s === "sim no" || s === "phone" || s === "mobile" || s === "sim number" || s === "contact"; });
          var roadcastIdx = headers.findIndex(function(h) { return h.toString().toLowerCase().trim() === "status on roadcast"; });
          var finalIdx    = headers.findIndex(function(h) { return h.toString().toLowerCase().trim() === "final status"; });
          var remarkIdx   = headers.findIndex(function(h) { return h.toString().toLowerCase().trim() === "remark"; });

          if (nameIdx === -1) nameIdx = 1;
          if (imeiIdx === -1) imeiIdx = 2;
          if (cityIdx === -1) cityIdx = 4;
          if (roadcastIdx === -1) roadcastIdx = 6;
          if (finalIdx === -1) finalIdx = 8;
          if (remarkIdx === -1) remarkIdx = 10;

          for (var i = 1; i < lines.length; i++) {
            var line = lines[i];
            if (!line || !line.trim()) continue;

            var lowerLine = line.toLowerCase();

            // Quick skip if selectedCities are not in this line at all
            if (selectedCities.length > 0) {
              var cityInLine = selectedCities.some(function(c) { return lowerLine.indexOf(c) !== -1; });
              if (!cityInLine) continue;
            }

            var parsedRow = Utilities.parseCsv(line)[0];
            if (!parsedRow || parsedRow.length === 0) continue;

            var vName     = (nameIdx !== -1 && parsedRow[nameIdx]) ? parsedRow[nameIdx].toString().trim() : "";
            var vImei     = (imeiIdx !== -1 && parsedRow[imeiIdx]) ? parsedRow[imeiIdx].toString().trim() : "";
            var vCity     = (cityIdx !== -1 && parsedRow[cityIdx]) ? parsedRow[cityIdx].toString().trim() : "";
            var vPhone    = (phoneIdx !== -1 && parsedRow[phoneIdx]) ? parsedRow[phoneIdx].toString().trim() : "";
            var vRoadcast = (roadcastIdx !== -1 && parsedRow[roadcastIdx]) ? parsedRow[roadcastIdx].toString().trim() : "";
            var vFinal    = (finalIdx !== -1 && parsedRow[finalIdx]) ? parsedRow[finalIdx].toString().trim() : "";
            var vRemark   = (remarkIdx !== -1 && parsedRow[remarkIdx]) ? parsedRow[remarkIdx].toString().trim() : "";

            var lowerCity   = vCity.toLowerCase();
            var lowerName   = vName.toLowerCase();
            var lowerImei   = vImei.toLowerCase();
            var lowerPhone  = vPhone.toLowerCase();
            var lowerRemark = vRemark.toLowerCase();
            var lowerStatus = vRoadcast.toLowerCase();

            // 1. STRICT CITY FILTER CHECK (Supports multi-cities)
            if (selectedCities.length > 0) {
              var matchCityCell = selectedCities.some(function(c) { return lowerCity.indexOf(c) !== -1; });
              if (!matchCityCell) continue;
            }

            // 2. STATUS FILTER CHECK
            if (statusFilter === 'active' && lowerStatus !== 'active') continue;
            if (statusFilter === 'inactive' && lowerStatus === 'active') continue;

            // 3. TARGETED SEARCH FIELD CHECK (Supports multi-term OR condition)
            var isMatched = true;
            var matchedIn = [];

            if (isMultiTermSearch || searchTokens.length > 0) {
              function matchCheck(val) {
                if (!val) return false;
                if (isMultiTermSearch) {
                  return multiTerms.some(function(term) { return val.indexOf(term) !== -1; });
                }
                if (exactMatch) {
                  return val.indexOf(rawSearchTerm.toLowerCase()) !== -1;
                }
                return searchTokens.every(function(token) { return val.indexOf(token) !== -1; });
              }

              if (searchField === 'city') {
                isMatched = matchCheck(lowerCity);
                if (isMatched) matchedIn.push('City');
              } else if (searchField === 'vehicle') {
                isMatched = matchCheck(lowerName);
                if (isMatched) matchedIn.push('Vehicle');
              } else if (searchField === 'imei') {
                isMatched = matchCheck(lowerImei) || matchCheck(lowerPhone);
                if (isMatched) matchedIn.push('IMEI/SIM');
              } else if (searchField === 'remark') {
                isMatched = matchCheck(lowerRemark);
                if (isMatched) matchedIn.push('Remark');
              } else {
                // Universal ('all') search - detect which column matched
                isMatched = false;
                if (matchCheck(lowerCity))   { isMatched = true; matchedIn.push('City'); }
                if (matchCheck(lowerName))   { isMatched = true; matchedIn.push('Vehicle'); }
                if (matchCheck(lowerImei))   { isMatched = true; matchedIn.push('IMEI'); }
                if (matchCheck(lowerPhone))  { isMatched = true; matchedIn.push('SIM'); }
                if (matchCheck(lowerRemark)) { isMatched = true; matchedIn.push('Remark'); }
                if (matchCheck(lowerStatus)) { isMatched = true; matchedIn.push('Status'); }
              }
            } else if (selectedCities.length > 0) {
              matchedIn.push('City Filter');
            }

            if (!isMatched) continue;

            var vKey = vName || vImei || ('row_' + i);
            uniqueVehicleMap[vKey] = (uniqueVehicleMap[vKey] || 0) + 1;

            // Aggregate city-wise stats
            var normCity = vCity || 'Unassigned';
            if (!cityMap[normCity]) {
              cityMap[normCity] = { total: 0, active: 0, inactive: 0, vehicles: {} };
            }
            cityMap[normCity].total++;
            if (lowerStatus === 'active') {
              cityMap[normCity].active++;
            } else {
              cityMap[normCity].inactive++;
            }
            cityMap[normCity].vehicles[vKey] = true;

            // Track device swaps
            if (vName && vImei) {
              if (!vehicleImeiMap[vName]) vehicleImeiMap[vName] = {};
              vehicleImeiMap[vName][vImei] = (vehicleImeiMap[vName][vImei] || 0) + 1;

              if (!imeiVehicleMap[vImei]) imeiVehicleMap[vImei] = {};
              imeiVehicleMap[vImei][vName] = (imeiVehicleMap[vImei][vName] || 0) + 1;
            }

            results.push({
              sr: serialNumber++,
              date: Utilities.formatDate(currentDate, Session.getScriptTimeZone(), "yyyy-MM-dd"),
              displayDate: Utilities.formatDate(currentDate, Session.getScriptTimeZone(), "dd-MMM-yyyy"),
              vehicleName: vName,
              imei: vImei,
              city: vCity,
              phone: vPhone,
              roadcastStatus: vRoadcast,
              finalStatus: vFinal,
              remark: vRemark,
              matchedIn: matchedIn.join(', ') || 'Exact Match'
            });
          }
        }
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Calculate Overall Insights
  var totalRecords = results.length;
  var uniqueVehicleCount = Object.keys(uniqueVehicleMap).length;
  var activeRecords = results.filter(function(r) { return (r.roadcastStatus || '').toLowerCase() === "active"; }).length;
  var inactiveRecords = totalRecords - activeRecords;
  var downtimePct = totalRecords > 0 ? ((inactiveRecords / totalRecords) * 100).toFixed(1) : "0.0";

  // Per-vehicle group for streak, flapping, and swap analysis
  var vehicleHistoryMap = {};
  results.forEach(function(r) {
    var vKey = r.vehicleName || r.imei || 'unknown';
    if (!vehicleHistoryMap[vKey]) vehicleHistoryMap[vKey] = [];
    vehicleHistoryMap[vKey].push(r);
  });

  var chronicInactiveVehicles = [];
  var maxStreakOverall = 0;

  for (var vKey in vehicleHistoryMap) {
    var vRows = vehicleHistoryMap[vKey];
    // Sort rows ascending by date
    vRows.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

    var currentInactiveStreak = 0;
    var maxVehicleStreak = 0;
    var flipCount = 0;
    var prevStatus = null;

    vRows.forEach(function(row) {
      var isInactive = (row.roadcastStatus || '').toLowerCase() === "inactive";
      if (isInactive) {
        currentInactiveStreak++;
        maxVehicleStreak = Math.max(maxVehicleStreak, currentInactiveStreak);
      } else {
        currentInactiveStreak = 0;
      }
      if (prevStatus !== null && prevStatus !== (row.roadcastStatus || '').toLowerCase()) {
        flipCount++;
      }
      prevStatus = (row.roadcastStatus || '').toLowerCase();
    });

    maxStreakOverall = Math.max(maxStreakOverall, maxVehicleStreak);

    // Check if device was swapped (multiple IMEIs for same vehicle or vice versa)
    var isSwapped = false;
    if (vRows[0].vehicleName && Object.keys(vehicleImeiMap[vRows[0].vehicleName] || {}).length > 1) {
      isSwapped = true;
    }
    if (vRows[0].imei && Object.keys(imeiVehicleMap[vRows[0].imei] || {}).length > 1) {
      isSwapped = true;
    }

    var isChronic = currentInactiveStreak >= 3;
    var isFlapping = flipCount >= 2;

    if (isChronic) {
      chronicInactiveVehicles.push({
        vehicle: vKey,
        city: vRows[vRows.length - 1].city,
        imei: vRows[vRows.length - 1].imei,
        streakDays: currentInactiveStreak,
        latestRemark: vRows[vRows.length - 1].remark
      });
    }

    // Attach metadata flags to all rows of this vehicle
    vRows.forEach(function(row) {
      row.inactiveStreak = currentInactiveStreak;
      row.maxStreak = maxVehicleStreak;
      row.isChronicInactive = isChronic;
      row.isFlapping = isFlapping;
      row.isSwapped = isSwapped;
    });
  }

  // Stale / Repeated Remark Detection (3+ occurrences)
  var remarkCounts = {};
  var repeatedRemark = null;
  results.forEach(function(r) {
    var rmk = (r.remark || '').trim();
    if (rmk && rmk.length > 2) {
      var rmkKey = rmk.toLowerCase();
      remarkCounts[rmkKey] = (remarkCounts[rmkKey] || 0) + 1;
      if (remarkCounts[rmkKey] >= 3 && !repeatedRemark) {
        repeatedRemark = rmk;
      }
    }
  });

  results.forEach(function(r) {
    var rmkKey = (r.remark || '').trim().toLowerCase();
    if (rmkKey && remarkCounts[rmkKey] >= 3) {
      r.isStaleRemark = true;
    }
  });

  // Dynamic IMEI Movement & Lifecycle Analysis across Vehicles & Cities (Supports Single & Multiple IMEIs)
  var imeiHistoryMap = {};
  results.forEach(function(r) {
    var imei = (r.imei || '').trim();
    if (imei) {
      if (!imeiHistoryMap[imei]) imeiHistoryMap[imei] = [];
      imeiHistoryMap[imei].push(r);
    }
  });

  function buildSingleImeiAnalysis(targetImeiKey, imeiRows) {
    if (!imeiRows || imeiRows.length === 0) return null;
    var sortedRows = imeiRows.slice().sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

    var distinctVehiclesMap = {};
    var distinctCitiesMap = {};
    var phases = [];
    var transitions = [];
    var currentPhase = null;
    var prevRow = null;

    sortedRows.forEach(function(r) {
      var vName = r.vehicleName || 'Unknown Vehicle';
      var cName = r.city || 'Unassigned';
      var isAct = (r.roadcastStatus || '').toLowerCase() === 'active';

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
      var dv = distinctVehiclesMap[vName];
      dv.cities[cName] = true;
      dv.lastSeen = r.displayDate || r.date;
      dv.lastDateRaw = r.date;
      dv.daysCount++;
      if (isAct) dv.activeDays++; else dv.inactiveDays++;
      dv.latestStatus = r.roadcastStatus;
      if (r.remark && dv.remarks.indexOf(r.remark) === -1) dv.remarks.push(r.remark);

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
      var dc = distinctCitiesMap[cName];
      dc.vehicles[vName] = true;
      dc.lastSeen = r.displayDate || r.date;
      dc.daysCount++;
      if (isAct) dc.activeDays++; else dc.inactiveDays++;

      if (!currentPhase || currentPhase.vehicle !== vName || currentPhase.city !== cName) {
        if (prevRow) {
          var tType = (prevRow.vehicleName !== vName && prevRow.city !== cName) ? 'both' : (prevRow.vehicleName !== vName ? 'vehicle_swap' : 'city_transfer');
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
        if (r.remark && currentPhase.remarks.indexOf(r.remark) === -1) currentPhase.remarks.push(r.remark);
      }

      prevRow = r;
    });

    var vehicleList = Object.keys(distinctVehiclesMap).map(function(k) {
      var obj = distinctVehiclesMap[k];
      obj.cities = Object.keys(obj.cities);
      obj.uptimePct = obj.daysCount > 0 ? ((obj.activeDays / obj.daysCount) * 100).toFixed(1) : "0.0";
      return obj;
    });

    var cityList = Object.keys(distinctCitiesMap).map(function(k) {
      var obj = distinctCitiesMap[k];
      obj.vehicles = Object.keys(obj.vehicles);
      obj.uptimePct = obj.daysCount > 0 ? ((obj.activeDays / obj.daysCount) * 100).toFixed(1) : "0.0";
      return obj;
    });

    var latestRow = sortedRows[sortedRows.length - 1];
    var firstRow = sortedRows[0];
    var totalActive = sortedRows.filter(function(x) { return (x.roadcastStatus || '').toLowerCase() === 'active'; }).length;

    return {
      targetImei: targetImeiKey,
      totalTrackedDays: sortedRows.length,
      activeDays: totalActive,
      inactiveDays: sortedRows.length - totalActive,
      uptimePct: sortedRows.length > 0 ? ((totalActive / sortedRows.length) * 100).toFixed(1) : "0.0",
      distinctVehiclesCount: vehicleList.length,
      distinctCitiesCount: cityList.length,
      isDynamicSwap: vehicleList.length > 1,
      isInterCityMovement: cityList.length > 1,
      vehicles: vehicleList,
      cities: cityList,
      phases: phases,
      transitions: transitions,
      firstSeenDate: firstRow ? (firstRow.displayDate || firstRow.date) : null,
      lastSeenDate: latestRow ? (latestRow.displayDate || latestRow.date) : null,
      latestVehicle: latestRow ? latestRow.vehicleName : null,
      latestCity: latestRow ? latestRow.city : null,
      latestStatus: latestRow ? latestRow.roadcastStatus : null,
      latestPhone: latestRow ? latestRow.phone : null
    };
  }

  var imeiAnalyses = {};
  var allFoundImeis = Object.keys(imeiHistoryMap);
  allFoundImeis.forEach(function(curImei) {
    imeiAnalyses[curImei] = buildSingleImeiAnalysis(curImei, imeiHistoryMap[curImei]);
  });

  var primaryTargetImei = null;
  if (isMultiTermSearch) {
    primaryTargetImei = allFoundImeis[0] || null;
  } else if (searchField === 'imei' || /^\d{6,20}$/.test(rawSearchTerm)) {
    primaryTargetImei = rawSearchTerm;
  } else {
    if (allFoundImeis.length === 1) primaryTargetImei = allFoundImeis[0];
  }

  var imeiAnalysis = primaryTargetImei && imeiAnalyses[primaryTargetImei] ? imeiAnalyses[primaryTargetImei] : (allFoundImeis.length > 0 ? imeiAnalyses[allFoundImeis[0]] : null);

  // Build City Breakdown Scorecard
  var cityBreakdown = Object.keys(cityMap).map(function(cName) {
    var c = cityMap[cName];
    var vCount = Object.keys(c.vehicles).length;
    var upPct = c.total > 0 ? ((c.active / c.total) * 100).toFixed(1) : "0.0";
    return {
      city: cName,
      vehicles: vCount,
      totalDays: c.total,
      activeDays: c.active,
      inactiveDays: c.inactive,
      uptimePct: upPct,
      downtimePct: (100 - parseFloat(upPct)).toFixed(1)
    };
  }).sort(function(a, b) { return b.inactiveDays - a.inactiveDays; });

  return {
    searchTerm: rawSearchTerm,
    searchField: searchField,
    selectedCity: selectedCity,
    selectedCities: selectedCities,
    isMultiTermSearch: isMultiTermSearch,
    searchedTerms: isMultiTermSearch ? multiTerms : (searchTokens.length > 0 ? [rawSearchTerm] : []),
    startDate: Utilities.formatDate(startDate, Session.getScriptTimeZone(), "yyyy-MM-dd"),
    endDate: Utilities.formatDate(endDate, Session.getScriptTimeZone(), "yyyy-MM-dd"),
    totalDays: totalRecords,
    totalRecords: totalRecords,
    uniqueVehicles: uniqueVehicleCount,
    activeDays: activeRecords,
    inactiveDays: inactiveRecords,
    downtimePct: downtimePct,
    longestStreak: maxStreakOverall,
    chronicInactiveCount: chronicInactiveVehicles.length,
    chronicVehicles: chronicInactiveVehicles,
    cityBreakdown: cityBreakdown,
    repeatedRemarkWarning: repeatedRemark ? ("Repeated remark flagged: \"" + repeatedRemark + "\" (occurred " + (remarkCounts[repeatedRemark.toLowerCase()] || 3) + "+ times)") : null,
    imeiAnalysis: imeiAnalysis,
    imeiAnalyses: imeiAnalyses,
    results: results
  };
}

/**
 * 2. Sheet Macro: searchVehicleHistory
 * Runs inside Google Sheets on tab 'Search_History'.
 * Cell B2: Search Term
 * Cell B3: Start Date
 * Cell B4: End Date
 * Cell B5: Optional Search Field ('City Only', 'Vehicle Only', 'All')
 */
function searchVehicleHistory() {
  var dailyFolderId = VTS_CONFIG.DAILY_REPORTS_FOLDER_ID || '1WqrIXW7abqYzCug_xz4LbzVag2plBDnB';
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var searchSheet = ss.getSheetByName("Search_History");
  if (!searchSheet) {
    Browser.msgBox("Error: Please create a sheet tab named 'Search_History' first!");
    return;
  }

  var rawSearchTerm = searchSheet.getRange("B2").getValue().toString().trim();
  var startDate = new Date(searchSheet.getRange("B3").getValue());
  var endDate = new Date(searchSheet.getRange("B4").getValue());
  var searchFieldInput = searchSheet.getRange("B5").getValue().toString().trim().toLowerCase();

  if (!rawSearchTerm || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    Browser.msgBox("Please fill out Search Term (B2), Start Date (B3), and End Date (B4) completely.");
    return;
  }

  var targetField = 'all';
  if (searchFieldInput.indexOf('city') !== -1) targetField = 'city';
  else if (searchFieldInput.indexOf('vehicle') !== -1) targetField = 'vehicle';
  else if (searchFieldInput.indexOf('imei') !== -1) targetField = 'imei';
  else if (searchFieldInput.indexOf('remark') !== -1) targetField = 'remark';

  var searchTokens = rawSearchTerm.toLowerCase().split(/\s+/).filter(function(t) { return t.length > 0; });
  var headerRow = ["Sr.", "Date", "Vehicle Name", "IMEI / Unique ID", "City", "SIM / Phone", "Status on Roadcast", "Final Status", "Remark", "Matched In"];
  searchSheet.getRange(6, 1, 1, headerRow.length).setValues([headerRow]);

  // Clear old summary + old results + old formatting
  searchSheet.getRange(5, 1, 1, headerRow.length).clearContent();
  if (searchSheet.getLastRow() >= 7) {
    var oldRange = searchSheet.getRange(7, 1, searchSheet.getLastRow() - 6, headerRow.length);
    oldRange.clearContent();
    oldRange.setBackground(null);
  }

  var results = [];
  var folder = DriveApp.getFolderById(dailyFolderId);
  var serialNumber = 1;

  // Single-pass folder file index
  var fileMap = {};
  var folderFiles = folder.getFiles();
  while (folderFiles.hasNext()) {
    var f = folderFiles.next();
    var fName = f.getName();
    if (fName.indexOf("VTS_Report_") === 0) {
      fileMap[fName] = f;
    }
  }

  var currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    var formattedDate = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), "d_MMM_yyyy");
    var targetFileName = "VTS_Report_" + formattedDate + ".csv";

    var file = fileMap[targetFileName];
    if (file) {
      var rawBlobText = file.getBlob().getDataAsString();
      var lowerRawBlob = rawBlobText.toLowerCase();

      var hasAllTokens = searchTokens.every(function(token) {
        return lowerRawBlob.indexOf(token) !== -1;
      });

      if (hasAllTokens) {
        var lines = rawBlobText.split(/\r?\n/);
        if (lines.length > 1) {
          var headerLine = lines[0];
          var headers = Utilities.parseCsv(headerLine)[0];

          var nameIdx     = headers.findIndex(function(h) { return h.toString().toLowerCase().trim() === "name"; });
          var imeiIdx     = headers.findIndex(function(h) { var s = h.toString().toLowerCase().trim(); return s === "uniqueid" || s === "imei"; });
          var cityIdx     = headers.findIndex(function(h) { var s = h.toString().toLowerCase().trim(); return s === "city(user)" || s === "city"; });
          var phoneIdx    = headers.findIndex(function(h) { var s = h.toString().toLowerCase().trim(); return s === "sim" || s === "sim no" || s === "phone" || s === "mobile" || s === "sim number" || s === "contact"; });
          var roadcastIdx = headers.findIndex(function(h) { return h.toString().toLowerCase().trim() === "status on roadcast"; });
          var finalIdx    = headers.findIndex(function(h) { return h.toString().toLowerCase().trim() === "final status"; });
          var remarkIdx   = headers.findIndex(function(h) { return h.toString().toLowerCase().trim() === "remark"; });

          if (nameIdx === -1) nameIdx = 1;
          if (imeiIdx === -1) imeiIdx = 2;
          if (cityIdx === -1) cityIdx = 4;
          if (roadcastIdx === -1) roadcastIdx = 6;
          if (finalIdx === -1) finalIdx = 8;
          if (remarkIdx === -1) remarkIdx = 10;

          for (var i = 1; i < lines.length; i++) {
            var line = lines[i];
            if (!line || !line.trim()) continue;

            var parsedRow = Utilities.parseCsv(line)[0];
            if (!parsedRow || parsedRow.length === 0) continue;

            var vName     = (nameIdx !== -1 && parsedRow[nameIdx]) ? parsedRow[nameIdx].toString().trim() : "";
            var vImei     = (imeiIdx !== -1 && parsedRow[imeiIdx]) ? parsedRow[imeiIdx].toString().trim() : "";
            var vCity     = (cityIdx !== -1 && parsedRow[cityIdx]) ? parsedRow[cityIdx].toString().trim() : "";
            var vPhone    = (phoneIdx !== -1 && parsedRow[phoneIdx]) ? parsedRow[phoneIdx].toString().trim() : "";
            var vRoadcast = (roadcastIdx !== -1 && parsedRow[roadcastIdx]) ? parsedRow[roadcastIdx].toString().trim() : "";
            var vFinal    = (finalIdx !== -1 && parsedRow[finalIdx]) ? parsedRow[finalIdx].toString().trim() : "";
            var vRemark   = (remarkIdx !== -1 && parsedRow[remarkIdx]) ? parsedRow[remarkIdx].toString().trim() : "";

            var lowerCity   = vCity.toLowerCase();
            var lowerName   = vName.toLowerCase();
            var lowerImei   = vImei.toLowerCase();
            var lowerPhone  = vPhone.toLowerCase();
            var lowerRemark = vRemark.toLowerCase();
            var lowerStatus = vRoadcast.toLowerCase();

            function checkMatch(val) {
              if (!val) return false;
              return searchTokens.every(function(token) { return val.indexOf(token) !== -1; });
            }

            var isMatched = false;
            var matchedIn = [];

            if (targetField === 'city') {
              isMatched = checkMatch(lowerCity);
              if (isMatched) matchedIn.push('City');
            } else if (targetField === 'vehicle') {
              isMatched = checkMatch(lowerName);
              if (isMatched) matchedIn.push('Vehicle');
            } else if (targetField === 'imei') {
              isMatched = checkMatch(lowerImei) || checkMatch(lowerPhone);
              if (isMatched) matchedIn.push('IMEI/SIM');
            } else if (targetField === 'remark') {
              isMatched = checkMatch(lowerRemark);
              if (isMatched) matchedIn.push('Remark');
            } else {
              // Universal matching with column detection
              if (checkMatch(lowerCity))   { isMatched = true; matchedIn.push('City'); }
              if (checkMatch(lowerName))   { isMatched = true; matchedIn.push('Vehicle'); }
              if (checkMatch(lowerImei))   { isMatched = true; matchedIn.push('IMEI'); }
              if (checkMatch(lowerPhone))  { isMatched = true; matchedIn.push('SIM'); }
              if (checkMatch(lowerRemark)) { isMatched = true; matchedIn.push('Remark'); }
              if (checkMatch(lowerStatus)) { isMatched = true; matchedIn.push('Status'); }
            }

            if (!isMatched) continue;

            results.push([
              serialNumber++,
              new Date(currentDate),
              vName, vImei, vCity, vPhone, vRoadcast, vFinal, vRemark, matchedIn.join(', ')
            ]);
          }
        }
      }
    } else {
      Logger.log("File not found for date: " + formattedDate);
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (results.length === 0) {
    Browser.msgBox("No historical records found matching '" + rawSearchTerm + "' in that date range.");
    return;
  }

  // Write data
  var range = searchSheet.getRange(7, 1, results.length, headerRow.length);
  range.setValues(results);
  range.offset(0, 1, results.length, 1).setNumberFormat("dd-mmm-yyyy");

  // Summary calculation
  var totalDays = results.length;
  var activeDays = results.filter(function(r) { return r[6].toString().toLowerCase().trim() === "active"; }).length;
  var inactiveDays = totalDays - activeDays;
  var downtimePct = ((inactiveDays / totalDays) * 100).toFixed(1);

  // Inactive streaks
  var vehicleRows = {};
  for (var i = 0; i < results.length; i++) {
    var vName = results[i][2];
    if (!vehicleRows[vName]) vehicleRows[vName] = [];
    vehicleRows[vName].push({ rowIndex: 7 + i, date: results[i][1], status: results[i][6], remark: results[i][8] });
  }

  var longestStreak = 0;
  for (var v in vehicleRows) {
    var rows = vehicleRows[v];
    var streak = 0, maxStreak = 0, prevInactiveDate = null;
    rows.forEach(function(row) {
      if (row.status.toString().toLowerCase().trim() === "inactive") {
        if (prevInactiveDate && (row.date - prevInactiveDate) === 86400000) {
          streak++;
        } else {
          streak = 1;
        }
        maxStreak = Math.max(maxStreak, streak);
        prevInactiveDate = row.date;
      } else {
        streak = 0;
        prevInactiveDate = null;
      }
    });
    longestStreak = Math.max(longestStreak, maxStreak);
  }

  // Row 5 summary
  var summaryText = "📊 Total Days: " + totalDays +
    "   |   ✅ Active: " + activeDays +
    "   |   ❌ Inactive: " + inactiveDays +
    "   |   Downtime: " + downtimePct + "%" +
    "   |   🔴 Longest Inactive Streak: " + longestStreak + " day(s)";
  searchSheet.getRange(5, 1).setValue(summaryText);
  searchSheet.getRange(5, 1).setFontWeight("bold").setFontColor("#b45f06");

  // Highlight active / inactive
  for (var i3 = 0; i3 < results.length; i3++) {
    var statusCell = searchSheet.getRange(7 + i3, 7); // Status on Roadcast column
    if (results[i3][6].toString().toLowerCase().trim() === "active") {
      statusCell.setBackground("#d9ead3");
    } else if (results[i3][6].toString().toLowerCase().trim() === "inactive") {
      statusCell.setBackground("#f4cccc");
    }
  }

  Logger.log("Found " + results.length + " rows.");
}

/**
 * 24. Automated Morning Fleet Inspection Engine & City WhatsApp Broadcast
 * Evaluates active fleet by city at 8:30 AM before 10:00 AM municipal inspection deadlines.
 * Generates pre-formatted WhatsApp alerts and anomaly digests per site.
 */
function getMorningFleetDigest() {
  try {
    var devices = getMasterDevices();
    var cityMap = {};
    var totalInactive = 0;
    var totalNoRemark = 0;

    for (var i = 0; i < devices.length; i++) {
      var d = devices[i];
      var city = d.city || 'Other';
      if (!cityMap[city]) {
        cityMap[city] = {
          city: city,
          total: 0,
          inactive: 0,
          noRemark: 0,
          inactiveVehicles: []
        };
      }
      cityMap[city].total++;
      var isInactive = String(d.roadcastStatus || '').toLowerCase() === 'inactive';
      if (isInactive) {
        totalInactive++;
        cityMap[city].inactive++;
        var hasRemark = !!(d.remark && String(d.remark).trim());
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
    }

    var byCity = [];
    var now = new Date();
    var dateStr = Utilities.formatDate(now, 'Asia/Kolkata', 'dd-MM-yyyy hh:mm a');

    for (var cName in cityMap) {
      var c = cityMap[cName];
      var wa = '🚨 *WeVois Fleet Morning Alert - ' + c.city + ' Site*\n';
      wa += '📅 *Time:* ' + dateStr + ' | *Total:* ' + c.total + ' | *Inactive:* ' + c.inactive + '\n';
      if (c.noRemark > 0) {
        wa += '⚠️ *' + c.noRemark + ' Inactive vehicles have NO REMARK!*\n\n';
      } else {
        wa += '\n';
      }
      wa += '*Vehicles requiring immediate site check:*\n';
      var limit = Math.min(c.inactiveVehicles.length, 15);
      for (var v = 0; v < limit; v++) {
        var iv = c.inactiveVehicles[v];
        wa += (v + 1) + '. *' + iv.vehicle + '* (' + iv.imei + ') - Last: ' + iv.lastUpdate + ' | Remark: ' + (iv.remark ? iv.remark : '[BLANK - FILL REMARK]') + '\n';
      }
      if (c.inactiveVehicles.length > 15) {
        wa += '...and ' + (c.inactiveVehicles.length - 15) + ' more.\n';
      }
      wa += '\n_Please verify wire connectors & GPS power before 10:00 AM cutoff._';

      c.whatsappText = wa;
      byCity.push(c);
    }

    // Sort by inactive count descending
    byCity.sort(function(a, b) { return b.inactive - a.inactive; });

    return {
      success: true,
      inspectedAt: dateStr,
      totalVehicles: devices.length,
      totalInactive: totalInactive,
      totalNoRemark: totalNoRemark,
      byCity: byCity
    };
  } catch (err) {
    return {
      success: false,
      error: err.toString(),
      byCity: []
    };
  }
}

/**
 * Trigger function to send daily morning fleet inspection email digest
 */
function sendMorningFleetEmailDigest() {
  var digest = getMorningFleetDigest();
  if (!digest || !digest.success) return;

  var recipients = VTS_CONFIG.ADMIN_EMAILS || '';
  if (!recipients) return;

  var html = '<div style="font-family: Arial, sans-serif; padding: 15px; color: #333;">';
  html += '<h2 style="color: #1e3a8a;">🌅 WeVois Morning Fleet Inspection Digest</h2>';
  html += '<p><strong>Inspection Time:</strong> ' + digest.inspectedAt + '</p>';
  html += '<p><strong>Total Active Fleet:</strong> ' + digest.totalVehicles + ' | ';
  html += '<strong style="color: #dc2626;">Total Inactive:</strong> ' + digest.totalInactive + ' | ';
  html += '<strong style="color: #ea580c;">Missing Remarks:</strong> ' + digest.totalNoRemark + '</p>';
  html += '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">';
  html += '<h3>Site Breakdown:</h3><ul>';

  for (var i = 0; i < digest.byCity.length; i++) {
    var c = digest.byCity[i];
    html += '<li><strong>' + c.city + ':</strong> ' + c.inactive + ' inactive / ' + c.total + ' total (' + c.noRemark + ' missing remarks)</li>';
  }
  html += '</ul><p style="font-size: 12px; color: #64748b;">Automated system notification sent before 10:00 AM municipal SLA cutoff.</p></div>';

  MailApp.sendEmail({
    to: recipients,
    subject: '🚨 Morning Fleet Inspection Alert - ' + digest.totalInactive + ' Inactive Vehicles (' + digest.totalNoRemark + ' Missing Remarks)',
    htmlBody: html
  });
}

/**
 * Setup or reset the daily 8:30 AM morning trigger
 */
function setupMorningFleetTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendMorningFleetEmailDigest') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('sendMorningFleetEmailDigest')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(30)
    .inTimezone('Asia/Kolkata')
    .create();

  return { success: true, message: 'Daily 8:30 AM Morning Fleet Trigger created successfully!' };
}