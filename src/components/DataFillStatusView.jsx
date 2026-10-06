import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from './Icons';
import { getDataFillStatus, sendCustomNotification } from '../services/api';

export function DataFillStatusView({ users = [] }) {
  const [dataList, setDataList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Filled' | 'Pending'
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderToast, setReminderToast] = useState(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getDataFillStatus();
      setDataList(list || []);
    } catch (err) {
      setError(err.message || 'Failed to load Data Fill Status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const kpis = useMemo(() => {
    const total = dataList.length;
    const filledToday = dataList.filter((d) => d.filledToday).length;
    const notFilled = total - filledToday;
    return { total, filledToday, notFilled };
  }, [dataList]);

  const filtered = useMemo(() => {
    return dataList.filter((d) => {
      if (!d) return false;
      const city = String(d.city || '').toLowerCase();
      if (search && !city.includes(search.toLowerCase().trim())) {
        return false;
      }
      if (statusFilter === 'Filled' && !d.filledToday) return false;
      if (statusFilter === 'Pending' && d.filledToday) return false;
      return true;
    });
  }, [dataList, search, statusFilter]);

  const handleSendReminderToPending = async () => {
    const pendingCities = dataList.filter((d) => !d.filledToday);
    if (pendingCities.length === 0) {
      alert('All cities have filled their vehicle data today!');
      return;
    }

    const managers = users.filter((u) => u.email && u.role === 'Manager');
    const recipientEmails = managers.map((m) => m.email);

    if (recipientEmails.length === 0) {
      alert('No managers found to send reminders to.');
      return;
    }

    setSendingReminder(true);
    setReminderToast(null);

    try {
      const res = await sendCustomNotification({
        recipients: recipientEmails,
        notificationType: 'Vendor City Vehicle Data Missing Entry Alert',
        message: 'Please fill in today’s vehicle operation and maintenance data in your city tab immediately.',
        items: pendingCities
      });

      if (res.success) {
        setReminderToast({ type: 'success', text: `Reminder sent to ${recipientEmails.length} manager(s) for ${pendingCities.length} pending cities!` });
      } else {
        setReminderToast({ type: 'error', text: res.error || 'Failed to send reminder' });
      }
    } catch (err) {
      setReminderToast({ type: 'error', text: err.message });
    } finally {
      setSendingReminder(false);
      setTimeout(() => setReminderToast(null), 5000);
    }
  };

  return (
    <div className="view-container data-fill-view">
      <div className="view-header">
        <div>
          <h2>Data-Fill Status Monitoring</h2>
          <p className="subtitle">
            Live tracking of daily vehicle operation updates across all Vendor City Vehicle Data tabs.
          </p>
        </div>
        <div className="view-actions">
          <button className="secondary-button" onClick={fetchStatus} disabled={loading}>
            <Icon name="refresh" size={15} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh Status'}
          </button>
          <button
            className="primary-button"
            onClick={handleSendReminderToPending}
            disabled={sendingReminder || kpis.notFilled === 0}
          >
            <Icon name="mail" size={15} className={sendingReminder ? 'spin' : ''} />
            {sendingReminder ? 'Sending...' : `Remind ${kpis.notFilled} Pending Cities`}
          </button>
        </div>
      </div>

      {error && (
        <div className="notification-banner error" style={{ marginBottom: '16px' }}>
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      )}

      {reminderToast && (
        <div className={`notification-banner ${reminderToast.type}`} style={{ marginBottom: '16px' }}>
          <Icon name={reminderToast.type === 'success' ? 'check' : 'alert'} size={18} />
          <span>{reminderToast.text}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: '20px' }}>
        <div className="kpi-card">
          <div className="kpi-title">Total Monitored Cities</div>
          <div className="kpi-value">{kpis.total}</div>
          <div className="kpi-subtitle">Vendor City Vehicle Data tabs</div>
        </div>

        <div className="kpi-card accent">
          <div className="kpi-title">Filled Today</div>
          <div className="kpi-value">{kpis.filledToday}</div>
          <div className="kpi-subtitle">Cities updated with today's entries</div>
        </div>

        <div className="kpi-card danger">
          <div className="kpi-title">Pending / Not Filled</div>
          <div className="kpi-value">{kpis.notFilled}</div>
          <div className="kpi-subtitle">Require immediate follow-up</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="panel" style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-box" style={{ flex: 1, minWidth: '240px' }}>
          <Icon name="search" size={16} />
          <input
            type="text"
            placeholder="Search city name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-pills" style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`preset-pill ${statusFilter === 'All' ? 'active' : ''}`}
            onClick={() => setStatusFilter('All')}
          >
            All ({kpis.total})
          </button>
          <button
            className={`preset-pill ${statusFilter === 'Filled' ? 'active' : ''}`}
            onClick={() => setStatusFilter('Filled')}
          >
            Filled Today ({kpis.filledToday})
          </button>
          <button
            className={`preset-pill ${statusFilter === 'Pending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('Pending')}
          >
            Pending ({kpis.notFilled})
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>CITY / TAB NAME</th>
                <th>LAST ENTRY DATE</th>
                <th>DAYS SINCE LAST ENTRY</th>
                <th>STATUS TODAY</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.city}>
                  <td>
                    <strong>{row.city}</strong>
                  </td>
                  <td>{row.lastEntryDate}</td>
                  <td>
                    {row.daysSinceLastEntry === 0 ? (
                      <span className="text-success font-semibold">Today (0 days)</span>
                    ) : (
                      <span className="text-danger font-semibold">{row.daysSinceLastEntry} day(s) ago</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${row.filledToday ? 'status-active' : 'status-expired'}`}>
                      {row.filledToday ? 'FILLED TODAY' : 'NOT FILLED'}
                    </span>
                  </td>
                  <td>
                    {!row.filledToday && (
                      <button
                        className="table-action-btn"
                        onClick={handleSendReminderToPending}
                        title="Send email reminder to manager"
                      >
                        Send Reminder
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty-state">
                    <Icon name="search" size={28} />
                    <p>No cities found matching your criteria.</p>
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
