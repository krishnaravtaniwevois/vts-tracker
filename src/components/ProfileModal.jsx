import React, { useState } from 'react';
import { Icon } from './Icons';
import { saveUser } from '../services/api';

export function ProfileModal({ currentUser, onClose, onLogout, onRefreshUser }) {
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassText, setShowPassText] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [passMsg, setPassMsg] = useState('');
  const [passError, setPassError] = useState('');

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'Admin';
  const initials = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : '?';

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPassMsg('');
    setPassError('');

    if (!newPassword || newPassword.trim().length < 4) {
      setPassError('Password must be at least 4 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError('Passwords do not match.');
      return;
    }

    setSavingPass(true);
    try {
      const res = await saveUser({
        email: currentUser.email,
        oldEmail: currentUser.email,
        name: currentUser.name,
        role: currentUser.role,
        assignedCities: currentUser.assignedCities || [],
        password: newPassword.trim()
      });

      if (res.success) {
        const updated = { ...currentUser, password: newPassword.trim() };
        localStorage.setItem('vts_tracker_current_user', JSON.stringify(updated));
        if (onRefreshUser) onRefreshUser(updated);
        setPassMsg('Password changed successfully!');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setShowPasswordChange(false);
          setPassMsg('');
        }, 1500);
      } else {
        setPassError(res.error || 'Failed to update password.');
      }
    } catch (err) {
      setPassError(err.message || 'Error updating password.');
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px' }}
      >
        <div className="modal-header">
          <div>
            <div className="modal-eyebrow">{isAdmin ? 'ADMIN PROFILE' : 'MANAGER PROFILE'}</div>
            <h2 className="modal-title">My Account</h2>
            <p className="modal-subtitle">Your active session details and site access</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="manager-profile-card">
            <div className="user-avatar extra-large">{initials}</div>
            <div className="profile-details-block">
              <h3>{currentUser.name}</h3>
              <p className="user-email-text mono">{currentUser.email}</p>
              <div className="profile-meta-row">
                <span className={`status-badge ${isAdmin ? 'status-active' : 'status-other'}`}>
                  {isAdmin ? 'Admin' : 'Site Manager'}
                </span>
                {isAdmin ? (
                  <span className="city-scope-text">
                    <b>Access:</b> Full Fleet (All Cities)
                  </span>
                ) : (
                  <span className="city-scope-text">
                    <b>Cities:</b>{' '}
                    {currentUser.assignedCities && currentUser.assignedCities.length > 0
                      ? currentUser.assignedCities.join(', ')
                      : 'None assigned'}
                  </span>
                )}
              </div>
            </div>

            <div className="profile-security-note">
              <Icon name="check" size={16} />
              <span>
                {isAdmin
                  ? 'Full administrative control over all fleet vehicles, renewals, and user credentials.'
                  : 'Your dashboard is securely scoped to view and manage only your assigned cities.'}
              </span>
            </div>

            {/* Password Change Toggle */}
            {!showPasswordChange ? (
              <button
                type="button"
                className="secondary-button"
                style={{ width: '100%', marginTop: '6px' }}
                onClick={() => setShowPasswordChange(true)}
              >
                <Icon name="lock" size={14} /> &nbsp; Change My Password
              </button>
            ) : (
              <form
                onSubmit={handleUpdatePassword}
                style={{
                  width: '100%',
                  marginTop: '10px',
                  background: 'rgba(255,255,255,0.03)',
                  padding: '14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Set New Password</strong>
                  <button
                    type="button"
                    onClick={() => setShowPasswordChange(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Cancel
                  </button>
                </div>

                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '11px' }}>New Password</label>
                  <div className="input-field-wrap">
                    <input
                      type={showPassText ? 'text' : 'password'}
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      style={{ padding: '6px 10px', fontSize: '13px' }}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassText(!showPassText)}
                      tabIndex={-1}
                    >
                      <Icon name={showPassText ? 'eye-off' : 'eye'} size={14} />
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px' }}>Confirm New Password</label>
                  <input
                    type={showPassText ? 'text' : 'password'}
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    style={{ padding: '6px 10px', fontSize: '13px' }}
                  />
                </div>

                {passError && (
                  <p style={{ color: '#f87171', fontSize: '12px', marginBottom: '8px' }}>
                    {passError}
                  </p>
                )}

                {passMsg && (
                  <p style={{ color: '#4ade80', fontSize: '12px', marginBottom: '8px' }}>
                    {passMsg}
                  </p>
                )}

                <button
                  type="submit"
                  className="primary-button"
                  disabled={savingPass}
                  style={{ width: '100%', padding: '8px' }}
                >
                  {savingPass ? 'Saving...' : 'Update Password'}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="secondary-button danger"
            onClick={onLogout}
            style={{ color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.4)' }}
          >
            <Icon name="logout" size={15} /> &nbsp; Sign Out
          </button>
          <button className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

