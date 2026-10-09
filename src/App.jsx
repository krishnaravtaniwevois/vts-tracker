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
import { fetchAllFleetData, getStoredApiUrl, getCurrentUser, setCurrentUser, saveDailySnapshotApi, getWeeklyContinuousInactiveRunningApi } from './services/api';
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
  const [isSavingDaily, setIsSavingDaily] = useState(false);
  const [saveToast, setSaveToast] = useState(null);
  const [weeklyChronicCount, setWeeklyChronicCount] = useState(0);

  const handleSaveDailySnapshot = async () => {
    setIsSavingDaily(true);
    setSaveToast(null);
    try {
      // Per user instruction: Save to Drive folder as CSV only. Do NOT create any date sheet/tab in spreadsheet!
      const res = await saveDailySnapshotApi();
      if (res && res.success) {
        setSaveToast({
          type: 'success',
          text: `✅ ${res.message || "Today's report saved in Google Drive!"}`
        });
        loadData();
      } else {
        setSaveToast({
          type: 'error',
          text: `❌ ${res?.error || 'Failed to save report.'}`
        });
      }
    } catch (err) {
      setSaveToast({
        type: 'error',
        text: `❌ Error saving report: ${err.message}`
      });
    } finally {
      setIsSavingDaily(false);
      setTimeout(() => setSaveToast(null), 6000);
    }
  };

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

      // Check 1-Week Chronic Defaulters in background
      getWeeklyContinuousInactiveRunningApi()
        .then((res) => {
          if (res && res.success) setWeeklyChronicCount(res.chronicCount || 0);
        })
        .catch(() => {});
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

          getWeeklyContinuousInactiveRunningApi()
            .then((res) => {
              if (!ignore && res && res.success) setWeeklyChronicCount(res.chronicCount || 0);
            })
            .catch(() => {});
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
    { label: 'Inactive + Running', icon: 'alert', count: weeklyChronicCount > 0 ? `${weeklyChronicCount} Chronic` : undefined },
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
        <div className="brand" onClick={() => setActiveNav('Overview')} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src="/wevois-logo.png"
            alt="WeVOIS Logo"
            style={{ width: '38px', height: '38px', objectFit: 'contain', background: '#fff', borderRadius: '8px', padding: '2px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
          />
          <div className="brand-title">
            <span>WeVOIS <b>VTS</b></span>
            <small>Fleet Intelligence</small>
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
        {/* Floating Save Toast Notification */}
        {saveToast && (
          <div
            style={{
              position: 'fixed',
              top: '18px',
              right: '24px',
              zIndex: 99999,
              padding: '12px 20px',
              borderRadius: '10px',
              background: saveToast.type === 'success' ? '#065f46' : '#991b1b',
              border: `1px solid ${saveToast.type === 'success' ? '#34d399' : '#f87171'}`,
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <span>{saveToast.text}</span>
            <button
              type="button"
              onClick={() => setSaveToast(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '0 4px',
                lineHeight: 1
              }}
            >
              &times;
            </button>
          </div>
        )}

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
            {/* 1-Click Save Daily Drive Report */}
            <button
              type="button"
              onClick={handleSaveDailySnapshot}
              disabled={isSavingDaily}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '8px',
                background: isSavingDaily ? 'rgba(16, 185, 129, 0.25)' : 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                color: '#fff',
                cursor: isSavingDaily ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
              title="Save or update today's CSV report directly into Google Drive folder (no sheet tab created)"
            >
              {isSavingDaily ? (
                <>
                  <Icon name="refresh" size={14} className="spin" />
                  <span>Saving to Drive...</span>
                </>
              ) : (
                <>
                  <span>💾 Save Daily Report (Drive)</span>
                </>
              )}
            </button>

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
                {(attentionList.length > 0 || weeklyChronicCount > 0) && (
                  <span>{attentionList.length + (weeklyChronicCount > 0 ? 1 : 0)}</span>
                )}
              </button>

              {showNotifications && (
                <div className="notification-dropdown">
                  <div className="dropdown-header">
                    <h4>Attention Required ({attentionList.length + (weeklyChronicCount > 0 ? 1 : 0)})</h4>
                    <button className="close-mini" onClick={() => setShowNotifications(false)}>
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  <div className="dropdown-list">
                    {/* 1-Week Chronic Defaulter High-Priority Alert */}
                    {weeklyChronicCount > 0 && (
                      <div
                        className="notification-item"
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          borderLeft: '3px solid #ef4444',
                          marginBottom: '8px',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setActiveNav('Inactive + Running');
                          setShowNotifications(false);
                        }}
                      >
                        <span className="dot red" />
                        <div>
                          <strong style={{ color: '#f87171' }}>🚨 1-Week Chronic Defaulters ({weeklyChronicCount})</strong>
                          <small style={{ color: '#cbd5e1' }}>
                            Continuous Inactive + RUNNING for past 7 days &bull; Click to inspect
                          </small>
                        </div>
                      </div>
                    )}
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
                  devices={scopedDevices}
                  users={users}
                  onSelectDevice={setSelectedDevice}
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
