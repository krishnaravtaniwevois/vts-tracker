import React from 'react';
import { Icon } from './Icons';

export function UserSwitcher({ currentUser, onOpenProfile }) {
  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'Admin';
  const initials = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : '?';

  return (
    <div
      className="user-profile-badge"
      onClick={onOpenProfile}
      title="Click to view your profile"
      style={{ cursor: 'pointer' }}
    >
      <div className="user-avatar">{initials}</div>
      <div className="user-info">
        <div className="user-name">{currentUser.name}</div>
        <div className="user-role-label">
          {isAdmin ? (
            <span className="role-chip admin">ADMIN &bull; All Cities</span>
          ) : (
            <span className="role-chip manager">
              MANAGER &bull;{' '}
              {currentUser.assignedCities && currentUser.assignedCities.length > 0
                ? currentUser.assignedCities.join(', ')
                : 'No City'}
            </span>
          )}
        </div>
      </div>
      <Icon name="arrow" size={12} className="user-dropdown-arrow" />
    </div>
  );
}
