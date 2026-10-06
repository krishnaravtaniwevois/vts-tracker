import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from './Icons';
import { sendCustomNotification, getDataFillStatus, getCameraFillStatus, getInactiveRunningDevices } from '../services/api';

export function NotificationCenterView({ devices = [], users = [], _onRefresh }) {
  // Step 1: Recipients Selection
  const managers = useMemo(() => {
    return users.filter((u) => u.email && (u.role === 'Manager' || u.role === 'Admin'));
  }, [users]);

  const [selectedRecipients, setSelectedRecipients] = useState(() => {
    return users.filter((u) => u.email && (u.role === 'Manager' || u.role === 'Admin')).map((m) => m.email);
  });

  // Step 2: Notification Type
  // 'renewal_due' | 'inactive_devices' | 'status_override' | 'data_not_filled' | 'camera_not_filled' | 'custom_selection'
  const [notificationType, setNotificationType] = useState('renewal_due');
  const [customMessage, setCustomMessage] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);

  // Data fill and camera status async caches
  const [dataFillList, setDataFillList] = useState([]);
  const [cameraFillList, setCameraFillList] = useState([]);
  const [_inactiveRunningList, setInactiveRunningList] = useState([]);

  // Send state
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  useEffect(() => {
    const fetchAuxData = async () => {
      try {
        const [df, cf, ir] = await Promise.all([
          getDataFillStatus(),
          getCameraFillStatus(),
          getInactiveRunningDevices()
        ]);
        setDataFillList(df || []);
        setCameraFillList(cf || []);
        setInactiveRunningList(ir || []);
      } catch (err) {
        console.warn('Aux data fetch error:', err);
      }
    };
    fetchAuxData();
  }, []);

  // Compute preview items based on notification type
  const previewItems = useMemo(() => {
    if (notificationType === 'renewal_due') {
      return devices.filter(
        (d) =>
          d.renewalDecision === 'Pending' ||
          (d.remainingDays !== undefined && d.remainingDays <= 15)
      );
    }
    if (notificationType === 'inactive_devices') {
      return devices.filter((d) => String(d.roadcastStatus || '').toLowerCase() === 'inactive');
    }
    if (notificationType === 'status_override') {
      return devices.filter((d) => Boolean(d.statusOverride));
    }
    if (notificationType === 'data_not_filled') {
      return dataFillList.filter((df) => !df.filledToday);
    }
    if (notificationType === 'camera_not_filled') {
      return cameraFillList.filter((cf) => !cf.filledToday || cf.notWorking > 0);
    }
    if (notificationType === 'custom_selection') {
      return devices.filter((d) => selectedDeviceIds.includes(d.imei));
    }
    return [];
  }, [notificationType, devices, dataFillList, cameraFillList, selectedDeviceIds]);

  const handleToggleRecipient = (email) => {
    setSelectedRecipients((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const handleSelectAllRecipients = () => {
    if (selectedRecipients.length === managers.length) {
      setSelectedRecipients([]);
    } else {
      setSelectedRecipients(managers.map((m) => m.email));
    }
  };

  const handleToggleDeviceCustom = (imei) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(imei) ? prev.filter((id) => id !== imei) : [...prev, imei]
    );
  };

  const handleSendNotification = async () => {
    if (selectedRecipients.length === 0) {
      alert('Please select at least one recipient manager.');
      return;
    }
    setIsSending(true);
    setSendResult(null);

    const typeLabels = {
      renewal_due: 'Renewal Due Review Request',
      inactive_devices: 'Inactive Roadcast Devices Alert',
      status_override: 'Status Override / At Site Devices',
      data_not_filled: 'Vendor City Vehicle Data Missing Entry Alert',
      camera_not_filled: 'Camera Status Data Reminder',
      custom_selection: 'VTS Fleet Admin Custom Notice'
    };

    try {
      const res = await sendCustomNotification({
        recipients: selectedRecipients,
        notificationType: typeLabels[notificationType] || notificationType,
        message: customMessage.trim(),
        items: previewItems
      });

      if (res.success) {
        setSendResult({
          type: 'success',
          text: res.message || `Successfully sent email notifications to ${selectedRecipients.length} manager(s)!`
        });
      } else {
        setSendResult({ type: 'error', text: res.error || 'Failed to send notifications' });
      }
    } catch (err) {
      setSendResult({ type: 'error', text: err.message });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="view-container notification-center-view">
      <div className="view-header">
        <div>
          <h2>Dynamic Notification Center</h2>
          <p className="subtitle">
            Configure personalized email alerts for Site Managers with live table previews before dispatching.
          </p>
        </div>
      </div>

      {sendResult && (
        <div className={`notification-banner ${sendResult.type}`} style={{ marginBottom: '16px' }}>
          <Icon name={sendResult.type === 'success' ? 'check' : 'alert'} size={18} />
          <span>{sendResult.text}</span>
        </div>
      )}

      <div className="notification-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Step 1: Recipients Card */}
        <div className="panel step-card">
          <div className="step-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span className="step-badge" style={{ background: 'var(--primary-color, #3b82f6)', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>Step 1</span>
            <h3 style={{ margin: 0 }}>Select Recipients ({selectedRecipients.length}/{managers.length})</h3>
          </div>
          <p className="step-hint text-muted" style={{ fontSize: '13px', marginBottom: '12px' }}>Choose which site managers will receive this email notification:</p>

          <div className="recipients-actions" style={{ marginBottom: '12px' }}>
            <button className="quiet-button compact" onClick={handleSelectAllRecipients}>
              {selectedRecipients.length === managers.length ? 'Deselect All' : 'Select All Managers'}
            </button>
          </div>

          <div className="recipients-list" style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {managers.map((m) => {
              const isChecked = selectedRecipients.includes(m.email);
              return (
                <label key={m.email} className={`recipient-item ${isChecked ? 'selected' : ''}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 12px', borderRadius: '6px', background: isChecked ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg, #1e293b)', border: isChecked ? '1px solid #3b82f6' : '1px solid var(--border-color, #334155)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleRecipient(m.email)}
                    style={{ marginTop: '3px' }}
                  />
                  <div className="recipient-info">
                    <span className="recipient-name" style={{ fontWeight: 'bold', display: 'block', fontSize: '13px' }}>{m.name}</span>
                    <span className="recipient-email mono text-muted" style={{ fontSize: '12px', display: 'block' }}>{m.email}</span>
                    <span className="recipient-cities text-accent" style={{ fontSize: '11px', display: 'block' }}>
                      Cities: {Array.isArray(m.assignedCities) ? m.assignedCities.join(', ') : m.assignedCities || 'All Cities'}
                    </span>
                  </div>
                </label>
              );
            })}
            {managers.length === 0 && (
              <p className="text-muted" style={{ padding: '12px' }}>
                No managers found in Users sheet.
              </p>
            )}
          </div>
        </div>

        {/* Step 2: Notification Type & Message */}
        <div className="panel step-card">
          <div className="step-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span className="step-badge" style={{ background: 'var(--primary-color, #3b82f6)', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>Step 2</span>
            <h3 style={{ margin: 0 }}>Select Notification Type</h3>
          </div>
          <p className="step-hint text-muted" style={{ fontSize: '13px', marginBottom: '12px' }}>Select the data category to package and summarize in the email:</p>

          <div className="type-options-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            <label className={`type-option-card ${notificationType === 'renewal_due' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '6px', border: notificationType === 'renewal_due' ? '1px solid #3b82f6' : '1px solid var(--border-color, #334155)', background: notificationType === 'renewal_due' ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg, #1e293b)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="notifType"
                value="renewal_due"
                checked={notificationType === 'renewal_due'}
                onChange={() => setNotificationType('renewal_due')}
              />
              <div className="type-card-body">
                <strong style={{ fontSize: '13px' }}>Renewal Due</strong>
                <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Devices with Pending decision or expiring in &le; 15 days</p>
              </div>
            </label>

            <label className={`type-option-card ${notificationType === 'inactive_devices' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '6px', border: notificationType === 'inactive_devices' ? '1px solid #3b82f6' : '1px solid var(--border-color, #334155)', background: notificationType === 'inactive_devices' ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg, #1e293b)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="notifType"
                value="inactive_devices"
                checked={notificationType === 'inactive_devices'}
                onChange={() => setNotificationType('inactive_devices')}
              />
              <div className="type-card-body">
                <strong style={{ fontSize: '13px' }}>Inactive Devices</strong>
                <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Devices showing Status on Roadcast = Inactive</p>
              </div>
            </label>

            <label className={`type-option-card ${notificationType === 'status_override' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '6px', border: notificationType === 'status_override' ? '1px solid #3b82f6' : '1px solid var(--border-color, #334155)', background: notificationType === 'status_override' ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg, #1e293b)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="notifType"
                value="status_override"
                checked={notificationType === 'status_override'}
                onChange={() => setNotificationType('status_override')}
              />
              <div className="type-card-body">
                <strong style={{ fontSize: '13px' }}>Status Override / At Site</strong>
                <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Devices with manual location/site status overrides</p>
              </div>
            </label>

            <label className={`type-option-card ${notificationType === 'data_not_filled' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '6px', border: notificationType === 'data_not_filled' ? '1px solid #3b82f6' : '1px solid var(--border-color, #334155)', background: notificationType === 'data_not_filled' ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg, #1e293b)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="notifType"
                value="data_not_filled"
                checked={notificationType === 'data_not_filled'}
                onChange={() => setNotificationType('data_not_filled')}
              />
              <div className="type-card-body">
                <strong style={{ fontSize: '13px' }}>Data Not Filled Today</strong>
                <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Cities missing today's entry in Vendor City Vehicle Data</p>
              </div>
            </label>

            <label className={`type-option-card ${notificationType === 'camera_not_filled' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '6px', border: notificationType === 'camera_not_filled' ? '1px solid #3b82f6' : '1px solid var(--border-color, #334155)', background: notificationType === 'camera_not_filled' ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg, #1e293b)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="notifType"
                value="camera_not_filled"
                checked={notificationType === 'camera_not_filled'}
                onChange={() => setNotificationType('camera_not_filled')}
              />
              <div className="type-card-body">
                <strong style={{ fontSize: '13px' }}>Camera Data Reminder</strong>
                <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Cities with un-updated or faulty parking/vehicle cameras</p>
              </div>
            </label>

            <label className={`type-option-card ${notificationType === 'custom_selection' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '6px', border: notificationType === 'custom_selection' ? '1px solid #3b82f6' : '1px solid var(--border-color, #334155)', background: notificationType === 'custom_selection' ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg, #1e293b)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="notifType"
                value="custom_selection"
                checked={notificationType === 'custom_selection'}
                onChange={() => setNotificationType('custom_selection')}
              />
              <div className="type-card-body">
                <strong style={{ fontSize: '13px' }}>Custom Device Selection</strong>
                <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Manually check and pick specific devices from fleet</p>
              </div>
            </label>
          </div>

          <div className="custom-msg-wrap" style={{ marginTop: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', display: 'block', marginBottom: '6px' }}>
              Custom Note / Instructions (Optional)
            </label>
            <textarea
              rows="2"
              placeholder="Add an urgent note or deadline for the managers..."
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #334155)', background: 'var(--input-bg, #0f172a)', color: '#fff', fontSize: '13px' }}
            />
          </div>
        </div>
      </div>

      {/* Step 3: Live Preview Table */}
      <div className="panel preview-panel" style={{ marginTop: '20px' }}>
        <div className="preview-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <span className="step-badge" style={{ background: 'var(--primary-color, #3b82f6)', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>Step 3</span>
            <h3 style={{ display: 'inline', marginLeft: '10px' }}>
              Email Data Preview ({previewItems.length} items will be summarized)
            </h3>
          </div>
          <button
            className="primary-button"
            onClick={handleSendNotification}
            disabled={isSending || selectedRecipients.length === 0 || previewItems.length === 0}
          >
            <Icon name="mail" size={16} className={isSending ? 'spin' : ''} />
            {isSending ? 'Sending Emails...' : `Send Notification to ${selectedRecipients.length} Manager(s)`}
          </button>
        </div>

        {notificationType === 'custom_selection' && (
          <div className="custom-device-picker" style={{ marginBottom: '14px', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color, #334155)', padding: '10px', borderRadius: '6px' }}>
            <p className="text-muted" style={{ fontSize: '12px', marginBottom: '8px' }}>Select devices to include in this custom alert:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px' }}>
              {devices.slice(0, 50).map((d) => (
                <label key={d.imei} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedDeviceIds.includes(d.imei)}
                    onChange={() => handleToggleDeviceCustom(d.imei)}
                  />
                  <span>{d.vehicle} ({d.city})</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="table-wrap">
          {notificationType === 'data_not_filled' ? (
            <table>
              <thead>
                <tr>
                  <th>CITY</th>
                  <th>LAST ENTRY DATE</th>
                  <th>DAYS SINCE LAST ENTRY</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {previewItems.map((item, idx) => (
                  <tr key={item.city || idx}>
                    <td><strong>{item.city}</strong></td>
                    <td>{item.lastEntryDate}</td>
                    <td>{item.daysSinceLastEntry} day(s) ago</td>
                    <td>
                      <span className="status-badge status-expired">NOT FILLED TODAY</span>
                    </td>
                  </tr>
                ))}
                {previewItems.length === 0 && (
                  <tr>
                    <td colSpan="4" className="empty-state">
                      <Icon name="check" size={28} />
                      <p>All cities have already filled their vehicle data today!</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : notificationType === 'camera_not_filled' ? (
            <table>
              <thead>
                <tr>
                  <th>CITY</th>
                  <th>TOTAL CAMERAS</th>
                  <th>WORKING</th>
                  <th>NOT WORKING</th>
                  <th>LAST UPDATE</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {previewItems.map((item, idx) => (
                  <tr key={item.city || idx}>
                    <td><strong>{item.city}</strong></td>
                    <td>{item.totalCameras}</td>
                    <td className="text-success">{item.working}</td>
                    <td className="text-danger">{item.notWorking}</td>
                    <td>{item.lastDate}</td>
                    <td>
                      <span className={`status-badge ${item.filledToday ? 'status-active' : 'status-expired'}`}>
                        {item.filledToday ? 'Updated' : 'Not Updated Today'}
                      </span>
                    </td>
                  </tr>
                ))}
                {previewItems.length === 0 && (
                  <tr>
                    <td colSpan="6" className="empty-state">
                      <Icon name="check" size={28} />
                      <p>All camera records are up to date today!</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>VEHICLE</th>
                  <th>UNIQUEID (IMEI)</th>
                  <th>PHONE</th>
                  <th>CITY</th>
                  <th>ROADCAST STATUS</th>
                  <th>FINAL STATUS</th>
                  <th>REMAINING DAYS</th>
                  <th>DECISION</th>
                  <th>REMARK</th>
                </tr>
              </thead>
              <tbody>
                {previewItems.slice(0, 25).map((d, idx) => (
                  <tr key={d.imei || idx}>
                    <td><strong>{d.vehicle}</strong></td>
                    <td className="mono">{d.imei}</td>
                    <td className="mono">{d.sim || '—'}</td>
                    <td><span className="city-tag">{d.city}</span></td>
                    <td>
                      <span className={`status-badge status-${String(d.roadcastStatus || 'active').toLowerCase()}`}>
                        {d.roadcastStatus || 'Active'}
                      </span>
                    </td>
                    <td>{d.statusOverride ? `${d.statusOverride} (Override)` : (d.finalStatus || '—')}</td>
                    <td>{d.remainingDays !== undefined ? `${d.remainingDays}d` : '—'}</td>
                    <td>{d.renewalDecision || 'Pending'}</td>
                    <td>{d.renewalRemark || d.remark || '—'}</td>
                  </tr>
                ))}
                {previewItems.length > 25 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', color: '#94a3b8', padding: '10px' }}>
                      ... and {previewItems.length - 25} more items included in email.
                    </td>
                  </tr>
                )}
                {previewItems.length === 0 && (
                  <tr>
                    <td colSpan="9" className="empty-state">
                      <Icon name="info" size={28} />
                      <p>No matching devices for this notification type.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}