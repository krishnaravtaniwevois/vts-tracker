import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from './Icons';
import {
  getInactiveRunningDevices,
  updateInactiveRunningRemark,
  sendCustomNotification,
  syncInactiveRunningSheetApi,
  getWeeklyContinuousInactiveRunningApi
} from '../services/api';
import { exportToExcelFile, exportToCsvFile } from '../services/exportUtils';

export function InactiveRunningView({
  users = [],
  devices = [],
  groundRecordAudit = null,
  onSelectDevice,
  onRefresh
}) {
  const [subTab, setSubTab] = useState('ground_audit'); // 'ground_audit' | 'roadcast_anomaly'

  // ----------------------------------------------------
  // SUB-TAB 1: Ground Truth Cross-Audit States & Logic
  // ----------------------------------------------------
  const [groundSearch, setGroundSearch] = useState('');
  const [groundCityFilter, setGroundCityFilter] = useState('All');
  const [groundDiscrepancyFilter, setGroundDiscrepancyFilter] = useState('All');
  const [sendingGhostAlert, setSendingGhostAlert] = useState(false);
  const [ghostAlertToast, setGhostAlertToast] = useState(null);

  const groundCities = useMemo(() => {
    const set = new Set();
    devices.forEach((d) => {
      if (d.city) set.add(d.city);
    });
    return ['All', ...Array.from(set).sort()];
  }, [devices]);

  const groundAuditList = useMemo(() => {
    return devices.map((d) => {
      const isRoadcastActive = String(d.roadcastStatus || '').toLowerCase() === 'active';
      const isGroundDead = d.groundVehicleStatus === 'In-Active' || d.groundVtsStatus === 'Removed';
      const isGhost = d.isGhostLicense || (isGroundDead && isRoadcastActive);
      const isTrackingGap = d.groundVehicleStatus === 'Active' && (d.groundVtsStatus === 'Removed' || d.groundVtsStatus === 'Not Installed');

      let verdict = 'Normal';
      let verdictType = 'success';
      if (isGhost) {
        verdict = '⚠️ GHOST VTS (Billing Leakage)';
        verdictType = 'danger';
      } else if (d.groundVtsStatus === 'Removed') {
        verdict = 'VTS Hardware Removed';
        verdictType = 'warning';
      } else if (d.groundVehicleStatus === 'In-Active') {
        verdict = 'Site Vehicle In-Active';
        verdictType = 'muted';
      } else if (isTrackingGap) {
        verdict = 'Tracking Gap (VTS Missing)';
        verdictType = 'warning';
      } else if (d.ownership === 'Unmatched') {
        verdict = 'Unmatched with Ground Sheet';
        verdictType = 'info';
      } else {
        verdict = 'Matched Ground Reality';
        verdictType = 'success';
      }

      return {
        ...d,
        isGhost,
        verdict,
        verdictType
      };
    });
  }, [devices]);

  const filteredGroundAudit = useMemo(() => {
    return groundAuditList.filter((d) => {
      if (groundSearch) {
        const q = groundSearch.toLowerCase().trim();
        const match =
          (d.vehicle && d.vehicle.toLowerCase().includes(q)) ||
          (d.groundRegNo && d.groundRegNo.toLowerCase().includes(q)) ||
          (d.imei && String(d.imei).includes(q)) ||
          (d.city && d.city.toLowerCase().includes(q)) ||
          (d.groundRemark && d.groundRemark.toLowerCase().includes(q)) ||
          (d.ownership && d.ownership.toLowerCase().includes(q));
        if (!match) return false;
      }

      if (groundCityFilter !== 'All' && d.city !== groundCityFilter) {
        return false;
      }

      if (groundDiscrepancyFilter === 'ghost_vts') {
        return d.isGhost;
      }
      if (groundDiscrepancyFilter === 'vts_removed') {
        return d.groundVtsStatus === 'Removed';
      }
      if (groundDiscrepancyFilter === 'site_inactive') {
        return d.groundVehicleStatus === 'In-Active';
      }
      if (groundDiscrepancyFilter === 'vendor') {
        return d.ownership === 'Vendor';
      }
      if (groundDiscrepancyFilter === 'wevois') {
        return d.ownership === 'WeVois';
      }
      if (groundDiscrepancyFilter === 'unmatched') {
        return d.ownership === 'Unmatched';
      }

      return true;
    });
  }, [groundAuditList, groundSearch, groundCityFilter, groundDiscrepancyFilter]);

  const ghostCount = useMemo(() => groundAuditList.filter((d) => d.isGhost).length, [groundAuditList]);
  const vendorCount = useMemo(() => groundAuditList.filter((d) => d.ownership === 'Vendor').length, [groundAuditList]);
  const wevoisCount = useMemo(() => groundAuditList.filter((d) => d.ownership === 'WeVois').length, [groundAuditList]);
  const removedCount = useMemo(() => groundAuditList.filter((d) => d.groundVtsStatus === 'Removed').length, [groundAuditList]);

  const handleAlertGhostLicenses = async () => {
    const ghostDevices = groundAuditList.filter((d) => d.isGhost);
    if (ghostDevices.length === 0) {
      alert('No Ghost VTS billing leakage devices found in current fleet.');
      return;
    }

    const managers = users.filter((u) => u.email && u.role === 'Manager');
    const recipientEmails = managers.map((m) => m.email);
    if (recipientEmails.length === 0) {
      alert('No site managers registered to send email alerts.');
      return;
    }

    setSendingGhostAlert(true);
    setGhostAlertToast(null);

    try {
      const res = await sendCustomNotification({
        recipients: recipientEmails,
        notificationType: '⚠️ Ghost VTS Billing Leakage (Vehicle Record)',
        message: 'The following vehicles are marked In-Active or VTS Removed on ground ("Vehicle Record" sheet), but are still ACTIVE on Roadcast portal. Please review and deactivate these licenses immediately to prevent company billing loss.',
        items: ghostDevices
      });

      if (res.success) {
        setGhostAlertToast({
          type: 'success',
          text: `Ghost VTS leakage alert sent to ${recipientEmails.length} manager(s) for ${ghostDevices.length} vehicle(s)!`
        });
      } else {
        setGhostAlertToast({ type: 'error', text: res.error || 'Failed to send notification' });
      }
    } catch (err) {
      setGhostAlertToast({ type: 'error', text: err.message });
    } finally {
      setSendingGhostAlert(false);
      setTimeout(() => setGhostAlertToast(null), 5000);
    }
  };

  // ----------------------------------------------------
  // SUB-TAB 2: Roadcast Anomaly States & Logic
  // ----------------------------------------------------
  const [anomalyDevices, setAnomalyDevices] = useState([]);
  const [loadingAnomaly, setLoadingAnomaly] = useState(true);
  const [anomalyError, setAnomalyError] = useState(null);
  const [anomalySearch, setAnomalySearch] = useState('');
  const [anomalyCityFilter, setAnomalyCityFilter] = useState('All');

  // Dynamic Google Sheet Sync State ("VTS Inactive + running Vehicle")
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [syncToast, setSyncToast] = useState(null);

  // 1-Week Continuous Streak / Chronic Defaulters State (Drive Daily Reports)
  const [weeklyData, setWeeklyData] = useState(null);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [weeklyFilterActive, setWeeklyFilterActive] = useState(false);

  const [editingImei, setEditingImei] = useState(null);
  const [editingRemark, setEditingRemark] = useState('');
  const [savingImei, setSavingImei] = useState(null);
  const [saveStatus, setSaveStatus] = useState({});

  const [sendingAlert, setSendingAlert] = useState(false);
  const [alertToast, setAlertToast] = useState(null);

  const fetchAnomalyDevices = async () => {
    setLoadingAnomaly(true);
    setAnomalyError(null);
    try {
      const list = await getInactiveRunningDevices();
      setAnomalyDevices(list || []);
    } catch (err) {
      setAnomalyError(err.message || 'Failed to load anomaly devices');
    } finally {
      setLoadingAnomaly(false);
    }
  };

  const fetchWeeklyContinuous = async () => {
    setLoadingWeekly(true);
    try {
      const res = await getWeeklyContinuousInactiveRunningApi();
      if (res && res.success) {
        setWeeklyData(res);
      }
    } catch (err) {
      console.warn('Failed to load weekly continuous defaulters:', err);
    } finally {
      setLoadingWeekly(false);
    }
  };

  useEffect(() => {
    fetchAnomalyDevices();
    fetchWeeklyContinuous();
  }, []);

  // Map of chronic defaulters by IMEI for instant lookup
  const weeklyDefaultersMap = useMemo(() => {
    const map = {};
    if (weeklyData && weeklyData.chronicDefaulters) {
      weeklyData.chronicDefaulters.forEach((item) => {
        map[String(item.uniqueid).trim()] = item;
      });
    }
    return map;
  }, [weeklyData]);

  const handleSyncToGoogleSheet = async () => {
    setSyncingSheet(true);
    setSyncToast(null);
    try {
      const res = await syncInactiveRunningSheetApi();
      if (res && res.success) {
        setSyncToast({
          type: 'success',
          text: `✓ ${res.message || 'Successfully synced vehicles to "VTS Inactive + running Vehicle" sheet!'}`
        });
        await fetchAnomalyDevices();
        if (onRefresh) onRefresh();
      } else {
        setSyncToast({
          type: 'error',
          text: `❌ ${res?.error || 'Failed to sync to Google Sheet.'}`
        });
      }
    } catch (err) {
      setSyncToast({
        type: 'error',
        text: `❌ Error syncing sheet: ${err.message}`
      });
    } finally {
      setSyncingSheet(false);
      setTimeout(() => setSyncToast(null), 6000);
    }
  };

  const anomalyCities = useMemo(() => {
    const set = new Set();
    anomalyDevices.forEach((d) => {
      if (d.city) set.add(d.city);
    });
    return ['All', ...Array.from(set).sort()];
  }, [anomalyDevices]);

  const filteredAnomaly = useMemo(() => {
    return anomalyDevices.filter((d) => {
      // 1-Week Chronic Defaulter filter
      if (weeklyFilterActive && !weeklyDefaultersMap[String(d.uniqueid).trim()]) {
        return false;
      }

      if (anomalySearch) {
        const q = anomalySearch.toLowerCase().trim();
        const match =
          (d.name && d.name.toLowerCase().includes(q)) ||
          (d.uniqueid && String(d.uniqueid).includes(q)) ||
          (d.phone && String(d.phone).includes(q)) ||
          (d.city && d.city.toLowerCase().includes(q)) ||
          (d.remark && d.remark.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (anomalyCityFilter !== 'All' && d.city !== anomalyCityFilter) return false;
      return true;
    });
  }, [anomalyDevices, anomalySearch, anomalyCityFilter, weeklyFilterActive, weeklyDefaultersMap]);

  const handleStartEdit = (item, e) => {
    e.stopPropagation();
    setEditingImei(item.uniqueid);
    setEditingRemark(item.remark || '');
  };

  const handleSaveRemark = async (item) => {
    if (editingImei !== item.uniqueid) return;
    const newRemark = editingRemark.trim();
    setEditingImei(null);

    if (newRemark === (item.remark || '').trim()) return;

    setSavingImei(item.uniqueid);
    try {
      const res = await updateInactiveRunningRemark(item.uniqueid, newRemark);
      if (res.success) {
        item.remark = newRemark;
        item.lastRemarkUpdate = new Date().toLocaleDateString('en-GB');
        setSaveStatus((prev) => ({ ...prev, [item.uniqueid]: { success: true, message: 'Saved' } }));
        setTimeout(() => {
          setSaveStatus((prev) => {
            const next = { ...prev };
            delete next[item.uniqueid];
            return next;
          });
        }, 2500);
        if (onRefresh) onRefresh();
      } else {
        setSaveStatus((prev) => ({ ...prev, [item.uniqueid]: { success: false, message: res.error || 'Failed' } }));
      }
    } catch (err) {
      setSaveStatus((prev) => ({ ...prev, [item.uniqueid]: { success: false, message: err.message } }));
    } finally {
      setSavingImei(null);
    }
  };

  const handleNotifyManagers = async () => {
    if (filteredAnomaly.length === 0) return;
    const managers = users.filter((u) => u.email && u.role === 'Manager');
    const recipientEmails = managers.map((m) => m.email);

    if (recipientEmails.length === 0) {
      alert('No managers found to send alerts to.');
      return;
    }

    setSendingAlert(true);
    setAlertToast(null);

    try {
      const res = await sendCustomNotification({
        recipients: recipientEmails,
        notificationType: 'VTS Inactive + Running Vehicle Anomaly Alert',
        message: 'The following vehicles are actively RUNNING on site, but their VTS GPS device is showing INACTIVE on Roadcast. Please inspect wire connections immediately.',
        items: filteredAnomaly
      });

      if (res.success) {
        setAlertToast({ type: 'success', text: `Anomaly alert emailed to ${recipientEmails.length} manager(s) for ${filteredAnomaly.length} devices!` });
      } else {
        setAlertToast({ type: 'error', text: res.error || 'Failed to send alert' });
      }
    } catch (err) {
      setAlertToast({ type: 'error', text: err.message });
    } finally {
      setSendingAlert(false);
      setTimeout(() => setAlertToast(null), 5000);
    }
  };

  return (
    <div className="view-container inactive-running-view">
      {/* Top Header */}
      <div className="view-header">
        <div>
          <h2>Operational Audit &amp; Discrepancies Hub</h2>
          <p className="subtitle">
            Cross-audits between Ground Reality (<strong>"Vehicle Record"</strong> Sheet), Master <strong>900</strong> Fleet, and Roadcast Tracking Portal.
          </p>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="sub-tabs-bar" style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px' }}>
        <button
          className={`sub-tab-btn ${subTab === 'ground_audit' ? 'active' : ''}`}
          onClick={() => setSubTab('ground_audit')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: subTab === 'ground_audit' ? 'var(--primary-color, #3b82f6)' : 'var(--card-bg, #1e293b)',
            color: '#fff',
            fontWeight: subTab === 'ground_audit' ? 'bold' : 'normal',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Icon name="check" size={15} />
          <span>Ground Truth Cross-Audit</span>
          {ghostCount > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>
              {ghostCount} Ghost
            </span>
          )}
        </button>

        <button
          className={`sub-tab-btn ${subTab === 'roadcast_anomaly' ? 'active' : ''}`}
          onClick={() => setSubTab('roadcast_anomaly')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: subTab === 'roadcast_anomaly' ? 'var(--primary-color, #3b82f6)' : 'var(--card-bg, #1e293b)',
            color: '#fff',
            fontWeight: subTab === 'roadcast_anomaly' ? 'bold' : 'normal',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Icon name="alert" size={15} />
          <span>VTS Inactive + Portal Running ({anomalyDevices.length})</span>
        </button>
      </div>

      {/* ==================================================== */}
      {/* SUB-TAB 1: Ground Truth Cross-Audit                  */}
      {/* ==================================================== */}
      {subTab === 'ground_audit' && (
        <div className="ground-audit-section">
          {ghostAlertToast && (
            <div className={`notification-banner ${ghostAlertToast.type}`} style={{ marginBottom: '16px' }}>
              <Icon name={ghostAlertToast.type === 'success' ? 'check' : 'alert'} size={18} />
              <span>{ghostAlertToast.text}</span>
            </div>
          )}

          {/* 4 Smart KPI Cards */}
          <div className="kpi-grid" style={{ marginBottom: '20px' }}>
            <div className="kpi-card danger" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="kpi-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="alert" size={16} /> Ghost VTS Licenses
              </div>
              <div className="kpi-value" style={{ color: '#f87171' }}>{ghostCount}</div>
              <div className="kpi-subtitle">In-Active on ground but Active on Roadcast (Billing Leakage)</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: '4px solid #eab308' }}>
              <div className="kpi-title">Vendor Fleet (Col I)</div>
              <div className="kpi-value" style={{ color: '#facc15' }}>{vendorCount}</div>
              <div className="kpi-subtitle">Must only be filled in Vendor City Vehicle Data</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: '4px solid #3b82f6' }}>
              <div className="kpi-title">WeVois Operations Fleet</div>
              <div className="kpi-value" style={{ color: '#60a5fa' }}>{wevoisCount}</div>
              <div className="kpi-subtitle">Direct WeVois Operation maintained vehicles</div>
            </div>

            <div className="kpi-card accent" style={{ borderLeft: '4px solid #fb923c' }}>
              <div className="kpi-title">VTS Hardware Removed</div>
              <div className="kpi-value" style={{ color: '#fb923c' }}>{removedCount}</div>
              <div className="kpi-subtitle">GPS detached or shifted to another vehicle (Col L)</div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="panel" style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-box" style={{ flex: 1, minWidth: '240px' }}>
              <Icon name="search" size={16} />
              <input
                type="text"
                placeholder="Search vehicle, registration plate, IMEI, ground remark..."
                value={groundSearch}
                onChange={(e) => setGroundSearch(e.target.value)}
              />
            </div>

            <div className="select-wrap">
              <label>City Filter:</label>
              <select value={groundCityFilter} onChange={(e) => setGroundCityFilter(e.target.value)}>
                {groundCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="select-wrap">
              <label>Discrepancy / Filter:</label>
              <select value={groundDiscrepancyFilter} onChange={(e) => setGroundDiscrepancyFilter(e.target.value)}>
                <option value="All">All Audited Vehicles ({groundAuditList.length})</option>
                <option value="ghost_vts">⚠️ Ghost VTS Only ({ghostCount})</option>
                <option value="vts_removed">VTS Hardware Removed ({removedCount})</option>
                <option value="site_inactive">Site Vehicle In-Active</option>
                <option value="vendor">Vendor Fleet Only ({vendorCount})</option>
                <option value="wevois">WeVois Fleet Only ({wevoisCount})</option>
                <option value="unmatched">Unmatched with Vehicle Record</option>
              </select>
            </div>

            <div className="table-actions-inline">
              <button
                className="secondary-button"
                onClick={() => exportToExcelFile(filteredGroundAudit, `Ground_Truth_Cross_Audit`)}
                title="Download Ground Truth Cross-Audit report as Excel"
              >
                <Icon name="download" size={14} /> Excel ({filteredGroundAudit.length})
              </button>
              <button
                className="primary-button"
                onClick={handleAlertGhostLicenses}
                disabled={sendingGhostAlert || ghostCount === 0}
                style={{ background: '#ef4444', borderColor: '#dc2626' }}
                title="Email alert to site managers about ghost licenses"
              >
                <Icon name="mail" size={14} className={sendingGhostAlert ? 'spin' : ''} />
                {sendingGhostAlert ? 'Sending...' : `Alert Ghost Licenses (${ghostCount})`}
              </button>
            </div>
          </div>

          {/* Audit Results Table */}
          <div className="panel table-panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>VEHICLE NAME</th>
                    <th>REG. PLATE</th>
                    <th>UNIQUEID (IMEI)</th>
                    <th>CITY</th>
                    <th>MAINTENANCE (COL I)</th>
                    <th>SITE STATUS (COL K)</th>
                    <th>VTS STATUS (COL L)</th>
                    <th>ROADCAST (COL F)</th>
                    <th>FIELD GROUND REMARK (COL M)</th>
                    <th>AUDIT VERDICT</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroundAudit.map((d, idx) => (
                    <tr
                      key={d.imei || idx}
                      className="clickable-row"
                      onClick={() => {
                        if (onSelectDevice) onSelectDevice(d);
                      }}
                      style={{
                        background: d.isGhost ? 'rgba(239, 68, 68, 0.05)' : undefined
                      }}
                    >
                      <td>
                        <strong>{d.vehicle}</strong>
                      </td>
                      <td>
                        <span className="mono" style={{ fontWeight: '500' }}>
                          {d.groundRegNo || '—'}
                        </span>
                      </td>
                      <td className="mono">{d.imei}</td>
                      <td><span className="city-tag">{d.city}</span></td>
                      <td>
                        {d.ownership === 'Vendor' ? (
                          <span className="ground-badge vendor">VENDOR</span>
                        ) : d.ownership === 'WeVois' ? (
                          <span className="ground-badge wevois">WEVOIS</span>
                        ) : (
                          <span className="text-muted">{d.ownership || '—'}</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 'bold', color: d.groundVehicleStatus === 'In-Active' ? '#f87171' : '#4ade80' }}>
                          {d.groundVehicleStatus || 'Active'}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: d.groundVtsStatus === 'Removed' ? '#fb923c' : 'inherit' }}>
                          {d.groundVtsStatus || 'Installed'}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-${String(d.roadcastStatus || 'active').toLowerCase()}`}>
                          {d.roadcastStatus || 'Active'}
                        </span>
                      </td>
                      <td style={{ maxWidth: '240px' }}>
                        {d.groundRemark ? (
                          <span style={{ fontSize: '12px', color: '#fbbf24', fontStyle: 'italic' }}>
                            "{d.groundRemark}"
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {d.isGhost ? (
                          <span className="ground-badge ghost-pulse">⚠️ GHOST VTS (Leakage)</span>
                        ) : d.groundVtsStatus === 'Removed' ? (
                          <span className="ground-badge removed">VTS REMOVED</span>
                        ) : d.groundVehicleStatus === 'In-Active' ? (
                          <span className="ground-badge inactive">SITE INACTIVE</span>
                        ) : (
                          <span style={{ color: '#4ade80', fontSize: '12px', fontWeight: '500' }}>
                            ✓ {d.verdict}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredGroundAudit.length === 0 && (
                    <tr>
                      <td colSpan="10" className="empty-state">
                        <Icon name="check" size={32} />
                        <p>No matching devices for this filter!</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* SUB-TAB 2: Attendance Anomaly                        */}
      {/* ==================================================== */}
      {subTab === 'roadcast_anomaly' && (
        <div className="anomaly-section">
          {anomalyError && (
            <div className="notification-banner error" style={{ marginBottom: '16px' }}>
              <Icon name="alert" size={18} />
              <span>{anomalyError}</span>
            </div>
          )}

          {alertToast && (
            <div className={`notification-banner ${alertToast.type}`} style={{ marginBottom: '16px' }}>
              <Icon name={alertToast.type === 'success' ? 'check' : 'alert'} size={18} />
              <span>{alertToast.text}</span>
            </div>
          )}

          {syncToast && (
            <div className={`notification-banner ${syncToast.type}`} style={{ marginBottom: '16px' }}>
              <Icon name={syncToast.type === 'success' ? 'check' : 'alert'} size={18} />
              <span>{syncToast.text}</span>
            </div>
          )}

          {/* KPI Cards */}
          <div className="kpi-grid" style={{ marginBottom: '20px' }}>
            <div className="kpi-card danger">
              <div className="kpi-title">Live Anomaly Devices</div>
              <div className="kpi-value">{anomalyDevices.length}</div>
              <div className="kpi-subtitle">Inactive VTS on physically running vehicles today</div>
            </div>

            <div
              className={`kpi-card danger ${weeklyFilterActive ? 'active' : ''}`}
              onClick={() => setWeeklyFilterActive(!weeklyFilterActive)}
              style={{ cursor: 'pointer', borderLeft: '4px solid #ef4444' }}
              title="Click to toggle filter for 1-Week Chronic (7 Days) Defaulters"
            >
              <div className="kpi-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="alert" size={16} /> 1-Week Chronic Defaulters
              </div>
              <div className="kpi-value" style={{ color: '#f87171' }}>
                {loadingWeekly ? '...' : (weeklyData?.chronicCount || 0)}
              </div>
              <div className="kpi-subtitle">
                {weeklyFilterActive ? '✓ Filtered (Click to Show All)' : 'Continuously Inactive+Running across 7 daily Drive reports'}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-title">Affected Cities</div>
              <div className="kpi-value">{anomalyCities.length > 1 ? anomalyCities.length - 1 : 0}</div>
              <div className="kpi-subtitle">Locations requiring immediate physical inspection</div>
            </div>

            <div className="kpi-card accent" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="kpi-title">Dynamic Target Sheet</div>
              <div className="kpi-value" style={{ color: '#34d399', fontSize: '18px' }}>Auto-Synced</div>
              <div className="kpi-subtitle">Sheet: "VTS Inactive + running Vehicle" (resolved autos-removed)</div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="panel" style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-box" style={{ flex: 1, minWidth: '220px' }}>
              <Icon name="search" size={16} />
              <input
                type="text"
                placeholder="Search by vehicle name, IMEI, SIM, city, remark..."
                value={anomalySearch}
                onChange={(e) => setAnomalySearch(e.target.value)}
              />
            </div>

            <div className="select-wrap">
              <label>City Filter:</label>
              <select value={anomalyCityFilter} onChange={(e) => setAnomalyCityFilter(e.target.value)}>
                {anomalyCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* 1-Week Chronic Streak Toggle Filter Pill */}
            <button
              type="button"
              className="secondary-button"
              onClick={() => setWeeklyFilterActive(!weeklyFilterActive)}
              style={{
                borderColor: weeklyFilterActive ? '#ef4444' : '#475569',
                background: weeklyFilterActive ? 'rgba(239, 68, 68, 0.25)' : 'transparent',
                color: weeklyFilterActive ? '#fca5a5' : '#cbd5e1',
                fontWeight: weeklyFilterActive ? 700 : 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Filter to only show vehicles continuously Inactive + RUNNING across the past week of daily Drive reports"
            >
              <Icon name="alert" size={14} style={{ color: '#ef4444' }} />
              <span>{weeklyFilterActive ? '✓ 1-Week Chronic Only' : `🚨 1-Week Chronic (${weeklyData?.chronicCount || 0})`}</span>
            </button>

            <div className="table-actions-inline">
              {/* Dynamic Google Sheet Sync Button */}
              <button
                type="button"
                className="primary-button"
                onClick={handleSyncToGoogleSheet}
                disabled={syncingSheet}
                style={{
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  borderColor: '#059669',
                  boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Dynamic Sync: Updates 'VTS Inactive + running Vehicle' tab in Google Sheets. Automatically removes any vehicle that became active or stopped running!"
              >
                <Icon name="refresh" size={14} className={syncingSheet ? 'spin' : ''} />
                <span>{syncingSheet ? 'Syncing...' : '🔄 Sync to Google Sheet'}</span>
              </button>

              <button
                className="secondary-button"
                onClick={() => {
                  fetchAnomalyDevices();
                  fetchWeeklyContinuous();
                }}
                disabled={loadingAnomaly || loadingWeekly}
              >
                <Icon name="refresh" size={14} className={(loadingAnomaly || loadingWeekly) ? 'spin' : ''} />
                <span>Refresh</span>
              </button>

              <button
                className="secondary-button"
                onClick={() => exportToExcelFile(filteredAnomaly, `Inactive_Running_Vehicles`)}
              >
                <Icon name="download" size={13} /> Excel ({filteredAnomaly.length})
              </button>

              {weeklyData?.chronicCount > 0 && (
                <button
                  className="secondary-button"
                  onClick={() => exportToExcelFile(weeklyData.chronicDefaulters, `Weekly_Continuous_Defaulters`)}
                  style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                  title="Export 1-Week Continuous Chronic Defaulters list"
                >
                  <Icon name="download" size={13} /> 1-Week Chronic ({weeklyData.chronicCount})
                </button>
              )}

              <button
                className="primary-button"
                onClick={handleNotifyManagers}
                disabled={sendingAlert || filteredAnomaly.length === 0}
              >
                <Icon name="mail" size={14} className={sendingAlert ? 'spin' : ''} />
                {sendingAlert ? 'Sending...' : `Notify Managers (${filteredAnomaly.length})`}
              </button>
            </div>
          </div>

          {/* Main Anomaly Table */}
          <div className="panel table-panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>UNIQUEID (IMEI)</th>
                    <th>VEHICLE NAME</th>
                    <th>PHONE (SIM)</th>
                    <th>CITY</th>
                    <th>VTS STATUS</th>
                    <th>VEHICLE STATUS</th>
                    <th>1-WEEK DRIVE STREAK</th>
                    <th>LAST ROADCAST UPDATE</th>
                    <th>VTS TYPE</th>
                    <th>INACTIVE-RUNNING REMARK (COL P)</th>
                    <th>LAST REMARK UPDATE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnomaly.map((row) => {
                    const isEditing = editingImei === row.uniqueid;
                    const isSaving = savingImei === row.uniqueid;
                    const statusState = saveStatus[row.uniqueid];
                    const chronicInfo = weeklyDefaultersMap[String(row.uniqueid).trim()];

                    return (
                      <tr key={row.uniqueid}>
                        <td>{row.date || 'Today'}</td>
                        <td className="mono">{row.uniqueid}</td>
                        <td><strong>{row.name}</strong></td>
                        <td className="mono">{row.phone || '—'}</td>
                        <td><span className="city-tag">{row.city}</span></td>
                        <td>
                          <span className="status-badge status-expired">Inactive</span>
                        </td>
                        <td>
                          <span className="final-status-badge final-running">RUNNING</span>
                        </td>
                        <td>
                          {chronicInfo ? (
                            <span
                              className={`status-badge ${chronicInfo.severity === 'CRITICAL' ? 'status-expired' : 'status-pending'}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '3px 8px' }}
                              title={`Continuous Inactive+Running on Drive reports: ${chronicInfo.datesDetected?.join(', ')}`}
                            >
                              🔥 {chronicInfo.streakDisplay}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>
                          )}
                        </td>
                        <td>{row.lastUpdate || '—'}</td>
                        <td><small className="text-muted">{row.vtsType || 'VTS Package 4G'}</small></td>
                        <td
                          className="remark-cell"
                          onClick={(e) => handleStartEdit(row, e)}
                          title="Click to edit dedicated Inactive-Running remark"
                        >
                          {isEditing ? (
                            <div className="inline-edit-wrap" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                autoFocus
                                value={editingRemark}
                                onChange={(e) => setEditingRemark(e.target.value)}
                                onBlur={() => handleSaveRemark(row)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRemark(row);
                                  if (e.key === 'Escape') setEditingImei(null);
                                }}
                                className="inline-edit-input"
                                placeholder="e.g. check kr rhe h, maintenance team inform..."
                              />
                            </div>
                          ) : (
                            <div className="remark-display polished">
                              {row.remark ? (
                                <span className="remark-text">{row.remark}</span>
                              ) : (
                                <span className="remark-empty-tag">+ Add remark</span>
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
                        <td>{row.lastRemarkUpdate || '—'}</td>
                      </tr>
                    );
                  })}
                  {filteredAnomaly.length === 0 && (
                    <tr>
                      <td colSpan="12" className="empty-state">
                        <Icon name="check" size={32} />
                        <p>{weeklyFilterActive ? 'No 1-week continuous defaulters found for this filter!' : 'No anomaly devices found! All running vehicles have active VTS tracking.'}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

