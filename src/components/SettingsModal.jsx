import React, { useState } from 'react';
import { Icon } from './Icons';
import { getStoredApiUrl, saveApiUrl, fetchAllFleetData, clearFleetCache } from '../services/api';
import { getStoredFirebaseConfig, saveFirebaseConfig, syncAllUsersToFirestore } from '../services/firebase';

export function SettingsModal({ onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState('sheets'); // 'sheets' | 'firebase'
  const [url, setUrl] = useState(getStoredApiUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Firebase Config States
  const storedFb = getStoredFirebaseConfig();
  const [apiKey, setApiKey] = useState(storedFb.apiKey || '');
  const [projectId, setProjectId] = useState(storedFb.projectId || 'vts-fleet-32b51');
  const [authDomain, setAuthDomain] = useState(storedFb.authDomain || 'vts-fleet-32b51.firebaseapp.com');
  const [fbSavedMsg, setFbSavedMsg] = useState('');

  const handleTestAndSaveSheets = async (e) => {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);

    saveApiUrl(url);

    if (!url.trim()) {
      setTestResult({
        success: true,
        message: 'Reverted to offline/demo data mode.'
      });
      setTesting(false);
      onSaved();
      return;
    }

    try {
      const data = await fetchAllFleetData();
      if (!data.isMock && data.devices && data.devices.length > 0) {
        setTestResult({
          success: true,
          message: `Connected successfully! Synced ${data.devices.length} devices from your Google Sheets.`
        });
        onSaved();
      } else if (data.isMock) {
        setTestResult({
          success: false,
          message: data.error || 'Could not connect. Please ensure your Web App is deployed with access "Anyone".'
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: 'Connection failed: ' + err.message
      });
    } finally {
      setTesting(false);
    }
  };

  const [isSavingFb, setIsSavingFb] = useState(false);

  const handleSaveFirebase = async (e) => {
    e.preventDefault();
    if (!apiKey.trim() || apiKey.includes('DummyKey')) {
      setFbSavedMsg({ type: 'error', text: 'Please enter your Firebase Web API Key (starts with AIzaSy...). Found in Project Settings > General > Web API Key.' });
      return;
    }

    setIsSavingFb(true);
    setFbSavedMsg(null);
    const cleanProjId = projectId.trim() || 'vts-fleet-32b51';
    let cleanAuthDomain = authDomain.trim();
    if (!cleanAuthDomain || cleanAuthDomain.includes('firebasestorage')) {
      cleanAuthDomain = `${cleanProjId}.firebaseapp.com`;
      setAuthDomain(cleanAuthDomain);
    }

    try {
      saveFirebaseConfig({
        apiKey: apiKey.trim(),
        projectId: cleanProjId,
        authDomain: cleanAuthDomain,
        storageBucket: `${cleanProjId}.firebasestorage.app`,
        messagingSenderId: storedFb.messagingSenderId || "678346206201",
        appId: storedFb.appId || "1:678346206201:web:defaultAppId"
      });

      const res = await syncAllUsersToFirestore();
      setFbSavedMsg({ type: 'success', text: `✅ ${res.message}` });
      setTimeout(() => {
        onSaved();
      }, 1500);
    } catch (err) {
      setFbSavedMsg({ type: 'error', text: `Sync notice: ${err.message}` });
    } finally {
      setIsSavingFb(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div>
            <div className="modal-eyebrow">CONFIGURATION</div>
            <h2 className="modal-title">System & Backend Setup</h2>
            <p className="modal-subtitle">Configure Google Sheets & Firebase Auth / Firestore</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="modal-tab-bar" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', padding: '0 20px', background: 'rgba(0,0,0,0.1)' }}>
          <button
            type="button"
            className={`tab-item ${activeTab === 'sheets' ? 'active' : ''}`}
            onClick={() => setActiveTab('sheets')}
            style={{ padding: '10px 16px', background: 'none', border: 'none', borderBottom: activeTab === 'sheets' ? '2px solid #3b82f6' : '2px solid transparent', color: activeTab === 'sheets' ? '#60a5fa' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}
          >
            Google Sheets API
          </button>
          <button
            type="button"
            className={`tab-item ${activeTab === 'firebase' ? 'active' : ''}`}
            onClick={() => setActiveTab('firebase')}
            style={{ padding: '10px 16px', background: 'none', border: 'none', borderBottom: activeTab === 'firebase' ? '2px solid #3b82f6' : '2px solid transparent', color: activeTab === 'firebase' ? '#60a5fa' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}
          >
            Firebase Auth & Firestore
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'sheets' && (
            <>
              <div className="setup-steps-box">
                <h4>Google Sheets Connection Steps:</h4>
                <ol>
                  <li>Open <b>script.google.com</b> and create a new project.</li>
                  <li>Paste code from <code>apps-script/Code.gs</code>.</li>
                  <li>Click <b>Deploy &gt; New deployment &gt; Web app</b> (Set "Who has access" = <b>Anyone</b>).</li>
                  <li>Copy Web App URL and paste below.</li>
                </ol>
              </div>

              {testResult && (
                <div className={`alert-banner ${testResult.success ? 'success' : 'error'}`}>
                  {testResult.success ? <Icon name="check" size={16} /> : <Icon name="alert" size={16} />}
                  <span>{testResult.message}</span>
                </div>
              )}

              <form onSubmit={handleTestAndSaveSheets} className="modal-form">
                <div className="form-group">
                  <label>Google Apps Script Web App URL</label>
                  <input
                    type="url"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <span className="field-hint">
                    Leave empty to use built-in offline demo fleet data.
                  </span>
                </div>

                <div style={{ marginTop: '14px', marginBottom: '16px', padding: '12px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div>
                      <strong style={{ fontSize: '13px', color: '#f87171' }}>Purge Local Browser Cache</strong>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                        If updated Google Sheet values (e.g. blank Column H) are not reflecting, clear the browser cache and force a fresh reload.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)', whiteSpace: 'nowrap', padding: '6px 12px' }}
                      onClick={() => {
                        clearFleetCache();
                        alert('Browser cache purged successfully! Refreshing data...');
                        onSaved();
                        onClose();
                      }}
                    >
                      Clear Cache
                    </button>
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-button" disabled={testing}>
                    {testing ? 'Testing Connection...' : 'Save & Test Connection'}
                  </button>
                </div>
              </form>
            </>
          )}

          {activeTab === 'firebase' && (
            <>
              <div className="setup-steps-box" style={{ background: 'rgba(59, 130, 246, 0.06)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                <h4 style={{ color: '#60a5fa' }}>Connect Firebase Firestore:</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Paste your <b>Web API Key</b> from Firebase Console (<b>Project Settings &gt; General &gt; Web API Key</b>).
                </p>
              </div>

              {fbSavedMsg && (
                <div className={`alert-banner ${typeof fbSavedMsg === 'object' ? fbSavedMsg.type : 'success'}`}>
                  <Icon name={typeof fbSavedMsg === 'object' && fbSavedMsg.type === 'error' ? 'alert' : 'check'} size={16} />
                  <span>{typeof fbSavedMsg === 'object' ? fbSavedMsg.text : fbSavedMsg}</span>
                </div>
              )}

              <form onSubmit={handleSaveFirebase} className="modal-form">
                <div className="form-group" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                  <label style={{ color: '#60a5fa', fontWeight: 'bold' }}>Firebase Web API Key *</label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    required
                    autoFocus
                  />
                  <span className="field-hint" style={{ color: 'var(--text-muted)' }}>
                    Go to Firebase Console &gt; Project Settings &gt; General &gt; Web API Key.
                  </span>
                </div>

                <div className="form-group">
                  <label>Firebase Project ID</label>
                  <input
                    type="text"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    placeholder="vts-fleet-32b51"
                  />
                </div>

                <div className="form-group">
                  <label>Firebase Auth Domain</label>
                  <input
                    type="text"
                    value={authDomain}
                    onChange={(e) => setAuthDomain(e.target.value)}
                    placeholder="vts-fleet-32b51.firebaseapp.com"
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={onClose}>
                    Close
                  </button>
                  <button type="submit" className="primary-button" disabled={isSavingFb}>
                    {isSavingFb ? 'Connecting & Syncing...' : 'Save & Sync to Firestore'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

