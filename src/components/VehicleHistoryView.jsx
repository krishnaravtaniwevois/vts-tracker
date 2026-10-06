import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icon } from './Icons';
import { fetchVehicleHistory, fetchMorningFleetDigest } from '../services/api';

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

  // CSV Export with enhanced columns
  const handleExportCsv = () => {
    if (!filteredResults || filteredResults.length === 0) return;

    const headers = ['Date', 'Vehicle Name', 'IMEI / Unique ID', 'City', 'SIM / Phone', 'Roadcast Status', 'Final Status', 'Matched In', 'Technician Remark', 'Chronic Streak'];
    const rows = filteredResults.map((r) => [
      `"${r.date || ''}"`,
      `"${r.vehicleName || r.vehicle || searchTerm}"`,
      `"${r.imei || ''}"`,
      `"${r.city || ''}"`,
      `"${r.phone || r.sim || ''}"`,
      `"${r.roadcastStatus || ''}"`,
      `"${r.finalStatus || ''}"`,
      `"${r.matchedIn || ''}"`,
      `"${(r.remark || '').replace(/"/g, '""')}"`,
      `"${r.inactiveStreak || 0}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `FleetAudit_${(searchTerm || selectedCity || 'All').replace(/\s+/g, '_')}_${historyStart}_to_${historyEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="view-container">
      {/* Header Banner */}
      <div className="page-heading" style={{ marginBottom: '20px' }}>
        <div>
          <div className="modal-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon name="history" size={14} /> FLEET INTELLIGENCE &amp; 360° VEHICLE AUDIT
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '4px 0 6px 0', color: 'var(--text-main)' }}>
            Vehicle History &amp; Downtime Audit
          </h2>
          <p className="subheading" style={{ margin: 0 }}>
            Universal audit of daily Google Drive CSV reports with <b>360° Damage Sheet &amp; Requirement Cross-Linking</b>, <b>Chronic Defaulter Detection</b>, and <b>City-Wise Health Scorecards</b>.
          </p>
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
                        handleSearch('', s.value, 'city');
                      } else if (s.type === 'IMEI') {
                        setSearchTerm(s.value);
                        setSearchField('imei');
                        handleSearch(s.value, '', 'imei');
                      } else {
                        setSearchTerm(s.value);
                        setSearchField('vehicle');
                        handleSearch(s.value, '', 'vehicle');
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
              padding: '13px 28px',
              fontSize: '15px',
              fontWeight: 700,
              borderRadius: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              cursor: 'pointer'
            }}
          >
            <Icon name="search" size={18} />
            {loadingHistory ? 'Searching Reports...' : 'Search History'}
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
                if (val) handleSearch(searchTerm, val, searchField);
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
                handleSearch('', city, 'city');
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
          {/* Multi-IMEI Tab Switcher & Dynamic Matrix */}
          {allImeisData.list.length > 1 && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 16px',
                background: 'rgba(30, 41, 59, 0.7)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Audited IMEIs ({allImeisData.list.length}):
                </span>
                <button
                  type="button"
                  onClick={() => setActiveImeiTab('all')}
                  style={{
                    background: activeImeiTab === 'all' ? '#6366f1' : 'rgba(99, 102, 241, 0.15)',
                    border: activeImeiTab === 'all' ? '1px solid #818cf8' : '1px solid rgba(99, 102, 241, 0.3)',
                    color: activeImeiTab === 'all' ? '#fff' : '#c7d2fe',
                    padding: '4px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  📊 Compare All Matrix ({allImeisData.list.length})
                </button>
                {allImeisData.summaries.map((im) => {
                  const isSel = activeImeiTab === im.imei;
                  return (
                    <button
                      key={im.imei}
                      type="button"
                      onClick={() => setActiveImeiTab(im.imei)}
                      style={{
                        background: isSel ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
                        border: isSel ? '1px solid #60a5fa' : '1px solid var(--border-color)',
                        color: isSel ? '#fff' : '#cbd5e1',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        fontWeight: isSel ? 700 : 500,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title={`Inspect dynamic timeline of IMEI ${im.imei} (Vehicle: ${im.latestVehicle || '—'})`}
                    >
                      📱 {im.imei}
                      <span style={{ fontFamily: 'inherit', fontSize: '10px', opacity: 0.8 }}>
                        ({im.latestVehicle || im.latestCity || '—'})
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleCopyMultiImeiWhatsApp}
                  style={{
                    background: 'rgba(37, 211, 102, 0.2)',
                    border: '1px solid rgba(37, 211, 102, 0.4)',
                    color: '#25d366',
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  📲 Copy All IMEIs (WhatsApp)
                </button>
                <button
                  type="button"
                  onClick={handleExportMultiImeiCsv}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid var(--border-color)',
                    color: '#cbd5e1',
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  📥 Export All IMEIs CSV
                </button>
              </div>
            </div>
          )}

          {/* If All IMEIs Matrix view is active */}
          {allImeisData.list.length > 1 && activeImeiTab === 'all' ? (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
                border: '2px solid #6366f1',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '24px',
                boxShadow: '0 12px 36px rgba(99, 102, 241, 0.25)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.8px', background: 'rgba(99, 102, 241, 0.25)', padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
                      📊 MULTI-IMEI COMPARATIVE AUDIT MATRIX
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Audit Window: <b>{historyStart}</b> to <b>{historyEnd}</b>
                    </span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff' }}>
                    Cross-Device Movement, Swaps &amp; Hardware Health
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Comparative dynamic audit across {allImeisData.list.length} target IMEIs. Click any IMEI row to inspect its full chronological movement stepper.
                  </p>
                </div>
              </div>

              {/* Comparative Stats Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 700 }}>Total Audited IMEIs</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '2px', color: '#fff' }}>{allImeisData.list.length} Devices</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Scanned across daily sheets</div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#c084fc', textTransform: 'uppercase', fontWeight: 700 }}>Reassigned / Swapped</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '2px', color: '#c084fc' }}>
                    {allImeisData.summaries.filter(im => im.transitions.length > 0).length} IMEIs
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Moved across multiple vehicles</div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#60a5fa', textTransform: 'uppercase', fontWeight: 700 }}>Multi-City Transfers</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '2px', color: '#60a5fa' }}>
                    {allImeisData.summaries.filter(im => im.distinctCities.length > 1).length} IMEIs
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Transferred between project sites</div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#f87171', textTransform: 'uppercase', fontWeight: 700 }}>Return / Damage Logs</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '2px', color: '#f87171' }}>
                    {allImeisData.summaries.filter(im => im.damageMatches.length > 0).length} IMEIs
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Flagged in repair sheets</div>
                </div>
              </div>

              {/* Matrix Table */}
              <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '10px 14px' }}>IMEI Number</th>
                      <th style={{ padding: '10px 14px' }}>Latest Deployment</th>
                      <th style={{ padding: '10px 14px' }}>Uptime &amp; Health</th>
                      <th style={{ padding: '10px 14px' }}>Historical Vehicles Flow</th>
                      <th style={{ padding: '10px 14px' }}>Sites Visited</th>
                      <th style={{ padding: '10px 14px' }}>Swaps</th>
                      <th style={{ padding: '10px 14px' }}>Damage Log</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center' }}>Dynamic Stepper</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allImeisData.summaries.map((im) => {
                      const uptimeNum = parseFloat(im.uptimePct);
                      const uptimeColor = uptimeNum >= 80 ? '#34d399' : uptimeNum >= 60 ? '#f59e0b' : '#f87171';
                      return (
                        <tr key={im.imei} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s ease' }}>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#fff' }}>
                            📱 {im.imei}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 700, color: '#60a5fa' }}>🚗 {im.latestVehicle || '—'}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📍 {im.latestCity || '—'} ({im.latestStatus})</div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <strong style={{ color: uptimeColor }}>{im.uptimePct}%</strong>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({im.activeDays}/{im.totalDays}d)</span>
                            </div>
                            <div style={{ height: '4px', width: '80px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                              <div style={{ height: '100%', width: `${im.uptimePct}%`, background: uptimeColor }} />
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                              {im.distinctVehicles.map((v, vIdx) => (
                                <span key={vIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93c5fd', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                                    {v.vehicleName} ({v.daysCount}d)
                                  </span>
                                  {vIdx < im.distinctVehicles.length - 1 && <span style={{ color: '#a5b4fc', fontSize: '12px' }}>➔</span>}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                              {im.distinctCities.map((c, cIdx) => (
                                <span key={cIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#86efac', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                                    {c.city}
                                  </span>
                                  {cIdx < im.distinctCities.length - 1 && <span style={{ color: '#86efac', fontSize: '12px' }}>➔</span>}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {im.transitions.length > 0 ? (
                              <span style={{ background: 'rgba(168, 85, 247, 0.2)', border: '1px solid #a855f7', color: '#d8b4fe', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                                🔄 {im.transitions.length} Swaps
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Single Vehicle</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {im.damageMatches.length > 0 ? (
                              <span style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                                ⚠️ {im.damageMatches.length} Logs
                              </span>
                            ) : (
                              <span style={{ color: '#86efac', fontSize: '11px' }}>Clean</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setActiveImeiTab(im.imei)}
                              style={{
                                background: 'rgba(99, 102, 241, 0.2)',
                                border: '1px solid #6366f1',
                                color: '#c7d2fe',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Inspect Stepper ➔
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : imeiJourney ? (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
                border: '2px solid #6366f1',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '24px',
                boxShadow: '0 12px 36px rgba(99, 102, 241, 0.25)',
                position: 'relative'
              }}
            >
              {allImeisData.list.length > 1 && (
                <button
                  type="button"
                  onClick={() => setActiveImeiTab('all')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid var(--border-color)',
                    color: '#c7d2fe',
                    borderRadius: '6px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginBottom: '14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  ← Back to All ({allImeisData.list.length}) IMEIs Matrix
                </button>
              )}
              {/* Top Header of IMEI Journey */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.8px', background: 'rgba(99, 102, 241, 0.25)', padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
                      📱 DYNAMIC IMEI LIFECYCLE &amp; MOVEMENT AUDIT
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Audit Window: <b>{historyStart}</b> to <b>{historyEnd}</b> ({imeiJourney.totalDays} Days)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                    <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 900, fontFamily: 'monospace', color: '#fff', letterSpacing: '0.5px' }}>
                      {imeiJourney.imei}
                    </h2>
                    
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(imeiJourney.imei);
                        setImeiCopied(true);
                        setTimeout(() => setImeiCopied(false), 2000);
                      }}
                      style={{
                        background: imeiCopied ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid var(--border-color)',
                        color: imeiCopied ? '#fff' : '#cbd5e1',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {imeiCopied ? '✓ Copied' : '📋 Copy IMEI'}
                    </button>

                    {/* Dynamic Badges */}
                    {imeiJourney.isMultiVehicle ? (
                      <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', background: 'rgba(168, 85, 247, 0.25)', border: '1px solid #a855f7', color: '#d8b4fe' }}>
                        🔄 Reassigned Across {imeiJourney.distinctVehicles.length} Vehicles
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', color: '#86efac' }}>
                        🟢 Dedicated Single Vehicle ({imeiJourney.distinctVehicles[0]?.vehicleName})
                      </span>
                    )}

                    {imeiJourney.isMultiCity ? (
                      <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.25)', border: '1px solid #3b82f6', color: '#93c5fd' }}>
                        🚚 Moved Across {imeiJourney.distinctCities.length} Cities ({imeiJourney.distinctCities.map(c => c.city).join(' ➔ ')})
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid var(--border-color)', color: '#cbd5e1' }}>
                        📍 Operating in {imeiJourney.distinctCities[0]?.city || 'Site'}
                      </span>
                    )}

                    {imeiJourney.damageMatches.length > 0 && (
                      <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.25)', border: '1px solid #ef4444', color: '#fca5a5' }}>
                        ⚠️ {imeiJourney.damageMatches.length} Return / Damage Log(s)
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons for IMEI */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleCopyImeiWhatsApp}
                    style={{
                      background: 'rgba(37, 211, 102, 0.2)',
                      border: '1px solid rgba(37, 211, 102, 0.5)',
                      color: '#25d366',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    title="Share complete dynamic IMEI allocation timeline on WhatsApp"
                  >
                    <span>📲 Share IMEI Journey</span>
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleExportImeiCsv}
                    style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Icon name="download" size={14} /> Export IMEI CSV
                  </button>
                </div>
              </div>

              {/* Key KPI Stats Grid for this IMEI */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '22px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 700 }}>
                    Assigned Vehicles
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '2px', color: '#fff' }}>
                    {imeiJourney.distinctVehicles.length}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {imeiJourney.distinctVehicles.map(v => v.vehicleName).join(', ')}
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#60a5fa', textTransform: 'uppercase', fontWeight: 700 }}>
                    Operating Sites / Cities
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '2px', color: '#fff' }}>
                    {imeiJourney.distinctCities.length}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {imeiJourney.distinctCities.map(c => c.city).join(', ')}
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#34d399', textTransform: 'uppercase', fontWeight: 700 }}>
                    Audited Days
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '2px', color: '#fff' }}>
                    {imeiJourney.totalDays} Days
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {imeiJourney.activeDays} Active • {imeiJourney.inactiveDays} Down
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: parseFloat(imeiJourney.uptimePct) >= 80 ? '#34d399' : '#f87171', textTransform: 'uppercase', fontWeight: 700 }}>
                    Hardware Uptime %
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '2px', color: parseFloat(imeiJourney.uptimePct) >= 80 ? '#34d399' : '#f87171' }}>
                    {imeiJourney.uptimePct}%
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {imeiJourney.transitions.length} Swaps / Reassignments
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: '#fcd34d', textTransform: 'uppercase', fontWeight: 700 }}>
                    Latest Deployment
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, marginTop: '4px', color: '#60a5fa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    🚗 {imeiJourney.latestVehicle || '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    📍 {imeiJourney.latestCity} • {imeiJourney.latestStatus}
                  </div>
                </div>
              </div>

              {/* Sequential Visual Journey Flow (Chronological Stepper Cards) */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔄 Dynamic Allocation &amp; Movement Journey</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      (Chronological timeline across vehicles &amp; sites)
                    </span>
                  </h4>
                  {imeiJourney.transitions.length > 0 && (
                    <span style={{ fontSize: '11px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 600 }}>
                      ⚡ {imeiJourney.transitions.length} Reassignment Event(s) Detected
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {imeiJourney.phases.map((phase, pIdx) => {
                    const isCurrentActiveVeh = phase.vehicle === imeiJourney.latestVehicle;
                    const nextTransition = imeiJourney.transitions[pIdx];

                    return (
                      <React.Fragment key={pIdx}>
                        {/* Phase Card */}
                        <div
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: isCurrentActiveVeh ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '10px',
                            padding: '14px 18px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                background: phase.color ? `${phase.color}25` : 'rgba(59, 130, 246, 0.2)',
                                border: `1px solid ${phase.color || '#3b82f6'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '16px',
                                fontWeight: 800,
                                color: phase.color || '#60a5fa'
                              }}
                            >
                              {pIdx + 1}
                            </div>

                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>
                                  🚗 {phase.vehicle}
                                </span>
                                <span style={{ fontSize: '12px', background: 'rgba(255, 255, 255, 0.08)', padding: '2px 8px', borderRadius: '4px', color: '#93c5fd' }}>
                                  🏙️ {phase.city}
                                </span>
                                {isCurrentActiveVeh && (
                                  <span style={{ fontSize: '10px', background: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    Current / Latest
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                📅 <b>{phase.startDate}</b> to <b>{phase.endDate}</b> ({phase.daysCount} Days)
                                <span style={{ marginLeft: '10px' }}>
                                  🟢 {phase.activeDays} Active • 🔴 {phase.inactiveDays} Inactive
                                </span>
                              </div>
                              {phase.remarks.length > 0 && (
                                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px', fontStyle: 'italic' }}>
                                  Remarks: "{phase.remarks.slice(0, 2).join('; ')}"
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (vehicleFilter === phase.vehicle) {
                                  setVehicleFilter('all');
                                } else {
                                  setVehicleFilter(phase.vehicle);
                                }
                                setCurrentPage(1);
                              }}
                              style={{
                                background: vehicleFilter === phase.vehicle ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                                border: '1px solid var(--border-color)',
                                color: vehicleFilter === phase.vehicle ? '#fff' : 'inherit',
                                borderRadius: '6px',
                                padding: '5px 12px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              {vehicleFilter === phase.vehicle ? '✓ Showing This Vehicle' : 'Filter Table to Vehicle'}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setDossierVehicle({ vehicleName: phase.vehicle, city: phase.city, imei: imeiJourney.imei });
                                setDossierTab('timeline');
                              }}
                              style={{
                                background: 'rgba(59, 130, 246, 0.15)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                color: '#60a5fa',
                                borderRadius: '6px',
                                padding: '5px 10px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              🔍 360° Dossier
                            </button>
                          </div>
                        </div>

                        {/* Transition Connector Box */}
                        {nextTransition && (
                          <div
                            style={{
                              margin: '2px 0 2px 24px',
                              padding: '8px 14px',
                              background: 'linear-gradient(90deg, rgba(168, 85, 247, 0.15) 0%, rgba(59, 130, 246, 0.1) 100%)',
                              borderLeft: '3px solid #a855f7',
                              borderRadius: '0 8px 8px 0',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              fontSize: '12px'
                            }}
                          >
                            <span style={{ fontSize: '16px' }}>⚡</span>
                            <div>
                              <strong style={{ color: '#d8b4fe' }}>
                                Reassignment Event on {nextTransition.date}:
                              </strong>
                              <span style={{ color: '#f1f5f9', marginLeft: '6px' }}>
                                Device removed from <b>{nextTransition.fromVehicle}</b> ({nextTransition.fromCity}) ➔ installed into <b>{nextTransition.toVehicle}</b> ({nextTransition.toCity})
                              </span>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Vehicle Allocation Comparison Table */}
              <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
                  📊 Vehicle-Wise Allocation Breakdown ({imeiJourney.distinctVehicles.length} Vehicles):
                </h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px 10px' }}>VEHICLE NUMBER</th>
                        <th style={{ padding: '8px 10px' }}>CITY (SITE)</th>
                        <th style={{ padding: '8px 10px' }}>FIRST SEEN</th>
                        <th style={{ padding: '8px 10px' }}>LAST SEEN</th>
                        <th style={{ padding: '8px 10px' }}>DAYS ACTIVE / DOWN</th>
                        <th style={{ padding: '8px 10px' }}>HEALTH %</th>
                        <th style={{ padding: '8px 10px' }}>LATEST REMARK</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {imeiJourney.distinctVehicles.map((v, idx) => {
                        const isSelected = vehicleFilter === v.vehicleName;
                        return (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent'
                            }}
                          >
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: v.color || '#60a5fa' }}>
                              🚗 {v.vehicleName}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              {v.cities.join(', ') || '—'}
                            </td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                              {v.firstSeen}
                            </td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                              {v.lastSeen}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ color: '#10b981' }}>{v.activeDays}d Active</span> • <span style={{ color: v.inactiveDays > 0 ? '#ef4444' : 'var(--text-muted)' }}>{v.inactiveDays}d Down</span> ({v.daysCount}d total)
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: parseFloat(v.uptimePct) >= 80 ? '#10b981' : '#f87171' }}>
                              {v.uptimePct}%
                            </td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.remarks[v.remarks.length - 1] || 'No remark'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setVehicleFilter(isSelected ? 'all' : v.vehicleName);
                                  setCurrentPage(1);
                                }}
                                style={{
                                  background: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                                  border: '1px solid var(--border-color)',
                                  color: isSelected ? '#fff' : 'inherit',
                                  borderRadius: '4px',
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                              >
                                {isSelected ? '✓ Filtered' : 'Filter Table'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cross-Link Return & Damage Sheet Alerts */}
              {imeiJourney.damageMatches.length > 0 && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#fca5a5', fontWeight: 700 }}>
                    🛠️ Hardware Return / Damage Sheet Records Found ({imeiJourney.damageMatches.length}):
                  </h5>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {imeiJourney.damageMatches.map((dmg, dIdx) => (
                      <div key={dIdx} style={{ fontSize: '12px', color: '#fecaca', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <span>
                          • <b>{dmg.timestamp}</b>: Return Reason: <i>{dmg.returnReason || 'Faulty'}</i> | Condition: <i>{dmg.condition || '—'}</i> | Courier: <i>{dmg.courierInfo || '—'}</i>
                        </span>
                        <span style={{ fontWeight: 700, color: '#f59e0b' }}>
                          Status: {dmg.status || 'Received'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filter Navigation Bar for Timeline Table */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Table Vehicle Filter:
                  </span>
                  <button
                    type="button"
                    onClick={() => { setVehicleFilter('all'); setCurrentPage(1); }}
                    style={{
                      background: vehicleFilter === 'all' ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                      border: vehicleFilter === 'all' ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                      color: vehicleFilter === 'all' ? '#fff' : 'var(--text-muted)',
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    All Vehicles ({imeiJourney.totalDays})
                  </button>

                  {imeiJourney.distinctVehicles.map((v) => {
                    const isSelected = vehicleFilter === v.vehicleName;
                    return (
                      <button
                        key={v.vehicleName}
                        type="button"
                        onClick={() => { setVehicleFilter(isSelected ? 'all' : v.vehicleName); setCurrentPage(1); }}
                        style={{
                          background: isSelected ? v.color || '#3b82f6' : 'rgba(255,255,255,0.05)',
                          border: isSelected ? `1px solid ${v.color || '#3b82f6'}` : '1px solid var(--border-color)',
                          color: isSelected ? '#fff' : v.color || '#93c5fd',
                          padding: '3px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer'
                        }}
                      >
                        🚗 {v.vehicleName} ({v.daysCount}d)
                      </button>
                    );
                  })}
                </div>

                {vehicleFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => { setVehicleFilter('all'); setCurrentPage(1); }}
                    style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Reset Filter to All
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {/* Multi-Vehicle Comparative Audit Section */}
          {allVehiclesData.length > 1 && (
            <div className="card" style={{ padding: '20px', marginBottom: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🚗 Multi-Vehicle Comparative Audit ({allVehiclesData.length} Vehicles Audited)
                  </h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Cross-vehicle downtime, chronic streaks, swapped devices &amp; 360° dossiers for all vehicles in this audit window.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setActiveVehicleTab('all')}
                    style={{
                      background: activeVehicleTab === 'all' ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                      border: activeVehicleTab === 'all' ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                      color: activeVehicleTab === 'all' ? '#fff' : 'var(--text-muted)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    All ({allVehiclesData.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveVehicleTab('chronic')}
                    style={{
                      background: activeVehicleTab === 'chronic' ? '#ef4444' : 'rgba(255,255,255,0.05)',
                      border: activeVehicleTab === 'chronic' ? '1px solid #ef4444' : '1px solid var(--border-color)',
                      color: activeVehicleTab === 'chronic' ? '#fff' : '#f87171',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ⚠️ Chronic Defaulters ({allVehiclesData.filter(v => v.isChronic).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveVehicleTab('swapped')}
                    style={{
                      background: activeVehicleTab === 'swapped' ? '#8b5cf6' : 'rgba(255,255,255,0.05)',
                      border: activeVehicleTab === 'swapped' ? '1px solid #8b5cf6' : '1px solid var(--border-color)',
                      color: activeVehicleTab === 'swapped' ? '#fff' : '#c084fc',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Swapped IMEIs ({allVehiclesData.filter(v => v.isSwapped || v.imeisList.length > 1).length})
                  </button>
                </div>
              </div>

              {/* Vehicle Table */}
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '8px 12px' }}>Vehicle</th>
                      <th style={{ padding: '8px 12px' }}>Site</th>
                      <th style={{ padding: '8px 12px' }}>Audited Days</th>
                      <th style={{ padding: '8px 12px' }}>Uptime %</th>
                      <th style={{ padding: '8px 12px' }}>Defaulter Streak</th>
                      <th style={{ padding: '8px 12px' }}>Installed / Swapped IMEIs</th>
                      <th style={{ padding: '8px 12px' }}>Latest Remark</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allVehiclesData
                      .filter((v) => {
                        if (activeVehicleTab === 'chronic') return v.isChronic;
                        if (activeVehicleTab === 'swapped') return v.isSwapped || v.imeisList.length > 1;
                        return true;
                      })
                      .map((v) => {
                        const uptimeNum = parseFloat(v.uptimePct);
                        const uptimeColor = uptimeNum >= 80 ? '#10b981' : uptimeNum >= 60 ? '#f59e0b' : '#ef4444';
                        return (
                          <tr key={v.vehicle} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                              🚗 {v.vehicle}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#93c5fd' }}>
                              {v.city}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              {v.totalDays}d ({v.activeDays} act / {v.inactiveDays} down)
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <strong style={{ color: uptimeColor }}>{v.uptimePct}%</strong>
                              </div>
                              <div style={{ height: '4px', width: '70px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginTop: '3px' }}>
                                <div style={{ height: '100%', width: `${v.uptimePct}%`, background: uptimeColor }} />
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              {v.isChronic || v.maxStreak >= 3 ? (
                                <span style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                                  🔥 {v.maxStreak}d Streak
                                </span>
                              ) : (
                                <span style={{ color: '#10b981', fontSize: '11px' }}>🟢 Healthy</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {v.imeisList.map((im, iIdx) => (
                                  <button
                                    key={iIdx}
                                    type="button"
                                    onClick={() => {
                                      setSearchTerm(im);
                                      setSearchField('imei');
                                      handleSearch(im, '', 'imei');
                                    }}
                                    style={{
                                      background: 'rgba(99, 102, 241, 0.15)',
                                      border: '1px solid rgba(99, 102, 241, 0.3)',
                                      color: '#c7d2fe',
                                      borderRadius: '4px',
                                      padding: '1px 5px',
                                      fontSize: '11px',
                                      cursor: 'pointer'
                                    }}
                                    title={`Audit dynamic journey of IMEI ${im}`}
                                  >
                                    📱 {im}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px', maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-muted)' }} title={v.latestRemark}>
                              {v.latestRemark || '—'}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDossierVehicle({ vehicleName: v.vehicle, city: v.city, imei: v.imeisList[0] });
                                    setDossierTab('timeline');
                                  }}
                                  style={{
                                    background: 'rgba(59, 130, 246, 0.15)',
                                    border: '1px solid #3b82f6',
                                    color: '#60a5fa',
                                    borderRadius: '4px',
                                    padding: '3px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  📂 360° Dossier
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVehicleFilter(vehicleFilter === v.vehicle ? 'all' : v.vehicle);
                                    setCurrentPage(1);
                                  }}
                                  style={{
                                    background: vehicleFilter === v.vehicle ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                                    border: '1px solid var(--border-color)',
                                    color: vehicleFilter === v.vehicle ? '#fff' : 'inherit',
                                    borderRadius: '4px',
                                    padding: '3px 6px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {vehicleFilter === v.vehicle ? '✓ Filtered' : 'Filter'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Total Records Found
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: 'var(--text-main)' }}>
                {summaryStats.total}
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Matching daily report rows</small>
            </div>

            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: '11px', color: '#8b5cf6', textTransform: 'uppercase', fontWeight: 600 }}>
                Unique Vehicles
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: '#8b5cf6' }}>
                {summaryStats.uniqueVehicles}
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Audited in this date window</small>
            </div>

            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '11px', color: '#10b981', textTransform: 'uppercase', fontWeight: 600 }}>
                Active Records
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: '#10b981' }}>
                {summaryStats.active}
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Healthy &amp; streaming</small>
            </div>

            <div className="card" style={{ padding: '16px', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase', fontWeight: 600 }}>
                Downtime %
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: '#ef4444' }}>
                {summaryStats.downtimePct}%
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                {summaryStats.inactive} Inactive occurrences
              </small>
            </div>
          </div>

          {/* City-Wise Fleet Health Scorecard */}
          {historyData.cityBreakdown && historyData.cityBreakdown.length > 0 && (
            <div className="card" style={{ padding: '16px 20px', marginBottom: '20px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="map" size={16} /> City-Wise Fleet Health &amp; Downtime Scorecard
                  </h4>
                  <small style={{ color: 'var(--text-muted)' }}>Click to filter single city, or toggle multiple sites simultaneously</small>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBatchModal(true);
                      setBatchTab('site');
                    }}
                    style={{
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      color: '#93c5fd',
                      borderRadius: '6px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ⚡ Compare Multiple Sites
                  </button>
                </div>
              </div>

              {/* Active Multi-Site Selection Banner */}
              {selectedCities.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid #3b82f6', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: '#93c5fd', flexWrap: 'wrap' }}>
                  <span>🏙️ Active Multi-Site Filter: <b>{selectedCities.join(', ')}</b> ({selectedCities.length} sites)</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCities([]);
                      setSelectedCity('');
                      handleSearch(searchTerm, '', searchField, []);
                    }}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline', fontWeight: 600 }}
                  >
                    Clear Multi-Site Filter (Show All Fleet)
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                {historyData.cityBreakdown.map((c) => {
                  const isSelected = selectedCities.length > 0
                    ? selectedCities.some(sc => sc.toLowerCase() === c.city.toLowerCase())
                    : (selectedCity && selectedCity.toLowerCase() === c.city.toLowerCase());
                  const uptime = parseFloat(c.uptimePct);
                  const healthColor = uptime >= 90 ? '#10b981' : uptime >= 75 ? '#f59e0b' : '#ef4444';

                  return (
                    <div
                      key={c.city}
                      onClick={(e) => {
                        if (e.shiftKey || e.ctrlKey || selectedCities.length > 0) {
                          let nextCities;
                          if (selectedCities.some(sc => sc.toLowerCase() === c.city.toLowerCase())) {
                            nextCities = selectedCities.filter(sc => sc.toLowerCase() !== c.city.toLowerCase());
                          } else {
                            nextCities = [...selectedCities, c.city];
                          }
                          setSelectedCities(nextCities);
                          setSelectedCity('');
                          handleSearch(searchTerm, '', searchField, nextCities);
                        } else {
                          if (isSelected) {
                            setSelectedCity('');
                            setSelectedCities([]);
                            handleSearch(searchTerm, '', searchField, []);
                          } else {
                            setSelectedCity(c.city);
                            setSelectedCities([]);
                            handleSearch(searchTerm, c.city, searchField, []);
                          }
                        }
                      }}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                        background: isSelected ? 'rgba(59, 130, 246, 0.16)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-color)';
                      }}
                      title="Click to filter by this city. Shift/Ctrl+Click to multi-select sites."
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '13px', color: isSelected ? '#60a5fa' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isSelected && <span>✓</span>} {c.city}
                        </strong>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: healthColor }}>
                          {c.uptimePct}%
                        </span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', margin: '6px 0' }}>
                        <div style={{ height: '100%', width: `${c.uptimePct}%`, background: healthColor, borderRadius: '2px' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>{c.vehicles} vehicles</span>
                        <span style={{ color: c.inactiveDays > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                          {c.inactiveDays} down
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chronic Inactive Problem Vehicles Alert Banner */}
          {historyData.chronicVehicles && historyData.chronicVehicles.length > 0 && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid #ef4444',
                borderRadius: '10px',
                padding: '14px 18px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Icon name="alert" size={24} style={{ color: '#ef4444' }} />
                <div>
                  <strong style={{ color: '#fca5a5', fontSize: '14px' }}>
                    🚨 {historyData.chronicVehicles.length} Vehicles Flagged as Chronic Inactive (3+ Consecutive Days Down):
                  </strong>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {historyData.chronicVehicles.slice(0, 5).map((cv, idx) => (
                      <span
                        key={idx}
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
                        title={`Click to open 360° dossier: ${cv.vehicle} down for ${cv.streakDays} days (${cv.latestRemark || 'No remark'})`}
                      >
                        🚗 {cv.vehicle} ({cv.streakDays}d down)
                      </span>
                    ))}
                    {historyData.chronicVehicles.length > 5 && (
                      <span style={{ fontSize: '11px', color: '#fca5a5', alignSelf: 'center' }}>
                        +{historyData.chronicVehicles.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setStatusTabFilter('chronic')}
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  View Problem Vehicles
                </button>
              </div>
            </div>
          )}

          {/* Stale Technician Remark Alert */}
          {historyData.repeatedRemarkWarning && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid #f59e0b',
                borderRadius: '10px',
                padding: '12px 18px',
                marginBottom: '20px',
                color: '#fcd34d',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <Icon name="alert" size={18} />
              <div>
                <strong>Technician Repeated Remark Flagged:</strong>
                <span style={{ marginLeft: '6px', color: '#fef3c7' }}>
                  {historyData.repeatedRemarkWarning}
                </span>
              </div>
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

                {/* Export CSV Button */}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleExportCsv}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
                >
                  <Icon name="download" size={14} /> Export CSV
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

      {/* Initial Empty State Guide */}
      {!loadingHistory && !historyData && (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '12px' }}>
          <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%', color: '#3b82f6', marginBottom: '16px' }}>
            <Icon name="history" size={36} />
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--text-main)' }}>
            Google Drive Historical Fleet Intelligence Ready
          </h3>
          <p style={{ maxWidth: '560px', margin: '0 auto', fontSize: '13px', lineHeight: '1.6' }}>
            Select a <b>City (Site)</b> from the dropdown or search by <b>Vehicle Number</b>, <b>IMEI</b>, or <b>Remark</b>.
            Use the <b>Search In</b> dropdown to target specific columns (e.g. <i>City Only</i> so Jaipur search never returns Sikar or Nawa).
          </p>
        </div>
      )}
    </div>
  );
}
