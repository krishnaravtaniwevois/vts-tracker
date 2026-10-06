import React from 'react';
import { Icon } from './Icons';

export function Dashboard({
  devices = [],
  requests = [],
  returnRequests = [],
  currentUser = { name: 'Admin', role: 'Admin' },
  isMockMode = false,
  onOpenSettings,
  onSelectDevice,
  onSelectStatusFilter,
  onSelectCityFilter,
  selectedStatus,
  onNavigate
}) {
  // Aggregate fleet metrics
  const total = devices.length;
  const activeCount = devices.filter(d => d.status === 'Active').length;
  const inactiveCount = devices.filter(d => d.status === 'Inactive').length;
  const rechargeSoonCount = devices.filter(d => d.status === 'Recharge Soon').length;
  const expiredCount = devices.filter(d => d.status === 'Expired').length;
  const damagedCount = devices.filter(d => d.status === 'Damaged' || d.isDamaged).length;
  const otherCount = Math.max(0, total - (activeCount + inactiveCount + rechargeSoonCount + expiredCount + damagedCount));

  const uptimePercent = total > 0 ? ((activeCount / total) * 100).toFixed(1) : '100';

  // Segmented health bar percentages
  const activePct = total > 0 ? ((activeCount / total) * 100) : 0;
  const inactivePct = total > 0 ? ((inactiveCount / total) * 100) : 0;
  const expiredPct = total > 0 ? (((expiredCount + rechargeSoonCount) / total) * 100) : 0;
  const otherPct = total > 0 ? (((damagedCount + otherCount) / total) * 100) : 0;

  // 4 Top KPI Cards
  const kpiStats = [
    {
      id: 'total',
      label: 'Total Monitored Fleet',
      value: total,
      pill: 'Registered',
      sub: 'All active & idle hardware units',
      actionText: 'View All Units',
      tone: 'blue',
      icon: 'device',
      filterTarget: 'All'
    },
    {
      id: 'active',
      label: 'Active Transmitting',
      value: activeCount,
      pill: `${uptimePercent}% Uptime`,
      sub: 'Real-time telemetry broadcasting',
      actionText: 'Filter Active',
      tone: 'green',
      icon: 'check',
      filterTarget: 'Active'
    },
    {
      id: 'inactive',
      label: 'Inactive / Dormant',
      value: inactiveCount,
      pill: 'Non-Reporting',
      sub: 'Stopped or non-transmitting devices',
      actionText: 'Filter Inactive',
      tone: 'amber',
      icon: 'alert',
      filterTarget: 'Inactive'
    },
    {
      id: 'renewals',
      label: 'Renewals & Expired Due',
      value: expiredCount + rechargeSoonCount,
      pill: expiredCount > 0 ? `${expiredCount} Expired` : 'Due Soon',
      sub: `${expiredCount} expired · ${rechargeSoonCount} due in 7 days`,
      actionText: 'Open Renewals Hub',
      tone: 'red',
      icon: 'refresh',
      filterTarget: 'Renewals'
    }
  ];

  // City Breakdown (Top 6)
  const cityCounts = devices.reduce((acc, d) => {
    const c = (d.city || 'Other').trim();
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});

  const sortedCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const maxCityCount = sortedCities.length > 0 ? sortedCities[0][1] : 1;

  // Priority Operational Radar (Expired or Due Soon)
  const urgentDevices = devices
    .filter(d => d.status === 'Expired' || d.status === 'Recharge Soon')
    .sort((a, b) => (a.remainingDays ?? 999) - (b.remainingDays ?? 999))
    .slice(0, 4);

  // Total pending logistics
  const totalLogistics = (requests?.length || 0) + (returnRequests?.length || 0);

  // Quick Action Launchpad Items
  const launchpadItems = [
    {
      title: "Master Fleet ('900')",
      desc: 'Browse complete hardware directory, IMEI, SIM & live vehicle assignments',
      badge: `${total} Units`,
      badgeColor: 'blue',
      icon: 'device',
      action: () => {
        onSelectStatusFilter('All');
        onNavigate('Devices');
      }
    },
    {
      title: 'License Renewals Hub',
      desc: 'Track licenses expiring within 7 days, recharge logs & monthly archives',
      badge: expiredCount > 0 ? `${expiredCount} Expired` : 'Up to Date',
      badgeColor: expiredCount > 0 ? 'red' : 'green',
      icon: 'refresh',
      action: () => onNavigate('Renewals')
    },
    {
      title: 'Inactive + Running Audit',
      desc: 'Detect ghost tracking & billing leakage: running on portal but marked inactive',
      badge: 'Audit Radar',
      badgeColor: 'amber',
      icon: 'eye',
      action: () => onNavigate('Inactive + Running')
    },
    {
      title: 'Roadcast Dual-Sync',
      desc: 'Upload Excel dumps to auto-sync Col L (License End) & Renewal Sheet',
      badge: 'Dual-Sync',
      badgeColor: 'blue',
      icon: 'upload',
      action: () => onNavigate('Import Roadcast')
    },
    {
      title: 'Requests & Returns',
      desc: 'Requisition new tracking units, site transfers & damaged hardware returns',
      badge: totalLogistics > 0 ? `${totalLogistics} Pending` : 'Logistics',
      badgeColor: 'amber',
      icon: 'truck',
      action: () => onNavigate('Requests & Returns')
    },
    {
      title: 'Intelligence & Reports',
      desc: 'Export clean Excel catalogs, city density breakdown & health statistics',
      badge: 'Excel Export',
      badgeColor: 'green',
      icon: 'chart',
      action: () => onNavigate('Reports')
    }
  ];

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="clean-dashboard">
      {/* 1. Hero Executive Command Header */}
      <div className="dashboard-hero-card">
        <div className="hero-welcome">
          <div className="hero-eyebrow">
            <span className="hero-pulse-dot" />
            <span>LIVE FLEET TELEMETRY &bull; {formattedDate}</span>
          </div>
          <h1>Fleet Command Center</h1>
          <p>
            {currentUser.role === 'Admin'
              ? `Real-time executive monitoring across ${total} GPS trackers and ${Object.keys(cityCounts).length} active project sites.`
              : `Viewing assigned project cities: ${currentUser.assignedCities?.length > 0 ? currentUser.assignedCities.join(', ') : 'All Assigned Sites'}.`}
          </p>
        </div>

        <div className="hero-actions-right">
          <div className="uptime-badge-card" title="Live fleet uptime based on actively transmitting GPS units">
            <div className="uptime-num">{uptimePercent}%</div>
            <div className="uptime-lbl">
              Fleet<br />Uptime
            </div>
          </div>

          {isMockMode && onOpenSettings && (
            <button className="banner-badge-btn" onClick={onOpenSettings} title="Connect your live Google Sheets script">
              <Icon name="alert" size={14} /> Demo Data &bull; Connect Live Sheets
            </button>
          )}

          <button
            className="primary-button"
            onClick={() => {
              onSelectStatusFilter('All');
              onNavigate('Devices');
            }}
          >
            <Icon name="device" size={16} /> Open Directory &rarr;
          </button>
        </div>
      </div>

      {/* 2. Top 4 Metric KPI Cards */}
      <section className="clean-stat-grid">
        {kpiStats.map((stat) => (
          <div
            key={stat.id}
            className={`clean-kpi-card ${selectedStatus === stat.filterTarget ? 'selected' : ''}`}
            onClick={() => {
              if (stat.filterTarget === 'Renewals') {
                onNavigate('Renewals');
              } else {
                onSelectStatusFilter(stat.filterTarget);
                onNavigate('Devices');
              }
            }}
          >
            <div className="clean-kpi-top">
              <div className={`clean-kpi-icon ${stat.tone}`}>
                <Icon name={stat.icon} size={20} />
              </div>
              <span className={`clean-kpi-pill ${stat.tone}`}>{stat.pill}</span>
            </div>

            <div className="clean-kpi-val">{stat.value}</div>
            <div className="clean-kpi-lbl">{stat.label}</div>

            <div className="clean-kpi-sub">
              <span>{stat.sub}</span>
              <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>&rarr;</span>
            </div>
          </div>
        ))}
      </section>

      {/* 3. Segmented Fleet Health Bar */}
      <div className="fleet-health-bar-card">
        <div className="health-bar-header">
          <span className="health-bar-title">Live Fleet Health Distribution</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Monitored: <strong style={{ color: '#ffffff' }}>{total}</strong> Trackers
          </span>
        </div>

        <div className="health-bar-track">
          <div
            className="health-segment active"
            style={{ width: `${activePct}%` }}
            title={`Active: ${activeCount} (${activePct.toFixed(1)}%)`}
          />
          <div
            className="health-segment inactive"
            style={{ width: `${inactivePct}%` }}
            title={`Inactive: ${inactiveCount} (${inactivePct.toFixed(1)}%)`}
          />
          <div
            className="health-segment expired"
            style={{ width: `${expiredPct}%` }}
            title={`Expired / Due Soon: ${expiredCount + rechargeSoonCount} (${expiredPct.toFixed(1)}%)`}
          />
          <div
            className="health-segment other"
            style={{ width: `${otherPct}%` }}
            title={`Damaged / Other: ${damagedCount + otherCount} (${otherPct.toFixed(1)}%)`}
          />
        </div>

        <div className="health-legend-row">
          <button
            className="health-legend-btn"
            onClick={() => {
              onSelectStatusFilter('Active');
              onNavigate('Devices');
            }}
            title="Filter active devices"
          >
            <span className="legend-dot active" />
            <span>Active: <strong>{activeCount}</strong> ({activePct.toFixed(1)}%)</span>
          </button>

          <button
            className="health-legend-btn"
            onClick={() => {
              onSelectStatusFilter('Inactive');
              onNavigate('Devices');
            }}
            title="Filter inactive devices"
          >
            <span className="legend-dot inactive" />
            <span>Inactive: <strong>{inactiveCount}</strong> ({inactivePct.toFixed(1)}%)</span>
          </button>

          <button
            className="health-legend-btn"
            onClick={() => onNavigate('Renewals')}
            title="Open license renewals hub"
          >
            <span className="legend-dot expired" />
            <span>Expired / Due: <strong>{expiredCount + rechargeSoonCount}</strong> ({expiredPct.toFixed(1)}%)</span>
          </button>

          <button
            className="health-legend-btn"
            onClick={() => {
              onSelectStatusFilter('Damaged');
              onNavigate('Devices');
            }}
            title="Filter damaged devices"
          >
            <span className="legend-dot other" />
            <span>Damaged / Repair: <strong>{damagedCount}</strong></span>
          </button>
        </div>
      </div>

      {/* 4. Quick Command Launchpad */}
      <section className="launchpad-section">
        <h3>Operational Modules Launchpad</h3>
        <div className="launchpad-grid">
          {launchpadItems.map((item, idx) => (
            <div key={idx} className="launch-tile" onClick={item.action}>
              <div className="launch-tile-icon">
                <Icon name={item.icon} size={20} />
              </div>
              <div className="launch-tile-content">
                <div className="launch-tile-top">
                  <span className="launch-tile-title">{item.title}</span>
                  <span className={`launch-badge ${item.badgeColor}`}>{item.badge}</span>
                </div>
                <p className="launch-tile-desc">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Executive Two-Column Grid: Sites Leaderboard + Immediate Action Radar */}
      <div className="exec-grid-2col">
        {/* Left Column: Top Project Sites Distribution */}
        <section className="exec-panel">
          <div className="exec-panel-head">
            <div>
              <h2>Top Project Sites</h2>
              <p>Fleet density and device allocation across active cities</p>
            </div>
            <button
              className="quiet-button"
              onClick={() => onNavigate('Reports')}
              style={{ fontSize: '12px' }}
            >
              Analytics &rarr;
            </button>
          </div>

          <div className="site-rank-list">
            {sortedCities.map(([cityName, count]) => {
              const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
              return (
                <div
                  className="site-rank-row"
                  key={cityName}
                  onClick={() => {
                    onSelectCityFilter(cityName);
                    onNavigate('Devices');
                  }}
                  title={`Click to view all ${count} trackers deployed in ${cityName}`}
                >
                  <span className="site-rank-name" title={cityName}>{cityName}</span>
                  <div className="site-rank-bar-wrap">
                    <div
                      className="site-rank-bar"
                      style={{ width: `${(count / maxCityCount) * 100}%` }}
                    />
                  </div>
                  <span className="site-rank-count">{count}</span>
                  <span className="site-rank-pct">{pct}%</span>
                </div>
              );
            })}

            {sortedCities.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No site location data available
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Priority Operational Radar */}
        <section className="exec-panel">
          <div className="exec-panel-head">
            <div>
              <h2>Immediate Action Radar</h2>
              <p>Critical expiring or dormant units requiring prompt attention</p>
            </div>
            <button
              className="quiet-button"
              onClick={() => onNavigate('Renewals')}
              style={{ fontSize: '12px' }}
            >
              Renewals Hub &rarr;
            </button>
          </div>

          <div className="radar-alerts-list">
            {urgentDevices.map((d) => (
              <div
                className="radar-item"
                key={d.imei}
                onClick={() => onSelectDevice(d)}
                title="Click to view device details & edit history"
              >
                <span className={`radar-dot ${d.status === 'Expired' ? 'red' : 'amber'}`} />
                <div className="radar-item-info">
                  <strong>
                    {d.vehicle || 'Unknown Vehicle'}{' '}
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      ({d.city || 'N/A'})
                    </span>
                  </strong>
                  <small>
                    {d.remainingDays !== null && d.remainingDays !== undefined
                      ? d.remainingDays < 0
                        ? `${Math.abs(d.remainingDays)} days overdue`
                        : `${d.remainingDays} days remaining`
                      : 'No expiration date'}{' '}
                    &bull; Exp: {d.licenseEnd || '—'}
                  </small>
                </div>
                <button
                  className="radar-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDevice(d);
                  }}
                >
                  Inspect &rarr;
                </button>
              </div>
            ))}

            {urgentDevices.length === 0 && (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                color: '#34d399',
                background: 'rgba(16, 185, 129, 0.05)',
                borderRadius: '10px',
                border: '1px dashed rgba(16, 185, 129, 0.2)',
                fontSize: '13px'
              }}>
                ✓ All fleet licenses in good standing. No urgent expirations detected.
              </div>
            )}
          </div>

          <div className="radar-stat-strip">
            <div
              className="radar-mini-box"
              onClick={() => {
                onSelectStatusFilter('Recharge Soon');
                onNavigate('Devices');
              }}
              title="Click to filter units expiring within 7 days"
            >
              <span>Expiring &lt; 7 Days</span>
              <strong style={{ color: rechargeSoonCount > 0 ? '#fbbf24' : '#ffffff' }}>
                {rechargeSoonCount}
              </strong>
            </div>

            <div
              className="radar-mini-box"
              onClick={() => {
                onSelectStatusFilter('Damaged');
                onNavigate('Devices');
              }}
              title="Click to filter damaged or under-repair units"
            >
              <span>Damaged / Repair</span>
              <strong style={{ color: damagedCount > 0 ? '#f87171' : '#ffffff' }}>
                {damagedCount}
              </strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
