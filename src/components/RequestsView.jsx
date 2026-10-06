import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from './Icons';
import {
  getCurrentUser,
  submitRequirementRequest,
  submitReturnRequest,
  approveFirestoreRequirement,
  rejectFirestoreRequirement,
  approveFirestoreReturn,
  rejectFirestoreReturn,
  bulkApproveFirestoreRequirements,
  bulkRejectFirestoreRecords,
  bulkApproveFirestoreReturns,
  archiveFirestoreRecord,
  deleteFirestoreRecord,
  bulkAddFirestoreRequirements,
  bulkAddFirestoreReturns,
  RAJASTHAN_CITIES,
  VEHICLE_TYPES,
  REQUIREMENT_TYPES,
  RETURN_REASONS
} from '../services/api';

export function RequestsView({ requests = [], returnRequests = [], onRefresh, devices = [] }) {
  const currentUser = getCurrentUser() || { name: 'User', email: 'user@wevois.com', role: 'Manager' };
  const isAdmin = currentUser.role === 'Admin';

  // Navigation & Sub-Tabs
  const [activeTab, setActiveTab] = useState('requirements'); // 'requirements' | 'returns' | 'archived'
  const [filterCity, setFilterCity] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All'); // 'All' | 'pending' | 'done' | 'rejected'
  const [search, setSearch] = useState('');

  // Row Expansion & Selection
  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Modal States
  const [showReqModal, setShowReqModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(null); // { docId, item }
  const [showRejectModal, setShowRejectModal] = useState(null); // { docId, item, collection: 'requirements' | 'returns' }
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkMode, setBulkMode] = useState('requirements'); // 'requirements' | 'returns'
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [parsedBulkItems, setParsedBulkItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Requirement Form state
  const [reqCity, setReqCity] = useState(currentUser.assignedCities?.[0] || 'JAIPUR');
  const [reqVehicleNo, setReqVehicleNo] = useState('');
  const [reqVehicleType, setReqVehicleType] = useState('Tipper');
  const [reqType, setReqType] = useState('New VTS');
  const [reqReason, setReqReason] = useState('');
  const [reqIsTampered, setReqIsTampered] = useState('No');
  const [reqIsPenalty, setReqIsPenalty] = useState('No');
  const [reqPenaltyAt, setReqPenaltyAt] = useState('App');
  const [reqPenaltyDetails, setReqPenaltyDetails] = useState('');
  const [reqEmpId, setReqEmpId] = useState(currentUser.empId || '');
  const [reqMobile, setReqMobile] = useState(currentUser.mobile || '');
  const [reqRemarks, setReqRemarks] = useState('');
  const [reqTotalVts, setReqTotalVts] = useState(1);
  const [reqVerified, setReqVerified] = useState(false);
  const [reqDeclared, setReqDeclared] = useState(false);

  // Return Form state
  const [retVehicleNo, setRetVehicleNo] = useState('');
  const [retVehicleType, setRetVehicleType] = useState('Tipper');
  const [retImei, setRetImei] = useState('');
  const [retSim, setRetSim] = useState('');
  const [retCity, setRetCity] = useState(currentUser.assignedCities?.[0] || 'JAIPUR');
  const [retReason, setRetReason] = useState('Faulty / Not Working');
  const [retCondition, setRetCondition] = useState('Good / Reusable');
  const [retIncludingWire, setRetIncludingWire] = useState(true);
  const [retNeedsReplacement, setRetNeedsReplacement] = useState(true);
  const [retVtsPhoto, setRetVtsPhoto] = useState('');
  const [retSimPhoto, setRetSimPhoto] = useState('');
  const [retEmpId, setRetEmpId] = useState(currentUser.empId || '');
  const [retMobile, setRetMobile] = useState(currentUser.mobile || '');
  const [retCourier, setRetCourier] = useState('');
  const [retRemarks, setRetRemarks] = useState('');
  const [retVerified, setRetVerified] = useState(false);

  // Approval Form state
  const [assignImei, setAssignImei] = useState('');
  const [assignSim, setAssignSim] = useState('');
  const [assignImeiPhoto, setAssignImeiPhoto] = useState('');
  const [assignSimPhoto, setAssignSimPhoto] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  // Rejection Form state
  const [rejectionReason, setRejectionReason] = useState('');

  const showToast = (msg, type = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Combine all cities from constant + data
  const allCities = useMemo(() => {
    const set = new Set([
      ...RAJASTHAN_CITIES,
      ...requests.map((r) => r.city?.toUpperCase()),
      ...returnRequests.map((r) => r.city?.toUpperCase()),
      ...devices.map((d) => d.city?.toUpperCase())
    ]);
    return Array.from(set).filter(Boolean).sort();
  }, [requests, returnRequests, devices]);

  // When Vehicle Number is entered in Return form, auto-fill IMEI, SIM & City if in devices list
  const handleReturnVehicleChange = (val) => {
    setRetVehicleNo(val.toUpperCase());
    const clean = val.toUpperCase().replace(/\s+/g, '');
    const matched = devices.find((d) => (d.vehicle || '').toUpperCase().replace(/\s+/g, '') === clean);
    if (matched) {
      if (matched.imei) setRetImei(matched.imei);
      if (matched.sim) setRetSim(matched.sim);
      if (matched.city) setRetCity(matched.city.toUpperCase());
    }
  };

  // KPI Calculations
  const kpis = useMemo(() => {
    const pendingReqs = requests.filter((r) => !r.isArchived && (r.status === 'pending' || !r.status)).length;
    const pendingRets = returnRequests.filter((r) => !r.isArchived && (r.status === 'pending' || !r.status)).length;
    const doneReqs = requests.filter((r) => r.status === 'done').length;
    const doneRets = returnRequests.filter((r) => r.status === 'done').length;
    const rejectedReqs = requests.filter((r) => r.status === 'rejected').length;
    const rejectedRets = returnRequests.filter((r) => r.status === 'rejected').length;

    return {
      pendingRequirements: pendingReqs,
      pendingReturns: pendingRets,
      totalCompleted: doneReqs + doneRets,
      totalRejected: rejectedReqs + rejectedRets
    };
  }, [requests, returnRequests]);

  // Filtered Requirements
  const filteredRequirements = useMemo(() => {
    return requests.filter((r) => {
      if (activeTab === 'archived' && !r.isArchived) return false;
      if (activeTab !== 'archived' && r.isArchived) return false;

      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.vehicleNumber?.toLowerCase().includes(q) ||
        r.vehicleNo?.toLowerCase().includes(q) ||
        r.requester?.toLowerCase().includes(q) ||
        r.userName?.toLowerCase().includes(q) ||
        r.empId?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q) ||
        r.assignedImei?.toLowerCase().includes(q) ||
        r.city?.toLowerCase().includes(q);

      const matchCity = filterCity === 'All' || r.city?.toUpperCase() === filterCity.toUpperCase();
      const matchStatus =
        filterStatus === 'All' ||
        (filterStatus === 'pending' && (!r.status || r.status === 'pending')) ||
        r.status === filterStatus;

      return matchSearch && matchCity && matchStatus;
    });
  }, [requests, activeTab, search, filterCity, filterStatus]);

  // Filtered Returns
  const filteredReturns = useMemo(() => {
    return returnRequests.filter((r) => {
      if (activeTab === 'archived' && !r.isArchived) return false;
      if (activeTab !== 'archived' && r.isArchived) return false;

      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.vehicleNumber?.toLowerCase().includes(q) ||
        r.vehicleName?.toLowerCase().includes(q) ||
        r.imei?.toLowerCase().includes(q) ||
        r.sim?.toLowerCase().includes(q) ||
        r.simNumber?.toLowerCase().includes(q) ||
        r.requester?.toLowerCase().includes(q) ||
        r.userName?.toLowerCase().includes(q) ||
        r.returnReason?.toLowerCase().includes(q) ||
        r.city?.toLowerCase().includes(q);

      const matchCity = filterCity === 'All' || r.city?.toUpperCase() === filterCity.toUpperCase();
      const matchStatus =
        filterStatus === 'All' ||
        (filterStatus === 'pending' && (!r.status || r.status === 'pending')) ||
        r.status === filterStatus;

      return matchSearch && matchCity && matchStatus;
    });
  }, [returnRequests, activeTab, search, filterCity, filterStatus]);

  // Multi-selection handlers
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (items) => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id || i.sr)));
    }
  };

  // Requirement Submission
  const handleRequirementSubmit = async (e) => {
    e.preventDefault();
    if (!reqVehicleNo.trim()) {
      alert('Vehicle Number is required.');
      return;
    }
    if (!reqVerified || !reqDeclared) {
      alert('Please check both the verification and declaration checkboxes.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        city: reqCity.toUpperCase(),
        vehicleNumber: reqVehicleNo.trim().toUpperCase(),
        vehicleType: reqVehicleType,
        requirementType: reqType,
        reason: reqReason.trim(),
        isTampered: reqIsTampered,
        isPenaltyImposed: reqIsPenalty,
        penaltyMarkedAt: reqIsPenalty === 'Yes' ? reqPenaltyAt : 'N/A',
        penaltyDetails: reqIsPenalty === 'Yes' ? reqPenaltyDetails.trim() : '',
        remarks: reqRemarks.trim(),
        totalVtsRequests: reqTotalVts,
        empId: reqEmpId.trim(),
        mobile: reqMobile.trim()
      };

      const res = await submitRequirementRequest(payload);
      if (res.success) {
        showToast(res.message || 'Requirement saved directly in Firebase Firestore!');
        setShowReqModal(false);
        setReqVehicleNo('');
        setReqReason('');
        setReqRemarks('');
        setReqPenaltyDetails('');
        setReqVerified(false);
        setReqDeclared(false);
        if (onRefresh) onRefresh();
      } else {
        alert('Failed: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Return Submission
  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    const cleanImei = retImei.trim();
    const cleanSim = retSim.trim();

    if (!retVehicleNo.trim()) {
      alert('Vehicle Number is required.');
      return;
    }
    if (cleanImei && cleanImei.length !== 15) {
      alert(`IMEI must be exactly 15 digits (Current: ${cleanImei.length} digits).`);
      return;
    }
    if (cleanSim && (cleanSim.length < 19 || cleanSim.length > 20)) {
      alert(`SIM Number must be 19 or 20 digits (Current: ${cleanSim.length} digits).`);
      return;
    }
    if (!retVerified) {
      alert('Please confirm the verification checkbox.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        vehicleNumber: retVehicleNo.trim().toUpperCase(),
        vehicleType: retVehicleType,
        imei: cleanImei,
        simNumber: cleanSim,
        city: retCity.toUpperCase(),
        returnReason: retReason,
        condition: retCondition,
        includingWire: retIncludingWire,
        needsReplacement: retNeedsReplacement,
        vtsPhoto: retVtsPhoto.trim(),
        simPhoto: retSimPhoto.trim(),
        empId: retEmpId.trim(),
        mobile: retMobile.trim(),
        remarks: (retCourier ? `Courier: ${retCourier}. ` : '') + retRemarks.trim()
      };

      const res = await submitReturnRequest(payload);
      if (res.success) {
        showToast(res.message || 'VTS Return saved directly in Firebase Firestore!');
        setShowReturnModal(false);
        setRetVehicleNo('');
        setRetImei('');
        setRetSim('');
        setRetCourier('');
        setRetRemarks('');
        setRetVtsPhoto('');
        setRetSimPhoto('');
        setRetVerified(false);
        if (onRefresh) onRefresh();
      } else {
        alert('Failed: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Admin Single Approve
  const handleConfirmApproval = async () => {
    if (!showApprovalModal) return;
    const { docId, type } = showApprovalModal;

    if (type === 'requirement') {
      const cleanImei = assignImei.trim();
      if (!cleanImei || cleanImei.length !== 15) {
        alert('Assigned IMEI must be exactly 15 digits.');
        return;
      }
      setIsSubmitting(true);
      try {
        await approveFirestoreRequirement(
          docId,
          {
            assignedImei: cleanImei,
            assignedSim: assignSim.trim(),
            assignedImeiPhoto: assignImeiPhoto.trim(),
            assignedSimPhoto: assignSimPhoto.trim(),
            adminNotes: adminNotes.trim()
          },
          currentUser
        );
        showToast(`Requirement for ${showApprovalModal.item.vehicleNumber} approved with assigned IMEI!`);
        setShowApprovalModal(null);
        setAssignImei('');
        setAssignSim('');
        setAdminNotes('');
        if (onRefresh) onRefresh();
      } catch (err) {
        alert('Error approving requirement: ' + err.message);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Return Approval
      setIsSubmitting(true);
      try {
        await approveFirestoreReturn(docId, currentUser);
        showToast(`Return receipt confirmed for ${showApprovalModal.item.vehicleNumber}!`);
        setShowApprovalModal(null);
        if (onRefresh) onRefresh();
      } catch (err) {
        alert('Error approving return: ' + err.message);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Admin Single Reject
  const handleConfirmRejection = async () => {
    if (!showRejectModal) return;
    const { docId, collection } = showRejectModal;
    if (!rejectionReason.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (collection === 'requirements') {
        await rejectFirestoreRequirement(docId, rejectionReason.trim(), currentUser);
      } else {
        await rejectFirestoreReturn(docId, rejectionReason.trim(), currentUser);
      }
      showToast('Record marked as rejected.');
      setShowRejectModal(null);
      setRejectionReason('');
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Error rejecting: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Bulk Actions
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to bulk approve ${selectedIds.size} selected items?`)) return;

    setIsSubmitting(true);
    try {
      const ids = Array.from(selectedIds);
      if (activeTab === 'requirements') {
        const batchItems = ids.map((id) => ({ id }));
        await bulkApproveFirestoreRequirements(batchItems, currentUser);
      } else {
        await bulkApproveFirestoreReturns(ids, currentUser);
      }
      showToast(`Successfully bulk approved ${ids.length} records!`);
      setSelectedIds(new Set());
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Bulk approve failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    const reason = prompt(`Enter rejection reason for ${selectedIds.size} records:`, 'Administrative decision');
    if (!reason) return;

    setIsSubmitting(true);
    try {
      const ids = Array.from(selectedIds);
      const col = activeTab === 'requirements' ? 'requirements' : 'returns';
      await bulkRejectFirestoreRecords(col, ids, reason, currentUser);
      showToast(`Bulk rejected ${ids.length} records.`);
      setSelectedIds(new Set());
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Bulk reject failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Archive & Delete
  const handleArchive = async (item, col) => {
    if (!item.id) return;
    try {
      await archiveFirestoreRecord(col, item.id, !item.isArchived);
      showToast(item.isArchived ? 'Record restored from archive' : 'Record moved to archive');
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Archive error: ' + err.message);
    }
  };

  const handleDelete = async (item, col) => {
    if (!item.id) return;
    if (!confirm(`Are you sure you want to remove ${item.vehicleNumber || 'this record'}?`)) return;
    try {
      await deleteFirestoreRecord(col, item.id);
      showToast('Record removed successfully.');
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Delete error: ' + err.message);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const isReq = activeTab === 'requirements' || activeTab === 'archived';
    const items = isReq ? filteredRequirements : filteredReturns;
    if (items.length === 0) {
      alert('No records to export.');
      return;
    }

    let csvContent = '';
    if (isReq) {
      const headers = ['Vehicle No', 'City', 'Vehicle Type', 'Requirement Type', 'Reason', 'Tampered', 'Penalty', 'Requester', 'Status', 'Assigned IMEI', 'Assigned SIM', 'Timestamp'];
      const rows = items.map((r) => [
        `"${r.vehicleNumber || ''}"`,
        `"${r.city || ''}"`,
        `"${r.vehicleType || ''}"`,
        `"${r.requirementType || ''}"`,
        `"${(r.reason || '').replace(/"/g, '""')}"`,
        `"${r.isTampered || 'No'}"`,
        `"${r.isPenaltyImposed || 'No'}"`,
        `"${r.requester || ''}"`,
        `"${r.status || 'pending'}"`,
        `"${r.assignedImei || ''}"`,
        `"${r.assignedSim || ''}"`,
        `"${r.timestamp || ''}"`
      ]);
      csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    } else {
      const headers = ['Vehicle No', 'City', 'IMEI', 'SIM', 'Vehicle Type', 'Return Reason', 'Wire Included', 'Replacement Needed', 'Status', 'Timestamp'];
      const rows = items.map((r) => [
        `"${r.vehicleNumber || ''}"`,
        `"${r.city || ''}"`,
        `"${r.imei || ''}"`,
        `"${r.sim || r.simNumber || ''}"`,
        `"${r.vehicleType || ''}"`,
        `"${(r.returnReason || '').replace(/"/g, '""')}"`,
        `"${r.includingWire ? 'Yes' : 'No'}"`,
        `"${r.needsReplacement ? 'Yes' : 'No'}"`,
        `"${r.status || 'pending'}"`,
        `"${r.timestamp || ''}"`
      ]);
      csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `VTS_${activeTab}_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Bulk Template Download
  const handleDownloadTemplate = (mode) => {
    let content = '';
    let filename = '';
    if (mode === 'requirements') {
      content = 'Vehicle Number,City,Vehicle Type,Requirement Type,Reason,Is Tampered,Is Penalty Imposed,Remarks\n' +
                'RJ14 GP 5469,JAIPUR,Tipper,New VTS,Device missing after body maintenance,No,No,Driver verified\n' +
                'RJ14 GA 1020,SIKAR,Tractor,SIM,SIM card faulty,No,No,Site request';
      filename = 'vts_requirements_template.csv';
    } else {
      content = 'Vehicle Number,City,Vehicle Type,IMEI,SIM Number,Return Reason,Including Wire,Needs Replacement,Remarks\n' +
                'RJ14 GP 5469,JAIPUR,Tipper,867440066114794,57542044556761234567,Faulty Device,Yes,Yes,Returning via DTDC\n' +
                'RJ14 GA 1020,SIKAR,Tractor,867440066114890,57542044556761234568,Vehicle Removed from Site,Yes,No,Handover by driver';
      filename = 'vts_returns_template.csv';
    }

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Bulk CSV Parse
  const handleParseCsv = () => {
    if (!bulkCsvText.trim()) return;
    const lines = bulkCsvText.trim().split('\n').filter(Boolean);
    if (lines.length < 2) {
      alert('CSV must contain a header row and at least 1 data row.');
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const parsed = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      if (vals.length < 2) continue;
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = vals[idx] || '';
      });

      if (bulkMode === 'requirements') {
        parsed.push({
          vehicleNumber: row['vehicle number'] || row['vehicleno'] || row['vehicle'] || '',
          city: row['city'] || 'JAIPUR',
          vehicleType: row['vehicle type'] || 'Tipper',
          requirementType: row['requirement type'] || 'New VTS',
          reason: row['reason'] || 'Bulk upload requirement',
          isTampered: (row['is tampered'] || 'No').toLowerCase() === 'yes' ? 'Yes' : 'No',
          isPenaltyImposed: (row['is penalty imposed'] || 'No').toLowerCase() === 'yes' ? 'Yes' : 'No',
          remarks: row['remarks'] || ''
        });
      } else {
        parsed.push({
          vehicleNumber: row['vehicle number'] || row['vehiclename'] || row['vehicle'] || '',
          city: row['city'] || 'JAIPUR',
          vehicleType: row['vehicle type'] || 'Tipper',
          imei: row['imei'] || '',
          simNumber: row['sim number'] || row['sim'] || '',
          returnReason: row['return reason'] || 'Faulty Device',
          includingWire: (row['including wire'] || 'yes').toLowerCase() === 'yes',
          needsReplacement: (row['needs replacement'] || 'yes').toLowerCase() === 'yes',
          remarks: row['remarks'] || ''
        });
      }
    }

    setParsedBulkItems(parsed);
  };

  const handleBulkImportSubmit = async () => {
    if (parsedBulkItems.length === 0) return;
    setIsSubmitting(true);
    try {
      if (bulkMode === 'requirements') {
        const res = await bulkAddFirestoreRequirements(parsedBulkItems, currentUser);
        showToast(res.message);
      } else {
        const res = await bulkAddFirestoreReturns(parsedBulkItems, currentUser);
        showToast(res.message);
      }
      setShowBulkModal(false);
      setBulkCsvText('');
      setParsedBulkItems([]);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="requests-view-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`toast-notification ${toastMessage.type}`}>
          <Icon name={toastMessage.type === 'success' ? 'check' : 'alert'} size={16} />
          <span>{toastMessage.msg}</span>
        </div>
      )}

      {/* Top Banner & Header */}
      <div className="page-header-row">
        <div>
          <div className="portal-badge-row">
            <span className="live-firebase-pill">
              <span className="live-dot pulse"></span>
              Firebase Firestore Live: <code>device-streaming-e98b4845</code>
            </span>
          </div>
          <h2 style={{ margin: '4px 0 2px 0' }}>VTS Requirements &amp; Returns Management</h2>
          <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>
            Submit, approve, assign hardware, and track vehicle tracking system field requirements and returns.
          </p>
        </div>

        <div className="header-actions-group">
          <button className="secondary-button" onClick={() => { setBulkMode(activeTab === 'returns' ? 'returns' : 'requirements'); setShowBulkModal(true); }}>
            <Icon name="upload" size={15} /> Bulk CSV Import
          </button>
          <button className="secondary-button" onClick={handleExportCSV}>
            <Icon name="chart" size={15} /> Export CSV
          </button>
          <button className="secondary-button" onClick={() => setShowReturnModal(true)}>
            <Icon name="upload" size={15} /> Return VTS Form
          </button>
          <button className="primary-button" onClick={() => setShowReqModal(true)}>
            <Icon name="plus" size={15} /> New VTS Request
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', margin: '18px 0' }}>
        <div className="kpi-card-vts pending-card" onClick={() => { setActiveTab('requirements'); setFilterStatus('pending'); }}>
          <div className="kpi-header">
            <span className="kpi-title">Pending Requirements</span>
            <span className="kpi-icon-wrap amber"><Icon name="inbox" size={16} /></span>
          </div>
          <div className="kpi-num amber">{kpis.pendingRequirements}</div>
          <div className="kpi-hint">Awaiting IMEI &amp; SIM assignment</div>
        </div>

        <div className="kpi-card-vts returns-card" onClick={() => { setActiveTab('returns'); setFilterStatus('pending'); }}>
          <div className="kpi-header">
            <span className="kpi-title">Pending VTS Returns</span>
            <span className="kpi-icon-wrap blue"><Icon name="device" size={16} /></span>
          </div>
          <div className="kpi-num blue">{kpis.pendingReturns}</div>
          <div className="kpi-hint">Removed or faulty units to receive</div>
        </div>

        <div className="kpi-card-vts done-card" onClick={() => setFilterStatus('done')}>
          <div className="kpi-header">
            <span className="kpi-title">Completed &amp; Dispatched</span>
            <span className="kpi-icon-wrap green"><Icon name="check" size={16} /></span>
          </div>
          <div className="kpi-num green">{kpis.totalCompleted}</div>
          <div className="kpi-hint">Approved &amp; assigned hardware</div>
        </div>

        <div className="kpi-card-vts rejected-card" onClick={() => setFilterStatus('rejected')}>
          <div className="kpi-header">
            <span className="kpi-title">Rejected Requests</span>
            <span className="kpi-icon-wrap red"><Icon name="close" size={16} /></span>
          </div>
          <div className="kpi-num red">{kpis.totalRejected}</div>
          <div className="kpi-hint">Declined / Duplicate tickets</div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="sub-tab-toolbar">
        <div className="tab-buttons-group">
          <button
            className={`sub-tab-btn ${activeTab === 'requirements' ? 'active' : ''}`}
            onClick={() => { setActiveTab('requirements'); setSelectedIds(new Set()); }}
          >
            📋 VTS &amp; SIM Requirements
            <span className="tab-badge">{requests.filter((r) => !r.isArchived).length}</span>
            {kpis.pendingRequirements > 0 && (
              <span className="tab-pending-badge">{kpis.pendingRequirements} Pending</span>
            )}
          </button>

          <button
            className={`sub-tab-btn ${activeTab === 'returns' ? 'active' : ''}`}
            onClick={() => { setActiveTab('returns'); setSelectedIds(new Set()); }}
          >
            📦 VTS Returns &amp; Dispatches
            <span className="tab-badge">{returnRequests.filter((r) => !r.isArchived).length}</span>
            {kpis.pendingReturns > 0 && (
              <span className="tab-pending-badge">{kpis.pendingReturns} Pending</span>
            )}
          </button>

          <button
            className={`sub-tab-btn ${activeTab === 'archived' ? 'active' : ''}`}
            onClick={() => { setActiveTab('archived'); setSelectedIds(new Set()); }}
          >
            🗃️ Archived Records
            <span className="tab-badge">
              {requests.filter((r) => r.isArchived).length + returnRequests.filter((r) => r.isArchived).length}
            </span>
          </button>
        </div>

        {onRefresh && (
          <button className="icon-button refresh-btn" onClick={onRefresh} title="Sync with Firestore">
            <Icon name="refresh" size={16} />
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="filter-toolbar" style={{ margin: '14px 0' }}>
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            type="text"
            placeholder={
              activeTab === 'requirements'
                ? 'Search by vehicle number, requester, reason, assigned IMEI...'
                : 'Search by vehicle, IMEI, SIM, return reason, city...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear-search" onClick={() => setSearch('')}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        <div className="filter-selects">
          <div className="select-wrap">
            <label>City:</label>
            <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)}>
              <option value="All">All Cities ({allCities.length})</option>
              {allCities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="select-wrap">
            <label>Status:</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="pending">⏳ Pending</option>
              <option value="done">✅ Approved / Done</option>
              <option value="rejected">❌ Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Actions Floating Bar (when items selected) */}
      {selectedIds.size > 0 && (
        <div className="bulk-actions-banner">
          <div className="bulk-count">
            <Icon name="check" size={16} />
            <strong>{selectedIds.size}</strong> records selected
          </div>
          <div className="bulk-btns">
            {isAdmin && (
              <>
                <button className="primary-button small-btn" onClick={handleBulkApprove} disabled={isSubmitting}>
                  <Icon name="check" size={14} /> Bulk Approve
                </button>
                <button className="danger-button small-btn" onClick={handleBulkReject} disabled={isSubmitting}>
                  <Icon name="close" size={14} /> Bulk Reject
                </button>
              </>
            )}
            <button className="secondary-button small-btn" onClick={() => setSelectedIds(new Set())}>
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Content Table Panel */}
      <div className="panel table-panel">
        {activeTab === 'requirements' || (activeTab === 'archived' && filteredRequirements.length > 0) ? (
          <div className="table-wrap">
            <table className="vts-enhanced-table">
              <thead>
                <tr>
                  <th style={{ width: '38px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={filteredRequirements.length > 0 && selectedIds.size === filteredRequirements.length}
                      onChange={() => handleSelectAll(filteredRequirements)}
                    />
                  </th>
                  <th>STATUS</th>
                  <th>TIMESTAMP</th>
                  <th>VEHICLE NO</th>
                  <th>CITY</th>
                  <th>REQ TYPE</th>
                  <th>REQUESTED BY</th>
                  <th>TAMPERED / PENALTY</th>
                  <th>ASSIGNED DEVICE</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequirements.map((req, idx) => {
                  const id = req.id || req.sr || idx;
                  const isExpanded = expandedId === id;
                  const isSelected = selectedIds.has(id);
                  const isPending = !req.status || req.status === 'pending';
                  const isDone = req.status === 'done';
                  const isRejected = req.status === 'rejected';

                  return (
                    <React.Fragment key={id}>
                      <tr className={`req-row ${isSelected ? 'row-selected' : ''} ${isPending ? 'row-pending' : ''}`}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(id)}
                          />
                        </td>
                        <td>
                          {isPending && <span className="status-pill status-amber pulse">⏳ Pending</span>}
                          {isDone && <span className="status-pill status-green">✅ Approved</span>}
                          {isRejected && <span className="status-pill status-red">❌ Rejected</span>}
                        </td>
                        <td>
                          <small className="text-muted">{req.timestamp}</small>
                        </td>
                        <td>
                          <div className="vehicle-cell">
                            <b className="mono font-bold">{req.vehicleNumber || req.vehicleNo}</b>
                            <span className="sub-tag">{req.vehicleType || 'Tipper'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="city-tag">{req.city}</span>
                        </td>
                        <td>
                          <span className={`pill-type ${(req.requirementType || '').toLowerCase().includes('sim') ? 'sim' : 'vts'}`}>
                            {req.requirementType || 'New VTS'}
                          </span>
                        </td>
                        <td>
                          <div className="requester-cell">
                            <strong>{req.userName || (req.requester || '').split('@')[0]}</strong>
                            {req.empId && <small className="text-muted">EMP: {req.empId}</small>}
                            {req.mobile && <small className="text-muted">📱 {req.mobile}</small>}
                          </div>
                        </td>
                        <td>
                          <div className="badges-stack">
                            {req.isTampered === 'Yes' ? (
                              <span className="badge-warning-chip" title="Physical Tampering Reported">⚠️ Tampered</span>
                            ) : (
                              <span className="text-muted" style={{ fontSize: '11px' }}>No Tampering</span>
                            )}
                            {req.isPenaltyImposed === 'Yes' && (
                              <span className="badge-danger-chip" title={`Penalty at: ${req.penaltyMarkedAt || 'Site'}`}>₹ Penalty Imposed</span>
                            )}
                          </div>
                        </td>
                        <td>
                          {req.assignedImei ? (
                            <div className="assigned-device-box">
                              <span className="mono bold-imei">IMEI: {req.assignedImei}</span>
                              {req.assignedSim && <span className="mono text-muted">SIM: {req.assignedSim}</span>}
                            </div>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="table-actions-cluster">
                            {isAdmin && isPending && (
                              <>
                                <button
                                  className="action-btn-pill approve"
                                  onClick={() => setShowApprovalModal({ docId: req.id, item: req, type: 'requirement' })}
                                  title="Approve & Assign Hardware"
                                >
                                  <Icon name="check" size={13} /> Approve
                                </button>
                                <button
                                  className="action-btn-pill reject"
                                  onClick={() => setShowRejectModal({ docId: req.id, item: req, collection: 'requirements' })}
                                  title="Reject Requirement"
                                >
                                  <Icon name="close" size={13} /> Reject
                                </button>
                              </>
                            )}

                            <button
                              className="action-btn-pill icon-only"
                              onClick={() => setExpandedId(isExpanded ? null : id)}
                              title={isExpanded ? 'Hide Details' : 'Show Full Details'}
                            >
                              <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={14} />
                            </button>

                            {isAdmin && (
                              <>
                                <button
                                  className="action-btn-pill icon-only"
                                  onClick={() => handleArchive(req, 'requirements')}
                                  title={req.isArchived ? 'Restore' : 'Archive'}
                                >
                                  <Icon name="inbox" size={13} />
                                </button>
                                <button
                                  className="action-btn-pill icon-only text-danger"
                                  onClick={() => handleDelete(req, 'requirements')}
                                  title="Delete"
                                >
                                  <Icon name="trash" size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Details Accordion */}
                      {isExpanded && (
                        <tr className="expanded-row">
                          <td colSpan="10">
                            <div className="expanded-card">
                              <div className="card-section">
                                <h4>Reason / Field Requirement Notes</h4>
                                <p className="reason-text">{req.reason || 'No detailed reason provided.'}</p>
                                {req.remarks && (
                                  <p className="remarks-text"><strong>Remarks:</strong> {req.remarks}</p>
                                )}
                              </div>

                              <div className="card-grid-3">
                                <div>
                                  <h5>Verification &amp; Declarations</h5>
                                  <ul className="details-list">
                                    <li>Site Verification: <b>{req.verificationConfirmed || 'Yes'}</b></li>
                                    <li>Duplicate Declaration: <b>{req.declarationConfirmed || 'Confirmed'}</b></li>
                                    <li>User IP / Client: <code>{req.userIp || 'Web Client'}</code></li>
                                  </ul>
                                </div>

                                <div>
                                  <h5>Tampering &amp; Penalty Record</h5>
                                  <ul className="details-list">
                                    <li>Tampered: <b>{req.isTampered || 'No'}</b></li>
                                    <li>Penalty Imposed: <b>{req.isPenaltyImposed || 'No'}</b></li>
                                    {req.isPenaltyImposed === 'Yes' && (
                                      <>
                                        <li>Penalty Marked In: <b>{req.penaltyMarkedAt || 'App'}</b></li>
                                        <li>Details: <b>{req.penaltyDetails || '—'}</b></li>
                                      </>
                                    )}
                                  </ul>
                                </div>

                                <div>
                                  <h5>Approval &amp; Dispatch Status</h5>
                                  <ul className="details-list">
                                    <li>Processed By: <b>{req.processedBy || '—'}</b></li>
                                    <li>Assigned IMEI: <code>{req.assignedImei || 'Not assigned yet'}</code></li>
                                    <li>Assigned SIM: <code>{req.assignedSim || 'Not assigned'}</code></li>
                                    {req.adminNotes && <li>Admin Notes: <i>{req.adminNotes}</i></li>}
                                    {req.rejectionReason && <li className="text-danger">Rejection Reason: <b>{req.rejectionReason}</b></li>}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {filteredRequirements.length === 0 && (
                  <tr>
                    <td colSpan="10" className="empty-state">
                      <Icon name="inbox" size={32} />
                      <p>No requirements match your current search and filters.</p>
                      <button className="primary-button small-btn" onClick={() => setShowReqModal(true)}>
                        <Icon name="plus" size={14} /> Submit New Requirement
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="vts-enhanced-table">
              <thead>
                <tr>
                  <th style={{ width: '38px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={filteredReturns.length > 0 && selectedIds.size === filteredReturns.length}
                      onChange={() => handleSelectAll(filteredReturns)}
                    />
                  </th>
                  <th>STATUS</th>
                  <th>TIMESTAMP</th>
                  <th>VEHICLE NO</th>
                  <th>CITY</th>
                  <th>IMEI (REMOVED)</th>
                  <th>SIM NUMBER</th>
                  <th>RETURN REASON</th>
                  <th>WIRE / REPLACEMENT</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredReturns.map((ret, idx) => {
                  const id = ret.id || ret.sr || idx;
                  const isExpanded = expandedId === id;
                  const isSelected = selectedIds.has(id);
                  const isPending = !ret.status || ret.status === 'pending';
                  const isDone = ret.status === 'done';
                  const isRejected = ret.status === 'rejected';

                  return (
                    <React.Fragment key={id}>
                      <tr className={`req-row ${isSelected ? 'row-selected' : ''} ${isPending ? 'row-pending' : ''}`}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(id)}
                          />
                        </td>
                        <td>
                          {isPending && <span className="status-pill status-amber pulse">⏳ Pending</span>}
                          {isDone && <span className="status-pill status-green">✅ Received</span>}
                          {isRejected && <span className="status-pill status-red">❌ Rejected</span>}
                        </td>
                        <td>
                          <small className="text-muted">{ret.timestamp}</small>
                        </td>
                        <td>
                          <div className="vehicle-cell">
                            <b className="mono font-bold">{ret.vehicleNumber || ret.vehicleName}</b>
                            <span className="sub-tag">{ret.vehicleType || 'Tipper'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="city-tag">{ret.city}</span>
                        </td>
                        <td className="mono">{ret.imei || '—'}</td>
                        <td className="mono">{ret.simNumber || ret.sim || '—'}</td>
                        <td>
                          <strong>{ret.returnReason}</strong>
                          {ret.condition && <div className="text-muted" style={{ fontSize: '11px' }}>Condition: {ret.condition}</div>}
                        </td>
                        <td>
                          <div className="badges-stack">
                            <span className={`chip-mini ${ret.includingWire ? 'green' : 'gray'}`}>
                              {ret.includingWire ? '🔌 Wire Included' : '❌ No Wire'}
                            </span>
                            {ret.needsReplacement && (
                              <span className="chip-mini blue">🔄 Replacement Req</span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="table-actions-cluster">
                            {isAdmin && isPending && (
                              <>
                                <button
                                  className="action-btn-pill approve"
                                  onClick={() => setShowApprovalModal({ docId: ret.id, item: ret, type: 'return' })}
                                  title="Acknowledge & Confirm Return"
                                >
                                  <Icon name="check" size={13} /> Acknowledge
                                </button>
                                <button
                                  className="action-btn-pill reject"
                                  onClick={() => setShowRejectModal({ docId: ret.id, item: ret, collection: 'returns' })}
                                  title="Reject Return"
                                >
                                  <Icon name="close" size={13} /> Reject
                                </button>
                              </>
                            )}

                            <button
                              className="action-btn-pill icon-only"
                              onClick={() => setExpandedId(isExpanded ? null : id)}
                              title={isExpanded ? 'Hide Details' : 'Show Full Details'}
                            >
                              <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={14} />
                            </button>

                            {isAdmin && (
                              <>
                                <button
                                  className="action-btn-pill icon-only"
                                  onClick={() => handleArchive(ret, 'returns')}
                                  title={ret.isArchived ? 'Restore' : 'Archive'}
                                >
                                  <Icon name="inbox" size={13} />
                                </button>
                                <button
                                  className="action-btn-pill icon-only text-danger"
                                  onClick={() => handleDelete(ret, 'returns')}
                                  title="Delete"
                                >
                                  <Icon name="trash" size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Return Details */}
                      {isExpanded && (
                        <tr className="expanded-row">
                          <td colSpan="10">
                            <div className="expanded-card">
                              <div className="card-grid-3">
                                <div>
                                  <h5>Return &amp; Courier Details</h5>
                                  <ul className="details-list">
                                    <li>Vehicle: <b>{ret.vehicleNumber || ret.vehicleName}</b> ({ret.vehicleType || 'Tipper'})</li>
                                    <li>City: <b>{ret.city}</b></li>
                                    <li>Removed IMEI: <code>{ret.imei || '—'}</code></li>
                                    <li>Removed SIM: <code>{ret.simNumber || ret.sim || '—'}</code></li>
                                    <li>Remarks / Courier: <b>{ret.remarks || ret.courierInfo || 'Handover'}</b></li>
                                  </ul>
                                </div>

                                <div>
                                  <h5>Hardware Condition &amp; Replacement</h5>
                                  <ul className="details-list">
                                    <li>Condition: <b>{ret.condition || 'Good / Reusable'}</b></li>
                                    <li>Wire Harness Included: <b>{ret.includingWire ? 'Yes' : 'No'}</b></li>
                                    <li>Replacement Auto-Generated: <b>{ret.needsReplacement ? 'Yes (In Requirements Tab)' : 'No'}</b></li>
                                    <li>Submitted By: <b>{ret.userName || ret.requester}</b></li>
                                  </ul>
                                </div>

                                <div>
                                  <h5>Photos &amp; Proof of Return</h5>
                                  <div className="photo-links-group">
                                    {ret.vtsPhoto ? (
                                      <a href={ret.vtsPhoto} target="_blank" rel="noopener noreferrer" className="photo-preview-link">
                                        📷 View VTS Photo
                                      </a>
                                    ) : (
                                      <span className="text-muted">No VTS Photo attached</span>
                                    )}
                                    {ret.simPhoto ? (
                                      <a href={ret.simPhoto} target="_blank" rel="noopener noreferrer" className="photo-preview-link">
                                        📷 View SIM Photo
                                      </a>
                                    ) : (
                                      <span className="text-muted">No SIM Photo attached</span>
                                    )}
                                  </div>
                                  {ret.rejectionReason && (
                                    <p className="text-danger" style={{ marginTop: '8px' }}>
                                      <strong>Rejection Reason:</strong> {ret.rejectionReason}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {filteredReturns.length === 0 && (
                  <tr>
                    <td colSpan="10" className="empty-state">
                      <Icon name="upload" size={32} />
                      <p>No VTS return records found matching criteria.</p>
                      <button className="secondary-button small-btn" onClick={() => setShowReturnModal(true)}>
                        <Icon name="upload" size={14} /> Submit Return Form
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: New VTS / SIM Requirement */}
      {showReqModal && (
        <div className="modal-backdrop" onClick={() => setShowReqModal(false)}>
          <div className="modal-container large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">NEW FIELD REQUIREMENT &bull; FIRESTORE LIVE</div>
                <h2 className="modal-title">Submit VTS / SIM Requirement</h2>
                <p className="modal-subtitle">
                  Raised by: <b>{currentUser.name}</b> ({currentUser.email})
                </p>
              </div>
              <button className="icon-button" onClick={() => setShowReqModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <form onSubmit={handleRequirementSubmit} className="modal-body modal-form">
              <div className="form-row-2">
                <div className="form-group">
                  <label>City / Project Site *</label>
                  <select required value={reqCity} onChange={(e) => setReqCity(e.target.value)}>
                    {allCities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Vehicle Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. RJ14 GP 5469"
                    value={reqVehicleNo}
                    onChange={(e) => setReqVehicleNo(e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Vehicle Type</label>
                  <select value={reqVehicleType} onChange={(e) => setReqVehicleType(e.target.value)}>
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Requirement Type</label>
                  <select value={reqType} onChange={(e) => setReqType(e.target.value)}>
                    {REQUIREMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Reason / Specific Problem Description *</label>
                <textarea
                  required
                  rows="3"
                  placeholder="Explain why the VTS/SIM is required, device symptoms, or site requirements..."
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Is there any sign of manual tampering?</label>
                  <select value={reqIsTampered} onChange={(e) => setReqIsTampered(e.target.value)}>
                    <option value="No">No — Normal Issue / Missing</option>
                    <option value="Yes">Yes — Wire Cut / Deliberate Tampering</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Has penalty been imposed on the driver?</label>
                  <select value={reqIsPenalty} onChange={(e) => setReqIsPenalty(e.target.value)}>
                    <option value="No">No Penalty</option>
                    <option value="Yes">Yes — Penalty Imposed</option>
                  </select>
                </div>
              </div>

              {reqIsPenalty === 'Yes' && (
                <div className="form-row-2 penalty-highlight-box">
                  <div className="form-group">
                    <label>Penalty Marked In</label>
                    <select value={reqPenaltyAt} onChange={(e) => setReqPenaltyAt(e.target.value)}>
                      <option value="App">Driver / Site App</option>
                      <option value="Register">Site Physical Register</option>
                      <option value="Other">Other / HR Challan</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Penalty Details &amp; Challan Amount</label>
                    <input
                      type="text"
                      placeholder="e.g. Rs. 2000 Challan #8472"
                      value={reqPenaltyDetails}
                      onChange={(e) => setReqPenaltyDetails(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="form-row-2">
                <div className="form-group">
                  <label>Requester Employee ID</label>
                  <input
                    type="text"
                    placeholder="e.g. EMP-1048"
                    value={reqEmpId}
                    onChange={(e) => setReqEmpId(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Contact Mobile Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={reqMobile}
                    onChange={(e) => setReqMobile(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Additional Site Remarks</label>
                <input
                  type="text"
                  placeholder="Optional site notes..."
                  value={reqRemarks}
                  onChange={(e) => setReqRemarks(e.target.value)}
                />
              </div>

              {/* Verification & Declaration Checks (From Flutter App) */}
              <div className="declarations-container">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={reqVerified}
                    onChange={(e) => setReqVerified(e.target.checked)}
                  />
                  <span>I verify that this requirement has been checked physically on-site and is genuine.</span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={reqDeclared}
                    onChange={(e) => setReqDeclared(e.target.checked)}
                  />
                  <span>I declare that no duplicate requirement has been raised for this vehicle.</span>
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowReqModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={isSubmitting || !reqVerified || !reqDeclared}>
                  <Icon name="check" size={16} />
                  {isSubmitting ? 'Saving to Firebase...' : 'Submit to Firebase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Return VTS Form */}
      {showReturnModal && (
        <div className="modal-backdrop" onClick={() => setShowReturnModal(false)}>
          <div className="modal-container large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">DEVICE RETURN &bull; FIRESTORE LIVE</div>
                <h2 className="modal-title">Submit VTS Return Form</h2>
                <p className="modal-subtitle">
                  Log removed, damaged, or replaced VTS hardware returning to Head Office
                </p>
              </div>
              <button className="icon-button" onClick={() => setShowReturnModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="modal-body modal-form">
              <div className="form-row-2">
                <div className="form-group">
                  <label>Vehicle Number * (Auto-suggest from devices)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. RJ14 GP 1010"
                    value={retVehicleNo}
                    onChange={(e) => handleReturnVehicleChange(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>City / Project Site *</label>
                  <select required value={retCity} onChange={(e) => setRetCity(e.target.value)}>
                    {allCities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>
                    Removed IMEI (15 Digits)
                    <span className="char-count">{retImei.length}/15</span>
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="e.g. 867440066114794"
                    value={retImei}
                    onChange={(e) => setRetImei(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                <div className="form-group">
                  <label>
                    Removed SIM Number (19-20 Digits)
                    <span className="char-count">{retSim.length}/20</span>
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    placeholder="e.g. 57542044556761234567"
                    value={retSim}
                    onChange={(e) => setRetSim(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Vehicle Type</label>
                  <select value={retVehicleType} onChange={(e) => setRetVehicleType(e.target.value)}>
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Return Reason *</label>
                  <select value={retReason} onChange={(e) => setRetReason(e.target.value)}>
                    {RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Hardware Toggles (From Flutter App) */}
              <div className="toggles-box">
                <label className="toggle-switch-row">
                  <input
                    type="checkbox"
                    checked={retIncludingWire}
                    onChange={(e) => setRetIncludingWire(e.target.checked)}
                  />
                  <div>
                    <strong>Device returned including wire harness?</strong>
                    <div className="text-muted" style={{ fontSize: '11px' }}>Check if power &amp; ignition wiring cable is returned with device</div>
                  </div>
                </label>

                <label className="toggle-switch-row highlight-replacement">
                  <input
                    type="checkbox"
                    checked={retNeedsReplacement}
                    onChange={(e) => setRetNeedsReplacement(e.target.checked)}
                  />
                  <div>
                    <strong>Replacement Required?</strong>
                    <div className="text-muted" style={{ fontSize: '11px' }}>
                      ⚡ If checked, a replacement request will automatically be created in the Requirements tab!
                    </div>
                  </div>
                </label>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>VTS Device Photo Link (Google Drive / Web URL)</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={retVtsPhoto}
                    onChange={(e) => setRetVtsPhoto(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>SIM Card Photo Link</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={retSimPhoto}
                    onChange={(e) => setRetSimPhoto(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Courier / Handover Info</label>
                  <input
                    type="text"
                    placeholder="e.g. DTDC Docket #938472 or Handover to Driver"
                    value={retCourier}
                    onChange={(e) => setRetCourier(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Additional Notes / Remarks</label>
                  <input
                    type="text"
                    placeholder="Any site notes..."
                    value={retRemarks}
                    onChange={(e) => setRetRemarks(e.target.value)}
                  />
                </div>
              </div>

              <label className="checkbox-row" style={{ marginTop: '8px' }}>
                <input
                  type="checkbox"
                  checked={retVerified}
                  onChange={(e) => setRetVerified(e.target.checked)}
                />
                <span>I confirm that the returned device has been physically removed from the vehicle and is ready for dispatch.</span>
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowReturnModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={isSubmitting || !retVerified}>
                  <Icon name="check" size={16} />
                  {isSubmitting ? 'Submitting to Firebase...' : 'Submit Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Admin Approval Modal (Requirement / Return) */}
      {showApprovalModal && (
        <div className="modal-backdrop" onClick={() => setShowApprovalModal(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">ADMIN APPROVAL &bull; FIRESTORE LIVE</div>
                <h2 className="modal-title">
                  {showApprovalModal.type === 'requirement' ? 'Assign Hardware & Approve' : 'Acknowledge Received Device'}
                </h2>
                <p className="modal-subtitle">
                  Vehicle: <b>{showApprovalModal.item.vehicleNumber || showApprovalModal.item.vehicleName}</b> &bull; City: {showApprovalModal.item.city}
                </p>
              </div>
              <button className="icon-button" onClick={() => setShowApprovalModal(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="modal-body modal-form">
              {showApprovalModal.type === 'requirement' ? (
                <>
                  <div className="form-group">
                    <label>
                      Assigned IMEI (15 Digits) *
                      <span className="char-count">{assignImei.length}/15</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={15}
                      placeholder="e.g. 867440066114794"
                      value={assignImei}
                      onChange={(e) => setAssignImei(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      Assigned SIM Number (19-20 Digits)
                      <span className="char-count">{assignSim.length}/20</span>
                    </label>
                    <input
                      type="text"
                      maxLength={20}
                      placeholder="e.g. 57542044556761234567"
                      value={assignSim}
                      onChange={(e) => setAssignSim(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>

                  <div className="form-group">
                    <label>Admin Notes / Dispatch Instructions</label>
                    <textarea
                      rows="2"
                      placeholder="e.g. Dispatched via DTDC on 18 Sep. Package contains device & antenna."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div className="confirm-prompt">
                  <p>
                    Are you sure you want to mark this VTS return for <b>{showApprovalModal.item.vehicleNumber}</b> as received and processed in the office?
                  </p>
                  <ul className="details-list" style={{ marginTop: '10px' }}>
                    <li>IMEI: <code>{showApprovalModal.item.imei || '—'}</code></li>
                    <li>SIM: <code>{showApprovalModal.item.simNumber || showApprovalModal.item.sim || '—'}</code></li>
                    <li>Return Reason: <b>{showApprovalModal.item.returnReason}</b></li>
                  </ul>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowApprovalModal(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleConfirmApproval}
                  disabled={isSubmitting || (showApprovalModal.type === 'requirement' && assignImei.length !== 15)}
                >
                  <Icon name="check" size={16} />
                  {isSubmitting ? 'Updating Firebase...' : 'Confirm & Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Rejection Reason Modal */}
      {showRejectModal && (
        <div className="modal-backdrop" onClick={() => setShowRejectModal(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow text-danger">REJECT RECORD</div>
                <h2 className="modal-title">Reject Request</h2>
                <p className="modal-subtitle">
                  Vehicle: <b>{showRejectModal.item.vehicleNumber || showRejectModal.item.vehicleName}</b>
                </p>
              </div>
              <button className="icon-button" onClick={() => setShowRejectModal(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="modal-body modal-form">
              <div className="form-group">
                <label>Reason for Rejection *</label>
                <textarea
                  required
                  rows="3"
                  placeholder="Specify why this requirement/return is being rejected (e.g. Duplicate ticket, Vehicle already active)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowRejectModal(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={handleConfirmRejection}
                  disabled={isSubmitting || !rejectionReason.trim()}
                >
                  <Icon name="close" size={16} />
                  {isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Bulk CSV Import Modal */}
      {showBulkModal && (
        <div className="modal-backdrop" onClick={() => setShowBulkModal(false)}>
          <div className="modal-container large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">BULK CSV IMPORT &bull; FIRESTORE LIVE</div>
                <h2 className="modal-title">Import Records in Bulk</h2>
                <p className="modal-subtitle">Direct batch upload to Firebase Firestore</p>
              </div>
              <button className="icon-button" onClick={() => setShowBulkModal(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="modal-body modal-form">
              <div className="tab-group" style={{ marginBottom: '12px' }}>
                <button
                  className={`tab-btn ${bulkMode === 'requirements' ? 'active' : ''}`}
                  onClick={() => { setBulkMode('requirements'); setParsedBulkItems([]); }}
                >
                  📋 Import Requirements
                </button>
                <button
                  className={`tab-btn ${bulkMode === 'returns' ? 'active' : ''}`}
                  onClick={() => { setBulkMode('returns'); setParsedBulkItems([]); }}
                >
                  📦 Import Returns
                </button>
              </div>

              <div className="template-download-row">
                <p className="text-muted" style={{ margin: 0, fontSize: '13px' }}>
                  Need the sample format? Download our pre-formatted CSV template:
                </p>
                <button
                  type="button"
                  className="secondary-button small-btn"
                  onClick={() => handleDownloadTemplate(bulkMode)}
                >
                  <Icon name="download" size={14} /> Download Sample Template
                </button>
              </div>

              <div className="form-group">
                <label>Paste CSV Data with Headers:</label>
                <textarea
                  rows="6"
                  placeholder={
                    bulkMode === 'requirements'
                      ? 'Vehicle Number,City,Vehicle Type,Requirement Type,Reason,Is Tampered,Is Penalty Imposed,Remarks\nRJ14 GP 5469,JAIPUR,Tipper,New VTS,Device missing,No,No,Driver verified'
                      : 'Vehicle Number,City,Vehicle Type,IMEI,SIM Number,Return Reason,Including Wire,Needs Replacement,Remarks\nRJ14 GP 5469,JAIPUR,Tipper,867440066114794,57542044556761234567,Faulty Device,Yes,Yes,Returning via DTDC'
                  }
                  value={bulkCsvText}
                  onChange={(e) => setBulkCsvText(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={handleParseCsv}
                disabled={!bulkCsvText.trim()}
              >
                🔍 Parse &amp; Preview ({bulkCsvText.split('\n').filter(Boolean).length > 1 ? bulkCsvText.split('\n').filter(Boolean).length - 1 : 0} Rows)
              </button>

              {/* Parsed Preview Table */}
              {parsedBulkItems.length > 0 && (
                <div className="parsed-preview-box">
                  <div className="preview-header">
                    <strong>Preview ({parsedBulkItems.length} records ready to import):</strong>
                  </div>
                  <div className="table-wrap" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <table style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>VEHICLE NO</th>
                          <th>CITY</th>
                          <th>TYPE</th>
                          <th>{bulkMode === 'requirements' ? 'REASON' : 'IMEI / REASON'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedBulkItems.map((item, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td className="mono font-bold">{item.vehicleNumber}</td>
                            <td>{item.city}</td>
                            <td>{bulkMode === 'requirements' ? item.requirementType : item.vehicleType}</td>
                            <td>{bulkMode === 'requirements' ? item.reason : `${item.imei || '—'} (${item.returnReason})`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowBulkModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleBulkImportSubmit}
                  disabled={isSubmitting || parsedBulkItems.length === 0}
                >
                  <Icon name="upload" size={16} />
                  {isSubmitting ? 'Importing...' : `Import ${parsedBulkItems.length} Records to Firebase`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Component Styles */}
      <style>{`
        .requests-view-container {
          padding: 0 4px;
        }
        .portal-badge-row {
          margin-bottom: 6px;
        }
        .live-firebase-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: #10b981;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 9999px;
        }
        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
        }
        .live-dot.pulse {
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          animation: pulseGreen 1.8s infinite;
        }
        @keyframes pulseGreen {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .kpi-card-vts {
          background: var(--bg-card, #1e293b);
          border: 1px solid var(--border-color, #334155);
          border-radius: 10px;
          padding: 14px 16px;
          cursor: pointer;
          transition: transform 0.15s, border-color 0.15s;
        }
        .kpi-card-vts:hover {
          transform: translateY(-2px);
          border-color: #3b82f6;
        }
        .kpi-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .kpi-title {
          font-size: 12px;
          color: var(--text-muted, #94a3b8);
          font-weight: 600;
          text-transform: uppercase;
        }
        .kpi-icon-wrap {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kpi-icon-wrap.amber { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
        .kpi-icon-wrap.blue { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
        .kpi-icon-wrap.green { background: rgba(16, 185, 129, 0.15); color: #10b981; }
        .kpi-icon-wrap.red { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
        .kpi-num {
          font-size: 26px;
          font-weight: 800;
          margin: 4px 0 2px 0;
        }
        .kpi-num.amber { color: #f59e0b; }
        .kpi-num.blue { color: #3b82f6; }
        .kpi-num.green { color: #10b981; }
        .kpi-num.red { color: #ef4444; }
        .kpi-hint {
          font-size: 11px;
          color: var(--text-muted, #94a3b8);
        }
        .sub-tab-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color, #334155);
          padding-bottom: 8px;
        }
        .tab-buttons-group {
          display: flex;
          gap: 8px;
        }
        .sub-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 8px;
          color: var(--text-muted, #94a3b8);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .sub-tab-btn:hover {
          color: var(--text-primary, #f8fafc);
          background: rgba(255, 255, 255, 0.04);
        }
        .sub-tab-btn.active {
          color: #fff;
          background: #3b82f6;
        }
        .tab-badge {
          background: rgba(0, 0, 0, 0.25);
          padding: 2px 7px;
          border-radius: 12px;
          font-size: 11px;
        }
        .tab-pending-badge {
          background: #f59e0b;
          color: #000;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 10px;
          font-size: 10px;
          text-transform: uppercase;
        }
        .bulk-actions-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #1e3a8a;
          border: 1px solid #3b82f6;
          padding: 10px 18px;
          border-radius: 8px;
          margin-bottom: 14px;
          color: #fff;
        }
        .bulk-count {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        .bulk-btns {
          display: flex;
          gap: 8px;
        }
        .small-btn {
          padding: 5px 10px;
          font-size: 12px;
        }
        .danger-button {
          background: #ef4444;
          color: #fff;
          border: none;
          padding: 8px 14px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }
        .danger-button:hover { background: #dc2626; }
        .vts-enhanced-table {
          width: 100%;
          border-collapse: collapse;
        }
        .vts-enhanced-table th {
          background: rgba(15, 23, 42, 0.6);
          color: var(--text-muted, #94a3b8);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.05em;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-color, #334155);
        }
        .vts-enhanced-table td {
          padding: 11px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          vertical-align: middle;
          font-size: 13px;
        }
        .vts-enhanced-table tr.row-pending {
          background: rgba(245, 158, 11, 0.02);
        }
        .vts-enhanced-table tr.row-selected {
          background: rgba(59, 130, 246, 0.08);
        }
        .vehicle-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sub-tag {
          font-size: 10px;
          color: var(--text-muted, #94a3b8);
          text-transform: uppercase;
        }
        .requester-cell {
          display: flex;
          flex-direction: column;
          font-size: 12px;
          gap: 1px;
        }
        .badges-stack {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .badge-warning-chip {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.4);
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          display: inline-block;
          width: fit-content;
        }
        .badge-danger-chip {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.4);
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          display: inline-block;
          width: fit-content;
        }
        .chip-mini {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          display: inline-block;
          width: fit-content;
        }
        .chip-mini.green { background: rgba(16, 185, 129, 0.15); color: #10b981; }
        .chip-mini.gray { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
        .chip-mini.blue { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
        .assigned-device-box {
          display: flex;
          flex-direction: column;
          font-size: 11px;
        }
        .bold-imei { color: #10b981; font-weight: 700; }
        .table-actions-cluster {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 5px;
        }
        .action-btn-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          transition: background 0.15s;
        }
        .action-btn-pill:hover { background: rgba(255, 255, 255, 0.15); }
        .action-btn-pill.approve { background: rgba(16, 185, 129, 0.15); color: #10b981; }
        .action-btn-pill.approve:hover { background: #10b981; color: #fff; }
        .action-btn-pill.reject { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
        .action-btn-pill.reject:hover { background: #ef4444; color: #fff; }
        .action-btn-pill.icon-only { padding: 4px 6px; }
        .action-btn-pill.text-danger:hover { color: #ef4444; }
        .status-pill {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }
        .status-pill.status-amber { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); }
        .status-pill.status-green { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
        .status-pill.status-red { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
        .expanded-card {
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid var(--border-color, #334155);
          border-radius: 8px;
          padding: 14px 18px;
          margin: 6px 0;
        }
        .card-grid-3 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-top: 10px;
        }
        .details-list {
          list-style: none;
          padding: 0;
          margin: 6px 0 0 0;
          font-size: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .char-count {
          float: right;
          font-size: 11px;
          color: var(--text-muted, #94a3b8);
        }
        .toggles-box {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color, #334155);
          border-radius: 8px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 12px;
        }
        .toggle-switch-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
        }
        .toggle-switch-row.highlight-replacement {
          background: rgba(59, 130, 246, 0.08);
          border-radius: 6px;
          padding: 6px 8px;
        }
        .declarations-container {
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed var(--border-color, #334155);
          border-radius: 8px;
          padding: 12px 14px;
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .checkbox-row {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          font-size: 12px;
          cursor: pointer;
        }
        .penalty-highlight-box {
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 8px;
          padding: 10px;
          margin-bottom: 12px;
        }
        .photo-preview-link {
          display: inline-block;
          background: rgba(59, 130, 246, 0.15);
          color: #3b82f6;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          margin-right: 8px;
        }
        .photo-preview-link:hover { text-decoration: underline; }
        .template-download-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color, #334155);
          border-radius: 6px;
          padding: 8px 12px;
          margin-bottom: 12px;
        }
        .toast-notification {
          position: fixed;
          top: 20px;
          right: 24px;
          z-index: 9999;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
          animation: slideInRight 0.25s ease-out;
        }
        .toast-notification.success { background: #065f46; color: #a7f3d0; border: 1px solid #10b981; }
        .toast-notification.error { background: #7f1d1d; color: #fecaca; border: 1px solid #ef4444; }
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
