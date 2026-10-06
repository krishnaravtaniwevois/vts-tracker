import React, { useState } from 'react';
import { Icon } from './Icons';

export function ReportsView({ devices = [] }) {
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedCity, setSelectedCity] = useState('All');

  const cities = ['All', ...Array.from(new Set(devices.map((d) => d.city).filter(Boolean))).sort()];

  const filtered = devices.filter((d) => {
    const matchStatus = selectedStatus === 'All' || d.status === selectedStatus;
    const matchCity = selectedCity === 'All' || d.city === selectedCity;
    return matchStatus && matchCity;
  });

  const exportToCSV = () => {
    const headers = [
      'Sr.',
      'Name',
      'Uniqueid',
      'Phone',
      'City',
      'Status on Roadcast',
      'Last update',
      'Final Status',
      'VTS Type',
      'Remark'
    ];
    const rows = filtered.map((d, i) => [
      d.sr || i + 1,
      `"${d.vehicle || ''}"`,
      `"${d.imei || ''}"`,
      `"${d.sim || ''}"`,
      `"${d.city || ''}"`,
      `"${d.roadcastStatus || d.status || ''}"`,
      `"${d.lastUpdate || ''}"`,
      `"${d.finalStatus || ''}"`,
      `"${d.vtsType || 'VTS Package 4G'}"`,
      `"${(d.remark || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const fileName = `900_Master_Fleet_${selectedCity}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="reports-view">
      <div className="page-header-row">
        <div>
          <h2>Fleet Analytics & Custom Reports ("900" Sheet)</h2>
          <p>Filter, review, and export master VTS records matching the 900 Google Sheet structure</p>
        </div>
        <button className="primary-button" onClick={exportToCSV}>
          <Icon name="download" size={16} /> Export {filtered.length} Records to CSV / Excel
        </button>
      </div>

      {/* Filter Control Box */}
      <div className="panel filter-panel">
        <div className="filter-grid">
          <div className="form-group">
            <label>Filter by City / Location</label>
            <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Filter by Status on Roadcast</label>
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Expired">Expired</option>
              <option value="Damaged">Damaged</option>
              <option value="Removed for Roadcast">Removed for Roadcast</option>
            </select>
          </div>

          <div className="report-metric-summary">
            <div className="metric-box">
              <span className="metric-num">{filtered.length}</span>
              <span className="metric-lbl">Matching Vehicles</span>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Table */}
      <div className="panel table-panel">
        <div className="panel-heading">
          <h3>Report Data Preview (10-Column "900" Structure)</h3>
          <small className="text-muted">Showing {Math.min(filtered.length, 100)} of {filtered.length} records</small>
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
                <th>FINAL STATUS (COL H)</th>
                <th>VTS TYPE (COL I)</th>
                <th>REMARK (COL J)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((device, idx) => (
                <tr key={device.imei || idx}>
                  <td className="text-muted">{device.sr || idx + 1}</td>
                  <td><strong>{device.vehicle}</strong></td>
                  <td className="mono">{device.imei}</td>
                  <td className="mono">{device.sim || '—'}</td>
                  <td><span className="city-tag">{device.city}</span></td>
                  <td><span className="status-badge">{device.roadcastStatus || device.status || 'Active'}</span></td>
                  <td>{device.lastUpdate || '—'}</td>
                  <td><strong>{device.finalStatus || '—'}</strong></td>
                  <td><small className="text-muted">{device.vtsType || 'VTS Package 4G'}</small></td>
                  <td className="text-muted">{device.remark || '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="10" className="empty-state">
                    No records match the selected report criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

