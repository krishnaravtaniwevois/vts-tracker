import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';
import { Icon } from './components/Icons';
import { Dashboard } from './components/Dashboard';
import { DeviceList } from './components/DeviceList';
import { RequestsView } from './components/RequestsView';
import { ReportsView } from './components/ReportsView';
import { ImportRoadcastView } from './components/ImportRoadcastView';
import { RenewalDashboard } from './components/RenewalDashboard';
import { UserManagementView } from './components/UserManagementView';
import { NotificationCenterView } from './components/NotificationCenterView';
import { DataFillStatusView } from './components/DataFillStatusView';
import { InactiveRunningView } from './components/InactiveRunningView';
import { VehicleHistoryView } from './components/VehicleHistoryView';
import { UserSwitcher } from './components/UserSwitcher';
import { ProfileModal } from './components/ProfileModal';
import { DeviceModal } from './components/DeviceModal';
import { SettingsModal } from './components/SettingsModal';
import { LoginScreen } from './components/LoginScreen';
import { AIAssistantDrawer } from './components/AIAssistantDrawer';
import { TabErrorBoundary } from './components/ErrorBoundary';
import { fetchAllFleetData, getStoredApiUrl, getCurrentUser, setCurrentUser } from './services/api';
export function App() {
  const [activeNav, setActiveNavState] = useState(() => {
    return localStorage.getItem('vts_tracker_active_nav') || 'Overview';
  });

  const [visitedNavs, setVisitedNavs] = useState(() => new Set([localStorage.getItem('vts_tracker_active_nav') || 'Overview']));

  const setActiveNav = (nav) => {
    setActiveNavState(nav);
    setVisitedNavs((prev) => new Set([...prev, nav]));
    try {
      localStorage.setItem('vts_tracker_active_nav', nav);
    } catch (e) {
      console.warn('Failed to save activeNav:', e);
    }
  };
  const [devices, setDevices] = useState([]);
  const [requests, setRequests] = useState([]);
  const [returnRequests, setReturnRequests] = useState([]);
  const [renewalLogs, setRenewalLogs] = useState([]);
  const [renewalArchives, setRenewalArchives] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUserState] = useState(getCurrentUser());

  const [isMockMode, setIsMockMode] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);

  // Global search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [selectedCityFilter, setSelectedCityFilter] = useState('All');

  // Modals
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentUserState(null);
    localStorage.removeItem('vts_tracker_current_user');
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllFleetData();
      setDevices(data.devices || []);
      setRequests(data.requests || []);
      setReturnRequests(data.returnRequests || []);
      setRenewalLogs(data.renewalLogs || []);
      setRenewalArchives(data.renewalArchives || []);
      setUsers(data.users || []);
      if (data.currentUser) setCurrentUserState(data.currentUser);
      setIsMockMode(!!data.isMock);
      setLastSynced(new Date());
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      setLoading(true);
      try {
        const data = await fetchAllFleetData();
        if (!ignore) {
          setDevices(data.devices || []);
          setRequests(data.requests || []);
          setReturnRequests(data.returnRequests || []);
          setRenewalLogs(data.renewalLogs || []);
          setRenewalArchives(data.renewalArchives || []);
          setUsers(data.users || []);
          if (data.currentUser) setCurrentUserState(data.currentUser);
          setIsMockMode(!!data.isMock);
          setLastSynced(new Date());
        }
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  // Scoped Devices based on User Role & Assigned Cities
  const scopedDevices = useMemo(() => {
    if (!currentUser || currentUser.role === 'Admin') return devices;
    const assigned = (currentUser.assignedCities || []).map((c) => String(c || '').toLowerCase().trim());
    if (assigned.length === 0) return [];
    return devices.filter((d) => assigned.includes(String(d.city || '').toLowerCase().trim()));
  }, [devices, currentUser]);

  // Devices needing attention for notification drawer
  const attentionList = scopedDevices.filter(
    (d) => d.status === 'Recharge Soon' || d.status === 'Expired'
  );

  const handleGlobalSearch = (e) => {
    setSearchQuery(e.target.value);
    if (activeNav !== 'Devices') {
      setActiveNav('Devices');
    }
  };

  const isAdmin = currentUser?.role === 'Admin';

  const navItems = [
    { label: 'Overview', icon: 'grid' },
    { label: 'Devices', icon: 'device', count: scopedDevices.length || undefined },
    { label: 'Renewals', icon: 'battery', count: attentionList.length || undefined },
    { label: 'Inactive + Running', icon: 'alert' },
    { label: 'Data Fill Status', icon: 'check' },
    { label: 'Notifications', icon: 'mail' },
    { label: 'Import Roadcast', icon: 'upload' },
    { label: 'Requests & Returns', icon: 'inbox', count: requests.length + returnRequests.length || undefined },
    { label: 'Reports', icon: 'chart' },
    { label: 'Vehicle History', icon: 'history' }
  ];

  if (isAdmin) {
    navItems.push({ label: 'Site Managers', icon: 'users', count: users.length || undefined });
  }

  if (!currentUser) {
    return (
      <LoginScreen
        users={users}
        onLoginSuccess={(u) => {
          setCurrentUserState(u);
          loadData();
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand" onClick={() => setActiveNav('Overview')}>
          <span className="brand-mark">V</span>
          <div className="brand-title">
            <span>VTS <b>Tracker</b></span>
            <small>Wevois Labs</small>
          </div>
        </div>

        <div className="workspace-label">MAIN MENU</div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.label}
              className={activeNav === item.label ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveNav(item.label)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.count !== undefined && <em className="nav-badge">{item.count}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="workspace-label">CONFIGURATION</div>
          <button className="nav-item" onClick={() => setShowSettings(true)}>
            <Icon name="settings" />
            <span>API Settings</span>
          </button>
          <button className="nav-item" onClick={handleLogout} title="Sign Out of Portal" style={{ color: '#f87171' }}>
            <Icon name="logout" />
            <span>Log Out</span>
          </button>
          {isMockMode && !getStoredApiUrl() && (
            <div className="mock-badge">
              <span>Demo Mock Mode</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main App Content Area */}
      <main className="main-content">
        {/* Top Header */}
        <header className="top-header">
          <div className="header-left">
            <div className="global-search-wrap">
              <Icon name="search" size={16} />
              <input
                type="text"
                placeholder="Quick search vehicle, IMEI, SIM, city across all views..."
                value={searchQuery}
                onChange={handleGlobalSearch}
              />
            </div>
          </div>

          <div className="header-actions">
            {/* Direct Refresh Action */}
            <button
              className="icon-button"
              onClick={loadData}
              title="Sync with Google Sheets"
              disabled={loading}
            >
              <Icon name="refresh" size={18} className={loading ? 'spin' : ''} />
            </button>

            {/* Notification Bell */}
            <div className="notification-wrapper">
              <button
                className="icon-button notification"
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label="Attention alerts"
              >
                <Icon name="bell" size={18} />
                {attentionList.length > 0 && <span>{attentionList.length}</span>}
              </button>

              {showNotifications && (
                <div className="notification-dropdown">
                  <div className="dropdown-header">
                    <h4>Attention Required ({attentionList.length})</h4>
                    <button className="close-mini" onClick={() => setShowNotifications(false)}>
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  <div className="dropdown-list">
                    {attentionList.slice(0, 8).map((d) => (
                      <div
                        key={d.imei}
                        className="notification-item"
                        onClick={() => {
                          setSelectedDevice(d);
                          setShowNotifications(false);
                        }}
                      >
                        <span className={`dot ${d.status === 'Expired' ? 'red' : 'amber'}`} />
                        <div>
                          <strong>{d.vehicle} ({d.city})</strong>
                          <small>
                            {d.status === 'Expired' ? 'Expired' : 'Recharge soon'} &bull; {d.licenseEnd}
                          </small>
                        </div>
                      </div>
                    ))}
                    {attentionList.length === 0 && (
                      <p className="p-3 text-center text-muted">No urgent alerts!</p>
                    )}
                  </div>
                  {attentionList.length > 8 && (
                    <div className="dropdown-footer">
                      <button
                        onClick={() => {
                          setSelectedStatusFilter('Recharge Soon');
                          setActiveNav('Devices');
                          setShowNotifications(false);
                        }}
                      >
                        View all {attentionList.length} items &rarr;
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Settings Quick Access */}
            <button
              className="icon-button"
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <Icon name="settings" size={18} />
            </button>

            {/* Active User Profile Badge */}
            <UserSwitcher
              currentUser={currentUser}
              onOpenProfile={() => setShowProfileModal(true)}
            />

            {/* Direct Logout Action */}
            <button
              className="icon-button"
              onClick={handleLogout}
              title="Log Out of Account"
              style={{ color: '#f87171' }}
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="content-wrap">
          {/* Active Navigation Views - Persisted so switching tabs preserves all state, filters & search */}
          {visitedNavs.has('Overview') && (
            <div style={{ display: activeNav === 'Overview' ? 'block' : 'none' }}>
              <TabErrorBoundary tabName="Overview">
                <Dashboard
                  devices={scopedDevices}
                  requests={requests}
                  returnRequests={returnRequests}
                  currentUser={currentUser}
                  isMockMode={isMockMode}
                  onOpenSettings={() => setShowSettings(true)}
                  selectedStatus={selectedStatusFilter}
                  onSelectDevice={setSelectedDevice}
                  onSelectStatusFilter={(status) => {
                    setSelectedStatusFilter(status);
                    setActiveNav('Devices');
                  }}
                  onSelectCityFilter={(city) => {
                    setSelectedCityFilter(city);
                    setActiveNav('Devices');
                  }}
                  onNavigate={setActiveNav}
                />
              </TabErrorBoundary>
            </div>
          )}

          {visitedNavs.has('Devices') && (
            <div style={{ display: activeNav === 'Devices' ? 'block' : 'none' }}>
              <TabErrorBoundary tabName="Devices">
                <DeviceList
                  devices={scopedDevices}
                  onSelectDevice={setSelectedDevice}
                  initialStatusFilter={selectedStatusFilter}
                  initialCityFilter={selectedCityFilter}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onRefresh={loadData}
                />
              </TabErrorBoundary>
            </div>
          )}

          {visitedNavs.has('Renewals') && (
            <div style={{ display: activeNav === 'Renewals' ? 'block' : 'none' }}>
              <TabErrorBoundary tabName="Renewals">
                <RenewalDashboard
                  devices={scopedDevices}
                  renewalLogs={renewalLogs}
                  renewalArchives={renewalArchives}
                  onRefresh={loadData}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                />
              </TabErrorBoundary>
            </div>
          )}

          {visitedNavs.has('Notifications') && (
            <div style={{ display: activeNav === 'Notifications' ? 'block' : 'none' }}>
              <TabErrorBoundary tabName="Notifications">
                <NotificationCenterView
                  devices={scopedDevices}
                  users={users}
                  onRefresh={loadData}
                />
              </TabErrorBoundary>
            </div>
          )}

          {visitedNavs.has('Data Fill Status') && (
            <div style={{ display: activeNav === 'Data Fill Status' ? 'block' : 'none' }}>
              <TabErrorBoundary tabName="Data Fill Status">
                <DataFillStatusView
                  users={users}
                />
              </TabErrorBoundary>
            </div>
          )}

          {visitedNavs.has('Inactive + Running') && (
            <div style={{ display: activeNav === 'Inactive + Running' ? 'block' : 'none' }}>
              <TabErrorBoundary tabName="Inactive + Running">
                <InactiveRunningView
                  users={users}
                  onRefresh={loadData}
                />
              </TabErrorBoundary>
            </div>
          )}

          {(visitedNavs.has('Requests') || visitedNavs.has('Requests & Returns')) && (
            <div style={{ display: (activeNav === 'Requests' || activeNav === 'Requests & Returns') ? 'block' : 'none' }}>
              <TabErrorBoundary tabName="Requests & Returns">
                <RequestsView
                  requests={requests}
                  returnRequests={returnRequests}
                  onRefresh={loadData}
                  devices={scopedDevices}
                />
              </TabErrorBoundary>
            </div>
          )}

          {visitedNavs.has('Import Roadcast') && (
            <div style={{ display: activeNav === 'Import Roadcast' ? 'block' : 'none' }}>
              <TabErrorBoundary tabName="Import Roadcast">
                <ImportRoadcastView
                  devices={scopedDevices}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onRefresh={loadData}
                />
              </TabErrorBoundary>
            </div>
          )}

          {visitedNavs.has('Reports') && (
            <div style={{ display: activeNav === 'Reports' ? 'block' : 'none' }}>
              <TabErrorBoundary tabName="Reports">
                <ReportsView devices={scopedDevices} />
              </TabErrorBoundary>
            </div>
          )}

          {visitedNavs.has('Vehicle History') && (
            <div style={{ display: activeNav === 'Vehicle History' ? 'block' : 'none' }}>
              <TabErrorBoundary tabName="Vehicle History">
                <VehicleHistoryView
                  devices={scopedDevices}
                  requests={requests}
                  returnRequests={returnRequests}
                  renewalLogs={renewalLogs}
                />
              </TabErrorBoundary>
            </div>
          )}

          {isAdmin && visitedNavs.has('Site Managers') && (
            <div style={{ display: activeNav === 'Site Managers' ? 'block' : 'none' }}>
              <TabErrorBoundary tabName="Site Managers">
                <UserManagementView
                  users={users}
                  devices={devices}
                  onRefresh={loadData}
                />
              </TabErrorBoundary>
            </div>
          )}

          {/* Footer Sync Note */}
          <p className="data-note">
            <span className={`sync-dot ${loading ? 'syncing' : ''}`} />
            {loading
              ? 'Syncing fleet data with Google Sheets...'
              : lastSynced
              ? `Data synced ${lastSynced.toLocaleTimeString()}`
              : 'Data ready'}
            <button onClick={loadData} className="refresh-link">
              Refresh now
            </button>
          </p>
        </div>
      </main>

      {/* Device Detail / Action Modal */}
      {selectedDevice && (
        <DeviceModal
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
          onRefresh={loadData}
        />
      )}

      {/* User Profile & Password Change Modal */}
      {showProfileModal && (
        <ProfileModal
          currentUser={currentUser}
          onClose={() => setShowProfileModal(false)}
          onLogout={handleLogout}
          onRefreshUser={(updated) => {
            setCurrentUserState(updated);
            loadData();
          }}
        />
      )}

      {/* Google Sheets API Settings Modal */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false);
            loadData();
          }}
        />
      )}

      {/* Floating Free AI Fleet Assistant Drawer */}
      <AIAssistantDrawer
        devices={devices}
        renewalLogs={renewalLogs}
        users={users}
        onNavigate={(nav) => setActiveNav(nav)}
        onSearch={(q) => {
          setSearchQuery(q);
          if (activeNav !== 'Devices') setActiveNav('Devices');
        }}
        onFilterCity={(city) => {
          setSelectedCityFilter(city);
          if (activeNav !== 'Devices') setActiveNav('Devices');
        }}
        onFilterStatus={(status) => {
          setSelectedStatusFilter(status);
          if (activeNav !== 'Devices') setActiveNav('Devices');
        }}
        onRefresh={loadData}
      />
    </div>
  );
}

export default App;
