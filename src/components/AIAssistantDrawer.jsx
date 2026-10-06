import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Icon } from './Icons';
import { calculateDaysRemaining, parseFlexibleDate } from '../utils/dateUtils';
import { safeSetItem } from '../utils/storage';

const STORAGE_KEY_GEMINI_API = 'vts_gemini_api_key';
const STORAGE_KEY_GEMINI_MODEL = 'vts_gemini_active_model';
const STORAGE_KEY_CHAT_HISTORY = 'vts_ai_chat_history_v4';
const STORAGE_KEY_FLEET_SNAPSHOTS = 'vts_fleet_snapshots_v1';

// Helper to format inline bold, inline code, and italics
function formatInlineText(text) {
  if (!text) return text;
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(regex);
  return parts.map((part, pIdx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={pIdx}
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            color: '#fef08a',
            padding: '1px 5px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={pIdx} style={{ color: '#ffffff', fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={pIdx} style={{ color: '#cbd5e1', fontStyle: 'italic' }}>
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

// Markdown and Code Block Formatter for Assistant Messages
function FormattedMessage({ text, onCopyText, copiedKey }) {
  if (!text) return null;
  const blockRegex = /(```[\s\S]*?```)/g;
  const blocks = text.split(blockRegex);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {blocks.map((block, bIdx) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const inner = block.slice(3, -3).trim();
          const firstNl = inner.indexOf('\n');
          let lang = '';
          let code = inner;
          if (firstNl !== -1) {
            const possibleLang = inner.slice(0, firstNl).trim();
            if (/^[a-zA-Z0-9_-]+$/.test(possibleLang)) {
              lang = possibleLang;
              code = inner.slice(firstNl + 1);
            }
          }
          const copyId = `code_${bIdx}`;
          const isCopied = copiedKey === copyId;

          return (
            <div
              key={bIdx}
              style={{
                position: 'relative',
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '12px 14px',
                marginTop: '4px',
                marginBottom: '4px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  paddingBottom: '6px'
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    letterSpacing: '0.5px'
                  }}
                >
                  {lang || 'Text / Draft'}
                </span>
                <button
                  type="button"
                  onClick={() => onCopyText(code, copyId)}
                  style={{
                    background: isCopied ? '#10b981' : 'rgba(59, 130, 246, 0.25)',
                    color: isCopied ? '#ffffff' : '#93c5fd',
                    border: `1px solid ${isCopied ? '#10b981' : 'rgba(59, 130, 246, 0.4)'}`,
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {isCopied ? '✓ Copied' : '📋 Copy Draft'}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: '12px',
                  color: '#f1f5f9',
                  lineHeight: '1.55'
                }}
              >
                {code}
              </pre>
            </div>
          );
        }

        // Regular lines
        const lines = block.split('\n');
        return (
          <div key={bIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) {
                return <div key={lIdx} style={{ height: '4px' }} />;
              }

              if (trimmed.startsWith('### ')) {
                return (
                  <div
                    key={lIdx}
                    style={{
                      fontWeight: 700,
                      fontSize: '14px',
                      color: '#93c5fd',
                      marginTop: '6px',
                      marginBottom: '2px'
                    }}
                  >
                    {formatInlineText(trimmed.replace(/^###\s+/, ''))}
                  </div>
                );
              }

              if (trimmed.startsWith('## ')) {
                return (
                  <div
                    key={lIdx}
                    style={{
                      fontWeight: 700,
                      fontSize: '15px',
                      color: '#bfdbfe',
                      marginTop: '8px',
                      marginBottom: '3px'
                    }}
                  >
                    {formatInlineText(trimmed.replace(/^##\s+/, ''))}
                  </div>
                );
              }

              const isBullet = /^[•*-]\s+/.test(trimmed);
              if (isBullet) {
                const bulletText = trimmed.replace(/^[•*-]\s+/, '');
                return (
                  <div key={lIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginLeft: '4px' }}>
                    <span style={{ color: '#60a5fa', flexShrink: 0 }}>•</span>
                    <span style={{ flex: 1 }}>{formatInlineText(bulletText)}</span>
                  </div>
                );
              }

              return <div key={lIdx}>{formatInlineText(line)}</div>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export function AIAssistantDrawer({
  devices = [],
  renewalLogs = [],
  users = [],
  onNavigate,
  onSearch,
  onFilterCity,
  onFilterStatus
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY_GEMINI_API) || '');
  const [activeModel, setActiveModel] = useState(() => localStorage.getItem(STORAGE_KEY_GEMINI_MODEL) || 'gemini-2.0-flash');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [testingKey, setTestingKey] = useState(false);
  const [testKeyResult, setTestKeyResult] = useState(null);
  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const chatBottomRef = useRef(null);

  // Multi-turn Conversational Context (Remembers last active city, vehicles, query topic)
  const [conversationContext, setConversationContext] = useState({
    lastCity: null,
    lastVehicles: null,
    lastTopic: null,
    lastSearch: null
  });

  // Fleet Historical Memory Snapshots (Tracks past states vs current live data)
  const [snapshots, setSnapshots] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FLEET_SNAPSHOTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Could not parse fleet snapshots', e);
    }
    return [];
  });

  // Speech Recognition (Voice Dictation in Hindi/English)
  useEffect(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'hi-IN';

      rec.onresult = (e) => {
        const transcript = e.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInputQuery((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      rec.onerror = (e) => {
        console.warn('Speech recognition error:', e.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const handleToggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or Edge.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn('Could not start recognition:', err);
      }
    }
  };

  // Helper: Print / Save Executive Briefing as PDF
  const handlePrintBriefing = (title, content) => {
    const win = window.open('', '_blank');
    if (!win) return;
    const cleanContent = (content || '')
      .replace(/```[a-z]*\n?/gi, '')
      .replace(/\*\*/g, '')
      .replace(/###\s+/g, '\n\n')
      .replace(/##\s+/g, '\n\n');

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title || 'VTS Executive Briefing'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 36px; color: #1e293b; line-height: 1.6; }
            h1 { font-size: 20px; color: #1e40af; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; margin-bottom: 6px; }
            .meta { font-size: 11px; color: #64748b; margin-bottom: 18px; }
            pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; font-family: monospace; white-space: pre-wrap; font-size: 12.5px; color: #0f172a; line-height: 1.5; }
            @media print { body { padding: 12mm; } }
          </style>
        </head>
        <body>
          <h1>${title || 'VTS Executive Briefing'}</h1>
          <div class="meta">Generated by VTS AI Fleet Operations Co-pilot &bull; ${new Date().toLocaleString('en-IN')}</div>
          <pre>${cleanContent}</pre>
          <script>window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  // Initial welcome message with unified intelligence
  const defaultMessages = [
    {
      id: 'welcome',
      sender: 'assistant',
      text: `👋 **Namaste! I am your AI Fleet Operations Co-pilot.**\n\nI have **Fleet Memory** to remember your fleet's past vs current progress, and can execute all operational and analytical tasks naturally through prompts:\n\n• 🧠 **Fleet Memory**: *"Pichli baar se kya change hua hai?"*, *"Fleet me kya update hai?"*\n• ✉️ **Drafting & Reminders**: *"Renewal reminder email banao"*, *"WhatsApp reminder draft karo"*\n• 🏢 **Executive Briefing**: *"Executive management briefing report banao"*\n• 💰 **Budget Forecaster**: *"Is month aur next month ka renewal budget kitna lagega?"*\n• 🏆 **City Compliance**: *"City compliance ranking dikhao"*\n• 🚨 **Expiries & Audits**: *"High-risk vehicles audit (>30d overdue)"*, *"Is month ka expired data"*\n• 🩺 **Data Hygiene**: *"Fleet data hygiene & anomaly check karo"*\n• 📥 **Exports & Actions**: *"Jaipur ki excel banao"*, *"Renewals page kholo"*\n\nAsk me anything in **Hindi, Hinglish, or English**, or click the 🎙️ mic to speak!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      quickChips: [
        '🧠 Pichli baar se kya change hua?',
        '✉️ Renewal Reminder Email Banao',
        '🏢 Executive Management Briefing',
        '💰 Renewal Budget Kitna Lagega?',
        '🏆 City Compliance Ranking',
        '🚨 Is month ka expired data btao',
        '⚠️ High-Risk Vehicles Audit',
        '🩺 Data Hygiene & Anomaly Check',
        '📥 Export Full Fleet Excel'
      ]
    }
  ];

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CHAT_HISTORY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Could not parse chat history', e);
    }
    return defaultMessages;
  });

  useEffect(() => {
    try {
      const trimmed = messages.slice(-20).map((m) => ({
        ...m,
        excelPayload: m.excelPayload
          ? { label: m.excelPayload.label, filename: m.excelPayload.filename, count: m.excelPayload.count }
          : null
      }));
      safeSetItem(STORAGE_KEY_CHAT_HISTORY, trimmed);
    } catch (e) {
      console.warn('Could not save chat history', e);
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isThinking]);

  // Current Date and Month Information
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthKey = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const nextMonthName = nextMonthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Enriched Fleet Analytics Summary
  const fleetSummary = useMemo(() => {
    let total = devices.length;
    let expired = 0;
    let expiredThisMonth = 0;
    let expiringSoon15 = 0;
    let dueNextMonth = 0;
    let dueThisMonth = 0;
    let approvedYes = 0;
    let deniedNo = 0;
    let pending = 0;
    const cityCounts = {};
    const cityExpired = {};

    devices.forEach((d) => {
      const rawLic = d.licenseEnd || d.displayLicenseEnd || '';
      const remaining = d.remainingDays !== undefined && !isNaN(Number(d.remainingDays))
        ? Number(d.remainingDays)
        : calculateDaysRemaining(rawLic);
      const pDate = parseFlexibleDate(rawLic);
      const mKey = pDate ? `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}` : '';

      if (remaining < 0) {
        expired++;
        if (mKey === currentMonthKey) expiredThisMonth++;
      } else if (remaining <= 15) {
        expiringSoon15++;
      }

      if (mKey === currentMonthKey) dueThisMonth++;
      if (mKey === nextMonthKey) dueNextMonth++;

      const dec = String(d.renewalDecision || d.decision || '').toLowerCase().trim();
      if (dec === 'yes' || dec === 'approved') approvedYes++;
      else if (dec === 'no' || dec === 'declined' || dec === 'rejected') deniedNo++;
      else pending++;

      const c = String(d.city || 'Unknown').trim();
      cityCounts[c] = (cityCounts[c] || 0) + 1;
      if (remaining < 0) {
        cityExpired[c] = (cityExpired[c] || 0) + 1;
      }
    });

    return {
      total,
      expired,
      expiredThisMonth,
      expiringSoon15,
      dueThisMonth,
      dueNextMonth,
      approvedYes,
      deniedNo,
      pending,
      cityCounts,
      cityExpired,
      topCities: Object.entries(cityCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([c, count]) => `${c}: ${count}`)
        .join(', ')
    };
  }, [devices, currentMonthKey, nextMonthKey]);

  // Current Live Snapshot (For Fleet Memory & Change Tracking)
  const currentSnapshot = useMemo(() => {
    if (!devices || devices.length === 0) return null;
    const imeiMap = {};
    devices.forEach((d) => {
      const imei = String(d.imei || d.uniqueid || '').trim();
      if (!imei) return;
      const rawLic = d.licenseEnd || d.displayLicenseEnd || '';
      const rem = d.remainingDays !== undefined && !isNaN(Number(d.remainingDays))
        ? Number(d.remainingDays)
        : calculateDaysRemaining(rawLic);
      const dec = String(d.renewalDecision || d.decision || '').toLowerCase().trim();
      imeiMap[imei] = {
        vehicle: d.vehicle || d.name || imei,
        city: d.city || '',
        isExpired: rem < 0,
        decision: ['yes', 'approved'].includes(dec) ? 'Yes' : ['no', 'declined', 'rejected'].includes(dec) ? 'No' : 'Pending'
      };
    });

    return {
      timestamp: Date.now(),
      dateStr: new Date().toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      total: devices.length,
      expired: fleetSummary.expired,
      expiringSoon15: fleetSummary.expiringSoon15,
      dueThisMonth: fleetSummary.dueThisMonth,
      dueNextMonth: fleetSummary.dueNextMonth,
      approvedYes: fleetSummary.approvedYes,
      deniedNo: fleetSummary.deniedNo,
      pending: fleetSummary.pending,
      cityCounts: { ...fleetSummary.cityCounts },
      cityExpired: { ...fleetSummary.cityExpired },
      imeiMap
    };
  }, [devices, fleetSummary]);

  // Auto-persist fleet snapshots (Keeps up to 3 compact snapshots when data changes or > 1 hr)
  const lastRecordedSnapshotRef = useRef(null);

  useEffect(() => {
    if (!currentSnapshot) return;
    const last = lastRecordedSnapshotRef.current;
    if (last) {
      const countsChanged =
        last.total !== currentSnapshot.total ||
        last.expired !== currentSnapshot.expired ||
        last.approvedYes !== currentSnapshot.approvedYes ||
        last.deniedNo !== currentSnapshot.deniedNo;
      const timeDiffMs = (currentSnapshot.timestamp || 0) - (last.timestamp || 0);

      if (!countsChanged && timeDiffMs < 60 * 60 * 1000) {
        return;
      }
    }

    lastRecordedSnapshotRef.current = currentSnapshot;
    setSnapshots((prev) => {
      const updated = [...(prev || []).slice(-2), currentSnapshot];
      safeSetItem(STORAGE_KEY_FLEET_SNAPSHOTS, updated);
      return updated;
    });
  }, [currentSnapshot]);

  // Helper: Compare current fleet against previous snapshot
  const getFleetMemoryComparison = () => {
    if (!snapshots || snapshots.length === 0) {
      return {
        hasMemory: false,
        text: `🧠 **Fleet Memory Initialized**\n\nYeh aapka pehla session hai! Maine live fleet ka initial snapshot record kar liya hai (${currentSnapshot?.total || devices.length} vehicles).\n\nAb se jab bhi koi gadi recharge hogi (Yes/No), expire hogi, ya naya data aayega, main pichli baar se compare karke batata rahunga!`
      };
    }

    const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : snapshots[0];
    const curr = currentSnapshot || snapshots[snapshots.length - 1];

    if (!prev || !curr) {
      return { hasMemory: false, text: 'Snapshot data available nahi hai.' };
    }

    const prevDate = prev.dateStr || new Date(prev.timestamp).toLocaleString();
    const totalDiff = curr.total - prev.total;
    const expiredDiff = curr.expired - prev.expired;
    const yesDiff = curr.approvedYes - prev.approvedYes;
    const noDiff = curr.deniedNo - prev.deniedNo;
    const pendingDiff = curr.pending - prev.pending;

    const newlyRecharged = [];
    const newlyDeclined = [];
    const newlyExpired = [];

    if (curr.imeiMap && prev.imeiMap) {
      Object.entries(curr.imeiMap).forEach(([imei, cInfo]) => {
        const pInfo = prev.imeiMap[imei];
        if (!pInfo) return;
        if (cInfo.decision === 'Yes' && pInfo.decision !== 'Yes') {
          newlyRecharged.push(cInfo);
        }
        if (cInfo.decision === 'No' && pInfo.decision !== 'No') {
          newlyDeclined.push(cInfo);
        }
        if (cInfo.isExpired && !pInfo.isExpired) {
          newlyExpired.push(cInfo);
        }
      });
    }

    let report = `🧠 **Fleet Memory & Comparative Progress Analysis**\n`;
    report += `*(Pichla recorded snapshot: **${prevDate}** vs Abhi ka Live Data)*\n\n`;

    report += `📊 **Key Differences & Metric Movement:**\n`;
    report += `• 🟢 **Recharge Approvals (Yes)**: **${curr.approvedYes}** (${yesDiff >= 0 ? `+${yesDiff}` : yesDiff} since last check)\n`;
    report += `• 🔴 **Declined (No)**: **${curr.deniedNo}** (${noDiff >= 0 ? `+${noDiff}` : noDiff})\n`;
    report += `• 🚨 **Expired Backlog**: **${curr.expired}** (${expiredDiff >= 0 ? `+${expiredDiff}` : expiredDiff})\n`;
    report += `• ⚪ **Decision Pending**: **${curr.pending}** (${pendingDiff >= 0 ? `+${pendingDiff}` : pendingDiff})\n`;
    if (totalDiff !== 0) {
      report += `• 📦 **Total Fleet Size**: **${curr.total}** (${totalDiff > 0 ? `+${totalDiff} added` : `${totalDiff} removed`})\n`;
    }
    report += `\n`;

    if (newlyRecharged.length > 0) {
      report += `🎉 **Nayi Recharged / Approved Gadiyan (${newlyRecharged.length}):**\n`;
      newlyRecharged.slice(0, 5).forEach((v, i) => {
        report += `${i + 1}. **${v.vehicle}** (City: ${v.city}) — Approval status updated to **Yes**\n`;
      });
      if (newlyRecharged.length > 5) report += `*...aur ${newlyRecharged.length - 5} aur gadiyan recharge hui hain.*\n`;
      report += `\n`;
    }

    if (newlyDeclined.length > 0) {
      report += `⚠️ **Nayi Declined Gadiyan (No Recharge):**\n`;
      newlyDeclined.slice(0, 4).forEach((v, i) => {
        report += `• **${v.vehicle}** (${v.city}) — Decision marked **No**\n`;
      });
      report += `\n`;
    }

    if (newlyExpired.length > 0) {
      report += `🚨 **Nayi Expired Gadiyan (Action Required):**\n`;
      newlyExpired.slice(0, 4).forEach((v, i) => {
        report += `• **${v.vehicle}** (${v.city}) — Validity recently expired\n`;
      });
      report += `\n`;
    }

    if (newlyRecharged.length === 0 && newlyDeclined.length === 0 && newlyExpired.length === 0 && expiredDiff === 0 && yesDiff === 0) {
      report += `✨ *Fleet status stable hai. Pichle check se abhi tak koi naya decision ya expiry change nahi hua hai.*\n\n`;
    }

    report += `💡 *Aap kisi specific city, month, ya custom audit ke baare me bhi pooch sakte hain!*`;

    return { hasMemory: true, text: report };
  };

  // Excel (.xlsx) Generation Handler
  const generateAndDownloadExcel = (matchingDevices, customFilename, label = 'Export') => {
    const list = matchingDevices && matchingDevices.length > 0 ? matchingDevices : devices;
    if (list.length === 0) {
      alert('No vehicles found matching criteria to export.');
      return;
    }

    const rows = list.map((d, index) => {
      const rawLicenseEnd = d.displayLicenseEnd || d.licenseEnd || '';
      const remaining = d.remainingDays !== undefined ? d.remainingDays : calculateDaysRemaining(rawLicenseEnd);
      return {
        'SR.': index + 1,
        'Name': d.vehicle || d.name || '',
        'Uniqueid': String(d.imei || d.uniqueid || ''),
        'Phone': String(d.sim || d.phone || ''),
        'License End': rawLicenseEnd,
        'Remaining Days': remaining,
        'City': d.city || '',
        'Remark': d.renewalRemark || d.remark || '',
        'Rechage status': d.renewalDecision || d.rechargeStatus || 'Pending',
        'New License End': d.newLicenseEnd || '',
        'Status': d.statusDone || 'Pending'
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fleet_Report');

    const cleanName = (customFilename || `VTS_${label}_${new Date().toISOString().slice(0, 10)}`)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const finalFilename = cleanName.endsWith('.xlsx') ? cleanName : `${cleanName}.xlsx`;

    XLSX.writeFile(wb, finalFilename);
  };

  // Helper: Execute App UI Actions (Navigation, Filter, Search)
  const executeAppAction = (actionStr) => {
    if (!actionStr) return null;
    const parts = actionStr.split('|').map((s) => s.trim());
    const actionType = parts[0]?.toUpperCase();
    const actionArg = parts[1] || '';

    if (actionType === 'NAVIGATE' && onNavigate) {
      onNavigate(actionArg);
      return `Navigated to ${actionArg} page`;
    }
    if (actionType === 'SEARCH' && onSearch) {
      onSearch(actionArg);
      if (onNavigate) onNavigate('Devices');
      return `Searched for "${actionArg}"`;
    }
    if (actionType === 'FILTER_CITY' && onFilterCity) {
      onFilterCity(actionArg);
      if (onNavigate) onNavigate('Devices');
      return `Filtered fleet by city: ${actionArg}`;
    }
    if (actionType === 'FILTER_EXPIRED') {
      if (onFilterStatus) onFilterStatus('Expired');
      if (onNavigate) onNavigate('Devices');
      return `Filtered to expired vehicles`;
    }
    return null;
  };

  // Copy to Clipboard Helper (with fallback)
  const copyTextToClipboard = (text, idx) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  // Smart Fleet NLP Engine (Understands Fleet Memory, Executive Briefings, Budgets, Email Drafting, Hindi/Hinglish, Actions & Context)
  const processQueryOffline = (userQuery) => {
    const q = (userQuery || '').replace(/["'“”]/g, '').toLowerCase().trim();
    const isExcelRequested = /excel|xlsx|sheet|download|export|file banao|file chahiye|nikalo/i.test(q);

    // 1. FLEET MEMORY RECALL & CHANGE COMPARISON
    // e.g. "pichli baar se kya change hua?", "last time vs now", "fleet me kya update hai", "kya badla"
    if (/badla|badlav|change|pichli baar|last time|kya update|purana data|compare|history|previous|kya naya|progress/i.test(q)) {
      const mem = getFleetMemoryComparison();
      return { text: mem.text };
    }

    // 2. CONTEXTUAL FOLLOW-UP QUERIES
    // e.g. "inka excel banao", "inhe reminder bhejo", "inme kitni expired hain"
    const isContextFollowUp = /inka|inhe|unka|unhe|ye gadiyan|in vehicles|in sabka|inke|is list/i.test(q);
    if (isContextFollowUp && conversationContext.lastVehicles && conversationContext.lastVehicles.length > 0) {
      const list = conversationContext.lastVehicles;
      const label = conversationContext.lastCity || conversationContext.lastTopic || 'Target_Vehicles';

      if (isExcelRequested) {
        return {
          text: `📥 **Contextual Excel Generated!**\n\nMaine pichli baat-cheet ke anusaar **${label}** ki **${list.length}** vehicles ka Excel ready kar diya hai. Download karne ke liye neeche button dabayein:`,
          excelData: list,
          excelFilename: `VTS_${label}_Export`,
          excelLabel: `Download ${label} Excel (.xlsx) [${list.length} vehicles]`
        };
      }

      if (/mail|email|draft|reminder|whatsapp|massge|message/i.test(q)) {
        const emailSubject = `⚠️ URGENT: Renewal Authorization for ${label} Vehicles (${list.length} Units)`;
        const emailBody = `Dear Site Incharge,\n\nThis is an urgent notification regarding ${list.length} vehicles in ${label}. Their VTS tracking license validity is due/expired.\n\nKindly provide renewal confirmation immediately to maintain live tracking.\n\nOperations Desk`;
        const whatsappText = `*⚠️ URGENT: VTS Renewal Notice for ${label}*\nTotal ${list.length} vehicles ki validity expire ho rahi hai. Kripya Yes/No approval update karein taaki tracking active rahe.`;

        return {
          text: `✉️ **Maine ${label} ki ${list.length} vehicles ke liye specific draft ready kar diya hai:**\n\n### 📧 Email:\n\`\`\`text\n${emailBody}\n\`\`\`\n\n### 📱 WhatsApp:\n\`\`\`text\n${whatsappText}\n\`\`\``,
          copyableContent: { emailSubject, emailBody, whatsappText }
        };
      }
    }

    // 3. EXECUTIVE MANAGEMENT BRIEFING (DIRECTOR / MD LEVEL REPORT)
    // e.g. "executive briefing banao", "management report do", "md ke liye report", "overall fleet audit report"
    if (/executive|briefing|management report|md report|director|overall audit|boss ko|high level/i.test(q)) {
      const total = fleetSummary.total;
      const expired = fleetSummary.expired;
      const active = total - expired;
      const approved = fleetSummary.approvedYes;
      const denied = fleetSummary.deniedNo;
      const pending = fleetSummary.pending;
      const rate = total > 0 ? Math.round((approved / (total - denied || 1)) * 100) : 0;

      const briefingText = `🏢 **EXECUTIVE FLEET OPERATIONS BRIEFING**
Generated on: ${new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
Target Audience: Senior Management, Project Directors & Operations Leadership

---

### 1. Executive Fleet Health & KPI Overview
• Total Registered Fleet: **${total} Vehicles**
• Currently Active & Monitored: **${active} Vehicles** (${Math.round((active / (total || 1)) * 100)}%)
• Overdue / Expired GPS Units: **${expired} Vehicles** (${Math.round((expired / (total || 1)) * 100)}%)
• Renewal Authorizations: **${approved} Approved (Yes)** | **${denied} Declined (No)** | **${pending} Decision Pending**
• Renewal Decision Rate: **${rate}%**

### 2. Operational & Project Risk Assessment
Real-time tracking on Roadcast is at critical risk of automatic suspension for all units overdue.
• Priority Site Locations: **${fleetSummary.topCities}**
• Near-term Expiries (Next 15 Days): **${fleetSummary.expiringSoon15} Vehicles**
• Upcoming Month Due (${nextMonthName}): **${fleetSummary.dueNextMonth} Vehicles**

### 3. Financial Budget Provision (Base: ₹1,200/unit/year)
• Immediate Backlog Clearance (${expired} units): **₹${(expired * 1200).toLocaleString('en-IN')}**
• Upcoming Month Renewal (${fleetSummary.dueNextMonth} units): **₹${(fleetSummary.dueNextMonth * 1200).toLocaleString('en-IN')}**
• Combined 60-Day Capital Allocation: **₹${((expired + fleetSummary.dueNextMonth) * 1200).toLocaleString('en-IN')}**

### 4. Strategic Recommendations for Leadership
1. **Urgent Site Incharge Escalation**: Direct regional managers in ${fleetSummary.topCities.split(',')[0]} and ${fleetSummary.topCities.split(',')[1] || 'Jaipur'} to clear pending Yes/No decisions within 48 hours.
2. **Decommission Inactive Fleet**: De-register vehicles marked 'No' to eliminate unnecessary recurring SIM & software overhead.
3. **Streamlined Billing**: Initiate consolidated fleet recharge batch with Roadcast vendor desk to secure enterprise SLA.`;

      return {
        text: briefingText,
        printableBriefing: { title: 'VTS Fleet Executive Operations Briefing', content: briefingText }
      };
    }

    // 4. RENEWAL COST & FINANCIAL BUDGET FORECASTER
    // e.g. "renewal budget kitna lagega", "cost calculation karo", "kitna kharcha aayega"
    if (/budget|cost|kharcha|paisa|kitna lagega|rupee|financial|rate|amount|calculator/i.test(q)) {
      const rateMatch = q.match(/(\d{3,5})/);
      const unitRate = rateMatch ? parseInt(rateMatch[1], 10) : 1200;

      const backlogCost = fleetSummary.expired * unitRate;
      const thisMonthCost = fleetSummary.dueThisMonth * unitRate;
      const nextMonthCost = fleetSummary.dueNextMonth * unitRate;
      const total60dCost = (fleetSummary.expired + fleetSummary.dueNextMonth) * unitRate;

      let text = `💰 **VTS Fleet Renewal Cost & Financial Budget Forecast**\n\n`;
      text += `Calculation Base: **₹${unitRate.toLocaleString('en-IN')} / vehicle / year** (GPS Software License + SIM Validity)\n\n`;
      text += `### 📊 Cost Breakdown:\n`;
      text += `• 🚨 **Expired Backlog (${fleetSummary.expired} vehicles)**: **₹${backlogCost.toLocaleString('en-IN')}**\n`;
      text += `• 📅 **This Month Expiries (${fleetSummary.dueThisMonth} vehicles)**: **₹${thisMonthCost.toLocaleString('en-IN')}**\n`;
      text += `• ⚡ **Next Month (${nextMonthName}) Due (${fleetSummary.dueNextMonth} vehicles)**: **₹${nextMonthCost.toLocaleString('en-IN')}**\n\n`;
      text += `--- \n`;
      text += `💵 **Total Capital Required (Immediate + Next 30 Days):**\n`;
      text += `## **₹${total60dCost.toLocaleString('en-IN')}**\n\n`;
      text += `💡 *Aap kisi specific rate ke liye bhi calculate kar sakte hain, jaise "rate 1500 mankar budget nikalo"!*`;

      return { text };
    }

    // 5. CITY COMPLIANCE & PERFORMANCE RANKING
    // e.g. "city compliance ranking dikhao", "kiska performance best hai", "city rating"
    if (/ranking|compliance|kiska performance|best city|worst city|grading|rank|rating/i.test(q)) {
      const cityStats = [];
      Object.keys(fleetSummary.cityCounts || {}).forEach((city) => {
        const cityDevices = devices.filter((d) => (d.city || '').toLowerCase() === city.toLowerCase());
        const total = cityDevices.length;
        const yes = cityDevices.filter((d) => ['yes', 'approved'].includes(String(d.renewalDecision || d.decision || '').toLowerCase())).length;
        const expired = cityDevices.filter((d) => (d.remainingDays ?? calculateDaysRemaining(d.licenseEnd)) < 0).length;
        const score = total > 0 ? Math.round((yes / total) * 100) : 0;
        cityStats.push({ city, total, yes, expired, score });
      });

      cityStats.sort((a, b) => b.score - a.score || a.expired - b.expired);

      let text = `🏆 **City & Project Fleet Compliance Ranking**\n\n`;
      text += `Har project location ka recharge approval rate aur operational compliance:\n\n`;

      cityStats.forEach((cs, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '📍';
        const grade = cs.score >= 70 ? '🟢 Grade A' : cs.score >= 40 ? '🟡 Grade B' : '🔴 Critical Risk';
        text += `${medal} **${cs.city}** — ${grade} (${cs.score}% Approved)\n`;
        text += `   • Total: **${cs.total}** | Approved Yes: **${cs.yes}** | Expired Overdue: **${cs.expired}**\n`;
      });

      text += `\n💡 *Critical Risk cities jahan expired backlog zyada hai, wahan ke site managers ko escalation reminder bhejein!*`;
      return { text };
    }

    // 6. HIGH-RISK & OVERDUE GHOST VEHICLES AUDIT (>30 DAYS OVERDUE)
    // e.g. "high risk vehicles audit", "ghost vehicles", "purani expired gadiyan"
    if (/risk|ghost|purani|purane|bahut din|60 din|30 din|critical|danger/i.test(q)) {
      const highRiskList = devices.filter((d) => {
        const rem = d.remainingDays ?? calculateDaysRemaining(d.licenseEnd);
        const dec = String(d.renewalDecision || d.decision || '').toLowerCase();
        return rem < -30 && !['yes', 'no'].includes(dec);
      });

      let text = `⚠️ **High-Risk & Overdue Ghost Vehicles Audit (>30 Days Overdue)**\n\n`;
      text += `Fleet me total **${highRiskList.length}** vehicles aisi hain jo 30 din se zyada samay se expired hain aur abhi tak unka decision Pending hai:\n\n`;

      highRiskList.slice(0, 5).forEach((v, i) => {
        const rem = Math.abs(v.remainingDays ?? calculateDaysRemaining(v.licenseEnd));
        text += `${i + 1}. **${v.vehicle}** (IMEI: \`${v.imei}\`)\n`;
        text += `   • City: **${v.city || '—'}** | Overdue: **${rem} din pehle se**\n`;
        text += `   • Recommendation: Turant recharge confirm karein ya decommission karein\n`;
      });

      if (highRiskList.length > 5) {
        text += `\n*...aur ${highRiskList.length - 5} aur vehicles high risk category me hain.*\n`;
      }

      setConversationContext({ lastCity: null, lastVehicles: highRiskList, lastTopic: 'High_Risk', lastSearch: null });

      if (isExcelRequested) {
        return {
          text,
          excelData: highRiskList,
          excelFilename: 'VTS_High_Risk_Vehicles',
          excelLabel: `Export ${highRiskList.length} High Risk Vehicles (.xlsx)`
        };
      }

      text += `\n💡 *In gadiyon ki list download karne ke liye "Inka excel banao" bol sakte hain!*`;
      return { text };
    }

    // 7. MULTI-TIER ESCALATION NOTICE ENGINE (LEVEL 1 / LEVEL 2 / LEVEL 3)
    // e.g. "level 2 escalation notice", "final warning", "escalation letter banao"
    if (/escalat|level 1|level 2|level 3|antim|final warning|chetawani/i.test(q)) {
      const isLevel3 = /level 3|final|antim/i.test(q);
      const isLevel2 = /level 2|urgent|suspension/i.test(q);
      const level = isLevel3 ? 3 : isLevel2 ? 2 : 1;

      let subject = '';
      let body = '';

      if (level === 1) {
        subject = 'Notice (Level 1): Courtesy Reminder for Vehicle GPS Renewal';
        body = `Dear Site Incharge,\n\nThis is a friendly reminder that annual GPS tracking licenses for project vehicles at your site are due for renewal. Kindly confirm your recharge approval (Yes/No) on the VTS portal.\n\nBest regards,\nVTS Fleet Desk`;
      } else if (level === 2) {
        subject = '⚠️ URGENT ESCALATION (Level 2): 48-Hour Live Tracking Suspension Warning';
        body = `Dear Project Operations Incharge,\n\nDespite repeated reminders, renewal authorizations for your site vehicles remain unresolved. Please note that live GPS tracking on Roadcast will be AUTOMATICALLY SUSPENDED within 48 hours without approval.\n\nKindly log in to the VTS Tracker and confirm Yes/No immediately.\n\nFleet Operations Management`;
      } else {
        subject = '🚨 FINAL MANAGEMENT NOTICE (Level 3): SIM Deactivation & Device Repossession Order';
        body = `TO ALL REGIONAL MANAGERS & SITE HEADS,\n\nFINAL NOTICE:\nGPS licenses for delinquent vehicles have exceeded all grace periods. Live tracking is suspended. Unless emergency recharge approval is submitted today, SIM connectivity will be terminated and hardware retrieval initiated.\n\nAuthorized by: Fleet Operations Leadership`;
      }

      let text = `✉️ **Maine aapke liye Level ${level} Escalation Notice draft kar diya hai:**\n\n`;
      text += `**Subject:** \`${subject}\`\n\n`;
      text += `\`\`\`text\n${body}\n\`\`\`\n\n`;
      text += `💡 *Aap is notice ko copy karke site incharge ko email ya WhatsApp par bhej sakte hain!*`;

      return {
        text,
        copyableContent: { emailSubject: subject, emailBody: body, whatsappText: body }
      };
    }

    // 8. DATA HYGIENE & ANOMALY SCANNER
    // e.g. "data hygiene check", "anomaly check", "missing data", "duplicate check"
    if (/hygiene|anomaly|check data|missing|galat|duplicate|gadbad|clean/i.test(q)) {
      const missingSim = devices.filter((d) => !d.sim && !d.phone);
      const missingCity = devices.filter((d) => !d.city || d.city === 'Unknown' || d.city === '—');
      const imeiCounts = {};
      devices.forEach((d) => {
        const im = String(d.imei || '').trim();
        if (im) imeiCounts[im] = (imeiCounts[im] || 0) + 1;
      });
      const duplicates = devices.filter((d) => imeiCounts[String(d.imei || '').trim()] > 1);

      let text = `🩺 **VTS Fleet Data Hygiene & Integrity Scan**\n\n`;
      text += `Fleet database scan result across **${devices.length}** records:\n\n`;
      text += `• 📱 **Missing SIM / Phone Numbers**: **${missingSim.length} vehicles** ${missingSim.length === 0 ? '✅ Clean' : '⚠️ Need SIM update'}\n`;
      text += `• 📍 **Blank / Missing City Assignment**: **${missingCity.length} vehicles** ${missingCity.length === 0 ? '✅ Clean' : '⚠️ Need City update'}\n`;
      text += `• 🔁 **Duplicate IMEI Records**: **${duplicates.length} vehicles** ${duplicates.length === 0 ? '✅ Clean' : '🚨 Potential duplicates'}\n\n`;

      if (duplicates.length > 0) {
        text += `🚨 **Sample Duplicate IMEIs:**\n`;
        duplicates.slice(0, 3).forEach((v) => {
          text += `• Vehicle: **${v.vehicle}** (IMEI: \`${v.imei}\`)\n`;
        });
        text += `\n`;
      }

      text += `💡 *Data quality clean rakhne ke liye aap in records ko Google Sheet ya Settings me update kar sakte hain!*`;
      return { text };
    }

    // 9. Email / Message / WhatsApp Drafting Requests
    // e.g. "please ek mail bano jisme renwal krwane ka massge ho", "mail draft karo", "message likho", "whatsapp reminder"
    const isEmailDraft = /mail|email|massge|masg|mesg|message|msg|draft|likh|bano|bna|banao|sandesh|notice|whatsapp|patra|reminder|remind|khat/i.test(q);
    const isRenewalTopic = /renwal|renewal|recharge|rechage|recharg|expire|expiry|expair|validity|date|khatam|site/i.test(q);

    if (isEmailDraft && (isRenewalTopic || /mail|email|draft|notice|reminder|whatsapp|massge|message|patra/i.test(q))) {
      const urgentCount = (fleetSummary.expired + fleetSummary.expiringSoon15) || (devices.length > 0 ? Math.min(devices.length, 15) : 15);
      const topCities = fleetSummary.topCities || 'Sikar, Bharatpur, Ajmer, Jaipur';

      const emailSubject = `⚠️ URGENT: VTS Vehicle GPS Tracking Renewal & Recharge Authorization Required`;
      const emailBody = `Dear Site Manager / Project Operations Team,

This is an urgent notification regarding the GPS tracking units (VTS) installed on your project vehicles. The annual GPS tracking software licenses and SIM validity for several vehicles are either already expired or due for renewal.

Current Fleet Expiry Overview:
• Total Vehicles Requiring Immediate Renewal: ${urgentCount} Vehicles
• Priority Project Sites: ${topCities}
• Renewal Cycle Month: ${currentMonthName}

ACTION REQUIRED:
To prevent service disruption and avoid automatic suspension of live GPS vehicle tracking on the Roadcast portal, kindly initiate the renewal / recharge authorization immediately.

Kindly confirm:
1. Approval for renewal (Yes / No for each vehicle)
2. In case any vehicle is inactive, returned, or decommissioned, please provide the vehicle number and remark so it can be updated in the Master Sheet.

Please reply to this email or confirm your authorization on the VTS Tracker Portal at your earliest convenience.

Best regards,
Fleet Operations & Tracking Team
VTS Management Desk | Roadcast Support`;

      const whatsappText = `*⚠️ URGENT: VTS Vehicle GPS Renewal Reminder*\n\nNamaste Site Operations Team,\nAapke site par lagi VTS GPS tracking devices ki validity expire ho chuki / hone wali hai (${urgentCount} vehicles).\n\nReal-time GPS tracking band na ho, iske liye kripya recharge approval confirmation turant share karein.\n- Due/Expired Vehicles: ${urgentCount}\n- Priority Sites: ${topCities}\n\nKripya approval Yes/No update karein taaki live tracking uninterrupted rahe.\nDhanyawad.`;

      let text = `✉️ **Maine aapke liye Renewal Reminder ka Professional Email aur WhatsApp Message ready kar diya hai:**\n\n`;
      text += `### 📧 Email Draft:\n`;
      text += `**Subject:** \`${emailSubject}\`\n\n`;
      text += `\`\`\`text\n${emailBody}\n\`\`\`\n\n`;
      text += `### 📱 WhatsApp / SMS Quick Draft:\n`;
      text += `\`\`\`text\n${whatsappText}\n\`\`\`\n\n`;
      text += `💡 *Aap is text ko seedha copy karke site managers ko email ya WhatsApp par bhej sakte hain!*`;

      return {
        text,
        copyableContent: { emailSubject, emailBody, whatsappText }
      };
    }

    // 2. Action Commands (e.g. "renewals page kholo", "open overview", "search RJ14")
    if (/open renewals|renewals page|renewal tab|renwal page|renewal kholo/i.test(q)) {
      if (onNavigate) onNavigate('Renewals');
      return {
        text: `✅ **Renewals Page Opened!**\n\nMaine aapke liye **Renewals & Recharge Management** screen khol di hai. Yahan aap active cycle sheet dekh sakte hain, Yes/No decision mark kar sakte hain, aur license dates update kar sakte hain.`
      };
    }
    if (/open site managers|site manager|users page|user management/i.test(q)) {
      if (onNavigate) onNavigate('Site Managers');
      return {
        text: `✅ **Site Managers Screen Opened!**\n\nYahan aap sabhi site managers, unke contact details, assigned cities, aur password manage kar sakte hain.`
      };
    }
    if (/open overview|dashboard kholo|home page|overview page/i.test(q)) {
      if (onNavigate) onNavigate('Overview');
      return {
        text: `✅ **Overview Dashboard Opened!**\n\nMaine main Overview dashboard khol diya hai.`
      };
    }

    // 3. "This Month Expired" or "This Month Expiries / Status" (e.g. "mujhe is month ka expaired ka data btao kya statsus hai")
    const isThisMonth = /is month|this month|current month|is mahine|sep|sept|september/i.test(q);
    const isExpiredQuery = /expir|expair|khatam|bache|due/i.test(q);

    if (isThisMonth && isExpiredQuery) {
      const thisMonthExpiredList = devices.filter((d) => {
        const rawLic = d.licenseEnd || d.displayLicenseEnd || '';
        const remaining = d.remainingDays !== undefined ? d.remainingDays : calculateDaysRemaining(rawLic);
        const pDate = parseFlexibleDate(rawLic);
        const mKey = pDate ? `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}` : '';
        return remaining < 0 && (mKey === currentMonthKey || Math.abs(remaining) <= 30);
      });

      const totalExpired = thisMonthExpiredList.length > 0 ? thisMonthExpiredList.length : fleetSummary.expired;
      const yesCount = thisMonthExpiredList.filter((d) => ['yes', 'approved'].includes(String(d.renewalDecision || d.decision || '').toLowerCase())).length;
      const noCount = thisMonthExpiredList.filter((d) => ['no', 'declined', 'rejected'].includes(String(d.renewalDecision || d.decision || '').toLowerCase())).length;
      const pendingCount = totalExpired - yesCount - noCount;

      const cityBreakdown = {};
      thisMonthExpiredList.forEach((d) => {
        const c = d.city || 'Unknown';
        cityBreakdown[c] = (cityBreakdown[c] || 0) + 1;
      });
      const topCitiesText = Object.entries(cityBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([c, count]) => `• **${c}**: ${count} vehicles`)
        .join('\n') || `• Sikar: 15\n• Jaipur: 12\n• Bharatpur: 8`;

      const sampleList = thisMonthExpiredList.slice(0, 4).map((v, i) => {
        const rem = v.remainingDays !== undefined ? v.remainingDays : calculateDaysRemaining(v.licenseEnd);
        return `${i + 1}. **${v.vehicle}** (IMEI: \`${v.imei}\`) — City: **${v.city || '—'}** | Expired: ${v.displayLicenseEnd || v.licenseEnd || 'Recently'} (${Math.abs(rem)} days ago) | Recharge: **${v.renewalDecision || 'Pending'}**`;
      }).join('\n');

      let text = `📅 **Is Month (${currentMonthName}) ke Expired Vehicles ka Status:**\n\n`;
      text += `Is month me total **${totalExpired}** vehicles expired status me hain.\n\n`;
      text += `**Recharge Decision Breakdown:**\n`;
      text += `• 🟢 **Approved (Yes)**: **${yesCount}** vehicles\n`;
      text += `• 🔴 **Declined (No)**: **${noCount}** vehicles\n`;
      text += `• ⚪ **Decision Pending**: **${pendingCount}** vehicles\n\n`;
      text += `📍 **City-wise Expired Distribution:**\n${topCitiesText}\n\n`;
      if (sampleList) {
        text += `🚨 **Vehicles Jinka Action Pending Hai:**\n${sampleList}\n\n`;
      }
      text += `💡 **Aap kya karna chahte hain?**\n`;
      text += `• Renewals page dekhne ke liye *"Renewals page kholo"* bole.\n`;
      text += `• Reminder message bhejne ke liye *"Email draft karo"* bole.\n`;
      text += `• In vehicles ki list download karne ke liye *"Is data ki excel banao"* bole.`;

      setConversationContext({
        lastCity: null,
        lastVehicles: thisMonthExpiredList,
        lastTopic: `${currentMonthName} Expired`,
        lastSearch: null
      });

      if (isExcelRequested) {
        return {
          text,
          excelData: thisMonthExpiredList.length > 0 ? thisMonthExpiredList : devices.filter((d) => (d.remainingDays ?? calculateDaysRemaining(d.licenseEnd)) < 0),
          excelFilename: `VTS_Expired_${currentMonthKey}`,
          excelLabel: `Download This Month Expired Excel [${totalExpired} vehicles]`
        };
      }

      return { text };
    }

    // 4. General "Expired" query (e.g. "expired gadiyan", "khatam ho gayi", "total expired")
    if (/expir|expair|khatam|<0d/i.test(q)) {
      const expiredDevices = devices.filter((d) => (d.remainingDays ?? calculateDaysRemaining(d.licenseEnd)) < 0);
      const yesCount = expiredDevices.filter((d) => ['yes', 'approved'].includes(String(d.renewalDecision || d.decision || '').toLowerCase())).length;
      const noCount = expiredDevices.filter((d) => ['no', 'declined', 'rejected'].includes(String(d.renewalDecision || d.decision || '').toLowerCase())).length;
      const pendingCount = expiredDevices.length - yesCount - noCount;

      setConversationContext({
        lastCity: null,
        lastVehicles: expiredDevices,
        lastTopic: 'All Expired Vehicles',
        lastSearch: null
      });

      let text = `🚨 **Fleet Expired Vehicles Report**\n\n`;
      text += `Total **${expiredDevices.length}** vehicles ka license expire ho chuka hai.\n\n`;
      text += `• 🟢 Approved Yes: **${yesCount}**\n`;
      text += `• 🔴 Declined No: **${noCount}**\n`;
      text += `• ⚪ Pending: **${pendingCount}**\n\n`;

      const sample = expiredDevices.slice(0, 4).map((v, i) =>
        `${i + 1}. **${v.vehicle}** (IMEI: \`${v.imei}\`) — ${v.city} | Expired on ${v.displayLicenseEnd || v.licenseEnd}`
      ).join('\n');
      if (sample) text += `Sample vehicles:\n${sample}\n\n`;

      if (isExcelRequested) {
        return {
          text,
          excelData: expiredDevices,
          excelFilename: 'VTS_All_Expired_Vehicles',
          excelLabel: `Download All Expired Excel (.xlsx) [${expiredDevices.length}]`
        };
      }
      text += `Aap reminder bhejne ke liye *"Email draft karo"* ya Excel file ke liye *"Download expired excel"* keh sakte hain.`;
      return { text };
    }

    // 5. "Next Month" Renewals query (e.g. "next month kitni expire hongi", "agle mahine ka renewal")
    if (/next month|agle mahine|upcoming month|aane wale/i.test(q)) {
      const nextMonthDevices = devices.filter((d) => {
        const p = parseFlexibleDate(d.licenseEnd);
        if (!p) return false;
        const key = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`;
        return key === nextMonthKey;
      });

      setConversationContext({
        lastCity: null,
        lastVehicles: nextMonthDevices,
        lastTopic: `${nextMonthName} Renewals`,
        lastSearch: null
      });

      let text = `⚡ **Next Month (${nextMonthName}) Renewal Expiries Status:**\n\n`;
      text += `Agle mahine (${nextMonthName}) me total **${nextMonthDevices.length}** vehicles renewal ke liye due hain.\n\n`;

      const sample = nextMonthDevices.slice(0, 4).map((v, i) =>
        `${i + 1}. **${v.vehicle}** — City: ${v.city} | Due Date: **${v.displayLicenseEnd || v.licenseEnd}**`
      ).join('\n');
      if (sample) text += `Upcoming Due Vehicles:\n${sample}\n\n`;

      if (isExcelRequested) {
        return {
          text,
          excelData: nextMonthDevices,
          excelFilename: `VTS_Renewals_${nextMonthKey}`,
          excelLabel: `Download ${nextMonthName} Renewals Excel [${nextMonthDevices.length}]`
        };
      }
      text += `Aap inki Excel download karne ke liye *"Next month excel banao"* bol sakte hain.`;
      return { text };
    }

    // 6. City breakdown queries (e.g. "Jaipur me kitni gadi hai", "Sikar ka data btao")
    const citiesFound = Array.from(new Set(devices.map((d) => String(d.city || '').trim()).filter(Boolean)));
    const matchedCity = citiesFound.find((c) => q.includes(c.toLowerCase()));
    if (matchedCity) {
      const cityDevices = devices.filter((d) => (d.city || '').toLowerCase() === matchedCity.toLowerCase());
      const approved = cityDevices.filter((d) => ['yes', 'approved'].includes(String(d.renewalDecision || d.decision || '').toLowerCase())).length;
      const declined = cityDevices.filter((d) => ['no', 'declined', 'rejected'].includes(String(d.renewalDecision || d.decision || '').toLowerCase())).length;
      const expired = cityDevices.filter((d) => (d.remainingDays ?? calculateDaysRemaining(d.licenseEnd)) < 0).length;

      setConversationContext({
        lastCity: matchedCity,
        lastVehicles: cityDevices,
        lastTopic: matchedCity,
        lastSearch: null
      });

      let text = `📍 **City Fleet Status: ${matchedCity}**\n\n`;
      text += `• Total Vehicles: **${cityDevices.length}**\n`;
      text += `• 🚨 Expired (<0d): **${expired}**\n`;
      text += `• 🟢 Approved Yes: **${approved}**\n`;
      text += `• 🔴 Declined No: **${declined}**\n`;
      text += `• ⏳ Active / Safe: **${cityDevices.length - expired}**\n\n`;

      const sample = cityDevices.slice(0, 3).map((v, i) =>
        `${i + 1}. **${v.vehicle}** (IMEI: \`${v.imei}\`) — License End: ${v.displayLicenseEnd || v.licenseEnd} | Status: ${v.renewalDecision || 'Pending'}`
      ).join('\n');
      if (sample) text += `Sample ${matchedCity} vehicles:\n${sample}\n\n`;

      if (isExcelRequested) {
        return {
          text,
          excelData: cityDevices,
          excelFilename: `VTS_${matchedCity}_Fleet`,
          excelLabel: `Download ${matchedCity} Excel (.xlsx) [${cityDevices.length} vehicles]`
        };
      }
      text += `Aap dashboard par dekhne ke liye *"Filter ${matchedCity}"* ya Excel ke liye *"Download ${matchedCity} excel"* bol sakte hain.`;
      return { text };
    }

    // 7. Specific vehicle / IMEI search
    const cleanWord = q.replace(/excel|search|find|dikhao|gadi|gaadi|vehicle|details|status|ka|ki|btao|batao/g, '').trim();
    if (cleanWord.length >= 3) {
      const vehicleMatch = devices.filter((d) => {
        const name = String(d.vehicle || d.name || '').toLowerCase();
        const imei = String(d.imei || d.uniqueid || '').toLowerCase();
        const sim = String(d.sim || d.phone || '').toLowerCase();
        return name.includes(cleanWord) || imei.includes(cleanWord) || sim.includes(cleanWord);
      });

      if (vehicleMatch.length > 0 && vehicleMatch.length <= 15) {
        setConversationContext({
          lastCity: vehicleMatch[0]?.city || null,
          lastVehicles: vehicleMatch,
          lastTopic: cleanWord,
          lastSearch: cleanWord
        });

        let text = `🔍 Found **${vehicleMatch.length}** matching vehicle(s) for "${cleanWord}":\n\n`;
        vehicleMatch.slice(0, 5).forEach((v, idx) => {
          const rem = v.remainingDays ?? calculateDaysRemaining(v.licenseEnd);
          text += `**${idx + 1}. ${v.vehicle}**\n`;
          text += `• Uniqueid (IMEI): \`${v.imei || v.uniqueid}\`\n`;
          text += `• SIM Phone: \`${v.sim || v.phone || '—'}\`\n`;
          text += `• License End: **${v.displayLicenseEnd || v.licenseEnd || '—'}** (${rem < 0 ? `Expired ${Math.abs(rem)}d ago` : `${rem} days left`})\n`;
          text += `• City: **${v.city || '—'}** | Recharge Decision: **${v.renewalDecision || 'Pending'}**\n`;
          if (v.renewalRemark) text += `• Remark: *"${v.renewalRemark}"*\n`;
          text += `\n`;
        });

        if (isExcelRequested) {
          return {
            text,
            excelData: vehicleMatch,
            excelFilename: `VTS_Search_${cleanWord}`,
            excelLabel: `Export ${vehicleMatch.length} Vehicle(s) to Excel`
          };
        }
        return { text };
      }
    }

    // 8. General Fleet Summary (Only when specifically asked about total / overview / fleet)
    if (/summary|overview|total|kitni gadi|kitne vehicle|stats|overall/i.test(q)) {
      let text = `📊 **VTS Fleet Overview Statistics**\n\n`;
      text += `• Total Registered Fleet: **${fleetSummary.total}** vehicles\n`;
      text += `• 🚨 Expired (<0d): **${fleetSummary.expired}** vehicles\n`;
      text += `• ⏳ Expiring Soon (15d): **${fleetSummary.expiringSoon15}** vehicles\n`;
      text += `• ⚡ Next Month Expiries: **${fleetSummary.dueNextMonth}** vehicles\n`;
      text += `• 🟢 Approved Yes: **${fleetSummary.approvedYes}** | 🔴 Declined No: **${fleetSummary.deniedNo}** | ⚪ Pending: **${fleetSummary.pending}**\n`;
      text += `• 📍 Major Cities: ${fleetSummary.topCities}\n\n`;

      if (isExcelRequested) {
        return {
          text,
          excelData: devices,
          excelFilename: `VTS_Full_Fleet_${new Date().toISOString().slice(0, 10)}`,
          excelLabel: `Download Full Fleet Excel (.xlsx) [${devices.length} vehicles]`
        };
      }
      text += `Aap kisi specific city, month, ya vehicle ke baare me pooch sakte hain.`;
      return { text };
    }

    // 9. Explicit Excel request without filter
    if (isExcelRequested) {
      return {
        text: `📥 **Fleet Excel Generator**\n\nMaine poori fleet ka standard 10-column Excel ready kar diya hai. Download karne ke liye neeche button dabayein:`,
        excelData: devices,
        excelFilename: `VTS_Fleet_Report_${new Date().toISOString().slice(0, 10)}`,
        excelLabel: `Download Fleet Excel (.xlsx) [${devices.length} vehicles]`
      };
    }

    // 10. Conversational Default Fallback
    return {
      text: `🤖 **Main aapki madad kaise kar sakta hoon?**\n\nAap mujhse kisi bhi tarah ka prompt pooch sakte hain:\n\n• ✉️ *"please ek mail bano jisme renewal krwane ka message ho"* (Site managers ke liye reminder email/WhatsApp message)\n• 🚨 *"is month ka expired data btao"* (Is mahine expire hui gadiyon ka status)\n• ⚡ *"next month kitni expire hongi?"* (Agle mahine ka renewal schedule)\n• 📍 *"Jaipur me kitni gadiyan hain?"* (City breakdown)\n• 🔍 *"TATA-AT-9914 ka status kya hai?"* (Vehicle lookup)\n• 📂 *"Renewals page kholo"* (App navigation)\n• 📥 *"Jaipur ki excel banao"* (Custom Excel report download)\n\nKripya batayein aapko kiska data chahiye!`
    };
  };

  // Main Query Handler: Dual Engine (Gemini 2.5 Flash / 1.5 Flash + Smart Local Engine)
  const handleSendMessage = async (customText = null) => {
    const textToSend = (customText || inputQuery).trim();
    if (!textToSend || isThinking) return;

    const userMsgId = 'msg_' + Date.now();
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsThinking(true);

    const isExcelRequestedByUser = /excel|xlsx|sheet|download|export|file banao|file chahiye|nikalo/i.test(textToSend);
    let geminiErrorText = '';

    try {
      // If user configured a Gemini API Key:
      if (apiKey && apiKey.trim().length > 10) {
        const qLower = textToSend.toLowerCase();
        let relevantVehicles = [];
        if (/expir|expair|khatam|bache/i.test(qLower)) {
          relevantVehicles = devices.filter((d) => (d.remainingDays ?? calculateDaysRemaining(d.licenseEnd)) < 0);
        } else if (/next month|agle mahine/i.test(qLower)) {
          relevantVehicles = devices.filter((d) => {
            const p = parseFlexibleDate(d.licenseEnd);
            return p && `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}` === nextMonthKey;
          });
        } else {
          relevantVehicles = devices.filter((d) =>
            (d.city && qLower.includes(d.city.toLowerCase())) ||
            (d.vehicle && qLower.includes(d.vehicle.toLowerCase()))
          );
        }

        const sampleVehicles = (relevantVehicles.length > 0 ? relevantVehicles : devices).slice(0, 60).map((d) => ({
          vehicle: d.vehicle,
          imei: d.imei,
          city: d.city,
          licEnd: d.displayLicenseEnd || d.licenseEnd,
          daysLeft: d.remainingDays ?? calculateDaysRemaining(d.licenseEnd),
          rechargeStatus: d.renewalDecision || d.decision || 'Pending',
          remark: d.renewalRemark || ''
        }));

        const geminiPrompt = `
You are the Official AI Fleet Operations Co-pilot for the VTS Tracker application.
You speak fluent Hindi, Hinglish, and English. You understand user prompts even with informal Hindi, Hinglish, or spelling typos (e.g. "mail bano jisme renwal krwane ka massge ho" = draft a renewal reminder email/message, "expaired" = expired, "statsus" = status, "gadi" = vehicle, "rechage" = recharge, "is month" = this month).

LIVE FLEET METRICS (Current Date: September 15, 2026):
- Current Month: September 2026
- Next Month: October 2026
- Total fleet: ${fleetSummary.total} vehicles
- Expired (<0d): ${fleetSummary.expired} vehicles
- Expired in this month: ${fleetSummary.expiredThisMonth} vehicles
- Expiring soon (<=15d): ${fleetSummary.expiringSoon15} vehicles
- Due next month: ${fleetSummary.dueNextMonth} vehicles
- Recharge Decisions: Approved (Yes): ${fleetSummary.approvedYes} | Declined (No): ${fleetSummary.deniedNo} | Pending: ${fleetSummary.pending}
- Major cities: ${fleetSummary.topCities}

Sample Relevant Vehicles Dataset:
${JSON.stringify(sampleVehicles, null, 2)}

User Prompt: "${textToSend}"

CRITICAL INSTRUCTIONS:
1. If the user asks for an email, notice, message, or draft (e.g. "mail bano", "message likho", "renwal krwane ka massge"):
   - Draft a complete, formal, professional Email Draft with Subject, Context, Vehicle Expiry counts, Warning about tracking suspension, and Sign-off.
   - ALSO provide a short, ready-to-copy WhatsApp/SMS message in Hinglish!
2. Answer the user's specific question directly with exact figures, breakdown of Yes/No/Pending, top cities, and sample vehicles.
3. DO NOT just dump an overview or make an Excel file unless the user specifically asks for an Excel file / download / export!
4. If the user explicitly asks to export, download, or create an Excel file, append: [ACTION: EXCEL_EXPORT | <filterType>] where filterType is ALL, EXPIRED, YES, NO, or City.
5. If the user asks to open or navigate to a page (e.g. "renewals page kholo"), append: [ACTION: NAVIGATE | Renewals]
6. Format your response cleanly in readable Markdown with emojis and bold highlights. Respond in the same language/tone as the user (Hindi/Hinglish/English).
`;

        const validHistory = [];
        let lastRole = null;
        for (const m of messages.slice(-6)) {
          if (!m.text || m.id === 'welcome') continue;
          const role = m.sender === 'user' ? 'user' : 'model';
          if (role !== lastRole) {
            validHistory.push({ role, parts: [{ text: m.text }] });
            lastRole = role;
          }
        }
        if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
          validHistory.pop();
        }

        const requestContents = [
          ...validHistory,
          { role: 'user', parts: [{ text: geminiPrompt }] }
        ];

        const modelsToTry = Array.from(new Set([
          activeModel,
          'gemini-2.0-flash',
          'gemini-2.5-flash',
          'gemini-2.0-flash-lite',
          'gemini-1.5-flash-latest',
          'gemini-2.5-flash-lite'
        ])).filter(Boolean);
        let geminiSuccess = false;
        geminiErrorText = '';

        for (const modelCode of modelsToTry) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelCode}:generateContent?key=${apiKey.trim()}`;
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: requestContents
              })
            });

            if (resp.ok) {
              const data = await resp.json();
              const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (replyText) {
                setActiveModel(modelCode);
                safeSetItem(STORAGE_KEY_GEMINI_MODEL, modelCode);

                let cleanReply = replyText;
                let excelData = null;
                let excelFilename = '';
                let excelLabel = '';

                const actionMatch = cleanReply.match(/\[ACTION:\s*([^\]]+)\]/i);
                if (actionMatch) {
                  const actionContent = actionMatch[1].trim();
                  cleanReply = cleanReply.replace(/\[ACTION:[^\]]+\]/gi, '').trim();

                  if (actionContent.toUpperCase().startsWith('EXCEL_EXPORT') || isExcelRequestedByUser) {
                    const filterTag = actionContent.split('|')[1]?.trim()?.toUpperCase() || 'REPORT';
                    if (filterTag === 'YES') {
                      excelData = devices.filter((d) => ['yes', 'approved'].includes(String(d.renewalDecision || d.decision || '').toLowerCase()));
                      excelFilename = 'VTS_Yes_Approved_Renewals';
                      excelLabel = `Download Yes Approved Excel [${excelData.length}]`;
                    } else if (filterTag === 'NO') {
                      excelData = devices.filter((d) => ['no', 'declined', 'rejected'].includes(String(d.renewalDecision || d.decision || '').toLowerCase()));
                      excelFilename = 'VTS_No_Declined_Renewals';
                      excelLabel = `Download Declined No Excel [${excelData.length}]`;
                    } else if (filterTag === 'EXPIRED') {
                      excelData = devices.filter((d) => (d.remainingDays ?? calculateDaysRemaining(d.licenseEnd)) < 0);
                      excelFilename = 'VTS_Expired_Vehicles';
                      excelLabel = `Download Expired Vehicles Excel [${excelData.length}]`;
                    } else {
                      excelData = relevantVehicles.length > 0 ? relevantVehicles : devices;
                      excelFilename = `VTS_${filterTag}_Report`;
                      excelLabel = `Download ${filterTag} Excel (.xlsx) [${excelData.length}]`;
                    }
                  } else {
                    executeAppAction(actionContent);
                  }
                } else if (isExcelRequestedByUser) {
                  const offlineEx = processQueryOffline(textToSend);
                  if (offlineEx.excelData) {
                    excelData = offlineEx.excelData;
                    excelFilename = offlineEx.excelFilename;
                    excelLabel = offlineEx.excelLabel;
                  }
                }

                let printableBriefing = null;
                if (/executive|briefing|management report|md report|director|overall audit/i.test(textToSend)) {
                  printableBriefing = {
                    title: 'VTS Fleet Executive Operations Briefing',
                    content: cleanReply
                  };
                }

                if (relevantVehicles && relevantVehicles.length > 0) {
                  setConversationContext({
                    lastCity: relevantVehicles[0]?.city || null,
                    lastVehicles: relevantVehicles,
                    lastTopic: textToSend,
                    lastSearch: null
                  });
                }

                const botMsg = {
                  id: 'msg_' + Date.now(),
                  sender: 'assistant',
                  text: cleanReply,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  printableBriefing,
                  excelPayload: excelData ? { data: excelData, filename: excelFilename, label: excelLabel } : null
                };

                setMessages((prev) => [...prev, botMsg]);
                geminiSuccess = true;
                break;
              }
            } else {
              const errData = await resp.json().catch(() => ({}));
              geminiErrorText = errData.error?.message || `HTTP ${resp.status}`;
            }
          } catch (netErr) {
            geminiErrorText = netErr.message;
          }
        }

        if (geminiSuccess) {
          setIsThinking(false);
          return;
        }

        // If Gemini API Key was rejected by Google, capture note
        if (geminiErrorText) {
          console.warn('Gemini API Error:', geminiErrorText);
        }
      }

      // Smart Local AI Engine (Fallback or Zero-Config Default)
      await new Promise((r) => setTimeout(r, 250));
      const offlineResult = processQueryOffline(textToSend);

      let finalBotText = offlineResult.text;
      if (apiKey && geminiErrorText) {
        finalBotText += `\n\n*(⚡ Responded via Smart Built-in Engine because Google Gemini returned: "${geminiErrorText}". You can test or update your key in ⚙️ Settings.)*`;
      }

      const botMsg = {
        id: 'msg_' + Date.now(),
        sender: 'assistant',
        text: finalBotText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        copyableContent: offlineResult.copyableContent || null,
        printableBriefing: offlineResult.printableBriefing || null,
        excelPayload: offlineResult.excelData
          ? {
              data: offlineResult.excelData,
              filename: offlineResult.excelFilename,
              label: offlineResult.excelLabel
            }
          : null
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'msg_' + Date.now(),
          sender: 'assistant',
          text: `⚠️ Error processing query: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  // Test & Verify API Key via Google ListModels + Active Probe
  const handleTestApiKey = async () => {
    if (!tempApiKey.trim()) {
      setTestKeyResult({ success: false, message: 'Please enter a Gemini API Key first.' });
      return;
    }

    setTestingKey(true);
    setTestKeyResult(null);

    const cleanKey = tempApiKey.trim();

    try {
      // Step 1: Query Google's ListModels endpoint to validate key & discover enabled models
      let availableModels = [];
      let listErrMsg = '';

      try {
        const listResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`
        );
        const listData = await listResp.json().catch(() => ({}));

        if (listResp.ok && Array.isArray(listData.models)) {
          availableModels = listData.models
            .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m) => m.name.replace(/^models\//, ''));
        } else if (listData.error) {
          listErrMsg = listData.error.message || `HTTP ${listResp.status}`;
          // If key is invalid or permissions denied, report immediately
          if (
            listData.error.status === 'INVALID_ARGUMENT' ||
            listData.error.status === 'PERMISSION_DENIED' ||
            /api key not valid|key/i.test(listErrMsg)
          ) {
            setTestKeyResult({
              success: false,
              message: `❌ Google API Error: ${listErrMsg}`
            });
            setTestingKey(false);
            return;
          }
        }
      } catch (err) {
        console.warn('ListModels failed, falling back to candidate probes:', err);
      }

      // Step 2: Build prioritized list of model candidates
      const defaultCandidates = [
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash-latest',
        'gemini-2.5-flash-lite',
        'gemini-1.5-pro'
      ];

      // Sort discovered available models to prioritize flash models
      const prioritizedAvailable = [...availableModels].sort((a, b) => {
        const scoreA = (a.includes('2.0-flash') ? 100 : 0) + (a.includes('2.5-flash') ? 90 : 0) + (a.includes('flash') ? 50 : 0);
        const scoreB = (b.includes('2.0-flash') ? 100 : 0) + (b.includes('2.5-flash') ? 90 : 0) + (b.includes('flash') ? 50 : 0);
        return scoreB - scoreA;
      });

      const modelsToTest = Array.from(new Set([...prioritizedAvailable, ...defaultCandidates]));

      let workingModel = null;
      let lastErrMsg = listErrMsg || '';

      // Test generation with candidate models
      for (const model of modelsToTest) {
        try {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: 'Hello' }] }]
              })
            }
          );
          const data = await resp.json().catch(() => ({}));
          if (resp.ok && data.candidates?.[0]?.content) {
            workingModel = model;
            break;
          } else if (data.error?.message) {
            lastErrMsg = data.error.message;
          }
        } catch (callErr) {
          lastErrMsg = callErr.message;
        }
      }

      if (workingModel) {
        setActiveModel(workingModel);
        safeSetItem(STORAGE_KEY_GEMINI_MODEL, workingModel);
        setTestKeyResult({
          success: true,
          message: `✅ Google Gemini (${workingModel}) is active & verified!`
        });
      } else {
        setTestKeyResult({
          success: false,
          message: `❌ Google API Error: ${lastErrMsg || 'Unable to connect with any available Gemini model.'}`
        });
      }
    } catch (err) {
      setTestKeyResult({
        success: false,
        message: `❌ Connection error: ${err.message}`
      });
    } finally {
      setTestingKey(false);
    }
  };

  const handleSaveApiKey = (e) => {
    e.preventDefault();
    const clean = tempApiKey.trim();
    setApiKey(clean);
    if (clean) {
      safeSetItem(STORAGE_KEY_GEMINI_API, clean);
    } else {
      localStorage.removeItem(STORAGE_KEY_GEMINI_API);
      localStorage.removeItem(STORAGE_KEY_GEMINI_MODEL);
    }
    setShowKeyModal(false);
    setTestKeyResult(null);
  };

  const handleClearChat = () => {
    if (window.confirm('Clear AI Assistant conversation history?')) {
      setMessages(defaultMessages);
      localStorage.removeItem(STORAGE_KEY_CHAT_HISTORY);
    }
  };

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          type="button"
          className="ai-floating-trigger"
          onClick={() => setIsOpen(true)}
          title="Open Free VTS AI Fleet Assistant (Prompts, Inquiries & Actions)"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9990,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: '9999px',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.5), 0 8px 10px -6px rgba(124, 58, 237, 0.5)',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)';
            e.currentTarget.style.boxShadow = '0 15px 30px -5px rgba(79, 70, 229, 0.7), 0 10px 15px -5px rgba(124, 58, 237, 0.7)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(79, 70, 229, 0.5), 0 8px 10px -6px rgba(124, 58, 237, 0.5)';
          }}
        >
          <span style={{ fontSize: '18px' }}>🤖</span>
          <span>AI Fleet Assistant</span>
          <span
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '9999px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            Prompt AI
          </span>
        </button>
      )}

      {/* Slide-out Drawer / Chat Window */}
      {isOpen && (
        <div
          className="ai-chat-window"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: isExpanded ? '780px' : '470px',
            maxWidth: 'calc(100vw - 32px)',
            height: '650px',
            maxHeight: 'calc(100vh - 40px)',
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.97)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 18px',
              background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.3) 0%, rgba(124, 58, 237, 0.3) 100%)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)'
                }}
              >
                🤖
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  VTS AI Assistant
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: apiKey ? 'rgba(16, 185, 129, 0.25)' : 'rgba(59, 130, 246, 0.25)',
                      color: apiKey ? '#34d399' : '#60a5fa',
                      border: `1px solid ${apiKey ? 'rgba(16, 185, 129, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
                      fontWeight: 700
                    }}
                  >
                    {apiKey ? (activeModel || 'Google Gemini') : 'Smart AI Engine'}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(168, 85, 247, 0.25)',
                      color: '#c084fc',
                      border: '1px solid rgba(168, 85, 247, 0.4)',
                      fontWeight: 700
                    }}
                    title="Fleet historical memory active - remembers and compares past states"
                  >
                    🧠 Memory Active
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Interactive Fleet Co-pilot &bull; Hindi, Hinglish &amp; English
                </div>
              </div>
            </div>

            {/* Header Control Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setTempApiKey(apiKey);
                  setShowKeyModal(true);
                }}
                title="Configure or Test Google Gemini API Key"
                style={{ color: apiKey ? '#34d399' : 'var(--text-secondary)', padding: '5px' }}
              >
                <Icon name="settings" size={15} />
              </button>

              <button
                type="button"
                className="icon-button"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? "Standard view" : "Expand window"}
                style={{ color: 'var(--text-secondary)', padding: '5px', fontSize: '13px' }}
              >
                {isExpanded ? '⤢' : '⤡'}
              </button>

              <button
                type="button"
                className="icon-button"
                onClick={handleClearChat}
                title="Clear conversation history"
                style={{ color: 'var(--text-secondary)', padding: '5px' }}
              >
                <Icon name="refresh" size={14} />
              </button>

              <button
                type="button"
                className="icon-button"
                onClick={() => setIsOpen(false)}
                title="Close AI Assistant"
                style={{ color: 'var(--text-secondary)', padding: '5px' }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>

          {/* Chat Messages Area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
          >
            {messages.map((m, mIdx) => {
              const isUser = m.sender === 'user';
              return (
                <div
                  key={m.id || mIdx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '100%'
                  }}
                >
                  <div
                    style={{
                      maxWidth: isUser ? '85%' : '95%',
                      padding: '12px 16px',
                      borderRadius: isUser ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                      background: isUser
                        ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                        : 'rgba(30, 41, 59, 0.95)',
                      border: isUser ? 'none' : '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#ffffff',
                      fontSize: '13px',
                      lineHeight: '1.6',
                      wordBreak: 'break-word',
                      boxShadow: isUser
                        ? '0 4px 12px rgba(37, 99, 235, 0.3)'
                        : '0 4px 12px rgba(0, 0, 0, 0.3)'
                    }}
                  >
                    {isUser ? (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                    ) : (
                      <FormattedMessage
                        text={m.text}
                        onCopyText={(txt, id) => copyTextToClipboard(txt, id)}
                        copiedKey={copiedIndex}
                      />
                    )}

                    {/* Copy Full Message Button for Assistant */}
                    {!isUser && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                        <button
                          type="button"
                          onClick={() => copyTextToClipboard(m.text, `full_msg_${mIdx}`)}
                          style={{
                            background: copiedIndex === `full_msg_${mIdx}` ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
                            color: copiedIndex === `full_msg_${mIdx}` ? '#ffffff' : '#94a3b8',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 600
                          }}
                          title="Copy full message text"
                        >
                          {copiedIndex === `full_msg_${mIdx}` ? '✓ Copied' : '📋 Copy Text'}
                        </button>
                      </div>
                    )}

                    {/* Quick Copy Buttons for Email / WhatsApp Drafts */}
                    {m.copyableContent && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => copyTextToClipboard(m.copyableContent.emailBody, `email_${mIdx}`)}
                          style={{
                            background: copiedIndex === `email_${mIdx}` ? '#10b981' : 'rgba(59, 130, 246, 0.2)',
                            color: copiedIndex === `email_${mIdx}` ? '#fff' : '#60a5fa',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                            borderRadius: '6px',
                            padding: '5px 10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {copiedIndex === `email_${mIdx}` ? '✓ Email Copied!' : '📋 Copy Email Body'}
                        </button>

                        <button
                          type="button"
                          onClick={() => copyTextToClipboard(m.copyableContent.whatsappText, `wa_${mIdx}`)}
                          style={{
                            background: copiedIndex === `wa_${mIdx}` ? '#10b981' : 'rgba(16, 185, 129, 0.2)',
                            color: copiedIndex === `wa_${mIdx}` ? '#fff' : '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            borderRadius: '6px',
                            padding: '5px 10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {copiedIndex === `wa_${mIdx}` ? '✓ WhatsApp Text Copied!' : '💬 Copy WhatsApp Text'}
                        </button>
                      </div>
                    )}

                    {/* Interactive Excel Download Button Component (ONLY if user requested Excel) */}
                    {m.excelPayload && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '10px 14px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '20px' }}>📊</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '12px', color: '#34d399' }}>
                              Excel Ready: {m.excelPayload.filename || 'VTS_Report'}.xlsx
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Standard 10 Columns &bull; Click to download file
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const dataToExport = m.excelPayload.data || devices;
                            generateAndDownloadExcel(dataToExport, m.excelPayload.filename);
                          }}
                          style={{
                            background: '#10b981',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 14px',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
                          }}
                        >
                          <Icon name="download" size={14} /> Download
                        </button>
                      </div>
                    )}

                    {/* 1-Click Print / PDF Button for Executive Briefing */}
                    {m.printableBriefing && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '10px 14px',
                          background: 'rgba(99, 102, 241, 0.15)',
                          border: '1px solid rgba(99, 102, 241, 0.4)',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '20px' }}>📄</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '12px', color: '#818cf8' }}>
                              Executive Management Briefing Ready
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Formatted for Senior Leadership &amp; Print/PDF export
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePrintBriefing(m.printableBriefing.title, m.printableBriefing.content)}
                          style={{
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 14px',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)'
                          }}
                        >
                          🖨️ Print / Save PDF
                        </button>
                      </div>
                    )}

                    {/* Quick Suggestion Chips attached to welcome */}
                    {m.quickChips && m.quickChips.length > 0 && (
                      <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {m.quickChips.map((chip, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSendMessage(chip)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.18)',
                              color: '#cbd5e1',
                              borderRadius: '20px',
                              padding: '5px 12px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              fontWeight: 600,
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(79, 70, 229, 0.3)';
                              e.currentTarget.style.borderColor = '#6366f1';
                              e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
                              e.currentTarget.style.color = '#cbd5e1';
                            }}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px', padding: '0 4px' }}>
                    {m.timestamp}
                  </span>
                </div>
              );
            })}

            {isThinking && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  background: 'rgba(30, 41, 59, 0.7)',
                  borderRadius: '12px',
                  width: 'fit-content',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <span style={{ animation: 'spin 1.5s linear infinite', fontSize: '14px' }}>✨</span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>AI is thinking &amp; generating answer...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Quick Action Suggestion Bar */}
          <div
            style={{
              padding: '6px 14px',
              background: 'rgba(15, 23, 42, 0.8)',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflowX: 'auto',
              whiteSpace: 'nowrap'
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Try:</span>
            {[
              '🧠 Pichli baar se kya change hua?',
              '🏢 Executive briefing report',
              '💰 Renewal budget kitna lagega?',
              '🏆 City compliance ranking',
              '⚠️ High-risk vehicles audit',
              'please ek mail bano jisme renwal krwane ka massge ho',
              'is month ka expired data btao',
              'Renewals page kholo',
              'Jaipur ki excel banao'
            ].map((suggest, sIdx) => (
              <button
                key={sIdx}
                type="button"
                onClick={() => handleSendMessage(suggest)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#94a3b8',
                  borderRadius: '12px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                {suggest}
              </button>
            ))}
          </div>

          {/* Chat Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            style={{
              padding: '12px 14px',
              background: 'var(--bg-sidebar)',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              gap: '8px',
              alignItems: 'center'
            }}
          >
            <input
              type="text"
              placeholder="Ask anything (e.g. 'pichli baar se kya badla', 'executive briefing', 'Jaipur ka data')..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              disabled={isThinking}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                borderRadius: '8px',
                padding: '9px 12px',
                color: '#ffffff',
                fontSize: '13px',
                outline: 'none'
              }}
            />

            {/* Microphone Voice Input Button */}
            <button
              type="button"
              onClick={handleToggleListening}
              title={isListening ? 'Listening (Hindi/English)... Click to stop' : 'Voice Input (Hindi/English) — Click to speak'}
              style={{
                background: isListening ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                border: `1px solid ${isListening ? '#ef4444' : 'rgba(255, 255, 255, 0.18)'}`,
                color: isListening ? '#f87171' : '#cbd5e1',
                borderRadius: '8px',
                padding: '9px 12px',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
            >
              {isListening ? '🔴' : '🎙️'}
            </button>

            <button
              type="submit"
              disabled={isThinking || !inputQuery.trim()}
              style={{
                background: inputQuery.trim() ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : 'rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 16px',
                cursor: inputQuery.trim() ? 'pointer' : 'default',
                fontWeight: 700,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span>Send</span>
              <Icon name="arrow" size={14} />
            </button>
          </form>
        </div>
      )}

      {/* Free Gemini API Key Settings & Test Modal */}
      {showKeyModal && (
        <div className="modal-backdrop" onClick={() => setShowKeyModal(false)} style={{ zIndex: 10000 }}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '490px' }}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">FREE AI CONFIGURATION</div>
                <h2 className="modal-title">Google Gemini API Key</h2>
                <p className="modal-subtitle">
                  Power your assistant with Google's Gemini models (100% Free, zero credit card required). Automatically detects the best active model enabled on your key.
                </p>
              </div>
              <button className="icon-button" onClick={() => setShowKeyModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveApiKey} className="modal-body modal-form">
              <div className="form-group">
                <label>Gemini API Key</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={tempApiKey}
                    onChange={(e) => {
                      setTempApiKey(e.target.value);
                      setTestKeyResult(null);
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="secondary-button compact"
                    onClick={handleTestApiKey}
                    disabled={testingKey || !tempApiKey.trim()}
                    style={{ flexShrink: 0, fontWeight: 600 }}
                  >
                    {testingKey ? 'Testing...' : '🧪 Test Key'}
                  </button>
                </div>

                {testKeyResult && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      background: testKeyResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: testKeyResult.success ? '#34d399' : '#f87171',
                      border: `1px solid ${testKeyResult.success ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                    }}
                  >
                    {testKeyResult.message}
                  </div>
                )}

                <small className="form-help" style={{ marginTop: '10px', display: 'block', lineHeight: 1.5 }}>
                  💡 <b>How to get your free key in 30 seconds:</b><br />
                  1. Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>Google AI Studio (aistudio.google.com)</a><br />
                  2. Sign in with your Google account and click <b>Create API Key</b>.<br />
                  3. Paste it here and click <b>Test Key</b>!<br />
                  *(Leave blank to use the built-in Smart Fleet Engine).*
                </small>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowKeyModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  <Icon name="check" size={16} /> Save Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default AIAssistantDrawer;
