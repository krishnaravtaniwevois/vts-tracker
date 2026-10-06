import React, { useState } from 'react';
import { Icon } from './Icons';
import { addNewDevice } from '../services/api';

export function AddDeviceModal({ devices = [], isOpen, onClose, onRefresh }) {
  const [name, setName] = useState('');
  const [uniqueid, setUniqueid] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [vtsType, setVtsType] = useState('VTS Package 4G');
  const [remark, setRemark] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  // Check if IMEI already exists
  const cleanImei = String(uniqueid || '').trim().replace(/\s+/g, '');
  const existingDevice = cleanImei
    ? devices.find((d) => String(d.imei || '').trim() === cleanImei)
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!cleanImei) {
      setErrorMsg('Uniqueid (IMEI) is required.');
      return;
    }

    if (existingDevice) {
      setErrorMsg(`Duplicate IMEI: Device "${existingDevice.vehicle}" in ${existingDevice.city} is already using this IMEI.`);
      return;
    }

    setLoading(true);
    try {
      const res = await addNewDevice({
        name: name.trim(),
        uniqueid: cleanImei,
        phone: phone.trim(),
        city: city.trim() || 'Other',
        vtsType: vtsType.trim(),
        remark: remark.trim()
      });

      if (res.success) {
        setSuccessMsg(res.message || `Device "${name.trim()}" added successfully!`);
        if (onRefresh) onRefresh();
        setTimeout(() => {
          onClose();
          setName('');
          setUniqueid('');
          setPhone('');
          setCity('');
          setRemark('');
          setSuccessMsg('');
        }, 1400);
      } else {
        setErrorMsg(res.error || 'Failed to add new device.');
      }
    } catch (err) {
      setErrorMsg('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const commonVtsTypes = [
    'VTS Package 4G',
    'TcsVts (V-New)',
    'VTS Package ( 7500 MAH )',
    'TCSVTS (B-New)',
    'VTS Pakage 4G',
    'Other'
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-eyebrow">FLEET ONBOARDING</div>
            <h2 className="modal-title">Add New VTS Device</h2>
            <p className="modal-subtitle">
              Appends a new row directly to master "900" Google Sheet with zero manual formula work.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body modal-form">
          {errorMsg && (
            <div className="alert-banner error">
              <Icon name="alert" size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="alert-banner success">
              <Icon name="check" size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {existingDevice && (
            <div className="alert-banner error" style={{ margin: '0 0 12px 0' }}>
              <Icon name="alert" size={16} />
              <span>
                <b>Duplicate Warning:</b> IMEI is already registered to vehicle <b>{existingDevice.vehicle}</b> ({existingDevice.city}).
              </span>
            </div>
          )}

          <div className="form-row-2">
            <div className="form-group">
              <label>Vehicle Name (Col B) *</label>
              <input
                type="text"
                required
                placeholder="e.g. TATA-AT-5469, DUMPER-6029"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Uniqueid / IMEI (Col C) *</label>
              <input
                type="text"
                required
                placeholder="15-digit IMEI number"
                value={uniqueid}
                onChange={(e) => setUniqueid(e.target.value)}
                className="mono"
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Phone / SIM Number (Col D)</label>
              <input
                type="text"
                placeholder="e.g. 5754228752687"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mono"
              />
            </div>

            <div className="form-group">
              <label>City / Site Location (Col E) *</label>
              <input
                type="text"
                required
                placeholder="e.g. Ajmer, Bundi, Goa, Sikar"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>VTS Package Type (Col I)</label>
            <select
              value={vtsType}
              onChange={(e) => setVtsType(e.target.value)}
            >
              {commonVtsTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Initial Remark / Notes (Col J)</label>
            <textarea
              rows="2"
              placeholder="Optional notes, technician name, or initial comments..."
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={loading || Boolean(existingDevice) || !cleanImei || !name.trim()}
            >
              <Icon name="upload" size={16} />
              {loading ? 'Adding to Google Sheets...' : 'Add Device to "900" Sheet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

