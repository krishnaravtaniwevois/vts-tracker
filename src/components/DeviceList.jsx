import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from './Icons';
import { updateDeviceRemark, refreshFinalStatus, updateStatusOverride, clearFleetCache } from '../services/api';
import { exportToExcelFile, exportToCsvFile } from '../services/exportUtils';
import { AddDeviceModal } from './AddDeviceModal';

export function DeviceList({
  devices = [],
  onSelectDevice,
  initialStatusFilter = 'All',
  initialCityFilter = 'All',
  searchQuery = '',
  onSearchChange,
  onRefresh
}) {
  const [localSearch, setLocalSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [cityFilter, setCityFilter] = useState(initialCityFilter);
  const [finalStatusFilter, setFinalStatusFilter] = useState('All');
  const [vtsTypeFilter, setVtsTypeFilter] = useState('All');

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
      setCurrentPage(1);
    }
  }, [initialStatusFilter]);

  useEffect(() => {
    if (initialCityFilter) {
      setCityFilter(initialCityFilter);
      setCurrentPage(1);
    }
  }, [initialCityFilter]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // 10, 25, 50, 100, 250, 0 (All)

  // Add Device Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Final Status Refresh state
  const [isRefreshingFinalStatus, setIsRefreshingFinalStatus] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  const [refreshNotice, setRefreshNotice] = useState(null);

  // Status Override Modal state
  const [overrideModalDevice, setOverrideModalDevice] = useState(null);
  const [overrideInput, setOverrideInput] = useState('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  // Inline remark edit state: { imei: string, value: string }
  const [editingImei, setEditingImei] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingImei, setSavingImei] = useState(null);
  const [saveStatus, setSaveStatus] = useState({}); // { [imei]: { success: boolean, message: string } }

  const search = onSearchChange ? searchQuery : localSearch;

  const handleSearchChange = (val) => {
    if (onSearchChange) {
      onSearchChange(val);
    } else {
      setLocalSearch(val);
    }
    setCurrentPage(1);
  };

  const handleRefreshFinalStatus = async () => {
    setIsRefreshingFinalStatus(true);
    setRefreshNotice(null);
    try {
      const res = await refreshFinalStatus();
      if (res.success) {
        setLastRefreshedAt(res.refreshedAt || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
        setRefreshNotice({ type: 'success', text: res.message || 'Final Status refreshed successfully!' });
        if (onRefresh) onRefresh();
      } else {
        setRefreshNotice({ type: 'error', text: res.error || 'Failed to refresh Final Status' });
      }
    } catch (err) {
      setRefreshNotice({ type: 'error', text: err.message });
    } finally {
      setIsRefreshingFinalStatus(false);
      setTimeout(() => setRefreshNotice(null), 5000);
    }
  };

  const handleOpenOverride = (device, e) => {
    e.stopPropagation();
    setOverrideModalDevice(device);
    setOverrideInput(device.statusOverride || '');
  };

  const handleSaveOverride = async () => {
    if (!overrideModalDevice) return;
    const targetImei = overrideModalDevice.imei;
    setIsSavingOverride(true);
    try {
      const res = await updateStatusOverride(targetImei, overrideInput.trim());
      if (res.success) {
        setOverrideModalDevice(null);
        if (onRefresh) onRefresh();
      } else {
        alert(res.error || 'Failed to update status override');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleClearOverride = async (device, e) => {
    e.stopPropagation();
    if (!window.confirm(`Clear status override for ${device.vehicle} (${device.imei})?`)) return;
    try {
      const res = await updateStatusOverride(device.imei, '');
      if (res.success) {
        device.statusOverride = '';
        device.displayStatus = device.finalStatus || '—';
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // ----------------------------------------------------
  // Dynamic Cascading Filters Architecture
  // ----------------------------------------------------

  // Step 1: Base list matching Search query
  const searchFilteredList = useMemo(() => {
    return devices.filter((d) => {
      const q = search.toLowerCase().trim();
      if (!q) return true;
      return (
        (d.vehicle && d.vehicle.toLowerCase().includes(q)) ||
        (d.imei && d.imei.toLowerCase().includes(q)) ||
        (d.sim && d.sim.toLowerCase().includes(q)) ||
        (d.city && d.city.toLowerCase().includes(q)) ||
        (d.remark && d.remark.toLowerCase().includes(q))
      );
    });
  }, [devices, search]);

  // Dynamic Cities based on searchFilteredList
  const dynamicCities = useMemo(() => {
    const map = new Map();
    searchFilteredList.forEach((d) => {
      if (d.city) map.set(d.city, (map.get(d.city) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [searchFilteredList]);

  const effectiveCity = dynamicCities.some(([c]) => c === cityFilter) ? cityFilter : 'All';

  // Step 2: Filter by City
  const cityFilteredList = useMemo(() => {
    if (effectiveCity === 'All') return searchFilteredList;
    return searchFilteredList.filter((d) => d.city === effectiveCity);
  }, [searchFilteredList, effectiveCity]);

  // Dynamic Roadcast Statuses based on cityFilteredList
  const dynamicRoadcastStatuses = useMemo(() => {
    const map = new Map();
    cityFilteredList.forEach((d) => {
      const status = d.roadcastStatus || d.status || 'Active';
      map.set(status, (map.get(status) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [cityFilteredList]);

  const effectiveStatus = dynamicRoadcastStatuses.some(([s]) => s.toLowerCase() === statusFilter.toLowerCase()) ? statusFilter : 'All';

  // Step 3: Filter by Roadcast Status
  const statusFilteredList = useMemo(() => {
    if (effectiveStatus === 'All') return cityFilteredList;
    return cityFilteredList.filter((d) => {
      const current = d.roadcastStatus || d.status || '';
      return current.toLowerCase() === effectiveStatus.toLowerCase();
    });
  }, [cityFilteredList, effectiveStatus]);

  // Dynamic Final Statuses based on statusFilteredList
  const dynamicFinalStatuses = useMemo(() => {
    const map = new Map();
    statusFilteredList.forEach((d) => {
      const fs = d.finalStatus || '—';
      map.set(fs, (map.get(fs) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [statusFilteredList]);

  const effectiveFinalStatus = dynamicFinalStatuses.some(([fs]) => fs.toLowerCase() === finalStatusFilter.toLowerCase()) ? finalStatusFilter : 'All';

  // Step 4: Filter by Final Status
  const finalStatusFilteredList = useMemo(() => {
    if (effectiveFinalStatus === 'All') return statusFilteredList;
    return statusFilteredList.filter((d) => {
      const fs = d.finalStatus || '—';
      return fs.toLowerCase() === effectiveFinalStatus.toLowerCase();
    });
  }, [statusFilteredList, effectiveFinalStatus]);

  // Dynamic VTS Types based on finalStatusFilteredList
  const dynamicVtsTypes = useMemo(() => {
    const map = new Map();
    finalStatusFilteredList.forEach((d) => {
      if (d.vtsType) map.set(d.vtsType, (map.get(d.vtsType) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [finalStatusFilteredList]);

  const effectiveVtsType = dynamicVtsTypes.some(([vt]) => vt.toLowerCase() === vtsTypeFilter.toLowerCase()) ? vtsTypeFilter : 'All';

  // Step 5: Final Filtered devices
  const filtered = useMemo(() => {
    if (effectiveVtsType === 'All') return finalStatusFilteredList;
    return finalStatusFilteredList.filter((d) => (d.vtsType || '').toLowerCase() === effectiveVtsType.toLowerCase());
  }, [finalStatusFilteredList, effectiveVtsType]);

  const effectivePageSize = pageSize === 0 ? filtered.length || 1 : pageSize;
  const totalPages = Math.ceil(filtered.length / effectivePageSize) || 1;

  const paginated = useMemo(() => {
    if (pageSize === 0) return filtered;
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const handleResetFilters = () => {
    handleSearchChange('');
    setStatusFilter('All');
    setCityFilter('All');
    setFinalStatusFilter('All');
    setVtsTypeFilter('All');
    setCurrentPage(1);
  };

  // Start inline editing of Remark
  const handleStartEditRemark = (device, e) => {
    e.stopPropagation();
    setEditingImei(device.imei);
    setEditingValue(device.remark || '');
  };

  // Save inline Remark
  const handleSaveRemark = async (device) => {
    if (editingImei !== device.imei) return;
    const newValue = editingValue.trim();
    setEditingImei(null);

    if (newValue === (device.remark || '').trim()) {
      return;
    }

    setSavingImei(device.imei);
    try {
      const res = await updateDeviceRemark(device.imei, newValue);
      if (res.success) {
        setSaveStatus((prev) => ({
          ...prev,
          [device.imei]: { success: true, message: 'Saved' }
        }));
        device.remark = newValue;
        setTimeout(() => {
          setSaveStatus((prev) => {
            const next = { ...prev };
            delete next[device.imei];
            return next;
          });
        }, 2500);
        if (onRefresh) onRefresh();
      } else {
        setSaveStatus((prev) => ({
          ...prev,
          [device.imei]: { success: false, message: res.error || 'Save failed' }
        }));
      }
    } catch (err) {
      setSaveStatus((prev) => ({
        ...prev,
        [device.imei]: { success: false, message: err.message || 'Error' }
      }));
    } finally {
      setSavingImei(null);
    }
  };

  const handleRemarkKeyDown = (e, device) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveRemark(device);
    } else if (e.key === 'Escape') {
      setEditingImei(null);
    }
  };

  const hasActiveFilters =
    Boolean(search) ||
    statusFilter !== 'All' ||
    cityFilter !== 'All' ||
    finalStatusFilter !== 'All' ||
    vtsTypeFilter !== 'All';

  return (
    <div className="device-list-view">
      <div className="page-header-row">
        <div>
          <h2>Master Fleet Directory ("900" Sheet)</h2>
          <p>Browse and manage all {devices.length} registered vehicles with live Google Sheets sync</p>
        </div>
        <div className="header-actions-group">
          <button
            className="primary-button"
            onClick={() => setIsAddModalOpen(true)}
            title="Onboard a new VTS device to master sheet"
          >
            <Icon name="upload" size={15} /> + Add VTS Device
          </button>
          <button
            className="secondary-button"
            onClick={() => exportToExcelFile(filtered, `900_Fleet_Filtered`)}
            title="Download current filtered data as Excel spreadsheet"
          >
            <Icon name="download" size={15} /> Export Excel ({filtered.length})
          </button>
          <button
            className="secondary-button"
            onClick={() => exportToCsvFile(filtered, `900_Fleet_Filtered`)}
            title="Download current filtered data as CSV"
          >
            <Icon name="download" size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Dynamic Cascading Filter Bar */}
      <div className="filter-toolbar extended-filters">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            type="text"
            placeholder="Search by Vehicle Name, Uniqueid (IMEI), Phone, City, Status, Remark..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {search && (
            <button className="clear-search" onClick={() => handleSearchChange('')}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        <div className="filter-selects-wrap">
          {/* Dynamic City Filter */}
          <div className="select-wrap">
            <label>City / Site:</label>
            <select
              value={effectiveCity}
              onChange={(e) => {
                setCityFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="All">All Cities ({searchFilteredList.length})</option>
              {dynamicCities.map(([cityName, count]) => (
                <option key={cityName} value={cityName}>
                  {cityName} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic Roadcast Status Filter */}
          <div className="select-wrap">
            <label>Roadcast Status (Col F):</label>
            <select
              value={effectiveStatus}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="All">All Statuses ({cityFilteredList.length})</option>
              {dynamicRoadcastStatuses.map(([statusName, count]) => (
                <option key={statusName} value={statusName}>
                  {statusName} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic Final Status Filter */}
          <div className="select-wrap">
            <label>Final Status (Col H):</label>
            <select
              value={effectiveFinalStatus}
              onChange={(e) => {
                setFinalStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="All">All Final Statuses ({statusFilteredList.length})</option>
              {dynamicFinalStatuses.map(([fsName, count]) => (
                <option key={fsName} value={fsName}>
                  {fsName} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic VTS Type Filter */}
          <div className="select-wrap">
            <label>VTS Type (Col I):</label>
            <select
              value={effectiveVtsType}
              onChange={(e) => {
                setVtsTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="All">All VTS Types ({finalStatusFilteredList.length})</option>
              {dynamicVtsTypes.map(([vtName, count]) => (
                <option key={vtName} value={vtName}>
                  {vtName} ({count})
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button className="secondary-button compact" onClick={handleResetFilters}>
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Table Matching '900' Sheet 10 Columns */}
      <div className="panel table-panel">
        <div className="table-controls-bar">
          <div className="table-count-summary">
            Showing <b>{filtered.length === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1}</b>–
            <b>{Math.min(currentPage * effectivePageSize, filtered.length)}</b> of <b>{filtered.length}</b> devices
          </div>

          <div className="table-actions-inline">
            <button
              className="table-download-btn refresh-status-btn"
              onClick={handleRefreshFinalStatus}
              disabled={isRefreshingFinalStatus}
              title="Scan Vendor City Vehicle Data & Operation sheets for latest vehicle status"
            >
              <Icon name="refresh" size={13} className={isRefreshingFinalStatus ? 'spin' : ''} />
              {isRefreshingFinalStatus ? 'Refreshing...' : 'Refresh Final Status'}
            </button>
            <button
              className="table-download-btn"
              onClick={async () => {
                clearFleetCache();
                if (onRefresh) await onRefresh();
              }}
              title="Purge local browser cache and force fresh data fetch from Google Sheets"
              style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}
            >
              <Icon name="refresh" size={13} /> Force Resync (Clear Cache)
            </button>
            <span className="last-refreshed-hint" title="Last auto/manual refresh time">
              Refreshed: {lastRefreshedAt}
            </span>

            <button
              className="table-download-btn excel"
              onClick={() => exportToExcelFile(filtered, `900_Fleet_${cityFilter}`)}
              title="Download visible filtered table to Excel (.xlsx)"
            >
              <Icon name="download" size={13} /> Excel ({filtered.length})
            </button>
            <button
              className="table-download-btn csv"
              onClick={() => exportToCsvFile(filtered, `900_Fleet_${cityFilter}`)}
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
                <option value={0}>All ({filtered.length} rows)</option>
              </select>
            </div>
          </div>
        </div>

        {refreshNotice && (
          <div className={`notification-banner ${refreshNotice.type}`} style={{ margin: '8px 16px' }}>
            <Icon name={refreshNotice.type === 'success' ? 'check' : 'alert'} size={16} />
            <span>{refreshNotice.text}</span>
          </div>
        )}

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
                <th title="Column H is locked & protected with live Google Sheet formulas (=IFNA)">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Icon name="lock" size={12} /> FINAL STATUS (COL H)
                  </span>
                </th>
                <th>STATUS OVERRIDE</th>
                <th>VTS TYPE (COL I)</th>
                <th>REMARK (COL J)</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((device, index) => {
                const isEditing = editingImei === device.imei;
                const isSaving = savingImei === device.imei;
                const statusState = saveStatus[device.imei];

                return (
                  <tr
                    key={device.imei || index}
                    className="clickable-row"
                    onClick={() => {
                      if (onSelectDevice) onSelectDevice(device);
                    }}
                  >
                    <td className="text-muted">
                      {device.sr || (currentPage - 1) * effectivePageSize + index + 1}
                    </td>
                    <td>
                      <strong>{device.vehicle}</strong>
                    </td>
                    <td className="mono">{device.imei}</td>
                    <td className="mono">{device.sim || '—'}</td>
                    <td>
                      <span className="city-tag">{device.city}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${getStatusBadge(device.roadcastStatus || device.status)}`}>
                        {device.roadcastStatus || device.status || 'Active'}
                      </span>
                    </td>
                    <td>{device.lastUpdate || '—'}</td>
                    <td>
                      <span className={`final-status-badge ${getFinalStatusClass(device.statusOverride || device.finalStatus)}`}>
                        {device.statusOverride ? `${device.statusOverride} (Override)` : (device.finalStatus || '—')}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {device.statusOverride ? (
                        <div className="status-override-pill-wrap">
                          <span className="status-override-tag" onClick={(e) => handleOpenOverride(device, e)} title="Click to edit override">
                            {device.statusOverride}
                          </span>
                          <button
                            className="clear-override-btn"
                            onClick={(e) => handleClearOverride(device, e)}
                            title="Clear manual override & resume auto lookup"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          className="add-override-btn"
                          onClick={(e) => handleOpenOverride(device, e)}
                          title="Set manual status (e.g. At Site, In Repair)"
                        >
                          + Override
                        </button>
                      )}
                    </td>
                    <td>
                      <small className="text-muted">{device.vtsType || 'VTS Package 4G'}</small>
                    </td>
                    <td
                      className="remark-cell"
                      onClick={(e) => handleStartEditRemark(device, e)}
                      title="Click to edit remark"
                    >
                      {isEditing ? (
                        <div className="inline-edit-wrap" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            autoFocus
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={() => handleSaveRemark(device)}
                            onKeyDown={(e) => handleRemarkKeyDown(e, device)}
                            className="inline-edit-input"
                            placeholder="Type remark & press Enter..."
                          />
                        </div>
                      ) : (
                        <div className="remark-display polished">
                          {device.remark ? (
                            <span className="remark-text">{device.remark}</span>
                          ) : (
                            <span className="remark-empty-tag">+ Add note</span>
                          )}
                          {isSaving && <Icon name="refresh" size={13} className="spin text-muted" />}
                          {statusState && (
                            <span className={`inline-save-toast ${statusState.success ? 'success' : 'error'}`}>
                              {statusState.success ? <Icon name="check" size={12} /> : <Icon name="alert" size={12} />}
                              {statusState.message}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        className="table-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectDevice) onSelectDevice(device);
                        }}
                      >
                        Edit / View
                      </button>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan="12" className="empty-state">
                    <Icon name="search" size={32} />
                    <p>No devices match the specified search or filter criteria.</p>
                    <button className="primary-button compact" onClick={handleResetFilters}>
                      Clear Filters
                    </button>
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
              Page {currentPage} of {totalPages} ({filtered.length} total records)
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

      {/* Add Device Modal */}
      <AddDeviceModal
        devices={devices}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onRefresh={onRefresh}
      />

      {/* Status Override Modal */}
      {overrideModalDevice && (
        <div className="modal-backdrop" onClick={() => setOverrideModalDevice(null)}>
          <div className="modal-container small-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <Icon name="tag" size={20} className="modal-icon text-accent" />
                <div>
                  <h3>Set Status Override</h3>
                  <p className="modal-subtitle">
                    {overrideModalDevice.vehicle} ({overrideModalDevice.imei})
                  </p>
                </div>
              </div>
              <button className="close-btn" onClick={() => setOverrideModalDevice(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-hint-text">
                Setting a status override displays this text in Final Status (Col H) and prevents automatic sheet scans from replacing it until cleared.
              </p>

              <div className="form-group">
                <label>Status Override Value</label>
                <input
                  type="text"
                  placeholder="e.g. At Site, At Jaipur Office, In Repair..."
                  value={overrideInput}
                  onChange={(e) => setOverrideInput(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="preset-pill-group" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                <span className="preset-pill" style={{ cursor: 'pointer', padding: '4px 8px', background: 'var(--card-bg, #1e293b)', borderRadius: '4px', fontSize: '12px' }} onClick={() => setOverrideInput('At Site')}>At Site</span>
                <span className="preset-pill" style={{ cursor: 'pointer', padding: '4px 8px', background: 'var(--card-bg, #1e293b)', borderRadius: '4px', fontSize: '12px' }} onClick={() => setOverrideInput('At Jaipur Office')}>At Jaipur Office</span>
                <span className="preset-pill" style={{ cursor: 'pointer', padding: '4px 8px', background: 'var(--card-bg, #1e293b)', borderRadius: '4px', fontSize: '12px' }} onClick={() => setOverrideInput('In Repair / Maintenance')}>In Repair</span>
                <span className="preset-pill" style={{ cursor: 'pointer', padding: '4px 8px', background: 'var(--card-bg, #1e293b)', borderRadius: '4px', fontSize: '12px' }} onClick={() => setOverrideInput('Standby Vehicle')}>Standby Vehicle</span>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setOverrideModalDevice(null)}
                disabled={isSavingOverride}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleSaveOverride}
                disabled={isSavingOverride}
              >
                {isSavingOverride ? 'Saving...' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'status-active';
  if (s === 'inactive' || s.includes('soon')) return 'status-soon';
  if (s === 'expired' || s.includes('expaired') || s.includes('removed')) return 'status-expired';
  if (s.includes('damaged')) return 'status-damaged';
  return 'status-other';
}

function getFinalStatusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('running')) return 'final-running';
  if (s.includes('available')) return 'final-available';
  if (s.includes('lost') || s.includes('not found') || s.includes('not update')) return 'final-lost';
  if (s.includes('sold')) return 'final-sold';
  if (s.includes('damage')) return 'final-damaged';
  return 'final-default';
}
