import React, { useState } from 'react';
import { Icon } from './Icons';
import { markDeviceRenewed, submitDamage, updateDeviceDetails, extractRenewalCycleBatch, fetchVehicleHistory } from '../services/api';
import { safeGetItem, safeGetJson, safeSetItem } from '../utils/storage';

export function DeviceModal({ device, onClose, onRefresh }) {
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'edit' | 'recharge' | 'damage' | 'addToRenewal' | 'history'
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Edit Form states (Everything except IMEI)
  const [editVehicle, setEditVehicle] = useState(device?.vehicle || '');
  const [editSim, setEditSim] = useState(device?.sim || '');
  const [editCity, setEditCity] = useState(device?.city || '');
  const [editFinalStatus, setEditFinalStatus] = useState(device?.finalStatus || '');
  const [editVtsType, setEditVtsType] = useState(device?.vtsType || 'VTS Package 4G');
  const [editRemark, setEditRemark] = useState(device?.remark || '');

  // Form states for Recharge & Damage
  const [newDate, setNewDate] = useState('');
  const [damageIssue, setDamageIssue] = useState('Power issue');
  const [damageWarranty, setDamageWarranty] = useState('Out of Warranty');
  const [notes, setNotes] = useState('');

  // Add to Renewal Sheet states
  const cycleTabs = safeGetJson('vts_cached_cycle_tabs') || [
    '16 sep 2026',
    '14 sept 2026',
    '24 aug 2026',
    'Auguest 12aug 2026'
  ];
  const defaultRenewalTab = safeGetItem('vts_user_selected_cycle_tab') || safeGetItem('vts_tracker_active_cycle_tab') || (cycleTabs[0] || '');
  const [selectedRenewalTab, setSelectedRenewalTab] = useState(defaultRenewalTab);
  const [isAddingToRenewal, setIsAddingToRenewal] = useState(false);

  // Vehicle History states
  const [historyStart, setHistoryStart] = useState(() => {
    const d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  });
  const [historyEnd, setHistoryEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [historyData, setHistoryData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleLoadHistory = async () => {
    if (!device) return;
    setLoadingHistory(true);
    setStatusMsg(null);
    try {
      const data = await fetchVehicleHistory({
        searchTerm: device.vehicle || device.imei,
        startDate: historyStart,
        endDate: historyEnd
      });
      setHistoryData(data);
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Failed to load vehicle history: ' + err.message });
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!device) return null;

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await updateDeviceDetails({
        uniqueid: device.imei,
        vehicle: editVehicle.trim(),
        sim: editSim.trim(),
        city: editCity.trim(),
        finalStatus: editFinalStatus.trim(),
        vtsType: editVtsType.trim(),
        remark: editRemark.trim()
      });
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.message || 'Device details updated successfully in Google Sheets!' });
        if (onRefresh) onRefresh();
        setTimeout(() => {
          setActiveTab('details');
          setStatusMsg(null);
        }, 1500);
      } else {
        setStatusMsg({ type: 'error', text: res.error || 'Failed to update device details' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRechargeSubmit = async (e) => {
    e.preventDefault();
    if (!newDate) {
      alert('Please select a valid new license end date');
      return;
    }
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await markDeviceRenewed({
        uniqueid: device.imei,
        newLicenseEnd: newDate,
        remark: 'Renewed via Device Modal'
      });
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.message || 'Device renewal logged successfully!' });
        setTimeout(() => {
          if (onRefresh) onRefresh();
          onClose();
        }, 1200);
      } else {
        setStatusMsg({ type: 'error', text: res.error || 'Failed to save recharge' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDamageSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await submitDamage({
        vehicle: device.vehicle,
        imei: device.imei,
        sim: device.sim,
        city: device.city,
        issue: damageIssue,
        warranty: damageWarranty,
        notes
      });
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.message || 'Damage reported successfully!' });
        setTimeout(() => {
          if (onRefresh) onRefresh();
          onClose();
        }, 1200);
      } else {
        setStatusMsg({ type: 'error', text: res.error || 'Failed to report damage' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToRenewalSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRenewalTab) {
      alert('Please select a target Renewal Sheet Tab');
      return;
    }
    setIsAddingToRenewal(true);
    setStatusMsg(null);
    try {
      const res = await extractRenewalCycleBatch({
        tabName: selectedRenewalTab,
        devices: [{
          ...device,
          renewalDecision: 'Yes',
          decision: 'Yes',
          rechargeStatus: 'Yes',
          statusVal: 'Yes',
          statusDone: 'Not Done',
          newLicenseEnd: '',
          renewalRemark: ''
        }],
        targetMode: 'existing'
      });
      if (res.success) {
        setStatusMsg({ type: 'success', text: `✅ Added ${device.vehicle} to renewal sheet tab "${selectedRenewalTab}" with status YES!` });
        // Update local sheet cache for selectedRenewalTab if present
        const cacheKey = `vts_sheet_cache_${selectedRenewalTab.trim().toLowerCase()}`;
        const cached = safeGetJson(cacheKey);
        if (cached && Array.isArray(cached.sheetDevices)) {
          const cleanImei = String(device.imei || device.uniqueid).trim();
          if (!cached.sheetDevices.some(d => String(d.imei || d.uniqueid).trim() === cleanImei)) {
            cached.sheetDevices.push({
              ...device,
              sr: cached.sheetDevices.length + 1,
              renewalDecision: 'Yes',
              rechargeStatus: 'Yes',
              statusDone: 'Not Done'
            });
            if (!cached.recordsByImei) cached.recordsByImei = {};
            cached.recordsByImei[cleanImei] = { decision: 'Yes', remark: '', newLicenseEnd: '', statusDone: 'Not Done' };
            safeSetItem(cacheKey, cached);
          }
        }
        if (onRefresh) onRefresh();
      } else {
        setStatusMsg({ type: 'error', text: res.error || res.message || 'Failed to add vehicle to renewal sheet' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setIsAddingToRenewal(false);
    }
  };

  const getStatusClass = (status) => {
    const s = String(status || '').toLowerCase();
    if (s.includes('active')) return 'status-active';
    if (s.includes('soon')) return 'status-soon';
    if (s.includes('expired')) return 'status-expired';
    if (s.includes('damaged')) return 'status-damaged';
    return 'status-other';
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-eyebrow">DEVICE PROFILE</div>
            <h2 className="modal-title">{device.vehicle}</h2>
            <p className="modal-subtitle">IMEI: {device.imei} &bull; {device.city}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`modal-tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => { setActiveTab('details'); setStatusMsg(null); }}
          >
            <Icon name="device" size={15} /> Device Info
          </button>
          <button
            className={`modal-tab ${activeTab === 'edit' ? 'active' : ''}`}
            onClick={() => { setActiveTab('edit'); setStatusMsg(null); }}
          >
            <Icon name="settings" size={15} /> Edit Details
          </button>
          <button
            className={`modal-tab ${activeTab === 'recharge' ? 'active' : ''}`}
            onClick={() => { setActiveTab('recharge'); setStatusMsg(null); }}
          >
            <Icon name="battery" size={15} /> Log Recharge
          </button>
          <button
            className={`modal-tab ${activeTab === 'damage' ? 'active' : ''}`}
            onClick={() => { setActiveTab('damage'); setStatusMsg(null); }}
          >
            <Icon name="wrench" size={15} /> Report Damage
          </button>
          <button
            className={`modal-tab ${activeTab === 'addToRenewal' ? 'active' : ''}`}
            onClick={() => { setActiveTab('addToRenewal'); setStatusMsg(null); }}
          >
            <Icon name="calendar" size={15} /> 📑 Add to Renewal Sheet
          </button>
          <button
            className={`modal-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('history');
              setStatusMsg(null);
              if (!historyData) handleLoadHistory();
            }}
          >
            <Icon name="chart" size={15} /> 📊 History &amp; Downtime
          </button>
        </div>

        <div className="modal-body">
          {statusMsg && (
            <div className={`alert-banner ${statusMsg.type}`}>
              {statusMsg.type === 'success' ? <Icon name="check" size={16} /> : <Icon name="alert" size={16} />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {activeTab === 'details' && (
            <div className="device-info-grid">
              <div className="info-card">
                <span className="info-label">Roadcast Status (Col F)</span>
                <span className={`status-badge ${getStatusClass(device.roadcastStatus || device.status)}`}>
                  {device.roadcastStatus || device.status || 'Active'}
                </span>
              </div>
              <div className="info-card">
                <span className="info-label">Last Update (Col G)</span>
                <strong>{device.lastUpdate || '—'}</strong>
              </div>
              <div className="info-card">
                <span className="info-label">Final Status (Col H)</span>
                <strong>{device.finalStatus || '—'}</strong>
              </div>
              <div className="info-card">
                <span className="info-label">VTS Package Type (Col I)</span>
                <strong>{device.vtsType || 'VTS Package 4G'}</strong>
              </div>
              <div className="info-card">
                <span className="info-label">City / Site (Col E)</span>
                <strong>{device.city || 'N/A'}</strong>
              </div>
              <div className="info-card">
                <span className="info-label">SIM / Phone (Col D)</span>
                <strong className="mono">{device.sim || 'N/A'}</strong>
              </div>
              <div className="info-card full-width">
                <span className="info-label">Remark (Col J)</span>
                <p className="remark-text">{device.remark || 'No specific remarks recorded.'}</p>
              </div>
              <div className="full-width" style={{ marginTop: '8px', textAlign: 'right' }}>
                <button className="primary-button compact" onClick={() => setActiveTab('edit')}>
                  Edit Device Details &rarr;
                </button>
              </div>
            </div>
          )}

          {activeTab === 'edit' && (
            <form onSubmit={handleEditSubmit} className="modal-form">
              <p className="form-helper">
                You can update all device attributes below. Changes are saved directly to your master <b>"900" Google Sheet</b>. Uniqueid (IMEI) remains permanent.
              </p>

              <div className="form-group">
                <label>Uniqueid / IMEI (Permanent &bull; Read-Only)</label>
                <input type="text" value={device.imei} disabled style={{ opacity: 0.7, background: 'rgba(255,255,255,0.03)' }} />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Vehicle Name (Col B) *</label>
                  <input
                    type="text"
                    required
                    value={editVehicle}
                    onChange={(e) => setEditVehicle(e.target.value)}
                    placeholder="e.g. TATA-AT-5469"
                  />
                </div>

                <div className="form-group">
                  <label>Phone / SIM Number (Col D)</label>
                  <input
                    type="text"
                    value={editSim}
                    onChange={(e) => setEditSim(e.target.value)}
                    placeholder="e.g. 5754228752687"
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>City / Location (Col E) *</label>
                  <input
                    type="text"
                    required
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    placeholder="e.g. Ajmer"
                  />
                </div>

                <div className="form-group">
                  <label>Final Status (Col H)</label>
                  <input
                    type="text"
                    value={editFinalStatus}
                    onChange={(e) => setEditFinalStatus(e.target.value)}
                    placeholder="e.g. RUNNING, AVAILABLE, Lost..."
                  />
                </div>
              </div>

              <div className="form-group">
                <label>VTS Type (Col I)</label>
                <input
                  type="text"
                  value={editVtsType}
                  onChange={(e) => setEditVtsType(e.target.value)}
                  placeholder="e.g. VTS Package 4G, TcsVts (V-New)..."
                />
              </div>

              <div className="form-group">
                <label>Remark / Notes (Col J)</label>
                <textarea
                  rows="3"
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                  placeholder="Enter remarks, notes, technician info..."
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setActiveTab('details')}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={loading}>
                  {loading ? 'Saving to Sheets...' : 'Save Changes to Google Sheet'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'recharge' && (
            <form onSubmit={handleRechargeSubmit} className="modal-form">
              <p className="form-helper">
                Logging a recharge will automatically append an entry to your <b>Renewal Sheet</b> and update the device's license end date.
              </p>
              <div className="form-group">
                <label>Vehicle & IMEI</label>
                <input type="text" value={`${device.vehicle} (${device.imei})`} disabled />
              </div>
              <div className="form-group">
                <label>Current Expiry Date</label>
                <input type="text" value={device.licenseEnd || 'None'} disabled />
              </div>
              <div className="form-group">
                <label>New License End Date *</label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={loading}>
                  {loading ? 'Saving...' : 'Confirm & Log Recharge'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'damage' && (
            <form onSubmit={handleDamageSubmit} className="modal-form">
              <p className="form-helper">
                Reported damages will be logged to your <b>Damage Sheet</b> and change the device's status to <b>Damaged (In Repair Queue)</b>.
              </p>
              <div className="form-group">
                <label>Technical Issue *</label>
                <select
                  value={damageIssue}
                  onChange={(e) => setDamageIssue(e.target.value)}
                >
                  <option value="Power issue">Power issue</option>
                  <option value="IC Burned">IC Burned</option>
                  <option value="SIM not reading">SIM not reading</option>
                  <option value="Vts Full Damage">VTS Full Damage</option>
                  <option value="Water Damage">Water Ingress / Moisture</option>
                  <option value="Light Issue">Light Issue</option>
                  <option value="Wiring Problem">Wiring / Harness Problem</option>
                </select>
              </div>
              <div className="form-group">
                <label>Warranty Status</label>
                <select
                  value={damageWarranty}
                  onChange={(e) => setDamageWarranty(e.target.value)}
                >
                  <option value="Out of Warranty">Out of Warranty</option>
                  <option value="Warranty">In Warranty</option>
                </select>
              </div>
              <div className="form-group">
                <label>Additional Notes / Details</label>
                <textarea
                  rows="3"
                  placeholder="Describe damage symptoms, location, mechanic remarks..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="primary-button danger" disabled={loading}>
                  {loading ? 'Submitting...' : 'Mark as Damaged & Log'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'addToRenewal' && (
            <form onSubmit={handleAddToRenewalSubmit} className="modal-form">
              <p className="form-helper" style={{ color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '12px', lineHeight: '1.5' }}>
                Add this vehicle from the Master 950 Fleet directly into any Renewal Cycle Sheet. All added vehicles default to <b>Recharge Status: "Yes" 🟢</b> with continuous sequential SR. number.
              </p>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span>🎯 Select Target Renewal Sheet Tab *</span>
                </label>
                <select
                  value={selectedRenewalTab}
                  onChange={(e) => setSelectedRenewalTab(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #0d9488', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }}
                >
                  {cycleTabs.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Vehicle:</span> <strong style={{ color: 'var(--text-primary)' }}>{device.vehicle}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>City:</span> <strong style={{ color: 'var(--text-primary)' }}>{device.city || 'N/A'}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>IMEI:</span> <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{device.imei}</span></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Current Expiry:</span> <strong style={{ color: 'var(--text-primary)' }}>{device.licenseEnd || 'N/A'}</strong></div>
                </div>
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Initial Recharge Decision:</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: '#137333', color: '#fff' }}>YES 🟢</span>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isAddingToRenewal}
                  style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', borderColor: '#0f766e', fontWeight: 600 }}
                >
                  {isAddingToRenewal ? 'Adding to Sheet...' : `➕ Add to "${selectedRenewalTab}"`}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'history' && (
            <div className="history-tab-content">
              {/* Date Controls */}
              <div className="form-row-2" style={{ alignItems: 'flex-end', marginBottom: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={historyStart}
                    onChange={(e) => setHistoryStart(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>End Date</label>
                  <input
                    type="date"
                    value={historyEnd}
                    onChange={(e) => setHistoryEnd(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleLoadHistory}
                  disabled={loadingHistory}
                >
                  <Icon name="search" size={15} />
                  {loadingHistory ? 'Searching Daily Drive CSVs...' : 'Audit Vehicle History'}
                </button>
              </div>

              {loadingHistory && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                  <Icon name="refresh" size={24} className="spin" />
                  <p style={{ marginTop: '8px', fontSize: '13px' }}>Scanning historical daily reports in Drive folder...</p>
                </div>
              )}

              {!loadingHistory && historyData && (
                <>
                  {/* 4 Insight Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Monitored Days</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{historyData.totalDays}</div>
                    </div>

                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '11px', color: '#10b981', textTransform: 'uppercase' }}>Active Days</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>{historyData.activeDays}</div>
                    </div>

                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase' }}>Downtime %</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444', marginTop: '2px' }}>{historyData.downtimePct}%</div>
                    </div>

                    <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '11px', color: '#f59e0b', textTransform: 'uppercase' }}>Max Dead Streak</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>{historyData.longestStreak} Days</div>
                    </div>
                  </div>

                  {/* Repeated Remark Alert */}
                  {historyData.repeatedRemarkWarning && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', color: '#fca5a5', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon name="alert" size={16} />
                      <span><strong>Technician Stale Remark Alert:</strong> {historyData.repeatedRemarkWarning}</span>
                    </div>
                  )}

                  {/* Daily Records Timeline */}
                  <div className="table-wrap" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    <table style={{ fontSize: '12px', width: '100%' }}>
                      <thead>
                        <tr>
                          <th>DATE</th>
                          <th>ROADCAST STATUS</th>
                          <th>FINAL STATUS</th>
                          <th>TECHNICIAN REMARK</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyData.results.map((row, idx) => {
                          const isActive = (row.roadcastStatus || '').toLowerCase() === 'active';
                          return (
                            <tr key={idx} style={{ background: row.isStaleRemark ? 'rgba(239, 68, 68, 0.08)' : 'transparent' }}>
                              <td><small className="text-muted">{row.displayDate || row.date}</small></td>
                              <td>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 7px',
                                  borderRadius: '10px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: isActive ? '#10b981' : '#ef4444'
                                }}>
                                  {isActive ? '🟢 Active' : '🔴 Inactive'}
                                </span>
                              </td>
                              <td>{row.finalStatus || '—'}</td>
                              <td style={{ color: row.isStaleRemark ? '#ef4444' : 'inherit' }}>
                                {row.isStaleRemark && '⚠️ '}
                                {row.remark || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
