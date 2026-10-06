import * as XLSX from 'xlsx';
import Papa from 'papaparse';

/**
 * Format device records for clean 10-column export matching Google Sheet tab '900'
 */
export function formatDevicesForExport(devices = []) {
  return devices.map((d, idx) => ({
    'Sr.': d.sr || idx + 1,
    'Name': d.vehicle || '',
    'Uniqueid': d.uniqueid || d.imei || '',
    'Phone': d.sim || d.phone || '',
    'City': d.city || '',
    'Status on Roadcast': d.newStatus || d.roadcastStatus || d.status || '',
    'Last update': d.newDate || d.lastUpdate || '',
    'Final Status': d.finalStatus || '',
    'VTS Type': d.vtsType || 'VTS Package 4G',
    'Remark': d.remark || '',
    'License End': d.newLicenseEnd || d.licenseEnd || ''
  }));
}

/**
 * Export data array to Excel (.xlsx) file
 */
export function exportToExcelFile(data, fileNamePrefix = '900_Master_Fleet') {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  const exportData = formatDevicesForExport(data);
  const worksheet = XLSX.utils.json_to_sheet(exportData);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 6 },  // Sr.
    { wch: 22 }, // Name
    { wch: 20 }, // Uniqueid
    { wch: 18 }, // Phone
    { wch: 14 }, // City
    { wch: 22 }, // Status on Roadcast
    { wch: 16 }, // Last update
    { wch: 16 }, // Final Status
    { wch: 18 }, // VTS Type
    { wch: 35 }, // Remark
    { wch: 16 }  // License End
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '900');

  const timestamp = new Date().toISOString().slice(0, 10);
  const fileName = `${fileNamePrefix}_${timestamp}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

/**
 * Export data array to CSV (.csv) file
 */
export function exportToCsvFile(data, fileNamePrefix = '900_Master_Fleet') {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  const exportData = formatDevicesForExport(data);
  const csv = Papa.unparse(exportData);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().slice(0, 10);
  link.setAttribute('download', `${fileNamePrefix}_${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

