import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Icon } from './Icons';
import { submitRoadcastImport } from '../services/api';
import { exportToExcelFile, exportToCsvFile } from '../services/exportUtils';

export function ImportRoadcastView({ devices = [], searchQuery = '', onSearchChange, onRefresh }) {
  // Slots state: { file, fileName, rows: [ { uniqueid, lastUpdate, name, phone } ], count }
  const [slots, setSlots] = useState({
    active: { file: null, fileName: '', rows: [], count: 0 },
    inactive: { file: null, fileName: '', rows: [], count: 0 },
    expired: { file: null, fileName: '', rows: [], count: 0 }
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  // Sync Toggles (Name, Phone, and License End synchronization from Roadcast export)
  const [syncNames, setSyncNames] = useState(true);
  const [syncPhones, setSyncPhones] = useState(true);
  const [syncLicenseEnd, setSyncLicenseEnd] = useState(true);

  // Cascading Dynamic Filters
  const [localSearch, setLocalSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'updated_run' | 'changed' | 'active' | 'inactive' | 'expired'
  const [cityFilter, setCityFilter] = useState('All');
  const [finalStatusFilter, setFinalStatusFilter] = useState('All');
  const [vtsTypeFilter, setVtsTypeFilter] = useState('All');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // 10, 25, 50, 100, 250, 0 (All)

  const searchTerm = onSearchChange ? searchQuery : localSearch;

  const handleSearchChange = (val) => {
    if (onSearchChange) {
      onSearchChange(val);
    } else {
      setLocalSearch(val);
    }
    setCurrentPage(1);
  };

  // Helper: Normalize Uniqueid string
  const normalizeUniqueid = (val) => {
    if (val === null || val === undefined) return '';
    let s = String(val).trim();
    if (s.includes('e') || s.includes('E')) {
      const num = Number(val);
      if (!isNaN(num)) {
        s = num.toLocaleString('fullwide', { useGrouping: false });
      }
    }
    if (s.endsWith('.0')) {
      s = s.slice(0, -2);
    }
    return s.replace(/\s+/g, '');
  };

  // Helper: Normalize Date to "DD MMM YYYY"
  const normalizeDate = (dateVal) => {
    if (!dateVal) return '';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let d = null;

    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      d = dateVal;
    } else if (typeof dateVal === 'number') {
      const parsed = XLSX.SSF.parse_date_code(dateVal);
      if (parsed) {
        const day = String(parsed.d).padStart(2, '0');
        const month = monthNames[parsed.m - 1] || 'Jan';
        return `${day} ${month} ${parsed.y}`;
      }
    } else {
      const s = String(dateVal).trim();
      if (!s) return '';

      if (/^\d{1,2}[\s-]+[A-Za-z]{3}[\s-]+\d{4}$/.test(s)) {
        return s.replace(/-/g, ' ');
      }

      const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (isoMatch) {
        const year = isoMatch[1];
        const month = monthNames[parseInt(isoMatch[2], 10) - 1] || 'Jan';
        const day = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
        return `${day} ${month} ${year}`;
      }

      const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (dmyMatch) {
        const day = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
        const month = monthNames[parseInt(dmyMatch[2], 10) - 1] || 'Jan';
        const year = dmyMatch[3];
        return `${day} ${month} ${year}`;
      }

      const parsedTime = Date.parse(s);
      if (!isNaN(parsedTime)) {
        d = new Date(parsedTime);
      }
    }

    if (d && !isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = monthNames[d.getMonth()] || 'Jan';
      const year = d.getFullYear();
      return `${day} ${month} ${year}`;
    }

    return String(dateVal).trim();
  };

  // Parse file rows from either CSV (PapaParse) or XLSX (SheetJS)
  const parseFileContent = (fileObj) => {
    return new Promise((resolve, reject) => {
      const isCsv = fileObj.name.toLowerCase().endsWith('.csv');

      if (isCsv) {
        Papa.parse(fileObj, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            try {
              const rows = [];
              const data = results.data || [];
              data.forEach((row) => {
                let uniqueid = '';
                let lastUpdate = '';
                let name = '';
                let phone = '';
                let licenseEnd = '';

                const keys = Object.keys(row);
                const imeiKey = keys.find((k) => {
                  const l = k.toLowerCase().trim();
                  return l === 'uniqueid' || l === 'unique id' || l === 'imei' || l === 'imei no';
                }) || keys.find((k) => {
                  const l = k.toLowerCase().trim();
                  return l.includes('unique') && !l.includes('device');
                });

                const dateKey = keys.find((k) => {
                  const l = k.toLowerCase().trim();
                  return l === 'last update' || l === 'last_update' || l === 'lastupdate' || l === 'last updated';
                }) || keys.find((k) => {
                  const l = k.toLowerCase().trim();
                  return l.includes('last update');
                });

                const nameKey = keys.find((k) => {
                  const l = k.toLowerCase().trim();
                  return l === 'name' || l === 'vehicle' || l === 'vehicle name' || l === 'devicename';
                });

                const phoneKey = keys.find((k) => {
                  const l = k.toLowerCase().trim();
                  return l === 'phone' || l === 'sim' || l === 'sim no' || l === 'phone no' || l === 'mobile';
                });

                const licenseKey = keys.find((k) => {
                  const l = k.toLowerCase().trim();
                  return (
                    l === 'license end' ||
                    l === 'license_end' ||
                    l === 'expiry' ||
                    l === 'expiry date' ||
                    l === 'expiry_date' ||
                    l === 'license end date' ||
                    l === 'licence end' ||
                    l === 'validity' ||
                    l === 'valid till' ||
                    l === 'valid_till' ||
                    l === 'end date' ||
                    l === 'expiration date' ||
                    l === 'license expiry' ||
                    l === 'licence date'
                  );
                });

                if (imeiKey && row[imeiKey] !== undefined) {
                  uniqueid = normalizeUniqueid(row[imeiKey]);
                }
                if (dateKey && row[dateKey] !== undefined) {
                  lastUpdate = normalizeDate(row[dateKey]);
                }
                if (nameKey && row[nameKey] !== undefined) {
                  name = String(row[nameKey]).trim();
                }
                if (phoneKey && row[phoneKey] !== undefined) {
                  phone = normalizeUniqueid(row[phoneKey]);
                }

                // Primary: "License End", Fallback if blank: "Expiry"
                const licEndVal = String(row['License End'] || row['license end'] || row['license_end'] || row['License End Date'] || row['Licence End'] || '').trim();
                const expiryVal = String(row['Expiry'] || row['expiry'] || row['Expiry Date'] || row['expiry_date'] || '').trim();

                let rawLic = licEndVal || expiryVal;
                if (!rawLic && licenseKey && row[licenseKey]) {
                  rawLic = String(row[licenseKey]).trim();
                }
                if (rawLic) {
                  licenseEnd = normalizeDate(rawLic);
                }

                // Positional fallback if headers are completely unlabelled (Col 2=Name, Col 3=Uniqueid, Col 6=Phone, Col 8=Last Update, Col 13=Expiry)
                if (!name && keys.length >= 3) name = String(row[keys[2]] || '').trim();
                if (!uniqueid && keys.length >= 4) uniqueid = normalizeUniqueid(row[keys[3]]);
                if (!phone && keys.length >= 7) phone = normalizeUniqueid(row[keys[6]]);
                if (!lastUpdate && keys.length >= 9) lastUpdate = normalizeDate(row[keys[8]]);
                if (!licenseEnd && keys.length >= 14) licenseEnd = normalizeDate(row[keys[13]] || row[keys[11]]);

                if (uniqueid) {
                  rows.push({ uniqueid, lastUpdate, name, phone, licenseEnd });
                }
              });
              resolve(rows);
            } catch (err) {
              reject(err);
            }
          },
          error: (err) => reject(err)
        });
      } else {
        // XLSX / XLS
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const buffer = evt.target.result;
            const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            if (!rawData || rawData.length === 0) {
              resolve([]);
              return;
            }

            let colIdxImei = -1;
            let colIdxDate = -1;
            let colIdxName = -1;
            let colIdxPhone = -1;
            let colIdxLicenseEnd = -1;
            let colIdxExpiry = -1;

            const headerRow = rawData[0] || [];
            headerRow.forEach((cell, idx) => {
              const h = String(cell).toLowerCase().trim();
              if (h === 'uniqueid' || h === 'unique id' || h === 'imei') {
                colIdxImei = idx;
              } else if (h === 'last update' || h === 'last_update' || h === 'lastupdate') {
                colIdxDate = idx;
              } else if (h === 'name' || h === 'vehicle') {
                colIdxName = idx;
              } else if (h === 'phone' || h === 'sim') {
                colIdxPhone = idx;
              } else if (
                h === 'license end' ||
                h === 'license_end' ||
                h === 'licence end' ||
                h === 'license end date' ||
                h === 'expiry' ||
                h === 'expiry date' ||
                h === 'expiry_date' ||
                h === 'validity' ||
                h === 'valid till' ||
                h === 'valid_till' ||
                h === 'end date' ||
                h === 'expiration date' ||
                h === 'license expiry' ||
                h === 'licence date'
              ) {
                colIdxLicenseEnd = idx;
              }
            });

            if (colIdxImei === -1) {
              colIdxImei = headerRow.findIndex((c) => {
                const h = String(c).toLowerCase().trim();
                return h.includes('unique') && !h.includes('device');
              });
            }
            if (colIdxDate === -1) {
              colIdxDate = headerRow.findIndex((c) => {
                const h = String(c).toLowerCase().trim();
                return h.includes('last update');
              });
            }

            if (colIdxName === -1) colIdxName = 2;
            if (colIdxImei === -1) colIdxImei = 3;
            if (colIdxPhone === -1) colIdxPhone = 6;
            if (colIdxDate === -1) colIdxDate = 8;

            const rows = [];
            for (let r = 1; r < rawData.length; r++) {
              const row = rawData[r];
              if (!row || row.length === 0) continue;
              const rawImei = row[colIdxImei];
              const rawDate = row[colIdxDate];
              const rawName = row[colIdxName];
              const rawPhone = row[colIdxPhone];

              let rawLicense = '';
              if (colIdxLicenseEnd >= 0 && row[colIdxLicenseEnd]) {
                rawLicense = row[colIdxLicenseEnd];
              } else if (colIdxExpiry >= 0 && row[colIdxExpiry]) {
                rawLicense = row[colIdxExpiry];
              }

              const uniqueid = normalizeUniqueid(rawImei);
              if (!uniqueid) continue;

              rows.push({
                uniqueid,
                lastUpdate: normalizeDate(rawDate),
                name: rawName ? String(rawName).trim() : '',
                phone: rawPhone ? normalizeUniqueid(rawPhone) : '',
                licenseEnd: rawLicense ? normalizeDate(rawLicense) : ''
              });
            }
            resolve(rows);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(fileObj);
      }
    });
  };

  // Handle upload for a specific slot
  const handleSlotUpload = async (slotKey, fileObj) => {
    if (!fileObj) return;
    setIsProcessing(true);
    setSubmitResult(null);

    try {
      const parsedRows = await parseFileContent(fileObj);
      setSlots((prev) => ({
        ...prev,
        [slotKey]: {
          file: fileObj,
          fileName: fileObj.name,
          rows: parsedRows,
          count: parsedRows.length
        }
      }));
    } catch (err) {
      console.error(`Error parsing ${slotKey} file:`, err);
      alert(`Failed to parse ${slotKey} file: ` + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearSlot = (slotKey) => {
    setSlots((prev) => ({
      ...prev,
      [slotKey]: { file: null, fileName: '', rows: [], count: 0 }
    }));
  };

  // Build merged map of updates from uploaded slots
  const stagedUpdatesMap = useMemo(() => {
    const map = new Map();

    // Expired slot (lowest priority if device appears in multiple)
    slots.expired.rows.forEach((r) => {
      map.set(r.uniqueid, {
        status: 'Expired',
        lastUpdate: r.lastUpdate,
        name: r.name,
        phone: r.phone,
        licenseEnd: r.licenseEnd,
        sourceSlot: 'Expired'
      });
    });

    // Inactive slot
    slots.inactive.rows.forEach((r) => {
      map.set(r.uniqueid, {
        status: 'Inactive',
        lastUpdate: r.lastUpdate,
        name: r.name,
        phone: r.phone,
        licenseEnd: r.licenseEnd,
        sourceSlot: 'Inactive'
      });
    });

    // Active slot (highest priority)
    slots.active.rows.forEach((r) => {
      map.set(r.uniqueid, {
        status: 'Active',
        lastUpdate: r.lastUpdate,
        name: r.name,
        phone: r.phone,
        licenseEnd: r.licenseEnd,
        sourceSlot: 'Active'
      });
    });

    return map;
  }, [slots]);

  const totalUploadedRows = slots.active.count + slots.inactive.count + slots.expired.count;
  const hasUploads = totalUploadedRows > 0;

  // Compute master comparison diffs with all 10 columns
  const masterDiffs = useMemo(() => {
    if (devices.length === 0) return [];

    return devices.map((d) => {
      const imei = normalizeUniqueid(d.imei);
      const currentStatus = d.roadcastStatus || 'Active';
      const currentDate = d.lastUpdate || '';
      const currentVehicle = d.vehicle || '';
      const currentSim = d.sim || '';

      const staged = stagedUpdatesMap.get(imei);

      if (staged) {
        const newStatus = staged.status;
        const newDate = staged.lastUpdate || currentDate;
        const newVehicle = syncNames && staged.name ? staged.name : currentVehicle;
        const newSim = syncPhones && staged.phone ? staged.phone : currentSim;
        const currentLicenseEnd = d.licenseEnd || '';
        const newLicenseEnd = syncLicenseEnd && staged.licenseEnd ? staged.licenseEnd : currentLicenseEnd;
        const isLicenseRenewed = Boolean(staged.licenseEnd && staged.licenseEnd !== currentLicenseEnd);

        const isChanged =
          newStatus !== currentStatus ||
          (newDate && newDate !== currentDate) ||
          (newVehicle && newVehicle !== currentVehicle) ||
          (newSim && newSim !== currentSim) ||
          (newLicenseEnd && newLicenseEnd !== currentLicenseEnd);

        return {
          sr: d.sr,
          currentVehicle: currentVehicle,
          newVehicle: newVehicle,
          vehicle: newVehicle,
          uniqueid: imei,
          currentSim: currentSim,
          newSim: newSim,
          sim: newSim,
          city: d.city,
          currentStatus: currentStatus,
          newStatus: newStatus,
          currentDate: currentDate,
          newDate: newDate,
          currentLicenseEnd: currentLicenseEnd,
          newLicenseEnd: newLicenseEnd,
          isLicenseRenewed: isLicenseRenewed,
          finalStatus: d.finalStatus || '',
          vtsType: d.vtsType || 'VTS Package 4G',
          remark: d.remark || '',
          isUpdatedInThisRun: true,
          isChanged: isChanged,
          sourceSlot: staged.sourceSlot
        };
      } else {
        // Untouched - keep current values
        return {
          sr: d.sr,
          currentVehicle: currentVehicle,
          newVehicle: currentVehicle,
          vehicle: currentVehicle,
          uniqueid: imei,
          currentSim: currentSim,
          newSim: currentSim,
          sim: currentSim,
          city: d.city,
          currentStatus: currentStatus,
          newStatus: currentStatus,
          currentDate: currentDate,
          newDate: currentDate,
          currentLicenseEnd: d.licenseEnd || '',
          newLicenseEnd: d.licenseEnd || '',
          isLicenseRenewed: false,
          finalStatus: d.finalStatus || '',
          vtsType: d.vtsType || 'VTS Package 4G',
          remark: d.remark || '',
          isUpdatedInThisRun: false,
          isChanged: false,
          sourceSlot: 'Untouched'
        };
      }
    });
  }, [devices, stagedUpdatesMap, syncNames, syncPhones, syncLicenseEnd]);

  // Overall Fleet Totals
  const fullFleetSummary = useMemo(() => {
    const total = masterDiffs.length;
    let activeTotal = 0;
    let inactiveTotal = 0;
    let expiredTotal = 0;
    let removedTotal = 0;
    let otherTotal = 0;
    let updatedInThisRun = 0;
    let changedStatusCount = 0;
    let renewedLicensesCount = 0;

    masterDiffs.forEach((d) => {
      const statusLower = d.newStatus.toLowerCase();
      if (statusLower === 'active') activeTotal++;
      else if (statusLower === 'inactive') inactiveTotal++;
      else if (statusLower === 'expired' || statusLower === 'expaired') expiredTotal++;
      else if (statusLower.includes('removed')) removedTotal++;
      else otherTotal++;

      if (d.isUpdatedInThisRun) updatedInThisRun++;
      if (d.isChanged) changedStatusCount++;
      if (d.isLicenseRenewed) renewedLicensesCount++;
    });

    return {
      total,
      activeTotal,
      inactiveTotal,
      expiredTotal,
      removedTotal,
      otherTotal,
      updatedInThisRun,
      changedStatusCount,
      renewedLicensesCount
    };
  }, [masterDiffs]);

  // ----------------------------------------------------
  // Cascading Dynamic Filters
  // ----------------------------------------------------

  // Step 1: Base list matching Search and Status Quick Chips
  const baseList = useMemo(() => {
    return masterDiffs.filter((d) => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        d.vehicle?.toLowerCase().includes(q) ||
        d.uniqueid?.toLowerCase().includes(q) ||
        d.sim?.toLowerCase().includes(q) ||
        d.city?.toLowerCase().includes(q) ||
        d.remark?.toLowerCase().includes(q);

      let matchChip = true;
      if (filterType === 'changed') {
        matchChip = d.isChanged;
      } else if (filterType === 'updated_run') {
        matchChip = d.isUpdatedInThisRun;
      } else if (filterType === 'active') {
        matchChip = d.newStatus.toLowerCase() === 'active';
      } else if (filterType === 'inactive') {
        matchChip = d.newStatus.toLowerCase() === 'inactive';
      } else if (filterType === 'expired') {
        matchChip = d.newStatus.toLowerCase() === 'expired' || d.newStatus.toLowerCase() === 'expaired';
      } else if (filterType === 'renewed') {
        matchChip = d.isLicenseRenewed;
      }

      return matchSearch && matchChip;
    });
  }, [masterDiffs, searchTerm, filterType]);

  // Dynamic Cities based on baseList
  const dynamicCities = useMemo(() => {
    const map = new Map();
    baseList.forEach((d) => {
      if (d.city) map.set(d.city, (map.get(d.city) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [baseList]);

  const effectiveCity = dynamicCities.some(([c]) => c === cityFilter) ? cityFilter : 'All';

  // Step 2: Filter by City
  const cityFilteredList = useMemo(() => {
    if (effectiveCity === 'All') return baseList;
    return baseList.filter((d) => d.city === effectiveCity);
  }, [baseList, effectiveCity]);

  // Dynamic Final Statuses based on cityFilteredList
  const dynamicFinalStatuses = useMemo(() => {
    const map = new Map();
    cityFilteredList.forEach((d) => {
      if (d.finalStatus) map.set(d.finalStatus, (map.get(d.finalStatus) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [cityFilteredList]);

  const effectiveFinalStatus = dynamicFinalStatuses.some(([fs]) => fs.toLowerCase() === finalStatusFilter.toLowerCase()) ? finalStatusFilter : 'All';

  // Step 3: Filter by Final Status
  const finalStatusFilteredList = useMemo(() => {
    if (effectiveFinalStatus === 'All') return cityFilteredList;
    return cityFilteredList.filter((d) => (d.finalStatus || '').toLowerCase() === effectiveFinalStatus.toLowerCase());
  }, [cityFilteredList, effectiveFinalStatus]);

  // Dynamic VTS Types based on finalStatusFilteredList
  const dynamicVtsTypes = useMemo(() => {
    const map = new Map();
    finalStatusFilteredList.forEach((d) => {
      if (d.vtsType) map.set(d.vtsType, (map.get(d.vtsType) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [finalStatusFilteredList]);

  const effectiveVtsType = dynamicVtsTypes.some(([vt]) => vt.toLowerCase() === vtsTypeFilter.toLowerCase()) ? vtsTypeFilter : 'All';

  // Step 4: Final Filtered list
  const filteredDiffs = useMemo(() => {
    if (effectiveVtsType === 'All') return finalStatusFilteredList;
    return finalStatusFilteredList.filter((d) => (d.vtsType || '').toLowerCase() === effectiveVtsType.toLowerCase());
  }, [finalStatusFilteredList, effectiveVtsType]);

  // Pagination calculation
  const effectivePageSize = pageSize === 0 ? filteredDiffs.length || 1 : pageSize;
  const totalPages = Math.ceil(filteredDiffs.length / effectivePageSize) || 1;

  const paginatedDiffs = useMemo(() => {
    if (pageSize === 0) return filteredDiffs;
    const start = (currentPage - 1) * pageSize;
    return filteredDiffs.slice(start, start + pageSize);
  }, [filteredDiffs, currentPage, pageSize]);

  const handleResetFilters = () => {
    handleSearchChange('');
    setFilterType('all');
    setCityFilter('All');
    setFinalStatusFilter('All');
    setVtsTypeFilter('All');
    setCurrentPage(1);
  };

  // Execute Batch Update to Google Sheets
  const handleApplyUpdate = async () => {
    if (!hasUploads) {
      alert('Please upload at least one Roadcast export file before updating.');
      return;
    }

    const payloadUpdates = [];
    stagedUpdatesMap.forEach((val, uniqueid) => {
      payloadUpdates.push({
        uniqueid,
        status: val.status,
        lastUpdate: val.lastUpdate,
        name: syncNames && val.name ? val.name : undefined,
        phone: syncPhones && val.phone ? val.phone : undefined,
        licenseEnd: syncLicenseEnd && val.licenseEnd ? val.licenseEnd : undefined
      });
    });

    if (payloadUpdates.length === 0) {
      alert('No matching devices found to update.');
      return;
    }

    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      const res = await submitRoadcastImport(payloadUpdates);
      if (res.success) {
        setSubmitResult({
          success: true,
          message: res.message || `Successfully updated ${res.updatedCount || payloadUpdates.length} devices in Google Sheets!`
        });
        if (onRefresh) {
          onRefresh();
        }
      } else {
        setSubmitResult({
          success: false,
          message: res.error || 'Failed to update Google Sheets. Please check your connection.'
        });
      }
    } catch (err) {
      setSubmitResult({
        success: false,
        message: 'Sync error: ' + err.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const slotConfigs = [
    {
      key: 'active',
      label: '1. Active devices',
      badgeClass: 'status-active',
      desc: 'Sets matched devices to Active'
    },
    {
      key: 'inactive',
      label: '2. Inactive devices',
      badgeClass: 'status-soon',
      desc: 'Sets matched devices to Inactive'
    },
    {
      key: 'expired',
      label: '3. Expired devices',
      badgeClass: 'status-expired',
      desc: 'Sets matched devices to Expired (Optional)'
    }
  ];

  const hasActiveFilters =
    Boolean(searchTerm) ||
    filterType !== 'all' ||
    cityFilter !== 'All' ||
    finalStatusFilter !== 'All' ||
    vtsTypeFilter !== 'All';

  return (
    <div className="import-roadcast-view">
      <div className="page-header-row">
        <div>
          <h2>Bulk Roadcast Status & Device Sync</h2>
          <p>
            Upload your Roadcast export files. Automatically synchronizes <b>Status</b>, <b>Last Update</b>, <b>Vehicle Names</b>, and <b>Phone / SIM numbers</b> by IMEI.
          </p>
        </div>
        <div className="header-actions-group">
          <button
            className="secondary-button"
            onClick={() => exportToExcelFile(filteredDiffs, `900_Roadcast_Import_Filtered`)}
            title="Download current filtered data as Excel spreadsheet"
          >
            <Icon name="download" size={15} /> Export Excel ({filteredDiffs.length})
          </button>
          <button
            className="secondary-button"
            onClick={() => exportToCsvFile(filteredDiffs, `900_Roadcast_Import_Filtered`)}
            title="Download current filtered data as CSV"
          >
            <Icon name="download" size={15} /> Export CSV
          </button>
          {hasUploads && (
            <button
              className="primary-button"
              onClick={handleApplyUpdate}
              disabled={isSubmitting}
            >
              <Icon name="upload" size={16} />
              {isSubmitting ? 'Updating Google Sheets...' : `Update Sheet (${stagedUpdatesMap.size} Devices)`}
            </button>
          )}
        </div>
      </div>

      {/* 3 Upload Slots */}
      <div className="slots-grid">
        {slotConfigs.map((slot) => {
          const slotData = slots[slot.key];
          const hasFile = !!slotData.fileName;

          return (
            <div
              key={slot.key}
              className={`upload-slot-card ${hasFile ? 'filled' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleSlotUpload(slot.key, e.dataTransfer.files[0]);
                }
              }}
            >
              <div className="slot-header">
                <span className={`status-badge ${slot.badgeClass}`}>{slot.label}</span>
                {hasFile && (
                  <button
                    className="clear-slot-btn"
                    onClick={() => handleClearSlot(slot.key)}
                    title="Remove file"
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>

              <div className="slot-body">
                <Icon name="upload" size={24} className="slot-icon" />
                {hasFile ? (
                  <div className="slot-file-info">
                    <strong className="slot-filename">{slotData.fileName}</strong>
                    <span className="slot-count">{slotData.count} devices parsed</span>
                    {slotData.rows[0] && (
                      <small className="slot-sample mono">
                        Sample: {slotData.rows[0].name || slotData.rows[0].uniqueid}
                      </small>
                    )}
                  </div>
                ) : (
                  <div className="slot-empty-info">
                    <p>Drop .csv or .xlsx here</p>
                    <small>{slot.desc}</small>
                  </div>
                )}
              </div>

              <label className="slot-upload-label">
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleSlotUpload(slot.key, e.target.files[0]);
                    }
                  }}
                  style={{ display: 'none' }}
                />
                {hasFile ? 'Replace File' : 'Browse File'}
              </label>
            </div>
          );
        })}
      </div>

      {/* Sync Options Toggles */}
      <div className="panel" style={{ padding: '12px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="refresh" size={16} style={{ color: 'var(--color-primary)' }} />
            <strong style={{ fontSize: '13px' }}>Automatic Sync Options from Roadcast Export:</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <label className="checkbox-filter-label" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={syncNames}
                onChange={(e) => setSyncNames(e.target.checked)}
              />
              <span>Sync Vehicle Names (Col B)</span>
            </label>
            <label className="checkbox-filter-label" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={syncPhones}
                onChange={(e) => setSyncPhones(e.target.checked)}
              />
              <span>Sync Phone / SIM Numbers (Col D)</span>
            </label>
            <label className="checkbox-filter-label" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={syncLicenseEnd}
                onChange={(e) => setSyncLicenseEnd(e.target.checked)}
              />
              <span style={{ color: '#4ade80', fontWeight: 600 }}>Sync License End / Expiry (Col L & Renewal Sheet)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Processing & Submit Banners */}
      {isProcessing && (
        <div className="alert-banner">
          <Icon name="refresh" size={16} className="spin" />
          <span>Parsing uploaded file...</span>
        </div>
      )}

      {submitResult && (
        <div className={`alert-banner ${submitResult.success ? 'success' : 'error'}`}>
          <Icon name={submitResult.success ? 'check' : 'alert'} size={18} />
          <span>{submitResult.message}</span>
        </div>
      )}

      {/* Fleet Totals Summary */}
      <section className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon green"><span /></span>
          <span className="stat-label">Total Active Fleet</span>
          <strong>{fullFleetSummary.activeTotal}</strong>
          <span className="stat-detail">
            {fullFleetSummary.total ? `${((fullFleetSummary.activeTotal / fullFleetSummary.total) * 100).toFixed(1)}% of fleet` : ''}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-icon amber"><span /></span>
          <span className="stat-label">Total Inactive Fleet</span>
          <strong>{fullFleetSummary.inactiveTotal}</strong>
          <span className="stat-detail">
            {fullFleetSummary.total ? `${((fullFleetSummary.inactiveTotal / fullFleetSummary.total) * 100).toFixed(1)}% of fleet` : ''}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-icon red"><span /></span>
          <span className="stat-label">Total Expired Fleet</span>
          <strong>{fullFleetSummary.expiredTotal}</strong>
          <span className="stat-detail">
            {fullFleetSummary.total ? `${((fullFleetSummary.expiredTotal / fullFleetSummary.total) * 100).toFixed(1)}% of fleet` : ''}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-icon green"><span /></span>
          <span className="stat-label">Renewed Licenses</span>
          <strong style={{ color: '#4ade80' }}>{fullFleetSummary.renewedLicensesCount}</strong>
          <span className="stat-detail">
            Col L & Renewal Tab auto-sync
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-icon slate"><span /></span>
          <span className="stat-label">Updated in This Run</span>
          <strong>{fullFleetSummary.updatedInThisRun}</strong>
          <span className="stat-detail">
            {fullFleetSummary.changedStatusCount} status/data changes
          </span>
        </div>
      </section>

      {/* Diff Table & Filter Bar */}
      <div className="panel table-panel">
        <div className="panel-heading" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3>Fleet Status & Preview</h3>
            <p>
              Showing {filteredDiffs.length} of {masterDiffs.length} devices &bull; Dynamic cascading filters
            </p>
          </div>

          <div className="quick-chips">
            <button
              className={`chip ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => { setFilterType('all'); setCurrentPage(1); }}
            >
              All ({masterDiffs.length})
            </button>
            <button
              className={`chip ${filterType === 'updated_run' ? 'active' : ''}`}
              onClick={() => { setFilterType('updated_run'); setCurrentPage(1); }}
            >
              In Uploads ({fullFleetSummary.updatedInThisRun})
            </button>
            <button
              className={`chip ${filterType === 'changed' ? 'active' : ''}`}
              onClick={() => { setFilterType('changed'); setCurrentPage(1); }}
            >
              Changed Only ({fullFleetSummary.changedStatusCount})
            </button>
            <button
              className={`chip ${filterType === 'renewed' ? 'active' : ''}`}
              onClick={() => { setFilterType('renewed'); setCurrentPage(1); }}
              style={fullFleetSummary.renewedLicensesCount > 0 ? { border: '1px solid rgba(34, 197, 94, 0.4)', color: '#4ade80', fontWeight: 600 } : {}}
            >
              Renewed ({fullFleetSummary.renewedLicensesCount})
            </button>
            <button
              className={`chip ${filterType === 'active' ? 'active' : ''}`}
              onClick={() => { setFilterType('active'); setCurrentPage(1); }}
            >
              Active ({fullFleetSummary.activeTotal})
            </button>
            <button
              className={`chip ${filterType === 'inactive' ? 'active' : ''}`}
              onClick={() => { setFilterType('inactive'); setCurrentPage(1); }}
            >
              Inactive ({fullFleetSummary.inactiveTotal})
            </button>
            <button
              className={`chip ${filterType === 'expired' ? 'active' : ''}`}
              onClick={() => { setFilterType('expired'); setCurrentPage(1); }}
            >
              Expired ({fullFleetSummary.expiredTotal})
            </button>
          </div>
        </div>

        {/* Dynamic Cascading Filter Bar */}
        <div className="filter-toolbar extended-filters" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              type="text"
              placeholder="Search vehicle, IMEI, phone, city..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {searchTerm && (
              <button className="clear-search" onClick={() => handleSearchChange('')}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <div className="filter-selects-wrap">
            {/* Dynamic City Filter */}
            <div className="select-wrap">
              <label>City:</label>
              <select
                value={effectiveCity}
                onChange={(e) => { setCityFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="All">All Cities ({baseList.length})</option>
                {dynamicCities.map(([cityName, count]) => (
                  <option key={cityName} value={cityName}>
                    {cityName} ({count})
                  </option>
                ))}
              </select>
            </div>

            {/* Dynamic Final Status Filter */}
            <div className="select-wrap">
              <label>Final Status (Col H):</label>
              <select
                value={effectiveFinalStatus}
                onChange={(e) => { setFinalStatusFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="All">All Final Statuses ({cityFilteredList.length})</option>
                {dynamicFinalStatuses.map(([statusName, count]) => (
                  <option key={statusName} value={statusName}>
                    {statusName} ({count})
                  </option>
                ))}
              </select>
            </div>

            {/* Dynamic VTS Type Filter */}
            <div className="select-wrap">
              <label>VTS Type (Col I):</label>
              <select
                value={effectiveVtsType}
                onChange={(e) => { setVtsTypeFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="All">All VTS Types ({finalStatusFilteredList.length})</option>
                {dynamicVtsTypes.map(([typeName, count]) => (
                  <option key={typeName} value={typeName}>
                    {typeName} ({count})
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button className="secondary-button compact" onClick={handleResetFilters}>
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Table Controls (Count + Download Buttons + Page Size Selector with 10 rows) */}
        <div className="table-controls-bar">
          <div className="table-count-summary">
            Showing <b>{filteredDiffs.length === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1}</b>–
            <b>{Math.min(currentPage * effectivePageSize, filteredDiffs.length)}</b> of <b>{filteredDiffs.length}</b> devices
          </div>

          <div className="table-actions-inline">
            <button
              className="table-download-btn excel"
              onClick={() => exportToExcelFile(filteredDiffs, `900_Roadcast_Preview_${cityFilter}`)}
              title="Download visible filtered table to Excel (.xlsx)"
            >
              <Icon name="download" size={13} /> Excel ({filteredDiffs.length})
            </button>
            <button
              className="table-download-btn csv"
              onClick={() => exportToCsvFile(filteredDiffs, `900_Roadcast_Preview_${cityFilter}`)}
              title="Download visible filtered table to CSV"
            >
              <Icon name="download" size={13} /> CSV
            </button>

            <div className="table-page-size-selector">
              <label>Show:</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10 rows</option>
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
                <option value={250}>250 rows</option>
                <option value={0}>All ({filteredDiffs.length} rows)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SR.</th>
                <th>NAME (VEHICLE)</th>
                <th>UNIQUEID (IMEI)</th>
                <th>PHONE (SIM)</th>
                <th>CITY</th>
                <th>STATUS ON ROADCAST (COL F)</th>
                <th>LAST UPDATE (COL G)</th>
                <th>LICENSE END (COL L)</th>
                <th>FINAL STATUS (COL H)</th>
                <th>VTS TYPE (COL I)</th>
                <th>UPLOAD SOURCE</th>
              </tr>
            </thead>
            <tbody>
              {paginatedDiffs.map((diff, idx) => (
                <tr key={diff.uniqueid || idx}>
                  <td className="text-muted">{diff.sr || (currentPage - 1) * effectivePageSize + idx + 1}</td>
                  <td>
                    {diff.newVehicle && diff.newVehicle !== diff.currentVehicle ? (
                      <div className="diff-name-cell">
                        <span className="old-val">{diff.currentVehicle}</span>
                        <span className="diff-arrow">&rarr;</span>
                        <strong>{diff.newVehicle}</strong>
                      </div>
                    ) : (
                      <strong>{diff.vehicle}</strong>
                    )}
                  </td>
                  <td className="mono">{diff.uniqueid}</td>
                  <td className="mono">
                    {diff.newSim && diff.newSim !== diff.currentSim ? (
                      <div className="diff-name-cell">
                        <span className="old-val">{diff.currentSim || 'None'}</span>
                        <span className="diff-arrow">&rarr;</span>
                        <span>{diff.newSim}</span>
                      </div>
                    ) : (
                      diff.sim || '—'
                    )}
                  </td>
                  <td><span className="city-tag">{diff.city}</span></td>
                  <td>
                    <div className="diff-status-cell">
                      {diff.isChanged ? (
                        <>
                          <span className="old-val">{diff.currentStatus || 'Empty'}</span>
                          <span className="diff-arrow">&rarr;</span>
                          <span className={`status-badge ${getStatusBadge(diff.newStatus)}`}>
                            {diff.newStatus}
                          </span>
                        </>
                      ) : (
                        <span className={`status-badge ${getStatusBadge(diff.newStatus)}`}>
                          {diff.newStatus}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="diff-date-cell">
                      <span className="old-date">{diff.currentDate || '—'}</span>
                      {diff.newDate && diff.newDate !== diff.currentDate && (
                        <>
                          <span className="diff-arrow">&rarr;</span>
                          <span className="new-date">{diff.newDate}</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="diff-date-cell">
                      {diff.isLicenseRenewed ? (
                        <>
                          <span className="old-date">{diff.currentLicenseEnd || '—'}</span>
                          <span className="diff-arrow">&rarr;</span>
                          <strong className="new-date" style={{ color: '#4ade80' }}>{diff.newLicenseEnd}</strong>
                          <span style={{ fontSize: '10px', background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '1px 5px', borderRadius: '4px', marginLeft: '4px', fontWeight: 600 }}>Renewed 🎉</span>
                        </>
                      ) : (
                        <span className="text-muted">{diff.currentLicenseEnd || '—'}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`final-status-badge ${getFinalStatusClass(diff.finalStatus)}`}>
                      {diff.finalStatus || '—'}
                    </span>
                  </td>
                  <td>
                    <small className="text-muted">{diff.vtsType || 'VTS Package 4G'}</small>
                  </td>
                  <td>
                    <span className={`diff-tag ${diff.isUpdatedInThisRun ? 'updated' : 'unchanged'}`}>
                      {diff.isUpdatedInThisRun ? `Slot: ${diff.sourceSlot}` : 'Untouched'}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredDiffs.length === 0 && (
                <tr>
                  <td colSpan="11" className="empty-state">
                    No devices match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {pageSize !== 0 && totalPages > 1 && (
          <div className="pagination-bar">
            <span>
              Page {currentPage} of {totalPages} ({filteredDiffs.length} total records)
            </span>
            <div className="pagination-buttons">
              <button
                className="quiet-button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                title="First Page"
              >
                &laquo; First
              </button>
              <button
                className="quiet-button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                if (pageNum > totalPages) pageNum = totalPages - 4 + i;
                if (pageNum < 1) pageNum = i + 1;
                if (pageNum > totalPages) return null;

                return (
                  <button
                    key={pageNum}
                    className={`page-num ${currentPage === pageNum ? 'active' : ''}`}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                className="quiet-button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
              <button
                className="quiet-button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                title="Last Page"
              >
                Last &raquo;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getStatusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('active')) return 'status-active';
  if (s.includes('inactive') || s.includes('soon')) return 'status-soon';
  if (s.includes('expired') || s.includes('expaired')) return 'status-expired';
  if (s.includes('damaged')) return 'status-damaged';
  return 'status-other';
}

function getFinalStatusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('running')) return 'final-running';
  if (s.includes('available')) return 'final-available';
  if (s.includes('lost') || s.includes('not found')) return 'final-lost';
  if (s.includes('sold')) return 'final-sold';
  if (s.includes('damage')) return 'final-damaged';
  return 'final-default';
}
