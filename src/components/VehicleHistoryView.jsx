import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icon } from './Icons';
import { fetchVehicleHistory, fetchMorningFleetDigest } from '../services/api';
import { exportToExcelFile, exportToCsvFile } from '../services/exportUtils';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export function VehicleHistoryView({
  devices = [],
  requests = [],
  returnRequests = [],
  renewalLogs = []
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all'); // 'all', 'city', 'vehicle', 'imei', 'remark'
  const [selectedCity, setSelectedCity] = useState('');
  const [exactMatch, setExactMatch] = useState(false);
  const [historyStart, setHistoryStart] = useState(() => {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Fast 7-day default
    return d.toISOString().split('T')[0];
  });
  const [historyEnd, setHistoryEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [historyData, setHistoryData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tableFilter, setTableFilter] = useState('');
  const [statusTabFilter, setStatusTabFilter] = useState('all'); // 'all', 'active', 'inactive', 'chronic', 'swapped'

  // View Mode: 'table' vs 'cards' (for mobile field coordinators)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('vts_history_view_mode') || 'table';
    } catch {
      return 'table';
    }
  });

  // Morning 8:30 AM Fleet Readiness & WhatsApp Broadcast State
  const [morningDigest, setMorningDigest] = useState(null);
  const [loadingMorning, setLoadingMorning] = useState(false);
  const [showMorningBanner, setShowMorningBanner] = useState(true);
  const [copiedCity, setCopiedCity] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoadingMorning(true);
    fetchMorningFleetDigest()
      .then((data) => {
        if (isMounted) setMorningDigest(data);
      })
      .catch((err) => console.warn('Failed to load morning fleet digest:', err))
      .finally(() => {
        if (isMounted) setLoadingMorning(false);
      });
    return () => { isMounted = false; };
  }, []);

  const handleToggleViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('vts_history_view_mode', mode);
    } catch {}
  };

  const handleOpenCityWhatsApp = (c) => {
    if (!c || !c.whatsappText) return;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(c.whatsappText)}`;
    window.open(url, '_blank');
  };

  const handleCopyCityWhatsApp = (c) => {
    if (!c || !c.whatsappText) return;
    navigator.clipboard.writeText(c.whatsappText);
    setCopiedCity(c.city);
    setTimeout(() => setCopiedCity(null), 3000);
  };

  // In-memory cache for instant (0ms) re-queries
  const cacheRef = useRef({});

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25); // 10, 25, 50, 100, 250, 'All'

  // Multi-Site & Batch Multi-Search States
  const [selectedCities, setSelectedCities] = useState([]); // Array of strings e.g. ['Jaipur', 'Jodhpur']
  const [showMultiCityPicker, setShowMultiCityPicker] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchTab, setBatchTab] = useState('imei'); // 'imei' | 'vehicle' | 'site'
  const [batchText, setBatchText] = useState('');
  const [activeImeiTab, setActiveImeiTab] = useState('all'); // 'all' or specific IMEI
  const [activeVehicleTab, setActiveVehicleTab] = useState('all'); // 'all' or specific vehicleName

  // 360° Vehicle Dossier Modal State
  const [dossierVehicle, setDossierVehicle] = useState(null);
  const [dossierTab, setDossierTab] = useState('timeline'); // 'timeline', 'damage', 'requests', 'device', 'notes'
  const [actionNotes, setActionNotes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('vts_tracker_vehicle_notes') || '{}');
    } catch {
      return {};
    }
  });
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteTag, setNewNoteTag] = useState('Technician Assigned');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [imeiCopied, setImeiCopied] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState('all'); // 'all' or specific vehicleName

  // Extract unique cities from active fleet for dropdown & suggestions
  const fleetCities = useMemo(() => {
    const set = new Set();
    devices.forEach((d) => {
      if (d.city && d.city.trim()) set.add(d.city.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  // Executive Fleet Health Statistics
  const fleetStats = useMemo(() => {
    const total = devices.length;
    let active = 0;
    let inactive = 0;
    let expiringSoon = 0;
    const cityMap = {};

    devices.forEach((d) => {
      const roadcast = String(d.roadcastStatus || '').toLowerCase();
      const finalSt = String(d.finalStatus || '').toLowerCase();
      const isAct = roadcast === 'active' || finalSt === 'running' || finalSt === 'active';
      if (isAct) active++;
      else inactive++;

      if (d.remainingDays !== undefined && d.remainingDays !== null && d.remainingDays <= 15 && d.remainingDays >= 0) {
        expiringSoon++;
      }

      const c = (d.city || 'Other').trim();
      if (!cityMap[c]) {
        cityMap[c] = { city: c, total: 0, active: 0, inactive: 0 };
      }
      cityMap[c].total++;
      if (isAct) cityMap[c].active++;
      else cityMap[c].inactive++;
    });

    const cityList = Object.values(cityMap).map((cm) => ({
      ...cm,
      uptimePct: cm.total > 0 ? Math.round((cm.active / cm.total) * 100) : 0,
      downtimePct: cm.total > 0 ? Math.round((cm.inactive / cm.total) * 100) : 0
    })).sort((a, b) => b.total - a.total);

    const uptimePct = total > 0 ? Math.round((active / total) * 100) : 0;
    const downtimePct = total > 0 ? (100 - uptimePct) : 0;

    return {
      total,
      active,
      inactive,
      expiringSoon,
      uptimePct,
      downtimePct,
      cities: cityList
    };
  }, [devices]);

  // Critical Inactive Defaulters List
  const chronicVehiclesList = useMemo(() => {
    return (devices || []).filter((d) => {
      const roadcast = String(d.roadcastStatus || '').toLowerCase();
      const finalSt = String(d.finalStatus || '').toLowerCase();
      return roadcast === 'inactive' || finalSt === 'inactive' || finalSt === 'damaged';
    });
  }, [devices]);

  // Pending Workshop Return / Repair Requests
  const pendingReturnsList = useMemo(() => {
    return (returnRequests || []).slice(0, 10);
  }, [returnRequests]);

  // Parse multi-search tokens from searchTerm if user typed comma/newline/space separated items
  const parsedSearchTerms = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const splits = searchTerm.split(/[,;\n|\t]+/);
    if (splits.length > 1) {
      return splits.map((s) => s.trim()).filter(Boolean);
    }
    if (searchField === 'imei' || /^\d{10,20}(\s+\d{10,20})+$/.test(searchTerm.trim())) {
      const sp = searchTerm.trim().split(/\s+/).filter((s) => s.length >= 6);
      if (sp.length > 1) return sp;
    }
    return [];
  }, [searchTerm, searchField]);

  // Extract sample IMEIs from devices for quick testing & 1-click audit
  const sampleImeis = useMemo(() => {
    const list = [];
    const seen = new Set();
    devices.forEach((d) => {
      const imei = String(d.imei || '').trim();
      if (imei && !seen.has(imei)) {
        seen.add(imei);
        list.push({ imei, vehicle: d.vehicle || 'Fleet Vehicle', city: d.city || 'Site' });
      }
    });
    return list.slice(0, 6);
  }, [devices]);

  // Universal Smart Suggestions based on search input
  const suggestions = useMemo(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) return [];
    const q = searchTerm.toLowerCase();

    const matchedCities = fleetCities
      .filter((c) => c.toLowerCase().includes(q))
      .slice(0, 3)
      .map((c) => ({ type: 'City', label: c, value: c, targetField: 'city', sub: 'Search all vehicles in this city' }));

    const matchedDevices = [];
    devices.forEach((d) => {
      const vMatch = d.vehicle && String(d.vehicle).toLowerCase().includes(q);
      const iMatch = d.imei && String(d.imei).includes(q);
      const sMatch = d.sim && String(d.sim).includes(q);
      const rMatch = d.remark && String(d.remark).toLowerCase().includes(q);

      if (iMatch) {
        matchedDevices.push({
          type: 'IMEI',
          label: d.imei,
          value: d.imei,
          targetField: 'imei',
          sub: `📱 Track IMEI dynamic journey across vehicles & sites • Currently: ${d.vehicle || '—'} (${d.city || '—'})`
        });
      }
      if (vMatch && !iMatch) {
        matchedDevices.push({
          type: 'Vehicle',
          label: d.vehicle,
          value: d.vehicle,
          targetField: 'vehicle',
          sub: `IMEI: ${d.imei || '—'} • ${d.city || ''} ${d.sim ? '• SIM: ' + d.sim : ''}`
        });
      } else if (!iMatch && (sMatch || rMatch)) {
        matchedDevices.push({
          type: 'Vehicle',
          label: d.vehicle || d.imei,
          value: d.vehicle || d.imei,
          targetField: 'all',
          sub: `IMEI: ${d.imei || '—'} • ${d.city || ''} ${d.sim ? '• SIM: ' + d.sim : ''}`
        });
      }
    });

    return [...matchedCities, ...matchedDevices.slice(0, 8)];
  }, [searchTerm, devices, fleetCities]);

  const setPreset = (days) => {
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    setHistoryEnd(end.toISOString().split('T')[0]);
    setHistoryStart(start.toISOString().split('T')[0]);
  };

  const handleSearch = async (overrideTerm = null, overrideCity = null, overrideField = null, overrideCities = null) => {
    const term = (overrideTerm !== null ? overrideTerm : searchTerm).trim();
    const city = overrideCity !== null ? overrideCity : selectedCity;
    const citiesList = overrideCities !== null ? overrideCities : selectedCities;
    const field = overrideField !== null ? overrideField : searchField;

    if (!term && !city && citiesList.length === 0) {
      setErrorMsg('Please enter a search keyword, IMEI(s), or select City / Sites.');
      return;
    }

    if (overrideField !== null) {
      setSearchField(overrideField);
    }
    setVehicleFilter('all');
    setActiveImeiTab('all');
    setActiveVehicleTab('all');

    const citiesKey = citiesList.slice().sort().join(',');
    const cacheKey = `${term.toLowerCase()}_${field}_${city.toLowerCase()}_${citiesKey}_${exactMatch}_${historyStart}_${historyEnd}`;
    if (cacheRef.current[cacheKey]) {
      setHistoryData(cacheRef.current[cacheKey]);
      setErrorMsg(null);
      setShowSuggestions(false);
      setTableFilter('');
      setStatusTabFilter('all');
      setCurrentPage(1);
      return;
    }

    setLoadingHistory(true);
    setErrorMsg(null);
    setShowSuggestions(false);
    setTableFilter('');
    setStatusTabFilter('all');
    setCurrentPage(1);

    try {
      const data = await fetchVehicleHistory({
        searchTerm: term,
        searchField: field,
        cityFilter: citiesList.length > 0 ? citiesList.join(',') : city,
        cities: citiesList,
        exactMatch,
        startDate: historyStart,
        endDate: historyEnd
      });
      cacheRef.current[cacheKey] = data;
      setHistoryData(data);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to search vehicle history from Drive daily reports.');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Comprehensive Dynamic Multi-IMEI Movement & Lifecycle Analysis for ALL IMEIs in results
  const allImeisData = useMemo(() => {
    if (!historyData || !historyData.results) return { list: [], map: {}, summaries: [] };
    const rawResults = historyData.results;
    if (rawResults.length === 0) return { list: [], map: {}, summaries: [] };

    // Group rows by IMEI
    const imeiGroups = {};
    rawResults.forEach((r) => {
      const im = (r.imei || '').trim();
      if (im) {
        if (!imeiGroups[im]) imeiGroups[im] = [];
        imeiGroups[im].push(r);
      }
    });

    const uniqueImeis = Object.keys(imeiGroups);
    if (uniqueImeis.length === 0) return { list: [], map: {}, summaries: [] };

    const vehicleColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];
    const analysesMap = {};
    const summaries = [];

    uniqueImeis.forEach((targetImei) => {
      const imeiRows = imeiGroups[targetImei];
      const sorted = [...imeiRows].sort((a, b) => new Date(a.date) - new Date(b.date));

      const vehiclesMap = {};
      const citiesMap = {};
      const phases = [];
      const transitions = [];
      let currentPhase = null;
      let prevRow = null;
      let vColorIdx = 0;
      const assignedVehicleColors = {};

      sorted.forEach((r) => {
        const vName = r.vehicleName || r.vehicle || 'Unknown Vehicle';
        const cName = r.city || 'Unassigned';
        const isAct = (r.roadcastStatus || '').toLowerCase() === 'active';

        if (!assignedVehicleColors[vName]) {
          assignedVehicleColors[vName] = vehicleColors[vColorIdx % vehicleColors.length];
          vColorIdx++;
        }

        if (!vehiclesMap[vName]) {
          vehiclesMap[vName] = {
            vehicleName: vName,
            color: assignedVehicleColors[vName],
            cities: new Set(),
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
        const vObj = vehiclesMap[vName];
        vObj.cities.add(cName);
        vObj.lastSeen = r.displayDate || r.date;
        vObj.lastDateRaw = r.date;
        vObj.daysCount++;
        if (isAct) vObj.activeDays++; else vObj.inactiveDays++;
        vObj.latestStatus = r.roadcastStatus;
        if (r.remark && !vObj.remarks.includes(r.remark)) vObj.remarks.push(r.remark);

        if (!citiesMap[cName]) {
          citiesMap[cName] = {
            city: cName,
            vehicles: new Set(),
            firstSeen: r.displayDate || r.date,
            lastSeen: r.displayDate || r.date,
            daysCount: 0,
            activeDays: 0,
            inactiveDays: 0
          };
        }
        const cObj = citiesMap[cName];
        cObj.vehicles.add(vName);
        cObj.lastSeen = r.displayDate || r.date;
        cObj.daysCount++;
        if (isAct) cObj.activeDays++; else cObj.inactiveDays++;

        if (!currentPhase || currentPhase.vehicle !== vName || currentPhase.city !== cName) {
          if (prevRow) {
            const tType = (prevRow.vehicleName !== vName && prevRow.city !== cName) ? 'both' : (prevRow.vehicleName !== vName ? 'vehicle_swap' : 'city_transfer');
            transitions.push({
              date: r.displayDate || r.date,
              dateRaw: r.date,
              fromVehicle: prevRow.vehicleName || prevRow.vehicle,
              toVehicle: vName,
              fromCity: prevRow.city,
              toCity: cName,
              type: tType
            });
            r.isTransitionRow = true;
            r.prevVehicle = prevRow.vehicleName || prevRow.vehicle;
            r.prevCity = prevRow.city;
            r.transitionType = tType;
          }

          currentPhase = {
            phaseIndex: phases.length + 1,
            vehicle: vName,
            color: assignedVehicleColors[vName],
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

        r.vehicleColor = assignedVehicleColors[vName];
        prevRow = r;
      });

      const distinctVehicles = Object.values(vehiclesMap).map((v) => ({
        ...v,
        cities: Array.from(v.cities),
        uptimePct: v.daysCount > 0 ? ((v.activeDays / v.daysCount) * 100).toFixed(1) : '0.0'
      }));

      const distinctCities = Object.values(citiesMap).map((c) => ({
        ...c,
        vehicles: Array.from(c.vehicles),
        uptimePct: c.daysCount > 0 ? ((c.activeDays / c.daysCount) * 100).toFixed(1) : '0.0'
      }));

      const firstRow = sorted[0];
      const latestRow = sorted[sorted.length - 1];
      const totalDays = sorted.length;
      const activeDays = sorted.filter((r) => (r.roadcastStatus || '').toLowerCase() === 'active').length;
      const inactiveDays = totalDays - activeDays;
      const uptimePct = totalDays > 0 ? ((activeDays / totalDays) * 100).toFixed(1) : '0.0';

      const damageMatches = (returnRequests || []).filter((r) => {
        const matchImei = r.imei && String(r.imei).includes(targetImei);
        const matchVeh = r.vehicleNumber && distinctVehicles.some((v) => v.vehicleName.toLowerCase() === r.vehicleNumber.toLowerCase());
        return matchImei || matchVeh;
      });

      const reqMatches = (requests || []).filter((r) => {
        return r.vehicleNumber && distinctVehicles.some((v) => v.vehicleName.toLowerCase() === r.vehicleNumber.toLowerCase());
      });

      const masterDevice = (devices || []).find((d) => String(d.imei || '').trim() === targetImei) || {};

      const analysisObj = {
        imei: targetImei,
        totalDays,
        activeDays,
        inactiveDays,
        uptimePct,
        distinctVehicles,
        distinctCities,
        phases,
        transitions,
        isMultiVehicle: distinctVehicles.length > 1,
        isMultiCity: distinctCities.length > 1,
        firstSeenDate: firstRow?.displayDate || firstRow?.date,
        lastSeenDate: latestRow?.displayDate || latestRow?.date,
        latestVehicle: latestRow?.vehicleName || latestRow?.vehicle,
        latestCity: latestRow?.city,
        latestStatus: latestRow?.roadcastStatus,
        latestPhone: latestRow?.phone || masterDevice.sim,
        masterDevice,
        damageMatches,
        reqMatches,
        assignedVehicleColors,
        sortedRecords: sorted
      };

      analysesMap[targetImei] = analysisObj;
      summaries.push(analysisObj);
    });

    return { list: uniqueImeis, map: analysesMap, summaries };
  }, [historyData, returnRequests, requests, devices]);

  // Active Selected IMEI Dynamic Journey
  const imeiJourney = useMemo(() => {
    if (!allImeisData.list || allImeisData.list.length === 0) return null;
    if (activeImeiTab !== 'all' && allImeisData.map[activeImeiTab]) {
      return allImeisData.map[activeImeiTab];
    }
    const cleanTerm = (searchTerm || '').trim().toLowerCase();
    const found = allImeisData.list.find((i) => i.toLowerCase().includes(cleanTerm));
    if (found) return allImeisData.map[found];
    return allImeisData.map[allImeisData.list[0]];
  }, [allImeisData, activeImeiTab, searchTerm]);

  // Multi-Vehicle Comparative Overview
  const allVehiclesData = useMemo(() => {
    if (!historyData || !historyData.results) return [];
    const rawResults = historyData.results;
    if (rawResults.length === 0) return [];

    const vehMap = {};
    rawResults.forEach((r) => {
      const v = (r.vehicleName || r.vehicle || '').trim();
      if (!v) return;
      if (!vehMap[v]) {
        vehMap[v] = {
          vehicle: v,
          city: r.city || '—',
          imeis: new Set(),
          totalDays: 0,
          activeDays: 0,
          inactiveDays: 0,
          maxStreak: r.maxStreak || 0,
          isChronic: r.isChronicInactive || false,
          isSwapped: r.isSwapped || false,
          latestRemark: r.remark || '',
          latestDate: r.displayDate || r.date
        };
      }
      const obj = vehMap[v];
      if (r.imei) obj.imeis.add(r.imei);
      obj.totalDays++;
      if ((r.roadcastStatus || '').toLowerCase() === 'active') obj.activeDays++;
      else obj.inactiveDays++;
      if (r.inactiveStreak > obj.maxStreak) obj.maxStreak = r.inactiveStreak;
      if (r.isChronicInactive) obj.isChronic = true;
      if (r.isSwapped) obj.isSwapped = true;
      obj.latestRemark = r.remark || obj.latestRemark;
      obj.latestDate = r.displayDate || r.date;
    });

    return Object.values(vehMap).map((v) => ({
      ...v,
      imeisList: Array.from(v.imeis),
      uptimePct: v.totalDays > 0 ? ((v.activeDays / v.totalDays) * 100).toFixed(1) : '0.0',
      downtimePct: v.totalDays > 0 ? ((v.inactiveDays / v.totalDays) * 100).toFixed(1) : '0.0'
    }));
  }, [historyData]);

  // Copy complete IMEI journey to clipboard formatted for WhatsApp
  const handleCopyImeiWhatsApp = () => {
    if (!imeiJourney) return;
    const j = imeiJourney;
    let text = `📱 *WEVOIS VTS — DYNAMIC IMEI LIFECYCLE AUDIT* 📱\n`;
    text += `🔢 *IMEI:* ${j.imei}\n`;
    text += `📅 *Audit Period:* ${historyStart} to ${historyEnd} (${j.totalDays} Days)\n`;
    text += `📊 *Fleet Status:* ${j.activeDays} Days Active | ${j.inactiveDays} Days Down (${j.uptimePct}% Uptime)\n`;
    text += `📍 *Current Deployment:* ${j.latestVehicle || '—'} @ ${j.latestCity || '—'} (${j.latestStatus || 'Active'})\n\n`;

    text += `🚗 *VEHICLE ALLOCATION HISTORY (${j.distinctVehicles.length} Vehicles):*\n`;
    j.distinctVehicles.forEach((v, idx) => {
      text += `${idx + 1}. *${v.vehicleName}* (${v.cities.join(', ')}) — ${v.daysCount} Days (${v.activeDays} Active / ${v.inactiveDays} Inactive) | From: ${v.firstSeen} to ${v.lastSeen}\n`;
    });

    if (j.transitions.length > 0) {
      text += `\n🔄 *DETECTED REASSIGNMENTS / TRANSFERS (${j.transitions.length}):*\n`;
      j.transitions.forEach((t) => {
        text += `• On *${t.date}*: Transferred from *${t.fromVehicle}* (${t.fromCity}) ➔ *${t.toVehicle}* (${t.toCity})\n`;
      });
    }

    if (j.damageMatches.length > 0) {
      text += `\n⚠️ *HARDWARE RETURN / DAMAGE LOGS (${j.damageMatches.length}):*\n`;
      j.damageMatches.forEach((d) => {
        text += `• ${d.timestamp}: Reason: ${d.returnReason || 'Faulty'} | Status: ${d.status || 'Received'}\n`;
      });
    }

    text += `\n_Generated via WeVois VTS Intelligence Hub_`;

    navigator.clipboard.writeText(text).then(() => {
      setImeiCopied(true);
      setTimeout(() => setImeiCopied(false), 2500);
    }).catch(() => {
      alert('Could not copy to clipboard.');
    });
  };

  // Export full IMEI movement journey as CSV
  const handleExportImeiCsv = () => {
    if (!imeiJourney || !imeiJourney.sortedRecords) return;
    const headers = ['Date', 'IMEI', 'Vehicle Name', 'City', 'Phone / SIM', 'Status', 'Transition Event', 'Previous Vehicle', 'Remark'];
    const rows = imeiJourney.sortedRecords.map((r) => [
      `"${r.date || ''}"`,
      `"${r.imei || imeiJourney.imei}"`,
      `"${r.vehicleName || ''}"`,
      `"${r.city || ''}"`,
      `"${r.phone || ''}"`,
      `"${r.roadcastStatus || ''}"`,
      `"${r.isTransitionRow ? (r.transitionType === 'both' ? 'Vehicle Swap & City Move' : r.transitionType === 'vehicle_swap' ? 'Vehicle Swap' : 'City Move') : ''}"`,
      `"${r.prevVehicle || ''}"`,
      `"${(r.remark || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `IMEI_Lifecycle_${imeiJourney.imei}_${historyStart}_to_${historyEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy All Multi-IMEI summary to WhatsApp
  const handleCopyMultiImeiWhatsApp = () => {
    if (!allImeisData || allImeisData.summaries.length === 0) return;
    let text = `📱 *WEVOIS VTS — MULTI-IMEI FLEET AUDIT SUMMARY* 📱\n`;
    text += `📅 *Audit Period:* ${historyStart} to ${historyEnd}\n`;
    text += `🔢 *Total Audited IMEIs:* ${allImeisData.summaries.length}\n`;
    text += `🏙️ *Sites / Cities:* ${selectedCities.length > 0 ? selectedCities.join(', ') : (selectedCity || 'All Fleet Sites')}\n\n`;

    allImeisData.summaries.forEach((im, idx) => {
      text += `${idx + 1}. *IMEI:* ${im.imei}\n`;
      text += `   • Current: *${im.latestVehicle || '—'}* @ ${im.latestCity || '—'} (${im.latestStatus || 'Active'})\n`;
      text += `   • Hardware Uptime: *${im.uptimePct}%* (${im.activeDays} Days Active / ${im.inactiveDays} Days Down)\n`;
      text += `   • Vehicles History (${im.distinctVehicles.length}): ${im.distinctVehicles.map(v => v.vehicleName).join(' ➔ ')}\n`;
      text += `   • Sites Visited (${im.distinctCities.length}): ${im.distinctCities.map(c => c.city).join(' ➔ ')}\n`;
      if (im.transitions.length > 0) {
        text += `   • 🔄 ${im.transitions.length} Reassignment(s) logged across vehicles\n`;
      }
      if (im.damageMatches.length > 0) {
        text += `   • ⚠️ ${im.damageMatches.length} Return / Damage record(s) on file\n`;
      }
      text += `\n`;
    });

    text += `_Generated via WeVois VTS Intelligence Hub_`;

    navigator.clipboard.writeText(text).then(() => {
      setImeiCopied(true);
      setTimeout(() => setImeiCopied(false), 2500);
    }).catch(() => {
      alert('Could not copy to clipboard.');
    });
  };

  // Export All Multi-IMEI summary as CSV
  const handleExportMultiImeiCsv = () => {
    if (!allImeisData || allImeisData.summaries.length === 0) return;
    const headers = ['IMEI', 'Current Vehicle', 'Current City', 'Latest Status', 'Hardware Uptime %', 'Active Days', 'Inactive Days', 'Total Days', 'Historical Vehicles', 'Historical Cities', 'Reassignment Count', 'Damage Records Count'];
    const rows = allImeisData.summaries.map((im) => [
      `"${im.imei}"`,
      `"${im.latestVehicle || ''}"`,
      `"${im.latestCity || ''}"`,
      `"${im.latestStatus || ''}"`,
      `"${im.uptimePct}%"`,
      `"${im.activeDays}"`,
      `"${im.inactiveDays}"`,
      `"${im.totalDays}"`,
      `"${im.distinctVehicles.map(v => v.vehicleName).join(' -> ')}"`,
      `"${im.distinctCities.map(c => c.city).join(' -> ')}"`,
      `"${im.transitions.length}"`,
      `"${im.damageMatches.length}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Multi_IMEI_Audit_${allImeisData.summaries.length}_Devices_${historyStart}_to_${historyEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter inside returned table results (Search in table + Status Tabs + Vehicle Filter)
  const filteredResults = useMemo(() => {
    if (!historyData || !historyData.results) return [];
    let list = historyData.results;

    // Vehicle Specific Filter (when inspecting multi-vehicle IMEI)
    if (vehicleFilter !== 'all') {
      list = list.filter((r) => (r.vehicleName || r.vehicle) === vehicleFilter);
    }

    // Status Tab Filtering
    if (statusTabFilter === 'active') {
      list = list.filter((r) => (r.roadcastStatus || '').toLowerCase() === 'active');
    } else if (statusTabFilter === 'inactive') {
      list = list.filter((r) => (r.roadcastStatus || '').toLowerCase() === 'inactive');
    } else if (statusTabFilter === 'chronic') {
      list = list.filter((r) => r.isChronicInactive || (r.inactiveStreak && r.inactiveStreak >= 3));
    } else if (statusTabFilter === 'swapped') {
      list = list.filter((r) => r.isSwapped);
    }

    // In-table quick search query
    if (!tableFilter.trim()) return list;
    const q = tableFilter.toLowerCase().trim();
    return list.filter((r) => {
      const rowStr = `${r.date || ''} ${r.vehicleName || ''} ${r.imei || ''} ${r.city || ''} ${r.phone || ''} ${r.roadcastStatus || ''} ${r.finalStatus || ''} ${r.remark || ''} ${r.matchedIn || ''}`.toLowerCase();
      return rowStr.includes(q);
    });
  }, [historyData, statusTabFilter, tableFilter, vehicleFilter]);

  // Aggregate statistics
  const summaryStats = useMemo(() => {
    const rawList = (historyData && historyData.results) ? historyData.results : [];
    const total = rawList.length;
    let active = 0;
    let inactive = 0;
    let chronic = 0;
    let swapped = 0;
    const vehSet = new Set();

    rawList.forEach((r) => {
      const isAct = (r.roadcastStatus || '').toLowerCase() === 'active';
      if (isAct) active++;
      else inactive++;
      if (r.isChronicInactive || (r.inactiveStreak && r.inactiveStreak >= 3)) chronic++;
      if (r.isSwapped) swapped++;
      const vKey = r.vehicleName || r.imei;
      if (vKey) vehSet.add(vKey);
    });

    const downtime = total > 0 ? ((inactive / total) * 100).toFixed(1) : '0.0';
    return {
      total,
      active,
      inactive,
      chronic,
      swapped,
      uniqueVehicles: vehSet.size,
      downtimePct: downtime
    };
  }, [historyData]);

  // Pagination calculation
  const totalPages = useMemo(() => {
    if (pageSize === 'All' || pageSize === 0) return 1;
    return Math.max(1, Math.ceil(filteredResults.length / Number(pageSize)));
  }, [filteredResults.length, pageSize]);

  const paginatedResults = useMemo(() => {
    if (pageSize === 'All' || pageSize === 0) return filteredResults;
    const size = Number(pageSize);
    const start = (currentPage - 1) * size;
    return filteredResults.slice(start, start + size);
  }, [filteredResults, currentPage, pageSize]);

  const startIndex = filteredResults.length === 0 ? 0 : (pageSize === 'All' ? 1 : (currentPage - 1) * Number(pageSize) + 1);
  const endIndex = pageSize === 'All' ? filteredResults.length : Math.min(currentPage * Number(pageSize), filteredResults.length);

  const handleTableFilterChange = (val) => {
    setTableFilter(val);
    setCurrentPage(1);
  };

  // 360° Dossier Data Matching for Selected Vehicle
  const vehicleDossierData = useMemo(() => {
    if (!dossierVehicle) return null;

    const vName = (dossierVehicle.vehicleName || dossierVehicle.vehicle || '').trim();
    const vImei = (dossierVehicle.imei || '').trim();

    // 1. All Daily Timeline Records from Google Drive CSVs
    const historyRows = (historyData && historyData.results)
      ? historyData.results.filter((r) => (r.vehicleName && r.vehicleName === vName) || (r.imei && r.imei === vImei))
      : [];

    // 2. Damage & Return Sheet Records (returnRequests)
    const damageRows = returnRequests.filter((r) => {
      const matchVeh = vName && r.vehicleNumber && r.vehicleNumber.toLowerCase() === vName.toLowerCase();
      const matchImei = vImei && r.imei && String(r.imei).includes(vImei);
      return matchVeh || matchImei;
    });

    // 3. Requirement / Allocation Sheet Records (requests)
    const reqRows = requests.filter((r) => {
      return vName && r.vehicleNumber && r.vehicleNumber.toLowerCase() === vName.toLowerCase();
    });

    // 4. Master Device Status from devices array
    const masterDevice = devices.find((d) => {
      return (vName && d.vehicle && d.vehicle.toLowerCase() === vName.toLowerCase()) ||
             (vImei && d.imei && String(d.imei) === vImei);
    }) || {};

    // 5. Detected IMEIs / Device Swaps
    const attachedImeis = Array.from(new Set(historyRows.map((r) => r.imei).filter(Boolean)));

    // 6. Downtime calculation for this specific vehicle
    const totalDays = historyRows.length;
    const inactiveDays = historyRows.filter((r) => (r.roadcastStatus || '').toLowerCase() === 'inactive').length;
    const vehDowntime = totalDays > 0 ? ((inactiveDays / totalDays) * 100).toFixed(1) : '0.0';

    return {
      vehicleName: vName,
      imei: vImei,
      city: dossierVehicle.city || masterDevice.city || '—',
      masterDevice,
      historyRows,
      damageRows,
      reqRows,
      attachedImeis,
      totalDays,
      inactiveDays,
      vehDowntime,
      notes: actionNotes[vName] || []
    };
  }, [dossierVehicle, historyData, returnRequests, requests, devices, actionNotes]);

  // Handle adding a supervisor action note
  const handleAddNote = (e) => {
    e.preventDefault();
    if (!newNoteText.trim() || !dossierVehicle) return;

    const vName = dossierVehicle.vehicleName || dossierVehicle.vehicle || dossierVehicle.imei;
    const noteEntry = {
      id: Date.now(),
      text: newNoteText.trim(),
      tag: newNoteTag,
      timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      author: 'Supervisor'
    };

    const updated = {
      ...actionNotes,
      [vName]: [noteEntry, ...(actionNotes[vName] || [])]
    };

    setActionNotes(updated);
    setNewNoteText('');
    try {
      localStorage.setItem('vts_tracker_vehicle_notes', JSON.stringify(updated));
    } catch (err) {
      console.warn('Could not save note:', err);
    }
  };

  // WhatsApp formatted alert copy
  const handleCopyWhatsApp = () => {
    if (!historyData) return;

    const chronicList = (historyData.chronicVehicles || []).slice(0, 8);
    const dateRangeStr = `${historyStart} to ${historyEnd}`;
    const cityStr = selectedCity || 'All Fleet Sites';

    let text = `🚨 *WEVOIS VTS FLEET AUDIT ALERT* 🚨\n`;
    text += `📅 *Audit Period:* ${dateRangeStr}\n`;
    text += `🏙️ *Site / Filter:* ${cityStr}\n`;
    text += `📊 *Total Records:* ${summaryStats.total} | 🟢 *Active:* ${summaryStats.active} | 🔴 *Inactive:* ${summaryStats.inactive}\n`;
    text += `📉 *Downtime Rate:* ${summaryStats.downtimePct}%\n\n`;

    if (chronicList.length > 0) {
      text += `⚠️ *CRITICAL CHRONIC INACTIVE (3+ DAYS):*\n`;
      chronicList.forEach((c, idx) => {
        text += `${idx + 1}. *${c.vehicle}* (${c.city || 'Site'}) - *${c.streakDays} Days Down* | Remark: _${c.latestRemark || 'No remark'}_\n`;
      });
      text += `\n👉 *Action Required:* Field technician please inspect immediately.\n`;
    } else {
      text += `✅ *No chronic inactive (3+ days) vehicles flagged in this period.*\n`;
    }

    text += `\n_Generated via WeVois VTS Intelligence Hub_`;

    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2500);
    }).catch(() => {
      alert('Could not copy to clipboard automatically.');
    });
  };

  // Dedicated Excel (.xlsx) export for history audit records
  const handleExportAuditExcel = () => {
    if (!filteredResults || filteredResults.length === 0) {
      alert('No audit records to export.');
      return;
    }

    const exportRows = filteredResults.map((r, idx) => ({
      'Sr. No': idx + 1,
      'Date': r.displayDate || r.date || '',
      'Vehicle Number': r.vehicleName || r.vehicle || searchTerm || '',
      'IMEI Number': r.imei || '',
      'Project Site / City': r.city || '',
      'SIM / Phone': r.phone || r.sim || '',
      'Roadcast Status': r.roadcastStatus || r.status || '',
      'Final Status': r.finalStatus || '',
      'Defaulter Days': r.inactiveStreak || 0,
      'Technician Remark': r.remark || r.inactiveRunningRemark || '',
      'Matched In Sheet': r.matchedIn || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 8 },  // Sr. No
      { wch: 14 }, // Date
      { wch: 22 }, // Vehicle Number
      { wch: 20 }, // IMEI Number
      { wch: 18 }, // Project Site / City
      { wch: 16 }, // SIM / Phone
      { wch: 18 }, // Roadcast Status
      { wch: 15 }, // Final Status
      { wch: 16 }, // Defaulter Days
      { wch: 42 }, // Technician Remark
      { wch: 22 }  // Matched In Sheet
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'History_Audit');

    const label = (searchTerm || selectedCity || (selectedCities.length > 0 ? selectedCities.join('_') : 'Fleet_Audit')).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `VTS_History_Audit_${label}_${historyStart}_to_${historyEnd}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Dedicated CSV (.csv) export for history audit records
  const handleExportAuditCsv = () => {
    if (!filteredResults || filteredResults.length === 0) {
      alert('No audit records to export.');
      return;
    }

    const exportRows = filteredResults.map((r, idx) => ({
      'Sr No': idx + 1,
      'Date': r.displayDate || r.date || '',
      'Vehicle Number': r.vehicleName || r.vehicle || searchTerm || '',
      'IMEI Number': r.imei || '',
      'Project Site / City': r.city || '',
      'SIM / Phone': r.phone || r.sim || '',
      'Roadcast Status': r.roadcastStatus || r.status || '',
      'Final Status': r.finalStatus || '',
      'Defaulter Days': r.inactiveStreak || 0,
      'Technician Remark': r.remark || r.inactiveRunningRemark || '',
      'Matched In Sheet': r.matchedIn || ''
    }));

    const csv = Papa.unparse(exportRows);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const label = (searchTerm || selectedCity || (selectedCities.length > 0 ? selectedCities.join('_') : 'Fleet_Audit')).replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute('download', `VTS_History_Audit_${label}_${historyStart}_to_${historyEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Alias for backward compatibility
  const handleExportCsv = handleExportAuditCsv;

  // 1-Click Clear / New Search
  const handleClearHistory = () => {
    setHistoryData(null);
    setSearchTerm('');
    setSelectedCity('');
    setSelectedCities([]);
    setErrorMsg(null);
    setShowSuggestions(false);
    setCurrentPage(1);
    setTableFilter('');
    setStatusTabFilter('all');
    setVehicleFilter('all');
    setActiveImeiTab('all');
    setActiveVehicleTab('all');
  };

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the executive report.');
      return;
    }

    const title = historyData
      ? `Fleet Audit Report - ${searchTerm || selectedCity || 'All Fleet'} (${historyStart} to ${historyEnd})`
      : `Executive Fleet Status Report - ${new Date().toLocaleDateString('en-GB')}`;

    const items = filteredResults && filteredResults.length > 0
      ? filteredResults
      : devices;

    const rowsHtml = items.slice(0, 300).map((r, i) => {
      const isInactive = (r.roadcastStatus || r.status || '').toLowerCase() === 'inactive';
      return `
        <tr style="${isInactive ? 'background: #fff1f2;' : ''}">
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center;">${i + 1}</td>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold;">${r.vehicleName || r.vehicle || '—'}</td>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-family: monospace;">${r.imei || '—'}</td>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${r.city || '—'}</td>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-family: monospace;">${r.phone || r.sim || '—'}</td>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold; color: ${isInactive ? '#dc2626' : '#16a34a'};">${r.roadcastStatus || r.status || 'Active'}</td>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${r.lastUpdate || r.date || '—'}</td>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${r.remark || r.inactiveRunningRemark || '—'}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #1e293b; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px; }
          .brand { display: flex; align-items: center; gap: 12px; }
          .brand img { height: 42px; }
          .brand h1 { margin: 0; font-size: 20px; color: #1e293b; font-weight: 800; }
          .brand p { margin: 2px 0 0 0; font-size: 11px; color: #64748b; }
          .meta { text-align: right; font-size: 11px; color: #475569; }
          .kpis { display: flex; gap: 12px; margin-bottom: 16px; }
          .kpi { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; text-align: center; }
          .kpi-title { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: bold; }
          .kpi-val { font-size: 20px; font-weight: 800; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #f1f5f9; padding: 8px 10px; border: 1px solid #cbd5e1; text-align: left; font-size: 10px; text-transform: uppercase; }
          .footer { margin-top: 24px; border-top: 1px solid #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand">
            <img src="/wevois-logo.png" alt="WeVOIS" onerror="this.style.display='none'" />
            <div>
              <h1>WeVOIS Labs &bull; Vehicle Fleet Audit Report</h1>
              <p>Executive Fleet Health, Downtime & Operational Compliance</p>
            </div>
          </div>
          <div class="meta">
            <div><strong>Date:</strong> ${new Date().toLocaleString('en-GB')}</div>
            <div><strong>Scope:</strong> ${searchTerm || selectedCity || 'Entire Fleet'}</div>
            <div><strong>Audited Records:</strong> ${items.length}</div>
          </div>
        </div>

        <div class="kpis">
          <div class="kpi">
            <div class="kpi-title">Total Monitored Fleet</div>
            <div class="kpi-val" style="color: #2563eb;">${fleetStats.total}</div>
          </div>
          <div class="kpi">
            <div class="kpi-title">Active Uptime</div>
            <div class="kpi-val" style="color: #16a34a;">${fleetStats.active} (${fleetStats.uptimePct}%)</div>
          </div>
          <div class="kpi">
            <div class="kpi-title">Inactive Downtime</div>
            <div class="kpi-val" style="color: #dc2626;">${fleetStats.inactive} (${fleetStats.downtimePct}%)</div>
          </div>
          <div class="kpi">
            <div class="kpi-title">Active Sites</div>
            <div class="kpi-val" style="color: #475569;">${fleetCities.length} Sites</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Vehicle Name</th>
              <th>IMEI</th>
              <th>Site / City</th>
              <th>Phone</th>
              <th>Roadcast Status</th>
              <th>Last Seen</th>
              <th>Remark / Note</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>WeVOIS VTS Fleet Tracking Hub &bull; Confidential &bull; Executive Operations Digest</div>
          <div>Operations Officer Sign: _________________________</div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleCopyExecutiveWhatsApp = () => {
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    let text = `📊 *WEVOIS FLEET EXECUTIVE HEALTH REPORT* 📊\n`;
    text += `📅 *Date:* ${dateStr}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🚗 *Total Monitored Fleet:* ${fleetStats.total} Vehicles\n`;
    text += `🟢 *Active / Operational:* ${fleetStats.active} (${fleetStats.uptimePct}%)\n`;
    text += `🔴 *Inactive / Downtime:* ${fleetStats.inactive} (${fleetStats.downtimePct}%)\n`;
    text += `⚠️ *Chronic Defaulters:* ${chronicVehiclesList.length} Vehicles\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🏙️ *SITE PERFORMANCE SCORECARD:*\n`;
    fleetStats.cities.slice(0, 8).forEach((c) => {
      text += `• *${c.city}:* ${c.active}/${c.total} Active (${c.uptimePct}% Uptime)\n`;
    });
    if (chronicVehiclesList.length > 0) {
      text += `\n🚨 *CRITICAL ATTENTION REQUIRED (TOP INACTIVE):*\n`;
      chronicVehiclesList.slice(0, 6).forEach((v, idx) => {
        text += `${idx + 1}. *${v.vehicle}* (${v.city}) - Remark: _${v.remark || v.inactiveRunningRemark || 'No Remark'}_\n`;
      });
    }
    text += `\n👉 _Generated via WeVOIS VTS Intelligence Hub_`;

    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2500);
    });
  };

  const handleOpenDossierFromDevice = (d) => {
    setDossierVehicle({
      vehicle: d.vehicle || 'Unknown',
      vehicleName: d.vehicle || 'Unknown',
      imei: d.imei || '',
      city: d.city || 'Unassigned',
      phone: d.sim || d.phone || '',
      sim: d.sim || d.phone || '',
      roadcastStatus: d.roadcastStatus || 'Active',
      finalStatus: d.finalStatus || 'RUNNING',
      vtsType: d.vtsType || 'VTS Package 4G',
      remark: d.remark || '',
      licenseEnd: d.licenseEnd || '',
      remainingDays: d.remainingDays,
      rechargeStatus: d.rechargeStatus,
      rows: []
    });
    setDossierTab('timeline');
  };

  const handleAuditVehicle = (vehName, imei) => {
    const term = (vehName || imei || '').trim();
    if (!term) return;
    setSearchTerm(term);
    setSearchField(vehName ? 'vehicle' : 'imei');
    setSelectedCity('');
    setSelectedCities([]);
    handleSearch(term, '', vehName ? 'vehicle' : 'imei');
  };

  const handleAuditCity = (cityName) => {
    if (!cityName) return;
    setSelectedCity(cityName);
    setSelectedCities([]);
    setSearchField('city');
    setSearchTerm('');
    handleSearch('', cityName, 'city');
  };

  const handleAuditAllFleet = () => {
    setSelectedCity('');
    setSelectedCities([...fleetCities]);
    setSearchField('all');
    setSearchTerm('');
    handleSearch('', '', 'all', [...fleetCities]);
  };

  const handleExportFleetExcel = () => {
    const items = filteredResults && filteredResults.length > 0 ? filteredResults : devices;
    const formatted = items.map((d, idx) => ({
      'Sr.': idx + 1,
      'Vehicle Name': d.vehicleName || d.vehicle || '',
      'IMEI / Unique ID': d.imei || '',
      'SIM / Phone': d.phone || d.sim || '',
      'City / Site': d.city || '',
      'Roadcast Status': d.roadcastStatus || d.status || '',
      'Final Status': d.finalStatus || '',
      'Last Update': d.lastUpdate || d.date || '',
      'VTS Type': d.vtsType || 'VTS Package 4G',
      'Remark': d.remark || d.inactiveRunningRemark || ''
    }));
    exportToExcelFile(formatted, `WeVOIS_Fleet_Audit_${(selectedCity || 'AllSites')}`);
  };

  return (
    <div className="view-container">
      {/* Header Banner & Executive Action Bar */}
      <div className="page-heading" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div className="modal-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon name="history" size={14} /> FLEET INTELLIGENCE &amp; 360° VEHICLE AUDIT
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '4px 0 6px 0', color: 'var(--text-main)' }}>
            Vehicle History &amp; Fleet Downtime Intelligence
          </h2>
          <p className="subheading" style={{ margin: 0 }}>
            Executive fleet monitoring, 360° vehicle lifecycle audits, site uptime rankings, and chronic defaulter detection.
          </p>
        </div>

        {/* Top Executive Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handlePrintReport}
            className="secondary-button"
            style={{
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-main)',
              cursor: 'pointer'
            }}
            title="Print formal management audit report (PDF / A4 print)"
          >
            🖨️ Print Executive Report
          </button>

          <button
            type="button"
            onClick={handleCopyExecutiveWhatsApp}
            style={{
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(37, 211, 102, 0.15)',
              border: '1px solid rgba(37, 211, 102, 0.4)',
              color: '#25d366',
              cursor: 'pointer'
            }}
            title="Copy formatted WhatsApp summary to share with coordinators"
          >
            {copyFeedback ? '✓ Copied to WhatsApp!' : '📲 WhatsApp Digest'}
          </button>

          <button
            type="button"
            onClick={handleExportFleetExcel}
            style={{
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#60a5fa',
              cursor: 'pointer'
            }}
            title="Export complete active fleet to Excel (.xlsx)"
          >
            📊 Export Excel
          </button>

          <button
            type="button"
            onClick={handleAuditAllFleet}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
            }}
            title="1-Click Audit across all municipal sites"
          >
            🚀 Audit All Sites
          </button>
        </div>
      </div>

      {/* Executive Fleet Health Cockpit (6 Premium KPI Tiles - ALWAYS VISIBLE) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '22px' }}>
        <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.25)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🚗 Total Monitored Fleet
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#fff', marginTop: '4px' }}>
            {fleetStats.total}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Across {fleetCities.length} Project Sites
          </div>
        </div>

        <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#86efac', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🟢 Active Uptime
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#34d399', marginTop: '4px' }}>
            {fleetStats.active} <span style={{ fontSize: '13px', fontWeight: 700, color: '#86efac' }}>({fleetStats.uptimePct}%)</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Operational &amp; Live Streaming
          </div>
        </div>

        <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🔴 Fleet Downtime
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#f87171', marginTop: '4px' }}>
            {fleetStats.inactive} <span style={{ fontSize: '13px', fontWeight: 700, color: '#fca5a5' }}>({fleetStats.downtimePct}%)</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Offline or Unreachable
          </div>
        </div>

        <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#fcd34d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ⚠️ Defaulter Watchlist
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#fbbf24', marginTop: '4px' }}>
            {chronicVehiclesList.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Needs Technician Inspection
          </div>
        </div>

        <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#d8b4fe', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🔧 Workshop / Returns
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#c084fc', marginTop: '4px' }}>
            {pendingReturnsList.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Hardware Repair Logs
          </div>
        </div>

        <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(14, 165, 233, 0.08)', border: '1px solid rgba(14, 165, 233, 0.25)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ⚡ Recharge Expiry
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#38bdf8', marginTop: '4px' }}>
            {fleetStats.expiringSoon}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Expiring in &le; 15 Days
          </div>
        </div>
      </div>



      {/* Super Clean & Intuitive Search Card */}
      <div className="card" style={{ padding: '24px', marginBottom: '22px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
        {/* Main Search Input & Primary Search Button */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 360px', position: 'relative' }}>
            <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#60a5fa', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
              <Icon name="search" size={20} />
            </div>
            <input
              type="text"
              placeholder="Search by Vehicle No. (RJ14...), IMEI (8670...), SIM, or Site..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSuggestions(true);
                setErrorMsg(null);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              style={{
                width: '100%',
                padding: '13px 40px 13px 46px',
                borderRadius: '10px',
                border: searchTerm ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'inherit',
                fontSize: '15px',
                fontWeight: 500,
                outline: 'none',
                boxShadow: searchTerm ? '0 0 0 3px rgba(59, 130, 246, 0.15)' : 'none'
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => { setSearchTerm(''); setShowSuggestions(false); }}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '4px'
                }}
                title="Clear search"
              >
                &times;
              </button>
            )}

            {/* Smart Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  background: 'var(--card-bg, #1a202c)',
                  border: '1px solid #3b82f6',
                  borderRadius: '10px',
                  marginTop: '6px',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
                  maxHeight: '260px',
                  overflowY: 'auto'
                }}
              >
                {suggestions.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      if (s.type === 'City') {
                        setSelectedCity(s.value);
                        setSelectedCities([]);
                        setSearchField('city');
                        setSearchTerm('');
                      } else if (s.type === 'IMEI') {
                        setSearchTerm(s.value);
                        setSearchField('imei');
                      } else {
                        setSearchTerm(s.value);
                        setSearchField('vehicle');
                      }
                      setShowSuggestions(false);
                    }}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: s.type === 'IMEI' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(59, 130, 246, 0.3)', color: '#93c5fd', fontWeight: 700 }}>
                      {s.type}
                    </span>
                    <strong style={{ color: '#fff' }}>{s.label}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: 'auto' }}>
                      {s.sub}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Primary Search Button */}
          <button
            type="button"
            className="primary-button"
            onClick={() => handleSearch()}
            disabled={loadingHistory}
            style={{
              padding: '13px 26px',
              fontSize: '15px',
              fontWeight: 800,
              borderRadius: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
              cursor: 'pointer'
            }}
          >
            <Icon name="search" size={18} />
            {loadingHistory ? 'Searching Reports...' : '🔍 Confirm & Search'}
          </button>

          {/* Clear / New Search Button */}
          <button
            type="button"
            onClick={handleClearHistory}
            style={{
              padding: '13px 20px',
              fontSize: '14px',
              fontWeight: 700,
              borderRadius: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--border-color)',
              color: '#cbd5e1',
              cursor: 'pointer'
            }}
            title="Reset filters and start a clean search"
          >
            🔄 Clear / New Search
          </button>
        </div>

        {/* Filters Row: City / Site + Period Presets + Date Range */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Site / City Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Site / City:</span>
            <select
              value={selectedCities.length > 0 ? '' : selectedCity}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCity(val);
                setSelectedCities([]);
                setErrorMsg(null);
              }}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: (selectedCity || selectedCities.length > 0) ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                background: (selectedCity || selectedCities.length > 0) ? 'rgba(59, 130, 246, 0.12)' : 'var(--card-bg, #1a202c)',
                color: (selectedCity || selectedCities.length > 0) ? '#60a5fa' : 'inherit',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <option value="">
                {selectedCities.length > 0 ? `Selected Sites (${selectedCities.join(', ')})` : '🏙️ All Sites (Entire Fleet)'}
              </option>
              {fleetCities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowMultiCityPicker(!showMultiCityPicker)}
              style={{
                background: selectedCities.length > 0 ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                border: selectedCities.length > 0 ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                color: selectedCities.length > 0 ? '#93c5fd' : 'var(--text-muted)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Select multiple project sites simultaneously"
            >
              {selectedCities.length > 0 ? `✓ ${selectedCities.length} Sites` : '➕ Multi-Site'}
            </button>

            {/* Multi-City Popover */}
            {showMultiCityPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 60,
                  background: '#1e293b',
                  border: '1px solid #3b82f6',
                  borderRadius: '10px',
                  marginTop: '6px',
                  padding: '14px',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
                  minWidth: '280px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#93c5fd' }}>Select Sites:</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" onClick={() => setSelectedCities([...fleetCities])} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}>All</button>
                    <button type="button" onClick={() => setSelectedCities([])} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}>Clear</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {fleetCities.map((c) => {
                    const isChecked = selectedCities.includes(c);
                    return (
                      <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', background: isChecked ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)', color: isChecked ? '#fff' : '#cbd5e1' }}>
                        <input type="checkbox" checked={isChecked} onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCities([...selectedCities, c]);
                            setSelectedCity('');
                          } else {
                            setSelectedCities(selectedCities.filter(x => x !== c));
                          }
                        }} />
                        <span>{c}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => { setShowMultiCityPicker(false); handleSearch(searchTerm, '', searchField, selectedCities); }} className="primary-button" style={{ padding: '4px 12px', fontSize: '11px' }}>
                    Done ({selectedCities.length})
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Time Period Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[
                { label: '3 Days', days: 3 },
                { label: '7 Days', days: 7 },
                { label: '14 Days', days: 14 },
                { label: '30 Days', days: 30 }
              ].map((p) => {
                const isActive = (new Date(historyEnd) - new Date(historyStart)) / (1000 * 60 * 60 * 24) === p.days;
                return (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => setPreset(p.days)}
                    style={{
                      background: isActive ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
                      border: isActive ? '1px solid #60a5fa' : '1px solid var(--border-color)',
                      color: isActive ? '#fff' : 'var(--text-muted)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start Date & End Date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <input
              type="date"
              value={historyStart}
              onChange={(e) => setHistoryStart(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'rgba(255, 255, 255, 0.04)',
                color: 'inherit',
                fontSize: '12px'
              }}
              title="Start Date"
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>to</span>
            <input
              type="date"
              value={historyEnd}
              onChange={(e) => setHistoryEnd(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'rgba(255, 255, 255, 0.04)',
                color: 'inherit',
                fontSize: '12px'
              }}
              title="End Date"
            />
          </div>

          {/* Bulk Paste Modal Button */}
          <button
            type="button"
            onClick={() => { setShowBatchModal(true); setBatchTab('imei'); }}
            style={{
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: '#c7d2fe',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Paste multiple IMEIs or Vehicle numbers from Excel"
          >
            📋 Bulk Paste
          </button>
        </div>

        {/* Quick Site Chips */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Quick Sites:</span>
          {fleetCities.slice(0, 6).map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => {
                setSelectedCity(city);
                setSelectedCities([]);
                setSearchField('city');
                setSearchTerm('');
              }}
              style={{
                background: selectedCity === city ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.08)',
                border: selectedCity === city ? '1px solid #3b82f6' : '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '14px',
                padding: '3px 10px',
                fontSize: '12px',
                color: selectedCity === city ? '#fff' : '#93c5fd',
                cursor: 'pointer',
                fontWeight: selectedCity === city ? 700 : 500
              }}
            >
              🏙️ {city}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="alert-banner error" style={{ marginBottom: '20px' }}>
          <Icon name="alert" size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Loading State */}
      {loadingHistory && (
        <div className="card" style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Icon name="refresh" size={32} className="spin" />
          <h3 style={{ marginTop: '16px', fontSize: '16px', color: 'var(--text-main)' }}>
            Scanning Daily Reports in Google Drive...
          </h3>
          <p style={{ fontSize: '13px', margin: '4px 0 0 0' }}>
            Searching {selectedCity ? `City: "${selectedCity}"` : ''} {searchTerm ? `Keyword: "${searchTerm}"` : ''} across daily CSV reports between {historyStart} and {historyEnd}...
          </p>
        </div>
      )}

      {/* Results View */}
      {!loadingHistory && historyData && (
        <>
          {/* Active Audit Context Banner with 1-click back to Executive Dashboard */}
          <div
            style={{
              marginBottom: '18px',
              padding: '14px 18px',
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.15) 0%, rgba(30, 41, 59, 0.7) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              borderRadius: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#93c5fd', background: 'rgba(59, 130, 246, 0.25)', padding: '4px 10px', borderRadius: '6px' }}>
                AUDIT REPORT ACTIVE
              </span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                Historical Audit for: <b>{searchTerm || selectedCity || (selectedCities.length > 0 ? selectedCities.join(', ') : 'Entire Fleet')}</b>
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                ({historyStart} to {historyEnd}) &bull; <b>{filteredResults.length}</b> Records Found
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleExportAuditExcel}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)'
                }}
                title="Download complete audit records as Excel spreadsheet (.xlsx)"
              >
                📗 Download Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={handleExportAuditCsv}
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)'
                }}
                title="Download complete audit records as CSV file (.csv)"
              >
                📄 Download CSV (.csv)
              </button>
              <button
                type="button"
                onClick={handlePrintReport}
                className="secondary-button"
                style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 700, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                title="Print executive audit report"
              >
                🖨️ Print Report
              </button>
              <button
                type="button"
                onClick={handleClearHistory}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--border-color)',
                  color: '#cbd5e1',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Clear current audit and start a clean search"
              >
                🔄 Clear / New Search
              </button>
            </div>
          </div>

          {/* Executive 4-KPI Summary Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '18px' }}>
            <div className="card" style={{ padding: '16px', borderRadius: '12px', borderLeft: '4px solid #3b82f6', background: 'var(--card-bg)' }}>
              <div style={{ fontSize: '11px', color: '#93c5fd', textTransform: 'uppercase', fontWeight: 700 }}>
                Total Audit Records
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: '#fff' }}>
                {summaryStats.total}
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Matching daily report rows</small>
            </div>

            <div className="card" style={{ padding: '16px', borderRadius: '12px', borderLeft: '4px solid #8b5cf6', background: 'var(--card-bg)' }}>
              <div style={{ fontSize: '11px', color: '#c084fc', textTransform: 'uppercase', fontWeight: 700 }}>
                Unique Fleet Vehicles
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: '#c084fc' }}>
                {summaryStats.uniqueVehicles}
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Distinct vehicles audited</small>
            </div>

            <div className="card" style={{ padding: '16px', borderRadius: '12px', borderLeft: '4px solid #10b981', background: 'var(--card-bg)' }}>
              <div style={{ fontSize: '11px', color: '#86efac', textTransform: 'uppercase', fontWeight: 700 }}>
                Active Fleet Uptime
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: '#34d399' }}>
                {summaryStats.active} <span style={{ fontSize: '14px', color: '#86efac' }}>({summaryStats.uptimePct}%)</span>
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Operational &amp; live streaming</small>
            </div>

            <div className="card" style={{ padding: '16px', borderRadius: '12px', borderLeft: '4px solid #ef4444', background: 'var(--card-bg)' }}>
              <div style={{ fontSize: '11px', color: '#fca5a5', textTransform: 'uppercase', fontWeight: 700 }}>
                Fleet Downtime / Inactive
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: '#f87171' }}>
                {summaryStats.inactive} <span style={{ fontSize: '14px', color: '#fca5a5' }}>({summaryStats.downtimePct}%)</span>
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{summaryStats.chronic} chronic defaulter logs</small>
            </div>
          </div>

          {/* Defaulter Alert Banner (Only if chronic vehicles exist) */}
          {historyData.chronicVehicles && historyData.chronicVehicles.length > 0 && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: '#fca5a5', fontWeight: 800 }}>🚨 Defaulter Alert:</span>
                <span style={{ fontSize: '12px', color: '#fecaca' }}>
                  {historyData.chronicVehicles.length} vehicles flagged with 3+ consecutive days downtime:
                </span>
                {historyData.chronicVehicles.slice(0, 5).map((cv, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setDossierVehicle({ vehicleName: cv.vehicle, city: cv.city, imei: cv.imei });
                      setDossierTab('timeline');
                    }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.25)',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                    title={`Click to open 360° dossier: ${cv.vehicle} down for ${cv.streakDays}d`}
                  >
                    🚗 {cv.vehicle} ({cv.streakDays}d down)
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setStatusTabFilter('chronic');
                  setCurrentPage(1);
                }}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Filter Defaulters in Table
              </button>
            </div>
          )}

          {/* Hardware Movement Notice (Only when inspecting single IMEI reassigned) */}
          {imeiJourney && imeiJourney.distinctVehicles && imeiJourney.distinctVehicles.length > 1 && (
            <div
              style={{
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.35)',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: '#d8b4fe', fontWeight: 800 }}>🔄 Hardware Notice:</span>
                <span style={{ fontSize: '12px', color: '#c4b5fd' }}>
                  IMEI <b>{imeiJourney.imei}</b> was reassigned across {imeiJourney.distinctVehicles.length} vehicles: {imeiJourney.distinctVehicles.map(v => v.vehicleName).join(' ➔ ')}.
                </span>
              </div>
              <span style={{ fontSize: '11px', color: '#a78bfa' }}>
                All assignment dates are listed in the table below.
              </span>
            </div>
          )}

          {/* Daily Timeline Table Card */}
          <div className="card" style={{ padding: '20px', borderRadius: '12px' }}>
            {/* Table Header Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Historical Audit Timeline
                  <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 10px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                    {filteredResults.length} records
                  </span>
                </h3>
                <small style={{ color: 'var(--text-muted)' }}>
                  Audit Query: <b>{selectedCity ? `City: ${selectedCity}` : ''} {searchTerm ? `Keyword: "${searchTerm}"` : ''}</b> from {historyStart} to {historyEnd}
                </small>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* In-table quick search filter */}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search in table..."
                    value={tableFilter}
                    onChange={(e) => handleTableFilterChange(e.target.value)}
                    style={{
                      padding: '6px 28px 6px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'inherit',
                      fontSize: '12px',
                      width: '180px'
                    }}
                  />
                  {tableFilter && (
                    <button
                      type="button"
                      onClick={() => handleTableFilterChange('')}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer'
                      }}
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* Rows per page selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      const val = e.target.value === 'All' ? 'All' : Number(e.target.value);
                      setPageSize(val);
                      setCurrentPage(1);
                    }}
                    style={{
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--card-bg, #1a202c)',
                      color: 'inherit',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                    <option value="All">All ({summaryStats.total})</option>
                  </select>
                </div>

                {/* WhatsApp Dispatch Button */}
                <button
                  type="button"
                  onClick={handleCopyWhatsApp}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: copyFeedback ? '#10b981' : 'rgba(37, 211, 102, 0.15)',
                    border: '1px solid rgba(37, 211, 102, 0.35)',
                    color: copyFeedback ? '#fff' : '#25d366',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.2s ease'
                  }}
                  title="Copy ready-to-send WhatsApp summary for Site Managers"
                >
                  <Icon name="check" size={14} />
                  {copyFeedback ? 'Copied to Clipboard!' : '📲 Copy for WhatsApp'}
                </button>

                {/* Download Excel (.xlsx) */}
                <button
                  type="button"
                  onClick={handleExportAuditExcel}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                  }}
                  title="Download complete audit records as Excel spreadsheet (.xlsx)"
                >
                  📗 Download Excel (.xlsx)
                </button>

                {/* Download CSV (.csv) */}
                <button
                  type="button"
                  onClick={handleExportAuditCsv}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
                  }}
                  title="Download complete audit records as CSV file (.csv)"
                >
                  📄 Download CSV (.csv)
                </button>

                {/* New Search */}
                <button
                  type="button"
                  onClick={handleClearHistory}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid var(--border-color)',
                    color: '#cbd5e1',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Reset audit and search another vehicle/site"
                >
                  🔄 New Search
                </button>

                {/* View Mode Toggle: Table vs Cards */}
                <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => handleToggleViewMode('table')}
                    style={{
                      background: viewMode === 'table' ? '#3b82f6' : 'transparent',
                      color: viewMode === 'table' ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '5px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Desktop Table View"
                  >
                    <Icon name="list" size={13} /> Table
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleViewMode('cards')}
                    style={{
                      background: viewMode === 'cards' ? '#3b82f6' : 'transparent',
                      color: viewMode === 'cards' ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '5px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Mobile-First Touch Cards View"
                  >
                    <Icon name="dashboard" size={13} /> Cards
                  </button>
                </div>
              </div>
            </div>

            {/* Status Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '10px' }}>
              {[
                { key: 'all', label: `📋 All Records (${summaryStats.total})` },
                { key: 'active', label: `🟢 Active (${summaryStats.active})` },
                { key: 'inactive', label: `🔴 Inactive (${summaryStats.inactive})` },
                { key: 'chronic', label: `🚨 Chronic 3d+ (${summaryStats.chronic})`, alert: summaryStats.chronic > 0 },
                { key: 'swapped', label: `🔄 Swapped (${summaryStats.swapped})` }
              ].map((tab) => {
                const isActive = statusTabFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setStatusTabFilter(tab.key);
                      setCurrentPage(1);
                    }}
                    style={{
                      background: isActive ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                      border: isActive ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '12px',
                      color: isActive ? '#fff' : 'var(--text-muted)',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {viewMode === 'table' ? (
              /* Sticky Header Scrollable Table */
              <div
                className="table-wrap"
                style={{
                  maxHeight: '560px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px'
                }}
              >
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr style={{ position: 'sticky', top: 0, zIndex: 10, background: '#1e293b', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                      <th style={{ padding: '12px 14px', background: '#1e293b' }}>DATE</th>
                      <th style={{ padding: '12px 14px', background: '#1e293b' }}>VEHICLE</th>
                      <th style={{ padding: '12px 14px', background: '#1e293b' }}>IMEI / UNIQUE ID</th>
                      <th style={{ padding: '12px 14px', background: '#1e293b' }}>CITY</th>
                      <th style={{ padding: '12px 14px', background: '#1e293b' }}>STATUS</th>
                      <th style={{ padding: '12px 14px', background: '#1e293b' }}>MATCHED IN</th>
                      <th style={{ padding: '12px 14px', background: '#1e293b' }}>REMARK / ISSUE</th>
                      <th style={{ padding: '12px 14px', background: '#1e293b', textAlign: 'center' }}>360° DOSSIER</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResults.length > 0 ? (
                      paginatedResults.map((row, idx) => {
                        const isActive = (row.roadcastStatus || '').toLowerCase() === 'active';
                        const isChronic = row.isChronicInactive || (row.inactiveStreak && row.inactiveStreak >= 3);

                        return (
                          <tr
                            key={idx}
                            style={{
                              background: isChronic
                                ? 'rgba(239, 68, 68, 0.08)'
                                : row.isStaleRemark
                                ? 'rgba(245, 158, 11, 0.07)'
                                : idx % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'transparent',
                              borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                            }}
                          >
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <strong>{row.displayDate || row.date}</strong>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div
                                onClick={() => {
                                  setDossierVehicle(row);
                                  setDossierTab('timeline');
                                }}
                                style={{
                                  color: (imeiJourney && row.vehicleColor) ? row.vehicleColor : '#60a5fa',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                title="Click to view 360° vehicle history & lifecycle"
                              >
                                <span>{row.vehicleName || row.vehicle || '—'}</span>
                                {row.isSwapped && (
                                  <span style={{ fontSize: '10px', background: 'rgba(139, 92, 246, 0.2)', color: '#c084fc', padding: '1px 5px', borderRadius: '4px' }}>
                                    🔄 Swapped
                                  </span>
                                )}
                              </div>
                              {row.isTransitionRow && (
                                <div style={{ fontSize: '10px', fontWeight: 700, color: '#d8b4fe', background: 'rgba(168, 85, 247, 0.2)', border: '1px solid rgba(168, 85, 247, 0.4)', borderRadius: '4px', padding: '1px 6px', marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  ⚡ Reassigned from {row.prevVehicle || 'Previous Vehicle'}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                onClick={() => {
                                  if (row.imei) {
                                    setSearchTerm(row.imei);
                                    setSearchField('imei');
                                    setSelectedCity('');
                                    handleSearch(row.imei, '', 'imei');
                                  }
                                }}
                                style={{ fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer', color: '#93c5fd', textDecoration: 'underline' }}
                                title="Click to audit this IMEI's dynamic journey across vehicles & sites"
                              >
                                {row.imei || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ fontWeight: 500 }}>{row.city || '—'}</span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: isActive ? '#10b981' : '#ef4444'
                                  }}
                                >
                                  {isActive ? '🟢 Active' : '🔴 Inactive'}
                                </span>

                                {isChronic && (
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      padding: '2px 6px',
                                      borderRadius: '8px',
                                      background: '#ef4444',
                                      color: '#fff'
                                    }}
                                    title={`Continuous inactive for ${row.inactiveStreak || 3}+ days`}
                                  >
                                    {row.inactiveStreak || 3}d Down
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'rgba(255,255,255,0.06)',
                                  color: 'var(--text-muted)'
                                }}
                              >
                                {row.matchedIn || 'Match'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: isChronic ? '#fca5a5' : 'inherit' }}>
                              {row.isStaleRemark && '⚠️ '}
                              {row.remark || '—'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setDossierVehicle(row);
                                  setDossierTab('timeline');
                                }}
                                style={{
                                  background: 'rgba(59, 130, 246, 0.15)',
                                  border: '1px solid rgba(59, 130, 246, 0.3)',
                                  color: '#60a5fa',
                                  borderRadius: '6px',
                                  padding: '4px 10px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                🔍 360° Dossier
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                          No records found matching your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Mobile-First Field Touch Cards */
              <div>
                {paginatedResults.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                    {paginatedResults.map((row, idx) => {
                      const isActive = (row.roadcastStatus || '').toLowerCase() === 'active';
                      const isChronic = row.isChronicInactive || (row.inactiveStreak && row.inactiveStreak >= 3);
                      const hasRemark = !!(row.remark && String(row.remark).trim() && !String(row.remark).toLowerCase().includes('not filled'));

                      return (
                        <div
                          key={idx}
                          className="card"
                          style={{
                            padding: '16px',
                            borderRadius: '12px',
                            background: isChronic
                              ? 'rgba(239, 68, 68, 0.08)'
                              : row.isStaleRemark
                              ? 'rgba(245, 158, 11, 0.07)'
                              : 'var(--card-bg, #1a202c)',
                            border: isChronic
                              ? '2px solid rgba(239, 68, 68, 0.7)'
                              : !isActive
                              ? '1px solid rgba(239, 68, 68, 0.35)'
                              : '1px solid var(--border-color)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div>
                            {/* Card Top Pill Bar */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
                                  📅 {row.displayDate || row.date}
                                </span>
                                {row.city && (
                                  <span className="city-tag" style={{ fontSize: '11px' }}>
                                    {row.city}
                                  </span>
                                )}
                              </div>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: isActive ? '#10b981' : '#ef4444'
                                }}
                              >
                                {isActive ? '🟢 Active' : '🔴 Inactive'}
                              </span>
                            </div>

                            {/* Vehicle Title & Identifiers */}
                            <div style={{ marginBottom: '10px' }}>
                              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span
                                  onClick={() => {
                                    setDossierVehicle(row);
                                    setDossierTab('timeline');
                                  }}
                                  style={{ color: '#60a5fa', cursor: 'pointer' }}
                                  title="Open 360° Dossier"
                                >
                                  {row.vehicleName || row.vehicle || 'Unknown Vehicle'}
                                </span>
                                {row.matchedIn && (
                                  <span style={{ fontSize: '10px', fontWeight: 500, color: '#3b82f6', background: 'rgba(59, 130, 246, 0.12)', padding: '2px 6px', borderRadius: '4px' }}>
                                    {row.matchedIn}
                                  </span>
                                )}
                              </h4>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                <span
                                  className="mono"
                                  onClick={() => {
                                    if (row.imei) {
                                      setSearchTerm(row.imei);
                                      setSearchField('imei');
                                      setSelectedCity('');
                                      handleSearch(row.imei, '', 'imei');
                                    }
                                  }}
                                  style={{ cursor: 'pointer', color: '#93c5fd', textDecoration: 'underline' }}
                                  title="Click to audit dynamic IMEI journey"
                                >
                                  IMEI: {row.imei || '—'}
                                </span>
                                {row.phone && <span className="mono">• SIM: {row.phone}</span>}
                              </div>
                              {row.isTransitionRow && (
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#d8b4fe', background: 'rgba(168, 85, 247, 0.25)', border: '1px solid #a855f7', borderRadius: '4px', padding: '2px 8px', marginTop: '6px', display: 'inline-block' }}>
                                  ⚡ Reassigned from {row.prevVehicle || 'Previous Vehicle'}
                                </div>
                              )}
                            </div>

                            {/* Badges: Chronic, Swapped, Stale */}
                            {(isChronic || row.isSwapped || row.isStaleRemark) && (
                              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                {isChronic && (
                                  <span style={{ fontSize: '11px', background: 'rgba(239, 68, 68, 0.25)', border: '1px solid #ef4444', color: '#fca5a5', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    🚨 Chronic {row.inactiveStreak ? `(${row.inactiveStreak}d Down)` : '(3d+ Down)'}
                                  </span>
                                )}
                                {row.isSwapped && (
                                  <span style={{ fontSize: '11px', background: 'rgba(139, 92, 246, 0.25)', border: '1px solid #8b5cf6', color: '#c4b5fd', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    🔄 Swapped Device
                                  </span>
                                )}
                                {row.isStaleRemark && (
                                  <span style={{ fontSize: '11px', background: 'rgba(245, 158, 11, 0.25)', border: '1px solid #f59e0b', color: '#fcd34d', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    ⚠️ Stale Remark
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Remark Box */}
                            <div
                              style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: hasRemark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(239, 68, 68, 0.08)',
                                border: hasRemark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px dashed rgba(239, 68, 68, 0.4)',
                                marginBottom: '12px'
                              }}
                            >
                              <div style={{ fontSize: '11px', fontWeight: 700, color: hasRemark ? 'var(--text-muted)' : '#fca5a5', marginBottom: '3px' }}>
                                {hasRemark ? '📝 Site Remark / Issue:' : '⚠️ No Remark Entered:'}
                              </div>
                              <div style={{ fontSize: '13px', color: hasRemark ? 'var(--text-main)' : '#fca5a5', fontStyle: hasRemark ? 'normal' : 'italic' }}>
                                {hasRemark ? row.remark : 'No remark entered on site. Wire connector & GPS power must be verified.'}
                              </div>
                            </div>
                          </div>

                          {/* Touch Buttons Footer */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => {
                                setDossierVehicle(row);
                                setDossierTab('timeline');
                              }}
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                fontSize: '12px',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <Icon name="search" size={13} /> 360° Dossier
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const waText = `🚨 *Vehicle Alert: ${row.vehicleName || row.vehicle}*\nSite: ${row.city || '—'}\nIMEI: ${row.imei || '—'}\nStatus: ${row.roadcastStatus || 'Inactive'}\nDate: ${row.displayDate || row.date}\nRemark: ${row.remark || '[NO REMARK - PLEASE CHECK]'}\n_Please verify wire connector & GPS power before 10:00 AM cutoff._`;
                                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`, '_blank');
                              }}
                              style={{
                                background: 'rgba(37, 211, 102, 0.15)',
                                border: '1px solid rgba(37, 211, 102, 0.4)',
                                color: '#25d366',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Share this vehicle's alert on WhatsApp"
                            >
                              📲 Share
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No records found matching your filters.
                  </div>
                )}
              </div>
            )}

            {/* Bottom Pagination & Total Bar */}
            {filteredResults.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '16px',
                  paddingTop: '14px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.07)',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Showing <b>{startIndex}</b> to <b>{endIndex}</b> of <b>{filteredResults.length}</b> records
                  {pageSize !== 'All' && ` (Page ${currentPage} of ${totalPages})`}
                </div>

                {pageSize !== 'All' && totalPages > 1 && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(1)}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      title="First Page"
                    >
                      &laquo; First
                    </button>
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      &lsaquo; Prev
                    </button>

                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                      if (pageNum > totalPages) pageNum = totalPages - 4 + i;
                      if (pageNum < 1) pageNum = i + 1;
                      if (pageNum > totalPages) return null;

                      return (
                        <button
                          key={pageNum}
                          type="button"
                          className={`page-num ${currentPage === pageNum ? 'active' : ''}`}
                          onClick={() => setCurrentPage(pageNum)}
                          style={{
                            minWidth: '30px',
                            height: '30px',
                            borderRadius: '6px',
                            border: currentPage === pageNum ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                            background: currentPage === pageNum ? '#3b82f6' : 'rgba(255,255,255,0.03)',
                            color: currentPage === pageNum ? '#fff' : 'inherit',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: currentPage === pageNum ? 700 : 400
                          }}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      className="quiet-button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      Next &rsaquo;
                    </button>
                    <button
                      type="button"
                      className="quiet-button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      title="Last Page"
                    >
                      Last &raquo;
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* 360° VEHICLE DOSSIER MODAL */}
      {dossierVehicle && vehicleDossierData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setDossierVehicle(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '840px',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#0f172a',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  VEHICLE 360° DOSSIER &amp; LIFECYCLE
                </div>
                <h3 style={{ margin: '4px 0 6px 0', fontSize: '22px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  🚗 {vehicleDossierData.vehicleName || 'Vehicle Details'}
                  <span style={{ fontSize: '12px', fontWeight: 600, background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '2px 8px', borderRadius: '6px' }}>
                    {vehicleDossierData.city}
                  </span>
                </h3>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>IMEI: <strong style={{ color: '#fff' }}>{vehicleDossierData.imei || '—'}</strong></span>
                  <span>SIM: <strong style={{ color: '#fff' }}>{vehicleDossierData.masterDevice.sim || '—'}</strong></span>
                  <span>Downtime in Period: <strong style={{ color: vehicleDossierData.vehDowntime > 20 ? '#ef4444' : '#10b981' }}>{vehicleDossierData.vehDowntime}%</strong></span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDossierVehicle(null)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  color: 'var(--text-muted)',
                  fontSize: '20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                &times;
              </button>
            </div>

            {/* Dossier Navigation Tabs */}
            <div style={{ display: 'flex', gap: '6px', padding: '12px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
              {[
                { id: 'timeline', label: `📅 Daily Timeline (${vehicleDossierData.historyRows.length})` },
                { id: 'damage', label: `🛠️ Damage Sheet (${vehicleDossierData.damageRows.length})` },
                { id: 'requests', label: `📝 Allocation / Req (${vehicleDossierData.reqRows.length})` },
                { id: 'device', label: `📱 Device & Swaps` },
                { id: 'notes', label: `🏷️ Action Notes (${vehicleDossierData.notes.length})` }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDossierTab(t.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: dossierTab === t.id ? '1px solid #3b82f6' : '1px solid transparent',
                    background: dossierTab === t.id ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    color: dossierTab === t.id ? '#fff' : 'var(--text-muted)',
                    fontWeight: dossierTab === t.id ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Modal Body Content */}
            <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
              {/* Tab 1: Daily Activity Heatmap / Timeline */}
              {dossierTab === 'timeline' && (
                <div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700 }}>
                    Google Drive Daily Report Status Logs ({historyStart} to {historyEnd}):
                  </h4>

                  {vehicleDossierData.historyRows.length > 0 ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {vehicleDossierData.historyRows.map((row, idx) => {
                        const isAct = (row.roadcastStatus || '').toLowerCase() === 'active';
                        return (
                          <div
                            key={idx}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              background: isAct ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                              border: isAct ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '13px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontWeight: 700, minWidth: '100px' }}>{row.displayDate || row.date}</span>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  background: isAct ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                  color: isAct ? '#10b981' : '#ef4444'
                                }}
                              >
                                {isAct ? '🟢 Active' : '🔴 Inactive'}
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                IMEI: {row.imei}
                              </span>
                            </div>

                            <div style={{ color: row.isStaleRemark ? '#ef4444' : 'var(--text-main)', fontSize: '12px', textAlign: 'right' }}>
                              {row.remark ? `"${row.remark}"` : <span style={{ color: 'var(--text-muted)' }}>No remark</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                      No history entries found in the selected date window.
                    </p>
                  )}
                </div>
              )}

              {/* Tab 2: Damage Sheet Records */}
              {dossierTab === 'damage' && (
                <div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700 }}>
                    Damage &amp; Return Logs (From Tab "VTS Returns"):
                  </h4>

                  {vehicleDossierData.damageRows.length > 0 ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {vehicleDossierData.damageRows.map((dmg, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '14px',
                            borderRadius: '8px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            fontSize: '13px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <strong style={{ color: '#fca5a5' }}>
                              Reason: {dmg.returnReason || 'Faulty Device'}
                            </strong>
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                              {dmg.timestamp}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            <div>Condition: <strong style={{ color: '#fff' }}>{dmg.condition || '—'}</strong></div>
                            <div>Courier / Dispatch: <strong style={{ color: '#fff' }}>{dmg.courierInfo || '—'}</strong></div>
                            <div>Transit Status: <strong style={{ color: '#f59e0b' }}>{dmg.status || 'Submitted'}</strong></div>
                            <div>City: <strong style={{ color: '#fff' }}>{dmg.city || '—'}</strong></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                      <p style={{ margin: 0 }}>✅ No damage or return records reported in the Damage sheet for this vehicle.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Requirement / Allocation Records */}
              {dossierTab === 'requests' && (
                <div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700 }}>
                    Requirement &amp; Allocation Logs (From Tab "Form Responses 1"):
                  </h4>

                  {vehicleDossierData.reqRows.length > 0 ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {vehicleDossierData.reqRows.map((req, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '14px',
                            borderRadius: '8px',
                            background: 'rgba(59, 130, 246, 0.08)',
                            border: '1px solid rgba(59, 130, 246, 0.25)',
                            fontSize: '13px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <strong style={{ color: '#93c5fd' }}>
                              Type: {req.requirementType || 'New VTS'}
                            </strong>
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                              {req.timestamp}
                            </span>
                          </div>
                          <p style={{ margin: '0 0 8px 0', color: 'var(--text-main)', fontSize: '13px' }}>
                            {req.reason ? `Reason: "${req.reason}"` : 'No description provided'}
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            <div>Requested By: <strong style={{ color: '#fff' }}>{req.requester || '—'}</strong></div>
                            <div>Vehicle Type: <strong style={{ color: '#fff' }}>{req.vehicleType || 'Tipper'}</strong></div>
                            <div>Is Damaged: <strong style={{ color: req.isDamaged === 'Yes' ? '#ef4444' : '#10b981' }}>{req.isDamaged || 'No'}</strong></div>
                            <div>Penalty Info: <strong style={{ color: '#fff' }}>{req.penaltyInfo || 'NA'}</strong></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                      <p style={{ margin: 0 }}>No requirement or allocation requests recorded for this vehicle.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: Device & Swaps */}
              {dossierTab === 'device' && (
                <div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700 }}>
                    Master Device Identity &amp; Swap History:
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    <div className="card" style={{ padding: '14px' }}>
                      <small style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Current Master Status</small>
                      <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: '#10b981' }}>
                        {vehicleDossierData.masterDevice.finalStatus || vehicleDossierData.masterDevice.status || 'Active'}
                      </div>
                    </div>

                    <div className="card" style={{ padding: '14px' }}>
                      <small style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Vendor / Source</small>
                      <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: '#60a5fa' }}>
                        {vehicleDossierData.masterDevice.vendor || 'Roadcast'}
                      </div>
                    </div>

                    <div className="card" style={{ padding: '14px' }}>
                      <small style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>License End Date</small>
                      <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: '#f59e0b' }}>
                        {vehicleDossierData.masterDevice.licenseEnd || '—'}
                      </div>
                    </div>
                  </div>

                  <h5 style={{ margin: '14px 0 8px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                    Detected IMEIs associated with this vehicle:
                  </h5>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {vehicleDossierData.attachedImeis.map((imei, idx) => (
                      <span
                        key={idx}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid var(--border-color)',
                          fontFamily: 'monospace',
                          fontSize: '13px'
                        }}
                      >
                        📱 {imei} {idx === 0 ? '(Latest)' : '(Previous / Swapped)'}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 5: Action Notes */}
              {dossierTab === 'notes' && (
                <div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700 }}>
                    Supervisor Follow-Up &amp; Action Notes:
                  </h4>

                  <form onSubmit={handleAddNote} style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                      <select
                        value={newNoteTag}
                        onChange={(e) => setNewNoteTag(e.target.value)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--card-bg, #1a202c)',
                          color: 'inherit',
                          fontSize: '12px'
                        }}
                      >
                        <option value="Technician Assigned">🛠️ Technician Assigned</option>
                        <option value="Wire / Power Fixed">🔋 Wire / Power Fixed</option>
                        <option value="SIM Recharged">📞 SIM Recharged</option>
                        <option value="Under Inspection">🔍 Under Inspection</option>
                        <option value="Resolved">✅ Resolved</option>
                      </select>

                      <input
                        type="text"
                        placeholder='Add action note (e.g. "Technician sent to inspect wiring on 21-Sep")...'
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'rgba(255,255,255,0.04)',
                          color: 'inherit',
                          fontSize: '13px'
                        }}
                      />

                      <button
                        type="submit"
                        className="primary-button"
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                      >
                        Save Note
                      </button>
                    </div>
                  </form>

                  {vehicleDossierData.notes.length > 0 ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {vehicleDossierData.notes.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '8px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', marginRight: '8px' }}>
                              {n.tag}
                            </span>
                            <span style={{ fontSize: '13px' }}>{n.text}</span>
                          </div>
                          <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                            {n.timestamp}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                      No follow-up action notes recorded yet.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDossierVehicle(null)}
                style={{ padding: '8px 18px', fontSize: '13px' }}
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch & Multi-Item Fleet Audit Modal */}
      {showBatchModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowBatchModal(false)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #6366f1',
              borderRadius: '16px',
              maxWidth: '640px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>⚡</span>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                    Batch &amp; Multi-Item Fleet Audit
                  </h3>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Bulk search multiple IMEIs, Vehicle numbers, or Municipal Project Sites simultaneously.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', padding: '0 24px', background: 'rgba(0, 0, 0, 0.2)' }}>
              <button
                type="button"
                onClick={() => { setBatchTab('imei'); setBatchText(''); }}
                style={{
                  padding: '12px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: batchTab === 'imei' ? '2px solid #6366f1' : '2px solid transparent',
                  color: batchTab === 'imei' ? '#fff' : 'var(--text-muted)',
                  fontWeight: batchTab === 'imei' ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                📱 Multiple IMEIs
              </button>
              <button
                type="button"
                onClick={() => { setBatchTab('vehicle'); setBatchText(''); }}
                style={{
                  padding: '12px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: batchTab === 'vehicle' ? '2px solid #3b82f6' : '2px solid transparent',
                  color: batchTab === 'vehicle' ? '#fff' : 'var(--text-muted)',
                  fontWeight: batchTab === 'vehicle' ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                🚗 Multiple Vehicles
              </button>
              <button
                type="button"
                onClick={() => setBatchTab('site')}
                style={{
                  padding: '12px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: batchTab === 'site' ? '2px solid #10b981' : '2px solid transparent',
                  color: batchTab === 'site' ? '#fff' : 'var(--text-muted)',
                  fontWeight: batchTab === 'site' ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                🏙️ Multiple Sites ({selectedCities.length})
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px' }}>
              {/* Tab 1: Multiple IMEIs */}
              {batchTab === 'imei' && (() => {
                const parsed = batchText.split(/[,;\n|\t\s]+/).filter((s) => s.length >= 6);
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#c7d2fe', fontWeight: 600 }}>
                        Paste list of IMEIs (from Excel column, WhatsApp, or comma/newline separated):
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const samples = sampleImeis.slice(0, 3).map((s) => s.imei);
                            if (samples.length > 0) {
                              setBatchText(samples.join('\n'));
                            } else {
                              setBatchText('867440066114794\n867440066114795\n867440066114796');
                            }
                          }}
                          style={{
                            background: 'rgba(99, 102, 241, 0.15)',
                            border: '1px solid rgba(99, 102, 241, 0.4)',
                            color: '#c7d2fe',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          📋 Paste Sample IMEIs
                        </button>
                        {batchText && (
                          <button
                            type="button"
                            onClick={() => setBatchText('')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#f87171',
                              fontSize: '11px',
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <textarea
                      rows={6}
                      placeholder={"867440066114794\n867440066114795\n867440066114796\n..."}
                      value={batchText}
                      onChange={(e) => setBatchText(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(99, 102, 241, 0.4)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#fff',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        resize: 'vertical',
                        marginBottom: '10px'
                      }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <span style={{ fontSize: '12px', color: parsed.length > 0 ? '#34d399' : 'var(--text-muted)', fontWeight: 600 }}>
                        {parsed.length > 0
                          ? `✓ Detected ${parsed.length} valid IMEI(s) ready to audit`
                          : 'Enter or paste at least 1 IMEI to begin audit'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setShowBatchModal(false)}
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={parsed.length === 0}
                        onClick={() => {
                          const formatted = parsed.join(', ');
                          setSearchTerm(formatted);
                          setSearchField('imei');
                          setSelectedCity('');
                          setShowBatchModal(false);
                          handleSearch(formatted, '', 'imei');
                        }}
                        style={{
                          background: parsed.length > 0 ? '#6366f1' : 'rgba(255,255,255,0.1)',
                          border: 'none',
                          color: '#fff',
                          borderRadius: '8px',
                          padding: '8px 20px',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: parsed.length > 0 ? 'pointer' : 'not-allowed',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        🚀 Audit These {parsed.length > 0 ? `${parsed.length} ` : ''}IMEIs (OR Match)
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Tab 2: Multiple Vehicles */}
              {batchTab === 'vehicle' && (() => {
                const parsed = batchText.split(/[,;\n|\t]+/).map(s => s.trim()).filter(Boolean);
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#93c5fd', fontWeight: 600 }}>
                        Paste list of Vehicle Numbers (comma, newline, or tab separated):
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const samples = devices.slice(0, 3).map((d) => d.vehicle).filter(Boolean);
                            if (samples.length > 0) {
                              setBatchText(samples.join('\n'));
                            } else {
                              setBatchText('RJ14 GP 5469\nEV-1010\nRJ14-GB-2002');
                            }
                          }}
                          style={{
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                            color: '#93c5fd',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          📋 Paste Sample Vehicles
                        </button>
                        {batchText && (
                          <button
                            type="button"
                            onClick={() => setBatchText('')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#f87171',
                              fontSize: '11px',
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <textarea
                      rows={6}
                      placeholder={"RJ14 GP 5469\nEV-1010\nRJ14-GB-2002\n..."}
                      value={batchText}
                      onChange={(e) => setBatchText(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#fff',
                        fontSize: '13px',
                        resize: 'vertical',
                        marginBottom: '10px'
                      }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <span style={{ fontSize: '12px', color: parsed.length > 0 ? '#34d399' : 'var(--text-muted)', fontWeight: 600 }}>
                        {parsed.length > 0
                          ? `✓ Detected ${parsed.length} vehicle number(s) ready to audit`
                          : 'Enter or paste at least 1 vehicle number to begin audit'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setShowBatchModal(false)}
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={parsed.length === 0}
                        onClick={() => {
                          const formatted = parsed.join(', ');
                          setSearchTerm(formatted);
                          setSearchField('vehicle');
                          setSelectedCity('');
                          setShowBatchModal(false);
                          handleSearch(formatted, '', 'vehicle');
                        }}
                        style={{
                          background: parsed.length > 0 ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                          border: 'none',
                          color: '#fff',
                          borderRadius: '8px',
                          padding: '8px 20px',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: parsed.length > 0 ? 'pointer' : 'not-allowed',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        🚀 Audit These {parsed.length > 0 ? `${parsed.length} ` : ''}Vehicles (OR Match)
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Tab 3: Multiple Sites / Cities */}
              {batchTab === 'site' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', color: '#86efac', fontWeight: 600 }}>
                      Check all municipal project sites you wish to audit together:
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedCities([...fleetCities])}
                        style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Select All ({fleetCities.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCities([])}
                        style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px', maxHeight: '240px', overflowY: 'auto', padding: '4px', marginBottom: '16px' }}>
                    {fleetCities.map((c) => {
                      const isChecked = selectedCities.includes(c);
                      return (
                        <label
                          key={c}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            background: isChecked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                            border: isChecked ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.06)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: isChecked ? 700 : 400,
                            color: isChecked ? '#fff' : 'inherit'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCities([...selectedCities, c]);
                              } else {
                                setSelectedCities(selectedCities.filter(sc => sc !== c));
                              }
                            }}
                          />
                          <span>{c}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '12px', color: selectedCities.length > 0 ? '#34d399' : 'var(--text-muted)', fontWeight: 600 }}>
                      {selectedCities.length > 0
                        ? `✓ Selected ${selectedCities.length} site(s): ${selectedCities.join(', ')}`
                        : 'No sites selected (defaults to All Cities)'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setShowBatchModal(false)}
                      style={{ padding: '8px 16px', fontSize: '13px' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={selectedCities.length === 0}
                      onClick={() => {
                        setSelectedCity('');
                        setShowBatchModal(false);
                        handleSearch(searchTerm, '', searchField, selectedCities);
                      }}
                      style={{
                        background: selectedCities.length > 0 ? '#10b981' : 'rgba(255,255,255,0.1)',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '8px',
                        padding: '8px 20px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: selectedCities.length > 0 ? 'pointer' : 'not-allowed',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      🚀 Audit Selected {selectedCities.length > 0 ? `${selectedCities.length} ` : ''}Sites
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Initial Executive Cockpit (Rendered when no active search query is displayed) */}
      {!loadingHistory && !historyData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Section 1: Site-Wise Fleet Uptime & Health Scorecard */}
          <div className="card" style={{ padding: '22px', borderRadius: '14px', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  FLEET SITES AUDIT LEADERBOARD
                </div>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>
                  🏙️ Municipal Project Sites &amp; Real-Time Uptime Scorecard
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Ranked breakdown across {fleetStats.cities.length} operational sites. Click <b>⚡ Audit Site</b> to inspect deep historical records for any city.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAuditAllFleet}
                className="primary-button"
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, borderRadius: '8px' }}
              >
                🚀 Audit All {fleetStats.cities.length} Sites (Full Fleet)
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
              {fleetStats.cities.map((c) => {
                const uptimeColor = c.uptimePct >= 90 ? '#34d399' : c.uptimePct >= 75 ? '#f59e0b' : '#f87171';
                return (
                  <div
                    key={c.city}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '10px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'transform 0.15s ease, border-color 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>
                          📍 {c.city}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: uptimeColor }}>
                          {c.uptimePct}% Uptime
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{ height: '6px', width: '100%', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                        <div style={{ height: '100%', width: `${c.uptimePct}%`, background: uptimeColor, borderRadius: '3px' }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                        <span>Total: <b>{c.total}</b></span>
                        <span style={{ color: '#34d399' }}>Active: <b>{c.active}</b></span>
                        <span style={{ color: '#f87171' }}>Down: <b>{c.inactive}</b></span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAuditCity(c.city)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        background: 'rgba(59, 130, 246, 0.12)',
                        color: '#93c5fd',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      ⚡ Audit {c.city} History ➔
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Critical Defaulter Watchlist (High-Priority Offline Vehicles) */}
          <div className="card" style={{ padding: '22px', borderRadius: '14px', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  URGENT FIELD INTERVENTION REQUIRED
                </div>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>
                  🚨 Critical Defaulter Watchlist ({chronicVehiclesList.length} Vehicles Offline)
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Vehicles currently flagged as inactive, offline, or requiring technician battery/wiring inspection.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyExecutiveWhatsApp}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                📲 Copy Offline Alert to WhatsApp
              </button>
            </div>

            {chronicVehiclesList.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#34d399', fontSize: '13px', fontWeight: 600 }}>
                ✓ Outstanding! 100% of fleet vehicles are operational and active.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '10px 14px' }}>#</th>
                      <th style={{ padding: '10px 14px' }}>Vehicle Name</th>
                      <th style={{ padding: '10px 14px' }}>Site / City</th>
                      <th style={{ padding: '10px 14px' }}>IMEI Number</th>
                      <th style={{ padding: '10px 14px' }}>SIM / Phone</th>
                      <th style={{ padding: '10px 14px' }}>Status</th>
                      <th style={{ padding: '10px 14px' }}>Last Seen</th>
                      <th style={{ padding: '10px 14px' }}>Technician Remark</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center' }}>Executive Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chronicVehiclesList.slice(0, 12).map((v, idx) => (
                      <tr key={v.imei || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#f87171' }}>
                          🚗 {v.vehicle || 'Unknown'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                            {v.city || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                          {v.imei || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          {v.sim || '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                            {v.roadcastStatus || 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          {v.lastUpdate || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '11px', color: '#fbbf24', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.remark || v.inactiveRunningRemark || 'No remark logged'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleAuditVehicle(v.vehicle, v.imei)}
                              style={{
                                background: 'rgba(59, 130, 246, 0.2)',
                                border: '1px solid #3b82f6',
                                color: '#93c5fd',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                              title="Audit historical daily CSV logs for this vehicle"
                            >
                              🔍 Audit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDossierFromDevice(v)}
                              style={{
                                background: 'rgba(168, 85, 247, 0.2)',
                                border: '1px solid #a855f7',
                                color: '#d8b4fe',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                              title="Open 360° vehicle lifecycle dossier modal"
                            >
                              📋 360° Dossier
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 3: Hardware Workshop & Return Tracking Cross-Link */}
          {pendingReturnsList.length > 0 && (
            <div className="card" style={{ padding: '22px', borderRadius: '14px', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  HARDWARE WORKSHOP CROSS-LINK
                </div>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>
                  🔧 Workshop Return &amp; Sensor Replacement Tracking
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Devices submitted from municipal sites for workshop diagnosis, repair, or warranty exchange.
                </p>
              </div>

              <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '8px 12px' }}>#</th>
                      <th style={{ padding: '8px 12px' }}>Vehicle Plate</th>
                      <th style={{ padding: '8px 12px' }}>IMEI Number</th>
                      <th style={{ padding: '8px 12px' }}>Site / City</th>
                      <th style={{ padding: '8px 12px' }}>Reported Defect / Reason</th>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                      <th style={{ padding: '8px 12px' }}>Date Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingReturnsList.map((r, rIdx) => (
                      <tr key={r.id || rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{rIdx + 1}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#fff' }}>{r.vehicleNumber || '—'}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#c7d2fe' }}>{r.imei || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{r.city || '—'}</td>
                        <td style={{ padding: '8px 12px', color: '#fbbf24' }}>{r.reason || r.defect || 'Hardware Repair'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                            {r.status || 'Pending'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>{r.date || r.createdAt || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
