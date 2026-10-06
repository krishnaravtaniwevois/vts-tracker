import React, { useState, useMemo } from 'react';
import { Icon } from './Icons';
import { saveUser, deleteUser, sendRenewalReminders, sendWelcomeEmail, syncUsersToFirebase } from '../services/api';

export function UserManagementView({ users = [], devices = [], onRefresh }) {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Sync state
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState(null);

  // Form states
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('Manager');
  const [formCities, setFormCities] = useState([]);
  const [cityInput, setCityInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswordMap, setShowPasswordMap] = useState({});

  // Email Reminders state
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);

  // Unique available fleet cities for quick chips
  const allFleetCities = useMemo(() => {
    const set = new Set();
    devices.forEach((d) => {
      if (d.city) set.add(d.city);
    });
    return Array.from(set).sort();
  }, [devices]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        (u.assignedCities && u.assignedCities.some((c) => c.toLowerCase().includes(q)))
    );
  }, [users, search]);

  const openAddModal = () => {
    setEditingUser(null);
    setFormEmail('');
    setFormName('');
    setFormPassword('manager123');
    setFormRole('Manager');
    setFormCities([]);
    setCityInput('');
    setShowAddModal(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormName(user.name);
    setFormPassword(user.password || (user.role === 'Admin' ? 'admin123' : 'manager123'));
    setFormRole(user.role || 'Manager');
    setFormCities(user.assignedCities || []);
    setCityInput('');
    setShowAddModal(true);
  };

  const handleToggleCity = (city) => {
    if (formCities.includes(city)) {
      setFormCities(formCities.filter((c) => c !== city));
    } else {
      setFormCities([...formCities, city]);
    }
  };

  const handleAddCustomCity = () => {
    const clean = cityInput.trim();
    if (clean && !formCities.includes(clean)) {
      setFormCities([...formCities, clean]);
      setCityInput('');
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!formEmail || !formName) {
      alert('Email and Name are required.');
      return;
    }

    const isNewUser = !editingUser;
    const finalPassword = formPassword.trim() || (formRole === 'Admin' ? 'admin123' : 'manager123');

    setIsSubmitting(true);
    try {
      const res = await saveUser({
        email: formEmail.trim(),
        oldEmail: editingUser ? editingUser.email : undefined,
        name: formName.trim(),
        role: formRole,
        password: finalPassword,
        assignedCities: formRole === 'Admin' ? [] : formCities
      });

      if (res.success) {
        setShowAddModal(false);
        if (onRefresh) onRefresh();

        // Send welcome email for new users only
        if (isNewUser) {
          try {
            await sendWelcomeEmail({
              email: formEmail.trim(),
              name: formName.trim(),
              password: finalPassword,
              role: formRole,
              assignedCities: formRole === 'Admin' ? [] : formCities
            });
            alert(`✅ User created! Login credentials sent to ${formEmail.trim()}`);
          } catch {
            alert(`✅ User created! (Email notification failed — check API connection)`);
          }
        } else {
          alert(res.message || 'User updated successfully!');
        }
      } else {
        alert('Failed to save user: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error saving user: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Are you sure you want to remove ${user.name} (${user.email})?`)) {
      return;
    }

    try {
      const res = await deleteUser(user.email, user.uid);
      if (res && res.success) {
        if (onRefresh) onRefresh();
        alert(`✅ ${res.message || 'User deleted successfully from Firebase!'}`);
      } else {
        alert('Failed to delete user: ' + (res?.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error deleting user: ' + err.message);
    }
  };

  // Trigger Instant Email Reminders
  const handleSendReminders = async () => {
    setIsSendingReminders(true);
    setReminderResult(null);
    try {
      const res = await sendRenewalReminders();
      if (res.success) {
        setReminderResult({
          type: 'success',
          text: res.message || `Sent reminder emails to ${res.emailCount} site managers!`
        });
      } else {
        setReminderResult({
          type: 'error',
          text: res.error || 'Failed to send reminder emails.'
        });
      }
    } catch (err) {
      setReminderResult({
        type: 'error',
        text: err.message
      });
    } finally {
      setIsSendingReminders(false);
    }
  };

  const handleSyncFirestore = async () => {
    setIsSyncingFirestore(true);
    setSyncStatusMsg(null);
    try {
      const res = await syncUsersToFirebase(users);
      if (res.success) {
        setSyncStatusMsg({ type: 'success', text: `✅ ${res.message}` });
        if (onRefresh) onRefresh();
      } else {
        setSyncStatusMsg({ type: 'error', text: res.error || 'Failed to sync to Firestore.' });
      }
    } catch (err) {
      setSyncStatusMsg({ type: 'error', text: err.message });
    } finally {
      setIsSyncingFirestore(false);
    }
  };

  return (
    <div className="users-management-view">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h2>Site Manager Access &amp; Permissions</h2>
          <p>
            Assign site managers to specific cities. Managers only see and edit devices in their assigned cities, and receive automated email reminders for pending renewal decisions.
          </p>
        </div>
        <div className="header-actions-group">
          <button
            className="secondary-button"
            onClick={handleSyncFirestore}
            disabled={isSyncingFirestore}
            title="Sync all user accounts directly into Firebase Firestore 'users' collection"
          >
            <Icon name="refresh" size={15} className={isSyncingFirestore ? 'spin' : ''} />
            {isSyncingFirestore ? 'Syncing Firestore...' : 'Sync to Firebase Firestore'}
          </button>
          <button
            className="secondary-button"
            onClick={handleSendReminders}
            disabled={isSendingReminders}
            title="Send email reminders to all site managers with pending renewal items via MailApp"
          >
            <Icon name="refresh" size={15} className={isSendingReminders ? 'spin' : ''} />
            {isSendingReminders ? 'Sending Emails...' : 'Send Reminders Now'}
          </button>
          <button className="primary-button" onClick={openAddModal}>
            <Icon name="plus" size={15} /> Add New User
          </button>
        </div>
      </div>

      {syncStatusMsg && (
        <div className={`alert-banner ${syncStatusMsg.type}`} style={{ marginBottom: '16px' }}>
          <Icon name={syncStatusMsg.type === 'success' ? 'check' : 'alert'} size={16} />
          <span>{syncStatusMsg.text}</span>
        </div>
      )}

      {reminderResult && (
        <div className={`alert-banner ${reminderResult.type}`} style={{ marginBottom: '16px' }}>
          <Icon name={reminderResult.type === 'success' ? 'check' : 'alert'} size={16} />
          <span>{reminderResult.text}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="filter-toolbar">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            type="text"
            placeholder="Search users by name, email, role, or assigned cities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear-search" onClick={() => setSearch('')}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="panel table-panel">
        <div className="table-controls-bar">
          <div className="table-count-summary">
            Total <b>{filteredUsers.length}</b> users configured in Firebase Firestore
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NAME</th>
                <th>EMAIL</th>
                <th>ROLE</th>
                <th>ASSIGNED CITIES (FILTER SCOPE)</th>
                <th>PASSWORD</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const isAdmin = u.role === 'Admin';
                const userPass = u.password || (isAdmin ? 'admin123' : 'manager123');
                return (
                  <tr key={u.email}>
                    <td>
                      <strong>{u.name}</strong>
                    </td>
                    <td className="mono">{u.email}</td>
                    <td>
                      <span className={`status-badge ${isAdmin ? 'status-active' : 'status-other'}`}>
                        {u.role || 'Manager'}
                      </span>
                    </td>
                    <td>
                      {isAdmin ? (
                        <span className="badge-tag success">All Cities (Unrestricted)</span>
                      ) : u.assignedCities && u.assignedCities.length > 0 ? (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {u.assignedCities.map((c) => (
                            <span key={c} className="city-tag">
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">No cities assigned</span>
                      )}
                    </td>
                    <td className="mono">
                      <span
                        style={{ cursor: 'pointer', background: '#0f172a', padding: '4px 8px', borderRadius: '6px', border: '1px solid #334155' }}
                        onClick={() => setShowPasswordMap((prev) => ({ ...prev, [u.email]: !prev[u.email] }))}
                        title="Click to reveal/hide password"
                      >
                        {showPasswordMap[u.email] ? userPass : '••••••••'}
                      </span>
                    </td>
                    <td>
                      <div className="table-row-actions">
                        <button
                          className="secondary-button compact"
                          onClick={() => openEditModal(u)}
                        >
                          Edit
                        </button>
                        {!isAdmin && (
                          <button
                            className="secondary-button compact danger"
                            onClick={() => handleDeleteUser(u)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-state">
                    <p>No users matching the search filter.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit User Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">USER ACCESS</div>
                <h2 className="modal-title">
                  {editingUser ? `Edit User: ${editingUser.name}` : 'Add New Site Manager'}
                </h2>
                <p className="modal-subtitle">Configure permissions and assigned city scope</p>
              </div>
              <button className="icon-button" onClick={() => setShowAddModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="modal-body modal-form">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Sharma"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. krishnaravtani.wevois@gmail.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
                {editingUser && (
                  <small className="text-muted" style={{ fontSize: '11px', marginTop: '4px', display: 'block' }}>
                    You can edit and update this user's email address anytime.
                  </small>
                )}
              </div>

              <div className="form-group">
                <label>Role</label>
                <select value={formRole} onChange={(e) => setFormRole(e.target.value)}>
                  <option value="Manager">Site Manager (Restricted to Assigned Cities)</option>
                  <option value="Admin">Admin (Full Access to All Cities)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Login Password *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. manager123"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
                <small className="text-muted" style={{ fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  Used to sign in to this portal. Default: manager123
                </small>
              </div>

              {formRole === 'Manager' && (
                <div className="form-group">
                  <label>Assigned Cities (Click to toggle)</label>
                  <div className="city-chips-selector">
                    {allFleetCities.map((city) => {
                      const isSelected = formCities.includes(city);
                      return (
                        <button
                          key={city}
                          type="button"
                          className={`city-toggle-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleToggleCity(city)}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {city}
                        </button>
                      );
                    })}
                  </div>

                  <div className="custom-city-input-row" style={{ marginTop: '10px' }}>
                    <input
                      type="text"
                      placeholder="Add custom city name..."
                      value={cityInput}
                      onChange={(e) => setCityInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomCity();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={handleAddCustomCity}
                    >
                      Add City
                    </button>
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={isSubmitting}>
                  <Icon name="check" size={16} />
                  {isSubmitting ? 'Saving...' : 'Save User Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

