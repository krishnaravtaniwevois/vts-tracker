import React, { useState } from 'react';
import { Icon } from './Icons';
import { loginUser, getStoredApiUrl, saveApiUrl } from '../services/api';
const SAVED_CREDENTIALS_KEY = 'vts_saved_login_credentials';

function getSavedCredentials() {
  try {
    const saved = localStorage.getItem(SAVED_CREDENTIALS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function LoginScreen({ _users = [], onLoginSuccess }) {
  const initialCreds = getSavedCredentials();
  const [email, setEmail] = useState(initialCreds.email || '');
  const [password, setPassword] = useState(initialCreds.password || '');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [apiUrl, setApiUrl] = useState(getStoredApiUrl());
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setError('Please enter your email address');
      return;
    }

    if (!cleanPassword) {
      setError('Please enter your password to sign in');
      return;
    }

    setIsLoading(true);

    if (apiUrl.trim()) {
      saveApiUrl(apiUrl.trim());
    }

    // Save or clear remembered credentials
    if (rememberMe) {
      localStorage.setItem(
        SAVED_CREDENTIALS_KEY,
        JSON.stringify({ email: cleanEmail, password: cleanPassword })
      );
    } else {
      localStorage.removeItem(SAVED_CREDENTIALS_KEY);
    }

    try {
      const res = await loginUser(cleanEmail, cleanPassword);
      if (res && res.user) {
        if (onLoginSuccess) onLoginSuccess(res.user);
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="split-login-wrapper">
      {/* Background Animated Gradient Ambience */}
      <div className="bg-glow-orb glow-top-left" />
      <div className="bg-glow-orb glow-bottom-right" />

      <div className="split-login-container">
        {/* LEFT PANEL: HERO SHOWCASE (Curved Artwork Card) */}
        <div className="login-hero-panel">
          <div className="hero-artwork-overlay" />

          <div className="hero-content">
            <div className="hero-top-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <img
                src="/wevois-logo.png"
                alt="WeVOIS"
                style={{ width: '20px', height: '20px', objectFit: 'contain', background: '#fff', borderRadius: '4px', padding: '1px' }}
              />
              <span>WEVOIS TELEMATICS & IOT</span>
            </div>

            <div className="hero-main-text">
              <p className="hero-kicker">FLEET MANAGEMENT 2.0</p>
              <h1 className="hero-title">Real-Time Fleet Intelligence & Smart Renewals</h1>
              <p className="hero-desc">
                Seamlessly track 949+ GPS devices, manage city-wise site permissions, 
                and automate monthly subscription renewals with live Roadcast synchronization.
              </p>
            </div>

            {/* Feature Stat Pills */}
            <div className="hero-stats-row">
              <div className="hero-stat-pill">
                <span className="stat-value">949+</span>
                <span className="stat-label">Live Units</span>
              </div>
              <div className="hero-stat-pill">
                <span className="stat-value">25+</span>
                <span className="stat-label">Municipal Sites</span>
              </div>
              <div className="hero-stat-pill">
                <span className="stat-value">100%</span>
                <span className="stat-label">Auto-Audited</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: CLEAN LOGIN FORM */}
        <div className="login-form-panel">
          <div className="form-inner-wrap">
            {/* Brand Header */}
            <div className="form-brand-header">
              <div className="brand-badge-row" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src="/wevois-logo.png"
                  alt="WeVOIS Logo"
                  style={{ width: '42px', height: '42px', objectFit: 'contain', borderRadius: '8px' }}
                />
                <span className="brand-name-text" style={{ fontSize: '18px', fontWeight: 800 }}>WeVOIS VTS</span>
              </div>
              <h2 className="welcome-title">Welcome Back</h2>
              <p className="welcome-subtext">
                Enter your email and credentials to access your fleet operations portal
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="login-error-card">
                <Icon name="alert-circle" size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="modern-form">
              <div className="form-group">
                <label>Email Address</label>
                <div className="input-field-wrap">
                  <input
                    type="email"
                    placeholder="name@wevois.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <div className="label-row">
                  <label>Password</label>
                </div>
                <div className="input-field-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
                  </button>
                </div>
              </div>

              <div className="form-options-row">
                <label className="remember-checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Save Login Credentials</span>
                </label>
                <a
                  href="mailto:krishnaravtani.wevois@gmail.com?subject=VTS%20Portal%20Access%20Request"
                  className="forgot-link"
                >
                  Need site access?
                </a>
              </div>

              <button type="submit" className="primary-signin-btn" disabled={isLoading}>
                {isLoading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>


            {/* Bottom Footer & Optional API Connection */}
            <div className="login-bottom-footer">
              <button
                type="button"
                className="api-toggle-link"
                onClick={() => setShowApiSettings(!showApiSettings)}
              >
                <Icon name="settings" size={13} />
                {showApiSettings ? 'Hide Backend Connection' : 'Google Sheets API Setup'}
              </button>

              {showApiSettings && (
                <div className="api-popout-box">
                  <label>Google Apps Script Web App URL</label>
                  <input
                    type="text"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                  />
                  <p>Auto-saved on sign-in. Powers live sync with your master spreadsheet.</p>
                </div>
              )}

              <p className="footer-copyright">
                Authorized WeVois Personnel Only &bull; VTS Telematics Portal
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
