import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Icon } from './Icons';
import {
  updateRenewalDecision,
  markDeviceRenewed,
  archiveRenewalList,
  sendRenewalReminders,
  fetchRenewalCycleTabs,
  setActiveRenewalCycleTab,
  extractRenewalCycleBatch,
  finalizeRenewalSession,
  applyBatchRenewals,
  batchUpdateLicenseDates,
  updateRenewalSheetUrl,
  RENEWAL_DONE_SHEET_URL
} from '../services/api';
import {
  parseFlexibleDate,
  getMonthYearKey,
  getMonthYearLabel,
  calculateDaysRemaining,
  formatDisplayDate
} from '../utils/dateUtils';
import { safeSetItem, safeGetItem, safeGetJson } from '../utils/storage';


export function RenewalDashboard({
  devices = [],
  renewalLogs = [],
  renewalArchives = [],
  onRefresh,
  searchQuery = '',
  onSearchChange
}) {
  const [localSearch, setLocalSearch] = useState('');
  const STORAGE_KEY_USER_CYCLE_TAB = 'vts_user_selected_cycle_tab';

  // Read persisted user choices so returning to Renewals preserves everything!
  const [filterPreset, setFilterPreset] = useState(() => {
    return safeGetItem('vts_renewal_filter_preset') || 'active_sheet';
  });
  const [cityFilter, setCityFilter] = useState(() => {
    return safeGetItem('vts_renewal_city_filter') || 'All';
  });
  const [decisionFilter, setDecisionFilter] = useState(() => {
    return safeGetItem('vts_renewal_decision_filter') || 'All';
  });

  // Computed next month & this month labels
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthKey = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const [selectedMonth, setSelectedMonth] = useState(() => {
    return safeGetItem('vts_renewal_selected_month') || nextMonthKey;
  });
  const [customStartDate, setCustomStartDate] = useState(() => {
    return safeGetItem('vts_renewal_custom_start') || '';
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return safeGetItem('vts_renewal_custom_end') || '';
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(() => {
    return Number(safeGetItem('vts_renewal_current_page')) || 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    return Number(safeGetItem('vts_renewal_page_size')) || 10;
  });

  // Dynamic Renewal Cycle & Sheet Multi-Tab States
  const [cycleTabs, setCycleTabs] = useState(() => {
    const cached = safeGetJson('vts_cached_cycle_tabs');
    if (cached && Array.isArray(cached) && cached.length > 0) return cached;
    return [
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
  });

  const [activeCycleTab, setActiveCycleTab] = useState(() => {
    return safeGetItem(STORAGE_KEY_USER_CYCLE_TAB) || safeGetItem('vts_tracker_active_cycle_tab') || '';
  });

  // INSTANT STALE-WHILE-REVALIDATE CACHE: Load sheet devices from cache in 0ms!
  const initialCacheKey = activeCycleTab ? `vts_sheet_cache_${String(activeCycleTab).trim().toLowerCase()}` : '';
  const initialCacheData = initialCacheKey ? safeGetJson(initialCacheKey) : null;

  const [carryoverImeis, setCarryoverImeis] = useState([]);
  const [sheetCycleRecords, setSheetCycleRecords] = useState(() => (initialCacheData && typeof initialCacheData.recordsByImei === 'object' && initialCacheData.recordsByImei ? initialCacheData.recordsByImei : {}));
  const [sheetDevices, setSheetDevices] = useState(() => (Array.isArray(initialCacheData?.sheetDevices) ? initialCacheData.sheetDevices : []));
  const [isSheetLoading, setIsSheetLoading] = useState(false);
  const [sheetSyncError, setSheetSyncError] = useState(null);
  const [editingLicImei, setEditingLicImei] = useState(null);
  const [isUpdatingBatch, setIsUpdatingBatch] = useState(false);
  const [showAllCities, setShowAllCities] = useState(false);

  // Extract & Batch Sheet Creation States
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [extractTargetMode, setExtractTargetMode] = useState('new'); // 'new' or 'existing'
  const [extractTabName, setExtractTabName] = useState('');
  const [extractExistingTab, setExtractExistingTab] = useState('');
  const [extractSourceFilter, setExtractSourceFilter] = useState('next_month'); // 'next_month', 'this_month', 'soon_15', 'expired', 'by_month', 'custom_range', 'all'
  const [extractSpecificMonth, setExtractSpecificMonth] = useState('');
  const [extractStartDate, setExtractStartDate] = useState('');
  const [extractEndDate, setExtractEndDate] = useState('');
  const [includeCarryoverNo, setIncludeCarryoverNo] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractNotice, setExtractNotice] = useState(null);

  // Add Specific VTS (Single / Bulk) from 950 Fleet to Renewal Sheet States
  const [showAddVtsModal, setShowAddVtsModal] = useState(false);
  const [addVtsMode, setAddVtsMode] = useState('single'); // 'single' | 'bulk'
  const [addVtsTargetTab, setAddVtsTargetTab] = useState(() => activeCycleTab || '');
  const [singleVtsSearch, setSingleVtsSearch] = useState('');
  const [bulkVtsInput, setBulkVtsInput] = useState('');
  const [isAddingVts, setIsAddingVts] = useState(false);
  const [addVtsNotice, setAddVtsNotice] = useState(null);

  // Finalize Session States
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [finalizeLicenseEnd, setFinalizeLicenseEnd] = useState('');
  const [finalizeNote, setFinalizeNote] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeNotice, setFinalizeNotice] = useState(null);

  // Modals & Drawers
  const [renewModalDevice, setRenewModalDevice] = useState(null);
  const [newLicenseEnd, setNewLicenseEnd] = useState('');
  const [renewNote, setRenewNote] = useState('');
  const [showArchivesModal, setShowArchivesModal] = useState(false);
  const [archiveTab, setArchiveTab] = useState('snapshots');
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveNotice, setArchiveNotice] = useState(null);

  // Email Reminders state
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [emailNotice, setEmailNotice] = useState(null);

  // Inline editing state for Renewal Remark
  const [editingImei, setEditingImei] = useState(null);
  const [editingRemark, setEditingRemark] = useState('');
  const [savingImei, setSavingImei] = useState(null);
  const [saveToast, setSaveToast] = useState({});

  // Helper: Case-insensitive, trimmed matching for sheet tab names (handles sept vs sep)
  const normalizeTabStr = (t) => String(t || '').trim().toLowerCase().replace(/sept/g, 'sep').replace(/\s+/g, ' ');
  const matchTab = (tabName, tabsList) => {
    if (!tabName || !tabsList || tabsList.length === 0) return null;
    const clean = normalizeTabStr(tabName);
    return tabsList.find(t => normalizeTabStr(t) === clean) || null;
  };

  const loadCycleData = async (tabToLoad) => {
    setIsSheetLoading(true);
    try {
      const userSavedTab = safeGetItem(STORAGE_KEY_USER_CYCLE_TAB) || safeGetItem('vts_tracker_active_cycle_tab') || '';
      const targetTab = tabToLoad || activeCycleTab || userSavedTab || '';

      // Instant cache retrieval if tabToLoad is specified (0ms UI update)
      if (targetTab) {
        const cacheKey = `vts_sheet_cache_${String(targetTab).trim().toLowerCase()}`;
        const cached = safeGetJson(cacheKey);
        if (cached && Array.isArray(cached.sheetDevices)) {
          setSheetDevices(cached.sheetDevices);
          if (cached.recordsByImei && typeof cached.recordsByImei === 'object') setSheetCycleRecords(cached.recordsByImei);
        }
      }

      const res = await fetchRenewalCycleTabs(targetTab);
      if (res && res.error) {
        setSheetSyncError(res.error);
      } else {
        setSheetSyncError(null);
      }
      if (res.tabs && res.tabs.length > 0) {
        const validTabs = res.tabs.filter(t => !['900', '950', 'VTS Data', 'Users', 'City_Email_Contacts', 'Search_History', 'Pivot Table 5', 'Search', 'Vendor Vehicles', 'analysis'].includes(t));
        if (validTabs.length > 0) {
          setCycleTabs(validTabs);
          safeSetItem('vts_cached_cycle_tabs', validTabs);

          const preferred = targetTab || activeCycleTab || userSavedTab;
          const matched = matchTab(preferred, validTabs);

          let currentTab = '';
          if (matched) {
            currentTab = matched;
          } else if (preferred) {
            currentTab = preferred;
            if (!validTabs.includes(preferred)) {
              setCycleTabs([preferred, ...validTabs]);
            }
          } else {
            currentTab = (res.activeTab && matchTab(res.activeTab, validTabs))
              ? matchTab(res.activeTab, validTabs)
              : validTabs[validTabs.length - 1];
          }

          setActiveCycleTab((prev) => {
            if (prev && matchTab(prev, validTabs)) return prev;
            return currentTab;
          });
          safeSetItem(STORAGE_KEY_USER_CYCLE_TAB, currentTab);
          safeSetItem('vts_tracker_active_cycle_tab', currentTab);
        }
      }
      if (res.recordsByImei) {
        setSheetCycleRecords(res.recordsByImei);
      }
      if (Array.isArray(res.sheetDevices)) {
        setSheetDevices(res.sheetDevices);
        const finalTab = targetTab || activeCycleTab || userSavedTab;
        if (finalTab) {
          safeSetItem(`vts_sheet_cache_${finalTab.trim().toLowerCase()}`, {
            sheetDevices: res.sheetDevices,
            recordsByImei: res.recordsByImei || {},
            timestamp: Date.now()
          });
        }
      }
      if (res.carryoverImeis) setCarryoverImeis(res.carryoverImeis);
    } catch (err) {
      console.warn('Notice loading cycle data:', err);
      setSheetSyncError(err.message || 'Error communicating with Google Sheets');
    } finally {
      setIsSheetLoading(false);
    }
  };

  useEffect(() => {
    loadCycleData();
  }, []);

  // Inline editing state for License End date

  const handleSearchChange = (val) => {
    if (onSearchChange) onSearchChange(val);
    else setLocalSearch(val);
    setCurrentPage(1);
    safeSetItem('vts_renewal_current_page', 1);
  };

  // Use parent search if provided, otherwise use local search
  const search = onSearchChange ? searchQuery : localSearch;

  // Enrich all devices with flexible parsed date and remaining days
  const enrichedDevices = useMemo(() => {
    return devices.map((d) => {
      const imei = String(d.imei || d.uniqueid || d.Uniqueid || '').trim();
      const rawLicenseEnd = d.licenseEnd || d['License End'] || d.license_end || d.expiry || d.Expiry || '';
      const displayLicEnd = rawLicenseEnd ? formatDisplayDate(rawLicenseEnd) : '';
      const remainingDays = (d.remainingDays !== undefined && d.remainingDays !== null && !isNaN(Number(d.remainingDays)))
        ? Number(d.remainingDays)
        : calculateDaysRemaining(rawLicenseEnd);
      const parsedDate = parseFlexibleDate(rawLicenseEnd);
      const monthKey = parsedDate ? getMonthYearKey(parsedDate) : '';

      // Check live sheetCycleRecords (synced directly from the active Google Sheet tab)
      const sheetRecord = sheetCycleRecords[imei] || {};

      // Decision priority: Google Sheet active tab > device prop > 'Pending'
      const rawDec = String(sheetRecord.decision || d.renewalDecision || d.decision || 'Pending').trim();
      const decLower = rawDec.toLowerCase();
      let renewalDecision = 'Pending';
      if (decLower === 'yes' || decLower === 'approved') {
        renewalDecision = 'Yes';
      } else if (decLower === 'no' || decLower === 'declined' || decLower === 'rejected') {
        renewalDecision = 'No';
      }

      // Renewal Remark: FRESH REMARK ONLY!
      // Must NOT inherit d.remark or d.Remark (from master sheet 900)
      const renewalRemark = sheetRecord.remark !== undefined ? sheetRecord.remark : (d.renewalRemark || d.renewal_remark || '');

      // New License End: Only show if an actual new date has been entered or uploaded!
      // Do NOT auto-compute next year just because 'Yes' was selected.
      // If decision is No or Pending, new license date is ALWAYS blank!
      let newLicenseEnd = '';
      if (renewalDecision === 'Yes') {
        const candidate = sheetRecord.newLicenseEnd || d.newLicenseEnd || '';
        if (candidate && candidate !== displayLicEnd) {
          newLicenseEnd = candidate;
        }
      }

      // Status: 'Done' only if completed with genuine new license date, 'Not Done' if No or (Yes without new date), 'Pending' otherwise
      let statusDone = 'Pending';
      if (renewalDecision === 'No') {
        statusDone = 'Not Done';
      } else if (renewalDecision === 'Yes') {
        statusDone = (newLicenseEnd && newLicenseEnd !== displayLicEnd) ? 'Done' : 'Not Done';
      } else {
        statusDone = 'Pending';
      }

      let rechargeStatus = 'Safe';
      if (remainingDays !== undefined && remainingDays < 0) {
        rechargeStatus = 'Expired';
      } else if (remainingDays !== undefined && remainingDays <= 15) {
        rechargeStatus = 'Recharge Soon';
      } else {
        rechargeStatus = 'Safe';
      }

      return {
        ...d,
        imei,
        licenseEnd: displayLicEnd,
        displayLicenseEnd: displayLicEnd,
        parsedDate,
        monthKey,
        remainingDays,
        rechargeStatus,
        renewalDecision,
        renewalRemark,
        newLicenseEnd,
        statusDone
      };
    });
  }, [devices, sheetCycleRecords]);

  // Overall KPIs
  const kpis = useMemo(() => {
    let expired = 0;
    let rechargeSoon15 = 0;
    let rechargeSoon30 = 0;
    let dueNextMonth = 0;
    let dueThisMonth = 0;
    let pendingDecision = 0;
    let approvedYes = 0;
    let deniedNo = 0;

    enrichedDevices.forEach((d) => {
      if (d.remainingDays !== undefined && d.remainingDays < 0) expired++;
      if (d.remainingDays !== undefined && d.remainingDays >= 0 && d.remainingDays <= 15) rechargeSoon15++;
      if (d.remainingDays !== undefined && d.remainingDays >= 0 && d.remainingDays <= 30) rechargeSoon30++;
      if (d.monthKey === nextMonthKey) dueNextMonth++;
      if (d.monthKey === thisMonthKey) dueThisMonth++;
      const dec = String(d.renewalDecision || '').trim().toLowerCase();
      if (dec === 'yes' || dec === 'approved') approvedYes++;
      else if (dec === 'no' || dec === 'declined' || dec === 'rejected') deniedNo++;
      else pendingDecision++;
    });

    return {
      total: enrichedDevices.length,
      expired,
      rechargeSoon15,
      rechargeSoon30,
      dueNextMonth,
      dueThisMonth,
      pendingDecision,
      approvedYes,
      deniedNo
    };
  }, [enrichedDevices, nextMonthKey, thisMonthKey]);

  // Available unique month options for dropdown with counts
  const availableMonths = useMemo(() => {
    const map = {};
    enrichedDevices.forEach((d) => {
      if (d.monthKey) {
        if (!map[d.monthKey]) {
          map[d.monthKey] = {
            key: d.monthKey,
            label: getMonthYearLabel(d.parsedDate),
            count: 0
          };
        }
        map[d.monthKey].count++;
      }
    });
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [enrichedDevices]);

  // Unique list of all cities (includes both Master Fleet AND Active Renewal Sheet cities!)
  const cities = useMemo(() => {
    const set = new Set();
    enrichedDevices.forEach((d) => {
      if (d.city) set.add(d.city);
    });
    if (sheetDevices && Array.isArray(sheetDevices)) {
      sheetDevices.forEach((d) => {
        if (d.city) set.add(d.city);
      });
    }
    return ['All', ...Array.from(set).sort()];
  }, [enrichedDevices, sheetDevices]);

  // Devices strictly extracted and saved in the active Google Sheet tab
  const activeSheetDeviceList = useMemo(() => {
    // If sheetDevices is present from Apps Script, use it directly
    if (sheetDevices && sheetDevices.length > 0) {
      const masterMap = new Map();
      enrichedDevices.forEach((d) => {
        if (d.imei) masterMap.set(String(d.imei), d);
      });

      return sheetDevices.map((sd, idx) => {
        const imei = String(sd.imei || sd.uniqueid || '').trim();
        const masterDev = masterMap.get(imei) || {};
        const liveRecord = sheetCycleRecords[imei] || {};

        const rawLicenseEnd = sd.licenseEnd || sd.displayLicenseEnd || masterDev.licenseEnd || '';
        const displayLicEnd = rawLicenseEnd ? formatDisplayDate(rawLicenseEnd) : '';
        const parsedDate = parseFlexibleDate(rawLicenseEnd);
        const remainingDays = (sd.remainingDays !== undefined && sd.remainingDays !== null && !isNaN(Number(sd.remainingDays)))
          ? Number(sd.remainingDays)
          : calculateDaysRemaining(rawLicenseEnd);
        const monthKey = parsedDate ? getMonthYearKey(parsedDate) : '';

        // Decision priority: live UI edit in sheetCycleRecords > sheetDevices > 'Pending'
        const rawDec = String(liveRecord.decision || sd.renewalDecision || sd.rechargeStatus || 'Pending').trim();
        const decLower = rawDec.toLowerCase();
        let renewalDecision = 'Pending';
        if (decLower === 'yes' || decLower === 'approved') {
          renewalDecision = 'Yes';
        } else if (decLower === 'no' || decLower === 'declined' || decLower === 'rejected') {
          renewalDecision = 'No';
        }

        // Fresh remark
        const renewalRemark = liveRecord.remark !== undefined ? liveRecord.remark : (sd.renewalRemark || '');

        // New License End: NEVER show when decision is No or Pending!
        // Only show if genuine new date exists (different from displayLicEnd)
        let newLicenseEnd = '';
        if (renewalDecision === 'Yes') {
          const candidate = liveRecord.newLicenseEnd !== undefined
            ? liveRecord.newLicenseEnd
            : (sd.newLicenseEnd || '');
          if (candidate && candidate !== displayLicEnd) {
            newLicenseEnd = candidate;
          }
        }

        // Status Done: 'Done' ONLY if renewalDecision === 'Yes' AND newLicenseEnd exists and differs from displayLicEnd
        // If decision is 'No' -> 'Not Done'
        // If decision is 'Yes' but no new date yet -> 'Not Done'
        // If decision is 'Pending' -> 'Pending'
        let statusDone = 'Pending';
        if (renewalDecision === 'No') {
          statusDone = 'Not Done';
        } else if (renewalDecision === 'Yes') {
          statusDone = (newLicenseEnd && newLicenseEnd !== displayLicEnd) ? 'Done' : 'Not Done';
        } else {
          statusDone = 'Pending';
        }

        return {
          ...masterDev,
          ...sd,
          sr: sd.sr || idx + 1,
          name: masterDev.vehicle || sd.name || sd.vehicle || '',
          vehicle: masterDev.vehicle || sd.vehicle || sd.name || '',
          uniqueid: imei,
          imei,
          phone: masterDev.sim || sd.phone || sd.sim || '',
          sim: masterDev.sim || sd.sim || sd.phone || '',
          licenseEnd: displayLicEnd,
          displayLicenseEnd: displayLicEnd,
          city: masterDev.city || sd.city || '',
          parsedDate,
          remainingDays,
          monthKey,
          renewalDecision,
          renewalRemark,
          newLicenseEnd,
          statusDone
        };
      });
    }

    // Fallback: If sheetDevices not yet fetched, filter enrichedDevices by sheetCycleRecords
    const activeImeis = Object.keys(sheetCycleRecords);
    if (activeImeis.length > 0) {
      return enrichedDevices.filter((d) => activeImeis.includes(String(d.imei)));
    }

    return [];
  }, [sheetDevices, enrichedDevices, sheetCycleRecords]);

  // City-Wise Renewal Breakdown (Yes, No, Pending)
  const cityBreakdown = useMemo(() => {
    // If active_sheet has records, use activeSheetDeviceList; otherwise fallback to enrichedDevices so city summary is never blank!
    const sourceList = (filterPreset === 'active_sheet' && activeSheetDeviceList.length > 0)
      ? activeSheetDeviceList
      : enrichedDevices;
    const map = {};

    sourceList.forEach((d) => {
      const city = String(d.city || 'Unassigned').trim();
      if (!map[city]) {
        map[city] = { city, total: 0, yes: 0, no: 0, pending: 0 };
      }
      map[city].total++;
      const dec = String(d.renewalDecision || '').trim().toLowerCase();
      if (dec === 'yes' || dec === 'approved') map[city].yes++;
      else if (dec === 'no' || dec === 'declined' || dec === 'rejected') map[city].no++;
      else map[city].pending++;
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filterPreset, activeSheetDeviceList, enrichedDevices]);

  // Filtered devices based on active preset, search, city, and decision
  const filteredDevices = useMemo(() => {
    // When preset is 'active_sheet', we strictly filter the active sheet tab's devices!
    const sourceList = filterPreset === 'active_sheet' ? activeSheetDeviceList : enrichedDevices;

    const list = sourceList.filter((d) => {
      // 1. Search Query
      if (search) {
        const q = search.toLowerCase().trim();
        const match =
          (d.vehicle && d.vehicle.toLowerCase().includes(q)) ||
          (d.imei && String(d.imei).includes(q)) ||
          (d.sim && String(d.sim).includes(q)) ||
          (d.city && d.city.toLowerCase().includes(q)) ||
          (d.renewalRemark && d.renewalRemark.toLowerCase().includes(q));
        if (!match) return false;
      }

      // 2. City Filter
      if (cityFilter !== 'All' && d.city !== cityFilter) {
        return false;
      }

      // 3. Decision Filter
      if (decisionFilter !== 'All') {
        const dec = String(d.renewalDecision || '').trim().toLowerCase();
        if (decisionFilter === 'Yes' && dec !== 'yes' && dec !== 'approved') return false;
        if (decisionFilter === 'No' && dec !== 'no' && dec !== 'declined' && dec !== 'rejected') return false;
        if (decisionFilter === 'Pending' && (dec === 'yes' || dec === 'approved' || dec === 'no' || dec === 'declined' || dec === 'rejected')) return false;
      }

      // 4. Preset Filter
      if (filterPreset === 'active_sheet') {
        return true;
      }
      if (filterPreset === 'next_month') {
        return d.monthKey === nextMonthKey;
      }
      if (filterPreset === 'this_month') {
        return d.monthKey === thisMonthKey;
      }
      if (filterPreset === 'by_month') {
        return d.monthKey === selectedMonth;
      }
      if (filterPreset === 'expired') {
        return d.remainingDays !== undefined && d.remainingDays < 0;
      }
      if (filterPreset === 'soon_15') {
        return d.remainingDays !== undefined && d.remainingDays >= 0 && d.remainingDays <= 15;
      }
      if (filterPreset === 'soon_30') {
        return d.remainingDays !== undefined && d.remainingDays >= 0 && d.remainingDays <= 30;
      }
      if (filterPreset === 'custom_range') {
        if (!d.parsedDate) return false;
        const dTime = new Date(d.parsedDate.getFullYear(), d.parsedDate.getMonth(), d.parsedDate.getDate()).getTime();

        if (customStartDate) {
          const sParts = customStartDate.split('-');
          const startTime = new Date(parseInt(sParts[0], 10), parseInt(sParts[1], 10) - 1, parseInt(sParts[2], 10)).getTime();
          if (dTime < startTime) return false;
        }
        if (customEndDate) {
          const eParts = customEndDate.split('-');
          const endTime = new Date(parseInt(eParts[0], 10), parseInt(eParts[1], 10) - 1, parseInt(eParts[2], 10)).getTime();
          if (dTime > endTime) return false;
        }
        return true;
      }
      if (filterPreset === 'all') {
        return true;
      }
      return true;
    });

    // Active sheet retains Google Sheet row order (SR. 1, 2, 3...)
    if (filterPreset === 'active_sheet') {
      return list.sort((a, b) => (Number(a.sr) || 0) - (Number(b.sr) || 0));
    }

    // Default sort for master fleet presets: Remaining Days ascending (soonest expiry first)
    return list.sort((a, b) => {
      const aDays = a.remainingDays !== undefined ? a.remainingDays : 999999;
      const bDays = b.remainingDays !== undefined ? b.remainingDays : 999999;
      return aDays - bDays;
    });
  }, [
    activeSheetDeviceList,
    enrichedDevices,
    search,
    cityFilter,
    decisionFilter,
    filterPreset,
    nextMonthKey,
    thisMonthKey,
    selectedMonth,
    customStartDate,
    customEndDate
  ]);

  // Live counts of Yes, No, Blank, and Total in currently filtered batch
  const batchCounts = useMemo(() => {
    let yes = 0;
    let no = 0;
    let blank = 0;

    filteredDevices.forEach((d) => {
      const dec = String(d.renewalDecision || '').trim().toLowerCase();
      if (dec === 'yes' || dec === 'approved') yes++;
      else if (dec === 'no' || dec === 'declined' || dec === 'rejected') no++;
      else blank++;
    });

    return {
      yes,
      no,
      blank,
      total: filteredDevices.length
    };
  }, [filteredDevices]);

  // Paginated devices
  const paginatedDevices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDevices.slice(start, start + pageSize);
  }, [filteredDevices, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredDevices.length / pageSize) || 1;

  // Handle Decision Dropdown Change (Pending / Yes / No)
  const handleDecisionChange = async (imei, decision) => {
    // Find device's current license end date
    const dev = enrichedDevices.find((d) => String(d.imei) === String(imei)) ||
                activeSheetDeviceList.find((d) => String(d.imei) === String(imei)) || {};
    const curLic = dev.displayLicenseEnd || dev.licenseEnd || '';

    // Optimistic UI update
    setSheetCycleRecords((prev) => {
      const existing = prev[imei] || {};
      let newLic = '';
      let st = 'Pending';
      if (decision === 'No') {
        newLic = '';
        st = 'Not Done';
      } else if (decision === 'Yes') {
        const cand = existing.newLicenseEnd || '';
        if (cand && cand !== curLic) {
          newLic = cand;
          st = 'Done';
        } else {
          newLic = '';
          st = 'Not Done';
        }
      } else {
        newLic = '';
        st = 'Pending';
      }

      return {
        ...prev,
        [imei]: {
          ...existing,
          decision,
          newLicenseEnd: newLic,
          statusDone: st
        }
      };
    });

    setSheetDevices((prev) =>
      prev.map((sd) => {
        if (String(sd.imei || sd.uniqueid) === String(imei)) {
          const curL = sd.displayLicenseEnd || sd.licenseEnd || curLic || '';
          let newLic = '';
          let st = 'Pending';
          if (decision === 'No') {
            newLic = '';
            st = 'Not Done';
          } else if (decision === 'Yes') {
            const cand = sd.newLicenseEnd || '';
            if (cand && cand !== curL) {
              newLic = cand;
              st = 'Done';
            } else {
              newLic = '';
              st = 'Not Done';
            }
          } else {
            newLic = '';
            st = 'Pending';
          }

          return {
            ...sd,
            renewalDecision: decision,
            rechargeStatus: decision,
            newLicenseEnd: newLic,
            statusDone: st
          };
        }
        return sd;
      })
    );

    try {
      const res = await updateRenewalDecision({
        imei,
        decision,
        activeTab: activeCycleTab
      });
      if (res.success) {
        setSaveToast({ [imei]: `Saved ${decision}` });
        setTimeout(() => setSaveToast({}), 1500);
      } else {
        alert('Failed to update decision: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error updating decision: ' + err.message);
    }
  };

  // Inline Renewal Remark Save (Fresh Renewal Remark)
  const handleSaveRemark = async (imei, remarkText) => {
    setSavingImei(imei);
    const finalRemark = remarkText !== undefined ? remarkText : editingRemark;

    // Optimistic UI update
    setSheetCycleRecords((prev) => ({
      ...prev,
      [imei]: {
        ...(prev[imei] || {}),
        remark: finalRemark
      }
    }));

    setSheetDevices((prev) =>
      prev.map((sd) => {
        if (String(sd.imei || sd.uniqueid) === String(imei)) {
          return { ...sd, renewalRemark: finalRemark };
        }
        return sd;
      })
    );

    try {
      const res = await updateRenewalDecision({
        imei,
        remark: finalRemark,
        activeTab: activeCycleTab
      });
      if (res.success) {
        setSaveToast({ [imei]: 'Saved!' });
        setTimeout(() => setSaveToast({}), 2000);
        setEditingImei(null);
      } else {
        alert('Failed to save remark: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error saving remark: ' + err.message);
    } finally {
      setSavingImei(null);
    }
  };

  // Inline New License End Date Save
  const handleInlineNewLicenseSave = async (imei, dateVal) => {
    setEditingLicImei(null);
    if (!dateVal) return;
    const formattedDate = formatDisplayDate(dateVal);

    const dev = enrichedDevices.find((d) => String(d.imei) === String(imei)) ||
                activeSheetDeviceList.find((d) => String(d.imei) === String(imei)) || {};
    const curLic = dev.displayLicenseEnd || dev.licenseEnd || '';

    const isGenuineNewDate = formattedDate && formattedDate !== curLic;
    const st = isGenuineNewDate ? 'Done' : 'Not Done';
    const finalDate = isGenuineNewDate ? formattedDate : '';

    // Optimistic UI update
    setSheetCycleRecords((prev) => ({
      ...prev,
      [imei]: {
        ...(prev[imei] || {}),
        newLicenseEnd: finalDate,
        statusDone: st,
        decision: 'Yes'
      }
    }));

    setSheetDevices((prev) =>
      prev.map((sd) => {
        if (String(sd.imei || sd.uniqueid) === String(imei)) {
          return {
            ...sd,
            newLicenseEnd: finalDate,
            statusDone: st,
            renewalDecision: 'Yes',
            rechargeStatus: 'Yes'
          };
        }
        return sd;
      })
    );

    if (!isGenuineNewDate) {
      alert('Selected date is same as current license end date. Please select a genuine new renewal date.');
      return;
    }

    try {
      const res = await batchUpdateLicenseDates({
        updates: [{ imei, newLicenseEnd: formattedDate }],
        tabName: activeCycleTab
      });
      if (res.success) {
        setSaveToast({ [imei]: 'Date Updated & Done!' });
        setTimeout(() => setSaveToast({}), 2000);
        if (onRefresh) onRefresh();
      } else {
        alert('Failed to update date: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error updating date: ' + err.message);
    }
  };

  // Upload Excel / CSV with updated license end dates
  const handleUploadUpdatedDates = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (!json || json.length === 0) {
          alert('Uploaded file contains no data rows.');
          return;
        }

        const updates = [];
        for (let row of json) {
          let imei = '';
          let newDate = '';
          for (let key of Object.keys(row)) {
            const kLower = key.trim().toLowerCase();
            if (['uniqueid', 'imei', 'device id'].some((x) => kLower === x)) {
              imei = String(row[key] || '').trim();
            } else if (!imei && (kLower.includes('uniqueid') || kLower.includes('imei'))) {
              imei = String(row[key] || '').trim();
            }
            if (kLower.includes('new license') || kLower.includes('new lic') || kLower.includes('new expiry')) {
              newDate = String(row[key] || '').trim();
            }
          }

          if (imei && newDate) {
            updates.push({ imei, newLicenseEnd: newDate });
          }
        }

        if (updates.length === 0) {
          alert('Could not find "Uniqueid" and "New License End" columns in the uploaded file. Please make sure the Excel file has "Uniqueid" and "New License End" columns.');
          return;
        }

        const confirmMsg = `Found ${updates.length} vehicles with new license end dates in "${file.name}". Do you want to update them on the Google Sheet and Master Sheet now?`;
        if (!window.confirm(confirmMsg)) return;

        setIsUpdatingBatch(true);
        const res = await batchUpdateLicenseDates({
          updates,
          tabName: activeCycleTab
        });

        if (res.success) {
          alert(`🎉 ${res.message || `Successfully updated ${updates.length} devices!`}`);
          await loadCycleData(activeCycleTab);
          if (onRefresh) onRefresh();
        } else {
          alert('Update failed: ' + (res.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Failed to parse uploaded file: ' + err.message);
      } finally {
        setIsUpdatingBatch(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleMarkRenewedSubmit = async (e) => {
    e.preventDefault();
    if (!newLicenseEnd) {
      alert('Please enter or select a new License End date.');
      return;
    }

    setIsRenewing(true);
    try {
      const res = await markDeviceRenewed({
        imei: renewModalDevice.imei,
        newLicenseEnd: newLicenseEnd,
        remark: renewNote || 'Renewed by admin'
      });

      if (res.success) {
        setRenewModalDevice(null);
        setNewLicenseEnd('');
        setRenewNote('');
        if (onRefresh) onRefresh();
        alert(res.message || 'Device license renewed and logged successfully!');
      } else {
        alert('Failed to mark renewed: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error renewing device: ' + err.message);
    } finally {
      setIsRenewing(false);
    }
  };

  // Send Email Reminders to Site Managers
  const handleSendEmails = async () => {
    setIsSendingEmails(true);
    setEmailNotice(null);
    try {
      const res = await sendRenewalReminders({
        filterPreset,
        targetMonth: selectedMonth
      });
      if (res.success) {
        setEmailNotice({
          type: 'success',
          text: res.message || 'Renewal notification emails sent to site managers!'
        });
      } else {
        setEmailNotice({
          type: 'error',
          text: res.error || 'Failed to send emails.'
        });
      }
    } catch (err) {
      setEmailNotice({
        type: 'error',
        text: err.message
      });
    } finally {
      setIsSendingEmails(false);
    }
  };

  // Export Filtered Renewal List to Excel
  const handleExportExcel = () => {
    if (filteredDevices.length === 0) {
      alert('No renewal records to export.');
      return;
    }

    const exportRows = filteredDevices.map((d, index) => ({
      'SR.': index + 1,
      'Name': d.vehicle,
      'Uniqueid': String(d.imei),
      'Phone': String(d.sim || ''),
      'City': d.city,
      'License End': d.displayLicenseEnd || d.licenseEnd || '',
      'Remaining Days': d.remainingDays !== undefined ? d.remainingDays : '',
      'Recharge Status': d.rechargeStatus,
      'Status on Roadcast': d.roadcastStatus,
      'Final Status': d.finalStatus,
      'Renewal Decision': d.renewalDecision,
      'Renewal Remark': d.renewalRemark
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Renewal_List');
    const filename = `VTS_Renewals_${filterPreset}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // Export & Archive Snapshot to Google Drive
  const _handleExportAndArchive = async () => {
    handleExportExcel();
    setIsArchiving(true);
    setArchiveNotice(null);
    try {
      const res = await archiveRenewalList({
        filterLabel: filterPreset,
        count: filteredDevices.length,
        devices: filteredDevices.map((d) => ({
          vehicle: d.vehicle,
          imei: d.imei,
          sim: d.sim,
          city: d.city,
          licenseEnd: d.displayLicenseEnd || d.licenseEnd,
          remainingDays: d.remainingDays,
          decision: d.renewalDecision,
          remark: d.renewalRemark
        }))
      });

      if (res.success) {
        setArchiveNotice({
          type: 'success',
          text: res.message || 'Snapshot successfully archived in Google Drive "VTS Renewal Archives"!'
        });
        if (onRefresh) onRefresh();
      } else {
        setArchiveNotice({
          type: 'error',
          text: res.error || 'Failed to create Drive archive snapshot.'
        });
      }
    } catch (err) {
      setArchiveNotice({
        type: 'error',
        text: err.message
      });
    } finally {
      setIsArchiving(false);
    }
  };

  // Dedicated Multi-Batch Download Handler (Yes / No / Blank / Combined) in XLSX and CSV
  const handleExportBatch = (exportType = 'all', format = 'xlsx') => {
    let targetList = filteredDevices;
    let label = 'ALL_COMBINED';

    if (exportType === 'yes') {
      targetList = filteredDevices.filter((d) => {
        const dec = String(d.renewalDecision || '').trim().toLowerCase();
        return dec === 'yes' || dec === 'approved';
      });
      label = 'YES_APPROVED';
    } else if (exportType === 'no') {
      targetList = filteredDevices.filter((d) => {
        const dec = String(d.renewalDecision || '').trim().toLowerCase();
        return dec === 'no' || dec === 'declined' || dec === 'rejected';
      });
      label = 'NO_DECLINED';
    } else if (exportType === 'blank' || exportType === 'pending') {
      targetList = filteredDevices.filter((d) => {
        const dec = String(d.renewalDecision || '').trim().toLowerCase();
        return dec !== 'yes' && dec !== 'approved' && dec !== 'no' && dec !== 'declined' && dec !== 'rejected';
      });
      label = 'BLANK_PENDING';
    }

    if (targetList.length === 0) {
      alert(`No records found for ${label} export.`);
      return;
    }
    const exportRows = targetList.map((d, index) => {
      const rawLicenseEnd = d.displayLicenseEnd || d.licenseEnd || '';

      return {
        'SR.': index + 1,
        'Name': d.vehicle,
        'Uniqueid': String(d.imei),
        'Phone': String(d.sim || ''),
        'License End': rawLicenseEnd,
        'City': d.city,
        'Remark': d.renewalRemark || '',
        'Rechage status': d.renewalDecision || 'Pending',
        'New License End': d.newLicenseEnd || '',
        'Status': d.statusDone || 'Pending'
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeCycleTab || 'Renewals');

    const cleanTab = (activeCycleTab || 'cycle').replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `VTS_Renewals_${label}_${cleanTab}_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      const csvContent = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `${filename}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      XLSX.writeFile(wb, `${filename}.xlsx`);
    }
  };

  // Helper presets for Custom Date Range
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    safeSetItem('vts_renewal_current_page', newPage);
  };

  // Helper presets for Custom Date Range
  const applyDateRangeDays = (days) => {
    const today = new Date();
    const target = new Date();
    target.setDate(today.getDate() + days);
    const formatYMD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    };
    const s = formatYMD(today);
    const e = formatYMD(target);
    setCustomStartDate(s);
    setCustomEndDate(e);
    safeSetItem('vts_renewal_custom_start', s);
    safeSetItem('vts_renewal_custom_end', e);
    handlePageChange(1);
  };

  const _applyDateRangeMonth = (offset = 0) => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
    const formatYMD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    };
    const s = formatYMD(start);
    const e = formatYMD(end);
    setCustomStartDate(s);
    setCustomEndDate(e);
    safeSetItem('vts_renewal_custom_start', s);
    safeSetItem('vts_renewal_custom_end', e);
    handlePageChange(1);
  };

  // Tab change handler for Google Sheet Cycle Tabs
  const handleTabChange = async (tab) => {
    setActiveCycleTab(tab);
    safeSetItem(STORAGE_KEY_USER_CYCLE_TAB, tab);
    safeSetItem('vts_tracker_active_cycle_tab', tab);
    safeSetItem('vts_user_has_manually_selected_tab', 'true');
    setFilterPreset('active_sheet');
    safeSetItem('vts_renewal_filter_preset', 'active_sheet');
    handlePageChange(1);

    // Instant local cache rendering (0ms!)
    const cacheKey = `vts_sheet_cache_${String(tab).trim().toLowerCase()}`;
    const cached = safeGetJson(cacheKey);
    if (cached && Array.isArray(cached.sheetDevices)) {
      setSheetDevices(cached.sheetDevices);
      if (cached.recordsByImei && typeof cached.recordsByImei === 'object') setSheetCycleRecords(cached.recordsByImei);
    }

    // Fire setActiveRenewalCycleTab in background without awaiting to eliminate UI latency
    setActiveRenewalCycleTab(tab).catch((e) => console.warn('Background setActiveRenewalCycleTab failed:', e));
    await loadCycleData(tab);
  };

  // Edit / verify Google Sheet URL directly
  const handleEditSheetUrl = async () => {
    const currentUrl = safeGetItem('vts_tracker_renewal_sheet_url') || RENEWAL_DONE_SHEET_URL;
    const input = prompt('Enter your "Renewal done month wise" Google Sheet URL or ID:', currentUrl);

    try {
      const res = await updateRenewalSheetUrl(input.trim());
      if (res.success) {
        safeSetItem('vts_tracker_renewal_sheet_url', input.trim());
        alert(res.message || 'Successfully linked Google Sheet!');
        if (onRefresh) onRefresh();
      } else {
        alert('Failed to link sheet: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Selected candidate devices to be extracted into sheet tab (independent of current active table view)
  const extractCandidates = useMemo(() => {
    let list = enrichedDevices.filter((d) => {
      if (extractSourceFilter === 'next_month') {
        return d.monthKey === nextMonthKey;
      }
      if (extractSourceFilter === 'this_month') {
        return d.monthKey === thisMonthKey;
      }
      if (extractSourceFilter === 'soon_15') {
        return d.remainingDays !== undefined && d.remainingDays >= 0 && d.remainingDays <= 15;
      }
      if (extractSourceFilter === 'soon_30') {
        return d.remainingDays !== undefined && d.remainingDays >= 0 && d.remainingDays <= 30;
      }
      if (extractSourceFilter === 'expired') {
        return d.remainingDays !== undefined && d.remainingDays < 0;
      }
      if (extractSourceFilter === 'by_month') {
        return d.monthKey === extractSpecificMonth;
      }
      if (extractSourceFilter === 'custom_range') {
        if (!d.parsedDate) return false;
        const dTime = new Date(d.parsedDate.getFullYear(), d.parsedDate.getMonth(), d.parsedDate.getDate()).getTime();
        if (extractStartDate) {
          const sParts = extractStartDate.split('-');
          const startTime = new Date(parseInt(sParts[0], 10), parseInt(sParts[1], 10) - 1, parseInt(sParts[2], 10)).getTime();
          if (dTime < startTime) return false;
        }
        if (extractEndDate) {
          const eParts = extractEndDate.split('-');
          const endTime = new Date(parseInt(eParts[0], 10), parseInt(eParts[1], 10) - 1, parseInt(eParts[2], 10)).getTime();
          if (dTime > endTime) return false;
        }
        return true;
      }
      if (extractSourceFilter === 'all') {
        return true;
      }
      return true;
    });

    if (includeCarryoverNo) {
      const candidateImeis = new Set(list.map((d) => String(d.imei)));
      const carryovers = enrichedDevices.filter(
        (d) => (carryoverImeis.map(String).includes(String(d.imei)) || d.renewalDecision === 'No') &&
               !candidateImeis.has(String(d.imei))
      );
      list = [...list, ...carryovers];
    }

    return list;
  }, [
    enrichedDevices,
    extractSourceFilter,
    nextMonthKey,
    thisMonthKey,
    extractSpecificMonth,
    extractStartDate,
    extractEndDate,
    includeCarryoverNo,
    carryoverImeis
  ]);

  // If adding to existing sheet, detect duplicate IMEIs that already exist in activeSheetDeviceList
  const existingSheetImeiSet = useMemo(() => {
    if (extractTargetMode !== 'existing') return new Set();
    if (extractExistingTab === activeCycleTab && activeSheetDeviceList.length > 0) {
      return new Set(activeSheetDeviceList.map((d) => String(d.imei || d.uniqueid)));
    }
    return new Set();
  }, [extractTargetMode, extractExistingTab, activeCycleTab, activeSheetDeviceList]);

  const extractStats = useMemo(() => {
    if (extractTargetMode !== 'existing' || existingSheetImeiSet.size === 0) {
      return { newCount: extractCandidates.length, duplicateCount: 0 };
    }
    let dup = 0;
    let fresh = 0;
    extractCandidates.forEach((d) => {
      if (existingSheetImeiSet.has(String(d.imei || d.uniqueid))) {
        dup++;
      } else {
        fresh++;
      }
    });
    return { newCount: fresh, duplicateCount: dup };
  }, [extractTargetMode, existingSheetImeiSet, extractCandidates]);

  // Single VTS search results from Master 950 Fleet
  const singleSearchResults = useMemo(() => {
    const q = singleVtsSearch.trim().toLowerCase();
    if (!q) return [];
    return enrichedDevices
      .filter((d) => {
        const imei = String(d.imei || d.uniqueid || '').toLowerCase();
        const vehicle = String(d.vehicle || d.name || '').toLowerCase();
        const city = String(d.city || '').toLowerCase();
        const phone = String(d.phone || d.sim || '').toLowerCase();
        return imei.includes(q) || vehicle.includes(q) || city.includes(q) || phone.includes(q);
      })
      .slice(0, 20);
  }, [singleVtsSearch, enrichedDevices]);

  // Set of IMEIs present in the chosen target tab (for deduplication check in modal)
  const targetTabImeiSet = useMemo(() => {
    const target = addVtsTargetTab || activeCycleTab;
    if (!target) return new Set();
    if (target === activeCycleTab && activeSheetDeviceList.length > 0) {
      return new Set(activeSheetDeviceList.map((d) => String(d.imei || d.uniqueid).trim()));
    }
    const cached = safeGetJson(`vts_sheet_cache_${String(target).trim().toLowerCase()}`);
    if (cached && Array.isArray(cached.sheetDevices)) {
      return new Set(cached.sheetDevices.map((d) => String(d.imei || d.uniqueid).trim()));
    }
    return new Set();
  }, [addVtsTargetTab, activeCycleTab, activeSheetDeviceList]);

  // Bulk VTS live parsing and matching against 950 Fleet
  const bulkVtsAnalysis = useMemo(() => {
    if (!bulkVtsInput.trim()) {
      return { totalParsed: 0, matchedDevices: [], notFoundImeis: [], alreadyInSheet: [], readyToAdd: [] };
    }
    const rawTokens = bulkVtsInput
      .split(/[\r\n,;\s]+/)
      .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    const uniqueImeis = [...new Set(rawTokens)];

    const deviceByImei = new Map();
    enrichedDevices.forEach((d) => {
      const clean = String(d.imei || d.uniqueid || '').trim();
      if (clean) deviceByImei.set(clean, d);
    });

    const matchedDevices = [];
    const notFoundImeis = [];
    const alreadyInSheet = [];
    const readyToAdd = [];

    uniqueImeis.forEach((token) => {
      const dev = deviceByImei.get(token);
      if (dev) {
        matchedDevices.push(dev);
        if (targetTabImeiSet.has(token)) {
          alreadyInSheet.push(dev);
        } else {
          readyToAdd.push(dev);
        }
      } else {
        notFoundImeis.push(token);
      }
    });

    return {
      totalParsed: uniqueImeis.length,
      matchedDevices,
      notFoundImeis,
      alreadyInSheet,
      readyToAdd
    };
  }, [bulkVtsInput, enrichedDevices, targetTabImeiSet]);

  // Open Extract Modal with auto-suggested tab name and defaults
  const handleOpenExtractModal = () => {
    const today = new Date();
    const day = today.getDate();
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'june', 'july', 'aug', 'sept', 'oct', 'nov', 'dec'];
    const suggested = `${day} ${monthNames[today.getMonth()]} ${today.getFullYear()}`;
    setExtractTabName(suggested);
    setExtractTargetMode('new');
    setExtractExistingTab(activeCycleTab || (cycleTabs && cycleTabs[0]) || '');
    setExtractSourceFilter('next_month');
    if (availableMonths.length > 0) {
      setExtractSpecificMonth(availableMonths[0].key);
    }
    const next30 = new Date();
    next30.setDate(today.getDate() + 30);
    const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setExtractStartDate(formatYMD(today));
    setExtractEndDate(formatYMD(next30));
    setShowExtractModal(true);
  };

  // Extract renewal devices to Google Sheet tab (brand new tab or append to existing tab)
  const handleExtractBatchSubmit = async (e) => {
    e.preventDefault();
    const finalTabName = extractTargetMode === 'new' ? extractTabName.trim() : extractExistingTab.trim();
    if (!finalTabName) {
      alert(extractTargetMode === 'new' ? 'Please enter a Tab / Cycle Name for the new sheet.' : 'Please select an existing sheet tab.');
      return;
    }

    if (extractCandidates.length === 0) {
      const proceed = confirm(`No devices match the selected criteria (${extractSourceFilter}). Do you want to proceed and create an empty tab "${finalTabName}"?`);
      if (!proceed) return;
    }

    setIsExtracting(true);
    setExtractNotice(null);

    // All extracted vehicles default strictly to 'Yes' (Recharge status) as explicitly requested
    const devicesToExtract = extractCandidates.map((d) => ({
      ...d,
      renewalDecision: 'Yes',
      decision: 'Yes',
      rechargeStatus: 'Yes',
      statusVal: 'Yes',
      statusDone: 'Not Done',
      newLicenseEnd: '',
      renewalRemark: ''
    }));

    try {
      const res = await extractRenewalCycleBatch({
        tabName: finalTabName,
        devices: devicesToExtract,
        includeDeclined: includeCarryoverNo,
        targetMode: extractTargetMode
      });

      if (res.success) {
        // Construct immediate local records with 'Yes' defaults for instant 0ms rendering
        const newRecords = {};
        const newSheetDevices = devicesToExtract.map((d, i) => {
          const imei = String(d.imei || d.uniqueid || '').trim();
          newRecords[imei] = {
            decision: 'Yes',
            remark: '',
            newLicenseEnd: '',
            statusDone: 'Not Done'
          };
          return {
            ...d,
            sr: i + 1,
            renewalDecision: 'Yes',
            rechargeStatus: 'Yes',
            statusDone: 'Not Done',
            newLicenseEnd: '',
            renewalRemark: ''
          };
        });

        if (extractTargetMode === 'new') {
          setSheetDevices(newSheetDevices);
          setSheetCycleRecords(newRecords);
          safeSetItem(`vts_sheet_cache_${finalTabName.trim().toLowerCase()}`, {
            sheetDevices: newSheetDevices,
            recordsByImei: newRecords,
            timestamp: Date.now()
          });
        }

        setActiveCycleTab(finalTabName);
        safeSetItem(STORAGE_KEY_USER_CYCLE_TAB, finalTabName);
        safeSetItem('vts_tracker_active_cycle_tab', finalTabName);
        safeSetItem('vts_user_has_manually_selected_tab', 'true');
        setFilterPreset('active_sheet');
        safeSetItem('vts_renewal_filter_preset', 'active_sheet');
        handlePageChange(1);
        if (!cycleTabs.includes(finalTabName)) {
          setCycleTabs([finalTabName, ...cycleTabs]);
        }
        await setActiveRenewalCycleTab(finalTabName);
        setExtractNotice({
          type: 'success',
          text: `✅ ${res.message}`
        });
        setShowExtractModal(false);
        await loadCycleData(finalTabName);
        if (onRefresh) onRefresh();
      } else {
        alert('Failed to extract batch: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error extracting batch: ' + err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  // Add specific single or bulk vehicles from 950 Master Fleet directly to Renewal Sheet
  const handleAddSpecificVts = async (devicesToAdd, customTabName) => {
    const finalTab = customTabName || addVtsTargetTab || activeCycleTab;
    if (!finalTab) {
      alert('Please select or specify a target Renewal Sheet tab.');
      return;
    }
    if (!devicesToAdd || devicesToAdd.length === 0) {
      alert('No vehicles selected or ready to add.');
      return;
    }

    setIsAddingVts(true);
    setAddVtsNotice(null);

    const formatted = devicesToAdd.map((d) => ({
      ...d,
      renewalDecision: 'Yes',
      decision: 'Yes',
      rechargeStatus: 'Yes',
      statusVal: 'Yes',
      statusDone: 'Not Done',
      newLicenseEnd: '',
      renewalRemark: ''
    }));

    try {
      const res = await extractRenewalCycleBatch({
        tabName: finalTab,
        devices: formatted,
        targetMode: 'existing'
      });

      if (res.success) {
        // If finalTab is activeCycleTab, immediately update local state for 0ms lag!
        if (finalTab === activeCycleTab) {
          const existingList = [...activeSheetDeviceList];
          const updatedRecords = { ...sheetCycleRecords };
          const existingImeis = new Set(existingList.map((d) => String(d.imei || d.uniqueid).trim()));

          let nextSr = existingList.length + 1;
          const newAdded = [];
          formatted.forEach((d) => {
            const imei = String(d.imei || d.uniqueid).trim();
            if (!existingImeis.has(imei)) {
              existingImeis.add(imei);
              updatedRecords[imei] = {
                decision: 'Yes',
                remark: '',
                newLicenseEnd: '',
                statusDone: 'Not Done'
              };
              newAdded.push({
                ...d,
                sr: nextSr++,
                renewalDecision: 'Yes',
                rechargeStatus: 'Yes',
                statusDone: 'Not Done',
                newLicenseEnd: '',
                renewalRemark: ''
              });
            }
          });

          const merged = [...existingList, ...newAdded];
          setSheetDevices(merged);
          setSheetCycleRecords(updatedRecords);
          safeSetItem(`vts_sheet_cache_${finalTab.trim().toLowerCase()}`, {
            sheetDevices: merged,
            recordsByImei: updatedRecords,
            timestamp: Date.now()
          });
        }

        setAddVtsNotice({
          type: 'success',
          text: `✅ ${res.message || `Added ${formatted.length} vehicle(s) to "${finalTab}" with default "Yes"!`}`
        });

        // Clear inputs after success
        setSingleVtsSearch('');
        setBulkVtsInput('');

        // Reload fresh data from sheet
        await loadCycleData(finalTab);
        if (onRefresh) onRefresh();
      } else {
        setAddVtsNotice({
          type: 'error',
          text: `❌ Failed to add vehicles: ${res.error || res.message || 'Unknown error'}`
        });
      }
    } catch (err) {
      setAddVtsNotice({
        type: 'error',
        text: `❌ Error: ${err.message}`
      });
    } finally {
      setIsAddingVts(false);
    }
  };

  // Open Finalize Session Modal with suggested date (+1 year)
  const _handleOpenFinalizeModal = () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const yyyy = nextYear.getFullYear();
    const mm = String(nextYear.getMonth() + 1).padStart(2, '0');
    const dd = String(nextYear.getDate()).padStart(2, '0');
    setFinalizeLicenseEnd(`${yyyy}-${mm}-${dd}`);
    setFinalizeNote(`Batch renewal finalized for session ${activeCycleTab}`);
    setShowFinalizeModal(true);
  };

  // Finalize session handler
  const handleFinalizeSubmit = async (e) => {
    e.preventDefault();
    if (!finalizeLicenseEnd) {
      alert('Please enter or select the new License End date.');
      return;
    }

    setIsFinalizing(true);
    try {
      const approvedDevices = filteredDevices.filter((d) => d.renewalDecision === 'Yes');
      const declinedDevices = filteredDevices.filter((d) => d.renewalDecision === 'No');

      if (approvedDevices.length === 0 && declinedDevices.length === 0) {
        alert('No Yes or No decisions found in the current filtered list.');
        setIsFinalizing(false);
        return;
      }

      const res = await finalizeRenewalSession({
        activeTab: activeCycleTab,
        newLicenseEnd: finalizeLicenseEnd,
        note: finalizeNote,
        approvedImeis: approvedDevices.map((d) => d.imei),
        declinedImeis: declinedDevices.map((d) => d.imei)
      });

      if (res.success) {
        setFinalizeNotice({
          type: 'success',
          text: `✅ ${res.message}`
        });
        setCarryoverImeis(declinedDevices.map((d) => String(d.imei)));
        setShowFinalizeModal(false);
        setFinalizeLicenseEnd('');
        setFinalizeNote('');
        if (onRefresh) onRefresh();
      } else {
        alert('Failed to finalize session: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error finalizing session: ' + err.message);
    } finally {
      setIsFinalizing(false);
    }
  };

  // Apply batch renewals handler
  const handleApplyBatchRenewals = async () => {
    const yesCount = batchCounts.yes;
    if (yesCount === 0) {
      alert('No approved ("Yes") vehicles found in the current sheet tab to update.\nPlease set Recharge status to "Yes" for the vehicles you want to renew.');
      return;
    }

    if (!window.confirm(`Are you sure you want to update License End dates for ${yesCount} approved vehicles in the Master Sheet?\n\nTheir new license dates will be saved, and their status will be marked as "Done".`)) {
      return;
    }

    setIsFinalizing(true);
    try {
      const res = await applyBatchRenewals({ tabName: activeCycleTab });
      if (res.success) {
        setFinalizeNotice({
          type: 'success',
          text: `✅ ${res.message}`
        });
        if (onRefresh) onRefresh();
      } else {
        alert('Failed to apply renewals: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error applying renewals: ' + err.message);
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="renewal-dashboard">
      {/* Top Header Row */}
      <div className="page-header-row" style={{ alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px 0' }}>Recharge &amp; Renewal Management</h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
            Select renewal data for this month, manage Yes/No recharge decisions with remarks, create Google Sheet tab, and apply license updates.
          </p>
        </div>

        <div className="header-actions-group" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="primary-button"
            onClick={handleOpenExtractModal}
            title="Create a new sheet tab or add to an existing sheet tab in Google Sheet"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderColor: '#059669', fontWeight: 600 }}
          >
            <Icon name="upload" size={15} /> 📤 Create / Update Sheet Tab
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setAddVtsTargetTab(activeCycleTab || (cycleTabs && cycleTabs[0]) || '');
              setShowAddVtsModal(true);
              setAddVtsNotice(null);
            }}
            title="Add specific single vehicle or bulk IMEIs from 950 Master fleet into Renewal Sheet tab"
            style={{
              background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
              borderColor: '#0f766e',
              fontWeight: 600
            }}
          >
            <Icon name="plus" size={15} /> ➕ Add VTS (Single / Bulk)
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handleApplyBatchRenewals}
            disabled={isFinalizing || batchCounts.yes === 0}
            title="Update Master Sheet License End dates to New License End dates for approved Yes vehicles"
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', borderColor: '#2563eb', fontWeight: 600 }}
          >
            <Icon name="check" size={15} /> {isFinalizing ? 'Updating...' : `✅ Update License End (${batchCounts.yes})`}
          </button>

          <button
            type="button"
            className="secondary-button compact"
            onClick={() => handleExportBatch('all', 'xlsx')}
            title="Download Excel (.xlsx) with exact 10 columns matching Google Sheet"
          >
            📥 Download Excel
          </button>

          <button
            type="button"
            className="secondary-button compact"
            onClick={() => handleExportBatch('all', 'csv')}
            title="Download CSV file"
          >
            CSV
          </button>

          <label
            className="secondary-button compact"
            style={{ cursor: isUpdatingBatch ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}
            title="Upload Excel or CSV with updated license end dates to update Google Sheet and mark as Done"
          >
            <Icon name="upload" size={13} className={isUpdatingBatch ? 'spin' : ''} />
            {isUpdatingBatch ? 'Updating Dates...' : '📤 Upload Updated Dates'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleUploadUpdatedDates}
              style={{ display: 'none' }}
              disabled={isUpdatingBatch}
            />
          </label>

          <a
            href={RENEWAL_DONE_SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="secondary-button compact"
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa' }}
            title="Open Renewal done month wise Google Sheet"
          >
            🔗 Open Sheet ↗
          </a>

          <button
            type="button"
            className="secondary-button compact"
            onClick={handleSendEmails}
            disabled={isSendingEmails}
            title="Send email reminders to site managers"
            style={{ fontSize: '11px' }}
          >
            <Icon name="refresh" size={13} className={isSendingEmails ? 'spin' : ''} />
            {isSendingEmails ? 'Sending...' : '📧 Reminders'}
          </button>

          <button
            type="button"
            className="secondary-button compact"
            onClick={() => setShowArchivesModal(true)}
            title="View Drive Archives & Logs"
            style={{ fontSize: '11px' }}
          >
            📁 Logs ({renewalArchives.length})
          </button>
        </div>
      </div>

      {extractNotice && (
        <div className={`alert-banner ${extractNotice.type}`} style={{ marginBottom: '14px' }}>
          <Icon name={extractNotice.type === 'success' ? 'check' : 'alert'} size={16} />
          <span>{extractNotice.text}</span>
        </div>
      )}

      {finalizeNotice && (
        <div className={`alert-banner ${finalizeNotice.type}`} style={{ marginBottom: '14px' }}>
          <Icon name={finalizeNotice.type === 'success' ? 'check' : 'alert'} size={16} />
          <span>{finalizeNotice.text}</span>
        </div>
      )}

      {emailNotice && (
        <div className={`alert-banner ${emailNotice.type}`} style={{ marginBottom: '14px' }}>
          <span>{emailNotice.text}</span>
        </div>
      )}

      {/* Unified Batch & Filter Control Bar */}
      <div
        className="renewal-unified-bar"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px'
        }}
      >
        {/* Left: Select Renewal Data */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon name="calendar" size={16} /> Select Data:
          </span>

          <select
            value={filterPreset}
            onChange={(e) => {
              const val = e.target.value;
              setFilterPreset(val);
              safeSetItem('vts_renewal_filter_preset', val);
              handlePageChange(1);
            }}
            style={{
              background: 'var(--bg-card)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: '6px',
              padding: '6px 12px',
              fontWeight: 'bold',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <option value="active_sheet">
              📄 Active Sheet Tab: {activeCycleTab} ({activeSheetDeviceList.length} vehicles)
            </option>
            <option value="next_month">⚡ Next Month ({getMonthYearLabel(nextMonthDate)}) [{kpis.dueNextMonth}]</option>
            <option value="this_month">📅 This Month ({getMonthYearLabel(now)}) [{kpis.dueThisMonth}]</option>
            <option value="expired">🚨 Expired (&lt; 0d) [{kpis.expired}]</option>
            <option value="soon_15">⏳ Next 15 Days [{kpis.rechargeSoon15}]</option>
            <option value="by_month">📆 Choose Specific Month...</option>
            <option value="custom_range">📆 Custom Date Range...</option>
            <option value="all">🌐 All Master Fleet ({kpis.total})</option>
          </select>

          {/* Month selector if Choose Specific Month is picked */}
          {filterPreset === 'by_month' && (
            <select
              value={selectedMonth}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedMonth(val);
                safeSetItem('vts_renewal_selected_month', val);
                handlePageChange(1);
              }}
              style={{
                background: 'var(--bg-card)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({m.count} vehicles)
                </option>
              ))}
            </select>
          )}

          {/* Date range inputs if Custom Range is picked */}
          {filterPreset === 'custom_range' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomStartDate(val);
                  safeSetItem('vts_renewal_custom_start', val);
                  handlePageChange(1);
                }}
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '12px'
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomEndDate(val);
                  safeSetItem('vts_renewal_custom_end', val);
                  handlePageChange(1);
                }}
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '12px'
                }}
              />
              <button
                type="button"
                className="secondary-button compact"
                onClick={() => applyDateRangeDays(15)}
                style={{ fontSize: '11px', padding: '3px 6px' }}
              >
                +15d
              </button>
              <button
                type="button"
                className="secondary-button compact"
                onClick={() => applyDateRangeDays(30)}
                style={{ fontSize: '11px', padding: '3px 6px' }}
              >
                +30d
              </button>
            </div>
          )}
        </div>

        {/* Middle: Decision Status Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            Recharge Status:
          </span>

          <button
            type="button"
            onClick={() => {
              setDecisionFilter('All');
              safeSetItem('vts_renewal_decision_filter', 'All');
              handlePageChange(1);
            }}
            style={{
              background: decisionFilter === 'All' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${decisionFilter === 'All' ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
              color: decisionFilter === 'All' ? '#60a5fa' : 'var(--text-secondary)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            All ({batchCounts.total})
          </button>

          <button
            type="button"
            onClick={() => {
              setDecisionFilter('Yes');
              safeSetItem('vts_renewal_decision_filter', 'Yes');
              handlePageChange(1);
            }}
            style={{
              background: decisionFilter === 'Yes' ? '#137333' : 'rgba(16, 185, 129, 0.12)',
              border: `1px solid ${decisionFilter === 'Yes' ? '#10b981' : 'rgba(16, 185, 129, 0.3)'}`,
              color: decisionFilter === 'Yes' ? '#ffffff' : '#34d399',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🟢 Yes ({batchCounts.yes})
          </button>

          <button
            type="button"
            onClick={() => {
              setDecisionFilter('No');
              safeSetItem('vts_renewal_decision_filter', 'No');
              handlePageChange(1);
            }}
            style={{
              background: decisionFilter === 'No' ? '#a50e0e' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${decisionFilter === 'No' ? '#ef4444' : 'rgba(239, 68, 68, 0.3)'}`,
              color: decisionFilter === 'No' ? '#ffffff' : '#f87171',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🔴 No ({batchCounts.no})
          </button>

          <button
            type="button"
            onClick={() => {
              setDecisionFilter('Pending');
              safeSetItem('vts_renewal_decision_filter', 'Pending');
              handlePageChange(1);
            }}
            style={{
              background: decisionFilter === 'Pending' ? 'rgba(234, 179, 8, 0.25)' : 'rgba(234, 179, 8, 0.1)',
              border: `1px solid ${decisionFilter === 'Pending' ? '#eab308' : 'rgba(234, 179, 8, 0.3)'}`,
              color: decisionFilter === 'Pending' ? '#facc15' : '#eab308',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ⚪ Blank / Pending ({batchCounts.blank})
          </button>
        </div>

        {/* Right: Active Cycle Sheet Tab */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            Active Tab:
          </span>
          <select
            value={activeCycleTab}
            onChange={(e) => handleTabChange(e.target.value)}
            style={{
              background: 'var(--bg-card)',
              color: '#34d399',
              border: '1px solid rgba(52, 211, 153, 0.4)',
              borderRadius: '6px',
              padding: '5px 10px',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            {cycleTabs.map((tab) => (
              <option key={tab} value={tab}>
                📄 {tab}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary-button compact"
            onClick={handleEditSheetUrl}
            title="Verify or update Google Sheet URL"
            style={{ fontSize: '11px', padding: '3px 8px', color: '#93c5fd' }}
          >
            ⚙️ Link
          </button>
          <button
            type="button"
            className="secondary-button compact"
            onClick={() => loadCycleData(activeCycleTab)}
            disabled={isSheetLoading}
            title="Re-pull live data from Google Sheet"
            style={{ fontSize: '11px', padding: '3px 8px', color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
          >
            <Icon name="refresh" size={11} className={isSheetLoading ? 'spin' : ''} />
            🔄 Sync Tab
          </button>
          {isSheetLoading && (
            <span style={{ fontSize: '11px', color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Syncing sheet data with Google Sheets...">
              <Icon name="refresh" size={12} className="spin" /> Syncing...
            </span>
          )}
        </div>
      </div>

      {sheetSyncError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fca5a5', fontSize: '12px' }}>
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <span><strong>Sheet Sync Issue:</strong> {sheetSyncError}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="primary-button"
              onClick={() => loadCycleData(activeCycleTab)}
              style={{ fontSize: '11px', padding: '4px 10px', background: '#3b82f6' }}
            >
              🔄 Retry Sync
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleEditSheetUrl}
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              ⚙️ Link Sheet URL
            </button>
          </div>
        </div>
      )}

      {/* Search & City Filter Bar */}
      <div className="filter-toolbar" style={{ marginBottom: '14px' }}>
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            type="text"
            placeholder="Search by Vehicle Name, Uniqueid (IMEI), SIM, City, Remark..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {search && (
            <button className="clear-search" onClick={() => handleSearchChange('')}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        <div className="filter-selects">
          <div className="select-wrap">
            <label>City / Site:</label>
            <select
              value={cityFilter}
              onChange={(e) => {
                const val = e.target.value;
                setCityFilter(val);
                safeSetItem('vts_renewal_city_filter', val);
                handlePageChange(1);
              }}
            >
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c === 'All' ? `All Cities (${cities.length - 1})` : c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* City-Wise Renewal Breakdown Widget (Yes / No Summary) */}
      {cityBreakdown.length > 0 && (
        <div
          className="city-breakdown-card"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
              flexWrap: 'wrap',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🏙️ City-Wise Renewal Breakdown
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 600
                }}
              >
                {cityBreakdown.length} {cityBreakdown.length === 1 ? 'City' : 'Cities'}
              </span>

              {cityFilter !== 'All' && (
                <button
                  type="button"
                  onClick={() => {
                    setCityFilter('All');
                    safeSetItem('vts_renewal_city_filter', 'All');
                    handlePageChange(1);
                  }}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    borderRadius: '6px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Click to reset city filter to All"
                >
                  Filtered: {cityFilter} ✕ Show All
                </button>
              )}
            </div>

            {cityBreakdown.length > 8 && (
              <button
                type="button"
                onClick={() => setShowAllCities((prev) => !prev)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#60a5fa',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px'
                }}
              >
                {showAllCities ? '▲ Show Less' : `▼ Show All (${cityBreakdown.length}) Cities`}
              </button>
            )}
          </div>

          {/* City Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '8px'
            }}
          >
            {(showAllCities ? cityBreakdown : cityBreakdown.slice(0, 8)).map((cb) => {
              const isActive = cityFilter === cb.city;
              return (
                <div
                  key={cb.city}
                  onClick={() => {
                    const nextVal = isActive ? 'All' : cb.city;
                    setCityFilter(nextVal);
                    safeSetItem('vts_renewal_city_filter', nextVal);
                    handlePageChange(1);
                  }}
                  title={`Click to filter by ${cb.city} (Total: ${cb.total} | Yes: ${cb.yes} | No: ${cb.no}${cb.pending > 0 ? ` | Pending: ${cb.pending}` : ''})`}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: isActive ? '1.5px solid #3b82f6' : '1px solid var(--border-color)',
                    background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: isActive ? '#60a5fa' : 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {cb.city}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        background: 'rgba(255, 255, 255, 0.05)',
                        padding: '1px 5px',
                        borderRadius: '4px'
                      }}
                    >
                      {cb.total}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                    <span style={{ color: '#34d399', fontWeight: 600 }}>
                      🟢 {cb.yes}
                    </span>
                    <span style={{ color: '#f87171', fontWeight: 600 }}>
                      🔴 {cb.no}
                    </span>
                    {cb.pending > 0 && (
                      <span style={{ color: '#facc15', fontWeight: 500 }}>
                        ⚪ {cb.pending}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Table Panel with Exact 10 Columns Matching Image 3 */}
      <div className="panel table-panel">
        <div className="table-controls-bar">
          <div className="table-count-summary">
            Showing <b>{filteredDevices.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</b>–
            <b>{Math.min(currentPage * pageSize, filteredDevices.length)}</b> of{' '}
            <b>{filteredDevices.length}</b> vehicles
          </div>
          <div className="table-page-size">
            <label>Show:</label>
            <select
              value={pageSize}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPageSize(val);
                safeSetItem('vts_renewal_page_size', val);
                handlePageChange(1);
              }}
            >
              <option value="10">10 rows</option>
              <option value="25">25 rows</option>
              <option value="50">50 rows</option>
              <option value="100">100 rows</option>
            </select>
          </div>
        </div>

        <div className="table-wrap renewal-table-wrap">
          <table>
            <thead>
              <tr style={{ background: '#e69138', color: '#000000', fontWeight: 'bold' }}>
                <th style={{ color: '#000000', textAlign: 'center', width: '50px', position: 'sticky', top: 0, zIndex: 30, background: '#e69138' }}>SR.</th>
                <th style={{ color: '#000000', position: 'sticky', top: 0, zIndex: 30, background: '#e69138' }}>Name</th>
                <th style={{ color: '#000000', position: 'sticky', top: 0, zIndex: 30, background: '#e69138' }}>Uniqueid</th>
                <th style={{ color: '#000000', position: 'sticky', top: 0, zIndex: 30, background: '#e69138' }}>Phone</th>
                <th style={{ color: '#000000', position: 'sticky', top: 0, zIndex: 30, background: '#e69138' }}>License End</th>
                <th style={{ color: '#000000', position: 'sticky', top: 0, zIndex: 30, background: '#e69138' }}>City</th>
                <th style={{ color: '#000000', position: 'sticky', top: 0, zIndex: 30, background: '#e69138' }}>Remark</th>
                <th style={{ color: '#000000', textAlign: 'center', width: '130px', position: 'sticky', top: 0, zIndex: 30, background: '#e69138' }}>Rechage status</th>
                <th style={{ color: '#000000', position: 'sticky', top: 0, zIndex: 30, background: '#e69138' }}>New License End</th>
                <th style={{ color: '#000000', textAlign: 'center', width: '100px', position: 'sticky', top: 0, zIndex: 30, background: '#e69138' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedDevices.map((d, index) => {
                const globalIndex = (currentPage - 1) * pageSize + index + 1;
                const isApproved = d.renewalDecision === 'Yes';
                const isDenied = d.renewalDecision === 'No';

                return (
                  <tr
                    key={d.imei || index}
                    className={`renewal-row ${isApproved ? 'row-approved' : isDenied ? 'row-denied' : ''}`}
                  >
                    {/* Col A: SR. */}
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {filterPreset === 'active_sheet' ? (d.sr || globalIndex) : globalIndex}
                    </td>

                    {/* Col B: Name */}
                    <td>
                      <strong>{d.vehicle}</strong>
                    </td>

                    {/* Col C: Uniqueid */}
                    <td className="mono" style={{ fontSize: '12px' }}>{d.imei}</td>

                    {/* Col D: Phone */}
                    <td className="mono" style={{ fontSize: '12px' }}>{d.sim || '—'}</td>

                    {/* Col E: License End */}
                    <td className="mono font-semibold" style={{ fontSize: '12px' }}>
                      {d.displayLicenseEnd || d.licenseEnd || '—'}
                      {d.remainingDays !== undefined && (
                        <div style={{ fontSize: '11px', color: d.remainingDays < 0 ? '#f87171' : d.remainingDays <= 15 ? '#facc15' : 'var(--text-muted)' }}>
                          {d.remainingDays < 0 ? `Expired (${Math.abs(d.remainingDays)}d ago)` : `${d.remainingDays} days left`}
                        </div>
                      )}
                    </td>

                    {/* Col F: City */}
                    <td>
                      <span className="city-tag">{d.city}</span>
                    </td>

                    {/* Col G: Remark (fresh renewal remark input) */}
                    <td>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <input
                          type="text"
                          defaultValue={d.renewalRemark || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (d.renewalRemark || '')) {
                              handleSaveRemark(d.imei, e.target.value);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.target.blur();
                            }
                          }}
                          placeholder="Add remark (e.g. No need now)"
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            color: 'var(--text-primary)',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            width: '100%',
                            minWidth: '130px'
                          }}
                        />
                        {saveToast[d.imei] && (
                          <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#10b981', fontWeight: 600 }}>
                            ✓ {saveToast[d.imei]}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Col H: Rechage status (Yes / No dropdown with red/green pill) */}
                    <td style={{ textAlign: 'center' }}>
                      <select
                        value={d.renewalDecision || 'Pending'}
                        onChange={(e) => handleDecisionChange(d.imei, e.target.value)}
                        style={{
                          background: isApproved ? '#137333' : isDenied ? '#a50e0e' : 'var(--bg-card)',
                          color: isApproved || isDenied ? '#ffffff' : 'var(--text-primary)',
                          border: `1px solid ${isApproved ? '#10b981' : isDenied ? '#ef4444' : 'rgba(255, 255, 255, 0.2)'}`,
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="Pending" style={{ background: '#1e293b', color: '#fff' }}>Pending</option>
                        <option value="Yes" style={{ background: '#137333', color: '#fff' }}>Yes</option>
                        <option value="No" style={{ background: '#a50e0e', color: '#fff' }}>No</option>
                      </select>
                    </td>

                    {/* Col I: New License End */}
                    <td className="mono font-semibold" style={{ fontSize: '12px', color: d.newLicenseEnd ? '#34d399' : 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {editingLicImei === d.imei ? (
                          <input
                            type="date"
                            defaultValue={d.newLicenseEnd ? (parseFlexibleDate(d.newLicenseEnd)?.toISOString().split('T')[0] || '') : ''}
                            onBlur={(e) => handleInlineNewLicenseSave(d.imei, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                            autoFocus
                            style={{ fontSize: '11px', padding: '2px 4px', borderRadius: '4px', background: 'var(--bg-card)', color: '#fff', border: '1px solid #10b981' }}
                          />
                        ) : (
                          <>
                            <span>{d.newLicenseEnd || '—'}</span>
                            {d.renewalDecision === 'Yes' && (
                              <button
                                type="button"
                                className="icon-button"
                                title="Set / Pick New License End Date"
                                onClick={() => setEditingLicImei(d.imei)}
                                style={{ padding: '2px 4px', opacity: 0.8, cursor: 'pointer', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '4px', color: '#60a5fa', fontSize: '11px' }}
                              >
                                ✏️
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>

                    {/* Col J: Status (Done / Not Done / Pending) */}
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          background: d.statusDone === 'Done' ? 'rgba(16, 185, 129, 0.2)' : d.statusDone === 'Not Done' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                          color: d.statusDone === 'Done' ? '#34d399' : d.statusDone === 'Not Done' ? '#f87171' : 'var(--text-muted)',
                          border: `1px solid ${d.statusDone === 'Done' ? '#10b981' : d.statusDone === 'Not Done' ? '#ef4444' : 'rgba(148, 163, 184, 0.3)'}`
                        }}
                      >
                        {d.statusDone || 'Pending'}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {paginatedDevices.length === 0 && (
                <tr>
                  <td colSpan="10" className="empty-state" style={{ padding: '36px 20px', textAlign: 'center' }}>
                    {isSheetLoading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <Icon name="refresh" size={24} className="spin" style={{ color: '#60a5fa' }} />
                        <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontSize: '14px' }}>
                          Syncing sheet data for "{activeCycleTab}" from Google Sheets...
                        </p>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                          Please wait a moment while records are being retrieved.
                        </p>
                      </div>
                    ) : filterPreset === 'active_sheet' && activeSheetDeviceList.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', maxWidth: '520px', margin: '0 auto' }}>
                        <div style={{ fontSize: '32px' }}>{sheetSyncError ? '⚠️' : '📄'}</div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: sheetSyncError ? '#f87171' : 'var(--text-primary)' }}>
                          {sheetSyncError ? `Connection Notice for "${activeCycleTab}"` : `Sheet Tab "${activeCycleTab}" is Currently Empty (0 Vehicles)`}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                          {sheetSyncError ? (
                            <span>{sheetSyncError}</span>
                          ) : (
                            <span>
                              No vehicles have been extracted into Google Sheet tab <b>"{activeCycleTab}"</b> yet.
                              You can extract vehicles into this sheet or click below to view renewals due this month.
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' }}>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => loadCycleData(activeCycleTab)}
                            style={{ fontSize: '12px', padding: '6px 14px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}
                          >
                            🔄 Re-sync from Google Sheets
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={handleEditSheetUrl}
                            style={{ fontSize: '12px', padding: '6px 14px' }}
                          >
                            ⚙️ Check / Update Sheet Link
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={handleOpenExtractModal}
                            style={{ fontSize: '12px', padding: '6px 14px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                          >
                            ✨ Extract Vehicles to "{activeCycleTab}"
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => {
                              setAddVtsTargetTab(activeCycleTab || (cycleTabs && cycleTabs[0]) || '');
                              setShowAddVtsModal(true);
                              setAddVtsNotice(null);
                            }}
                            style={{ fontSize: '12px', padding: '6px 14px', background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)' }}
                          >
                            ➕ Add Specific VTS (Single / Bulk)
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              setFilterPreset('this_month');
                              safeSetItem('vts_renewal_filter_preset', 'this_month');
                              handlePageChange(1);
                            }}
                            style={{ fontSize: '12px', padding: '6px 14px' }}
                          >
                            📅 View This Month ({kpis.dueThisMonth} due)
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              setFilterPreset('next_month');
                              safeSetItem('vts_renewal_filter_preset', 'next_month');
                              handlePageChange(1);
                            }}
                            style={{ fontSize: '12px', padding: '6px 14px' }}
                          >
                            ⚡ View Next Month ({kpis.dueNextMonth} due)
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              setFilterPreset('all');
                              safeSetItem('vts_renewal_filter_preset', 'all');
                              handlePageChange(1);
                            }}
                            style={{ fontSize: '12px', padding: '6px 14px' }}
                          >
                            🌐 View All Fleet ({kpis.total})
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontSize: '14px' }}>
                          No vehicles found matching current filter selection.
                        </p>
                        {(search || cityFilter !== 'All' || decisionFilter !== 'All') && (
                          <button
                            type="button"
                            className="secondary-button compact"
                            onClick={() => {
                              handleSearchChange('');
                              setCityFilter('All');
                              safeSetItem('vts_renewal_city_filter', 'All');
                              setDecisionFilter('All');
                              safeSetItem('vts_renewal_decision_filter', 'All');
                              handlePageChange(1);
                            }}
                            style={{ fontSize: '11px', marginTop: '6px' }}
                          >
                            ✕ Clear Search &amp; Filters
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <button
              className="pagination-btn"
              disabled={currentPage === 1}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              Previous
            </button>
            <div className="pagination-info">
              Page {currentPage} of {totalPages}
            </div>
            <button
              className="pagination-btn"
              disabled={currentPage === totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Mark As Renewed Modal */}
      {renewModalDevice && (
        <div className="modal-backdrop" onClick={() => setRenewModalDevice(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">ROADCAST RENEWAL</div>
                <h2 className="modal-title">Mark Device as Renewed</h2>
                <p className="modal-subtitle">
                  {renewModalDevice.vehicle} &bull; IMEI: {renewModalDevice.imei}
                </p>
              </div>
              <button className="icon-button" onClick={() => setRenewModalDevice(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <form onSubmit={handleMarkRenewedSubmit} className="modal-body modal-form">
              <div className="form-group">
                <label>Current Expiry Date</label>
                <input
                  type="text"
                  disabled
                  value={renewModalDevice.displayLicenseEnd || renewModalDevice.licenseEnd || 'Not set'}
                />
              </div>

              <div className="form-group">
                <label>New License End Date *</label>
                <input
                  type="date"
                  required
                  value={newLicenseEnd}
                  onChange={(e) => setNewLicenseEnd(e.target.value)}
                />
                <small className="form-help">
                  Sets the new expiry date on Roadcast and resets renewal status to Active.
                </small>
              </div>

              <div className="form-group">
                <label>Renewal Note / Transaction Details (Optional)</label>
                <textarea
                  rows="2"
                  placeholder="e.g. 1 Year renewal paid via Roadcast Invoice #4489"
                  value={renewNote}
                  onChange={(e) => setRenewNote(e.target.value)}
                  className="inline-edit-input"
                  style={{ width: '100%', padding: '8px' }}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setRenewModalDevice(null)}
                  disabled={isRenewing}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={isRenewing}>
                  <Icon name="check" size={16} />
                  {isRenewing ? 'Updating Sheet...' : 'Confirm Renewal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drive Archives & Renewal History Modal */}
      {showArchivesModal && (
        <div className="modal-backdrop" onClick={() => setShowArchivesModal(false)}>
          <div className="modal-container large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">AUDIT &amp; ARCHIVES</div>
                <h2 className="modal-title">Drive Renewal Archives &amp; Audit Logs</h2>
                <p className="modal-subtitle">Permanent records stored in Google Drive folder "VTS Renewal Archives"</p>
              </div>
              <button className="icon-button" onClick={() => setShowArchivesModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="tab-group" style={{ marginBottom: '16px' }}>
                <button
                  className={`tab-btn ${archiveTab === 'snapshots' ? 'active' : ''}`}
                  onClick={() => setArchiveTab('snapshots')}
                >
                  📁 Drive Archive Snapshots ({renewalArchives.length})
                </button>
                <button
                  className={`tab-btn ${archiveTab === 'logs' ? 'active' : ''}`}
                  onClick={() => setArchiveTab('logs')}
                >
                  📋 Renewal Decision Audit Log ({renewalLogs.length})
                </button>
              </div>

              {archiveTab === 'snapshots' ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>SNAPSHOT NAME</th>
                        <th>CREATED DATE</th>
                        <th>FILE SIZE</th>
                        <th>GOOGLE DRIVE LINK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renewalArchives.map((arc) => (
                        <tr key={arc.id || arc.name}>
                          <td>
                            <strong>{arc.name}</strong>
                          </td>
                          <td>{arc.createdDate}</td>
                          <td>{arc.size || '—'}</td>
                          <td>
                            {arc.url && arc.url !== '#' ? (
                              <a
                                href={arc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="drive-link"
                              >
                                Open in Drive ↗
                              </a>
                            ) : (
                              <span className="text-muted">Saved in Drive Folder</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {renewalArchives.length === 0 && (
                        <tr>
                          <td colSpan="4" className="empty-state">
                            <p>No snapshots archived in Google Drive yet. Click "Export &amp; Archive Snapshot" to create your first archive.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>LOG ID</th>
                        <th>VEHICLE</th>
                        <th>IMEI</th>
                        <th>PREVIOUS EXPIRY</th>
                        <th>NEW EXPIRY</th>
                        <th>LOGGED DATE</th>
                        <th>DECISION</th>
                        <th>REMARK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renewalLogs.map((log, idx) => (
                        <tr key={log.id || idx}>
                          <td className="mono">{log.id}</td>
                          <td>
                            <strong>{log.vehicle}</strong>
                          </td>
                          <td className="mono">{log.uniqueid}</td>
                          <td>{log.oldLicenseEnd || '—'}</td>
                          <td>
                            <strong style={{ color: '#34d399' }}>{log.newLicenseEnd || '—'}</strong>
                          </td>
                          <td>{log.dateLogged}</td>
                          <td>
                            <span className={`status-pill ${log.decision === 'Yes' ? 'yes' : 'no'}`}>
                              {log.decision || 'Yes'}
                            </span>
                          </td>
                          <td>{log.remark || '—'}</td>
                        </tr>
                      ))}
                      {renewalLogs.length === 0 && (
                        <tr>
                          <td colSpan="8" className="empty-state">
                            <p>No permanent renewal audit entries logged yet.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowArchivesModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Specific VTS (Single / Bulk) from 950 Fleet to Renewal Sheet Modal */}
      {showAddVtsModal && (
        <div className="modal-backdrop" onClick={() => setShowAddVtsModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow" style={{ color: '#0d9488' }}>MASTER 950 FLEET ➔ RENEWAL SHEET</div>
                <h2 className="modal-title">Add Vehicle(s) to Renewal Sheet</h2>
                <p className="modal-subtitle">
                  Inject single vehicles or paste bulk Unique IDs from the 950 Tab into any Renewal Tab.
                </p>
              </div>
              <button className="icon-button" onClick={() => setShowAddVtsModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="modal-form" style={{ padding: '0' }}>
              {/* Notice / Alert banner if present */}
              {addVtsNotice && (
                <div className={`alert-banner ${addVtsNotice.type}`} style={{ margin: '0 20px 14px 20px' }}>
                  <span>{addVtsNotice.text}</span>
                </div>
              )}

              {/* Destination Sheet Tab Selector */}
              <div style={{ margin: '0 20px 16px 20px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🎯 Target Renewal Sheet Tab:</span>
                </label>
                <select
                  value={addVtsTargetTab}
                  onChange={(e) => {
                    setAddVtsTargetTab(e.target.value);
                    setAddVtsNotice(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #0d9488',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                >
                  {cycleTabs.map((t) => (
                    <option key={t} value={t}>
                      {t} {t === activeCycleTab ? '(Active View)' : ''}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Added vehicles will be appended with default status <b>"Yes" (🟢 Recharge status)</b> and continuous SR. number.
                </div>
              </div>

              {/* Mode Switcher: Single vs Bulk */}
              <div style={{ display: 'flex', gap: '8px', margin: '0 20px 16px 20px' }}>
                <button
                  type="button"
                  onClick={() => { setAddVtsMode('single'); setAddVtsNotice(null); }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    border: addVtsMode === 'single' ? '2px solid #0d9488' : '1px solid var(--border-color)',
                    background: addVtsMode === 'single' ? 'rgba(13, 148, 136, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    color: addVtsMode === 'single' ? '#2dd4bf' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  🔍 Single Vehicle Search
                </button>
                <button
                  type="button"
                  onClick={() => { setAddVtsMode('bulk'); setAddVtsNotice(null); }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    border: addVtsMode === 'bulk' ? '2px solid #0d9488' : '1px solid var(--border-color)',
                    background: addVtsMode === 'bulk' ? 'rgba(13, 148, 136, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    color: addVtsMode === 'bulk' ? '#2dd4bf' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  📋 Bulk IMEIs / Unique IDs
                </button>
              </div>

              {/* MODE 1: SINGLE VEHICLE SEARCH */}
              {addVtsMode === 'single' && (
                <div style={{ margin: '0 20px 20px 20px' }}>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Search Vehicle Name, Number, or IMEI from 950 Fleet:
                    </label>
                    <input
                      type="text"
                      value={singleVtsSearch}
                      onChange={(e) => setSingleVtsSearch(e.target.value)}
                      placeholder="e.g. RJ14..., UP32..., or IMEI 865..."
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        fontSize: '13px'
                      }}
                    />
                  </div>

                  {singleVtsSearch.trim() && (
                    <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(0, 0, 0, 0.2)' }}>
                      {singleSearchResults.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                          No vehicles found in 950 Master Fleet matching "{singleVtsSearch}".
                        </div>
                      ) : (
                        singleSearchResults.map((dev) => {
                          const imei = String(dev.imei || dev.uniqueid).trim();
                          const isAlreadyInSheet = targetTabImeiSet.has(imei);
                          return (
                            <div
                              key={imei}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                gap: '10px'
                              }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{dev.vehicle}</strong>
                                  <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                                    {dev.city || 'No City'}
                                  </span>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                                  IMEI: {imei} &bull; Expiry: {dev.displayLicenseEnd || dev.licenseEnd || 'N/A'}
                                </div>
                              </div>

                              <div>
                                {isAlreadyInSheet ? (
                                  <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', fontWeight: 600 }}>
                                    🛡️ Already in Sheet
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="primary-button compact"
                                    disabled={isAddingVts}
                                    onClick={() => handleAddSpecificVts([dev], addVtsTargetTab)}
                                    style={{
                                      fontSize: '11px',
                                      padding: '5px 10px',
                                      background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                                      borderColor: '#0f766e'
                                    }}
                                  >
                                    {isAddingVts ? 'Adding...' : `➕ Add to "${addVtsTargetTab}"`}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                  {!singleVtsSearch.trim() && (
                    <div style={{ padding: '24px 16px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)', fontSize: '12px' }}>
                      Type a vehicle name, number, or IMEI above to search across all {enrichedDevices.length} vehicles in the 950 Master fleet.
                    </div>
                  )}
                </div>
              )}

              {/* MODE 2: BULK IMEIS / UNIQUE IDS */}
              {addVtsMode === 'bulk' && (
                <div style={{ margin: '0 20px 20px 20px' }}>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Paste IMEIs / Unique IDs from 950 Tab:
                    </label>
                    <textarea
                      rows="6"
                      value={bulkVtsInput}
                      onChange={(e) => setBulkVtsInput(e.target.value)}
                      placeholder={"Paste multiple IMEIs here...\n865432049123456\n865432049654321\n(One per line, comma or space separated)"}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        lineHeight: '1.5'
                      }}
                    />
                  </div>

                  {/* Bulk Live Analysis Panel */}
                  {bulkVtsInput.trim() && (
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                        📊 Input Analysis:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                        <div style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Unique IDs</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{bulkVtsAnalysis.totalParsed}</div>
                        </div>
                        <div style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(13, 148, 136, 0.15)', textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', color: '#2dd4bf' }}>Found in 950</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#2dd4bf' }}>{bulkVtsAnalysis.matchedDevices.length}</div>
                        </div>
                        <div style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', color: '#f87171' }}>Already in Sheet</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#f87171' }}>{bulkVtsAnalysis.alreadyInSheet.length}</div>
                        </div>
                        <div style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.2)', textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', color: '#34d399' }}>Ready to Add</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#34d399' }}>{bulkVtsAnalysis.readyToAdd.length}</div>
                        </div>
                      </div>

                      {bulkVtsAnalysis.notFoundImeis.length > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '11px', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', padding: '6px 10px', borderRadius: '6px' }}>
                          ⚠️ {bulkVtsAnalysis.notFoundImeis.length} IMEI(s) not found in 950 Fleet: {bulkVtsAnalysis.notFoundImeis.slice(0, 3).join(', ')}{bulkVtsAnalysis.notFoundImeis.length > 3 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={isAddingVts || bulkVtsAnalysis.readyToAdd.length === 0}
                      onClick={() => handleAddSpecificVts(bulkVtsAnalysis.readyToAdd, addVtsTargetTab)}
                      style={{
                        background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                        borderColor: '#0f766e',
                        fontWeight: 600,
                        fontSize: '13px',
                        padding: '8px 16px'
                      }}
                    >
                      {isAddingVts ? 'Adding Vehicles...' : `🚀 Add ${bulkVtsAnalysis.readyToAdd.length} Vehicles to "${addVtsTargetTab}"`}
                    </button>
                  </div>
                </div>
              )}

              <div className="modal-actions" style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', margin: '0' }}>
                <button type="button" className="secondary-button" onClick={() => setShowAddVtsModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Extract / Add Renewal Cycle Sheet Modal */}
      {showExtractModal && (
        <div className="modal-backdrop" onClick={() => setShowExtractModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow" style={{ color: '#10b981' }}>RENEWAL CYCLE WORKFLOW</div>
                <h2 className="modal-title">Create / Update Renewal Sheet</h2>
                <p className="modal-subtitle">
                  Select renewal vehicles and choose whether to create a new sheet or append to an existing sheet.
                </p>
              </div>
              <button className="icon-button" onClick={() => setShowExtractModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <form onSubmit={handleExtractBatchSubmit} className="modal-form">
              {/* STEP 1: Select Source Data */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: '12px', fontWeight: 700 }}>1</span>
                  Select Data (Month, 15 Days, Range):
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                  {[
                    { id: 'next_month', label: 'Next Month', icon: '⚡' },
                    { id: 'this_month', label: 'This Month', icon: '📅' },
                    { id: 'soon_15', label: '15 Days', icon: '⏳' },
                    { id: 'custom_range', label: 'Date Range', icon: '📆' },
                    { id: 'by_month', label: 'Pick Month', icon: '🗓️' },
                    { id: 'expired', label: 'Expired', icon: '⚠️' },
                    { id: 'all', label: 'All Fleet', icon: '🌐' }
                  ].map((filterOpt) => {
                    const isSelected = extractSourceFilter === filterOpt.id;
                    return (
                      <button
                        key={filterOpt.id}
                        type="button"
                        onClick={() => setExtractSourceFilter(filterOpt.id)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: isSelected ? '1.5px solid #10b981' : '1px solid var(--border-color)',
                          background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                          color: isSelected ? '#10b981' : 'var(--text-secondary)',
                          fontSize: '12px',
                          fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{filterOpt.icon}</span>
                        <span>{filterOpt.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sub-inputs for Specific Month */}
                {extractSourceFilter === 'by_month' && (
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Choose Specific Month:</label>
                    <select
                      value={extractSpecificMonth}
                      onChange={(e) => setExtractSpecificMonth(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }}
                    >
                      {availableMonths.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label} ({m.count} vehicles)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Sub-inputs for Custom Date Range */}
                {extractSourceFilter === 'custom_range' && (
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>From Date:</label>
                      <input
                        type="date"
                        value={extractStartDate}
                        onChange={(e) => setExtractStartDate(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '12px' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>To Date:</label>
                      <input
                        type="date"
                        value={extractEndDate}
                        onChange={(e) => setExtractEndDate(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                )}

                {/* Live Count & Default "Yes" Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '8px 12px', marginTop: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600 }}>
                    ✨ {extractCandidates.length} vehicles found
                  </span>
                  <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.25)', color: '#a7f3d0', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                    Default Status: YES 🟢
                  </span>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#c4b5fd', marginTop: '8px' }}>
                  <input
                    type="checkbox"
                    checked={includeCarryoverNo}
                    onChange={(e) => setIncludeCarryoverNo(e.target.checked)}
                  />
                  <span>Include previous <b>"No" (Declined)</b> carryover devices ({carryoverImeis.length})</span>
                </label>
              </div>

              {/* STEP 2: Choose Target Sheet (New vs Existing) */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', fontSize: '12px', fontWeight: 700 }}>2</span>
                  Target Sheet Destination:
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div
                    onClick={() => setExtractTargetMode('new')}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: extractTargetMode === 'new' ? '2px solid #10b981' : '1px solid var(--border-color)',
                      background: extractTargetMode === 'new' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <input
                        type="radio"
                        name="extractTargetMode"
                        checked={extractTargetMode === 'new'}
                        onChange={() => setExtractTargetMode('new')}
                      />
                      <span style={{ fontWeight: 600, fontSize: '13px', color: extractTargetMode === 'new' ? '#10b981' : 'var(--text-primary)' }}>
                        Create New Sheet
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, paddingLeft: '22px' }}>
                      Creates a fresh tab. All vehicles start with "Yes".
                    </p>
                  </div>

                  <div
                    onClick={() => setExtractTargetMode('existing')}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: extractTargetMode === 'existing' ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                      background: extractTargetMode === 'existing' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <input
                        type="radio"
                        name="extractTargetMode"
                        checked={extractTargetMode === 'existing'}
                        onChange={() => setExtractTargetMode('existing')}
                      />
                      <span style={{ fontWeight: 600, fontSize: '13px', color: extractTargetMode === 'existing' ? '#3b82f6' : 'var(--text-primary)' }}>
                        Add to Existing Sheet
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, paddingLeft: '22px' }}>
                      Skips duplicate IMEIs automatically.
                    </p>
                  </div>
                </div>

                {/* Target Mode Specific Fields */}
                {extractTargetMode === 'new' ? (
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>New Sheet Tab Name *</label>
                    <input
                      type="text"
                      value={extractTabName}
                      onChange={(e) => setExtractTabName(e.target.value)}
                      placeholder="e.g. 17 sept 2026, Oct 2026 1st half"
                      required
                    />
                    <span className="field-hint" style={{ fontSize: '11px' }}>
                      A new tab named "{extractTabName.trim() || '...'}" will be created. All vehicles will be initialized with <b>"Yes"</b>.
                    </span>
                  </div>
                ) : (
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Select Existing Sheet Tab *</label>
                    <select
                      value={extractExistingTab}
                      onChange={(e) => setExtractExistingTab(e.target.value)}
                      required
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }}
                    >
                      {cycleTabs.map((t) => (
                        <option key={t} value={t}>
                          {t} {t === activeCycleTab ? '(Active View)' : ''}
                        </option>
                      ))}
                    </select>

                    <div style={{ marginTop: '8px', padding: '10px 12px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px', fontSize: '12px', color: '#93c5fd' }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span>🛡️ Smart Deduplication Enabled:</span>
                      </div>
                      <div>
                        Duplicate IMEIs already in <b>"{extractExistingTab}"</b> will be automatically removed and skipped.
                      </div>
                      {extractExistingTab === activeCycleTab && activeSheetDeviceList.length > 0 && (
                        <div style={{ marginTop: '6px', fontWeight: 600, color: '#34d399' }}>
                          ✨ {extractStats.newCount} new vehicles will be added ({extractStats.duplicateCount} duplicate IMEIs skipped).
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Selection Summary Box */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Batch Summary:</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                    {extractCandidates.length} vehicles &bull; Default: YES
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                  Destination: <b>{extractTargetMode === 'new' ? (extractTabName.trim() || 'New Sheet Tab') : extractExistingTab}</b>
                  <br />
                  Mode: <b>{extractTargetMode === 'new' ? 'Brand New Sheet (All Yes)' : 'Append Non-Duplicate IMEIs (All Yes)'}</b>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowExtractModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isExtracting}
                  style={{
                    background: extractTargetMode === 'new'
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    borderColor: extractTargetMode === 'new' ? '#059669' : '#2563eb',
                    fontWeight: 600
                  }}
                >
                  {isExtracting
                    ? (extractTargetMode === 'new' ? 'Creating Tab & Setting to YES...' : 'Checking Duplicates & Appending...')
                    : (extractTargetMode === 'new'
                        ? `🚀 Create New Sheet (${extractCandidates.length} Vehicles - YES)`
                        : `➕ Append to Sheet (${extractStats.newCount} Vehicles - YES)`)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Finalize Session & Update License End Modal */}
      {showFinalizeModal && (
        <div className="modal-backdrop" onClick={() => setShowFinalizeModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow" style={{ color: '#3b82f6' }}>CYCLE COMPLETION &amp; RECHARGE</div>
                <h2 className="modal-title">Finalize Session &amp; Update Expiries</h2>
                <p className="modal-subtitle">
                  Apply renewals to approved (Yes) devices and queue declined (No) devices for the next session scenario.
                </p>
              </div>
              <button className="icon-button" onClick={() => setShowFinalizeModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <form onSubmit={handleFinalizeSubmit} className="modal-form">
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <div
                  style={{
                    flex: 1,
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#6ee7b7', textTransform: 'uppercase', fontWeight: 600 }}>Approved (Yes)</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981' }}>
                    {filteredDevices.filter((d) => d.renewalDecision === 'Yes').length}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>License End will update</div>
                </div>

                <div
                  style={{
                    flex: 1,
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#fca5a5', textTransform: 'uppercase', fontWeight: 600 }}>Declined (No)</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>
                    {filteredDevices.filter((d) => d.renewalDecision === 'No').length}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Carryover to next session</div>
                </div>
              </div>

              <div className="form-group">
                <label>New License End Date (for Approved Vehicles) *</label>
                <input
                  type="date"
                  value={finalizeLicenseEnd}
                  onChange={(e) => setFinalizeLicenseEnd(e.target.value)}
                  required
                />
                <span className="field-hint">
                  Usually 1 year from previous expiry or today (e.g. 1 year renewal).
                </span>
              </div>

              <div className="form-group">
                <label>Renewal Session Note / Remark</label>
                <input
                  type="text"
                  value={finalizeNote}
                  onChange={(e) => setFinalizeNote(e.target.value)}
                  placeholder={`Batch renewal finalized for session ${activeCycleTab}`}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowFinalizeModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isFinalizing}
                  style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}
                >
                  {isFinalizing ? 'Applying Renewals...' : '✅ Finalize & Update License End'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
