import * as XLSX from 'xlsx';
import Papa from 'papaparse';

/**
 * Format device records for clean 10-column export matching Google Sheet tab '900'
 * Handles both Master Sheet (d.vehicle, d.imei) AND Anomaly (d.name, d.uniqueid) format.
 */
export function formatDevicesForExport(devices = []) {
  return devices.map((d, idx) => ({
    'Sr.': d.sr || idx + 1,
    'Name': d.vehicle || d.name || '',
    'Uniqueid': '\'' + String(d.uniqueid || d.imei || ''),
    'Phone': '\'' + String(d.sim || d.phone || ''),
    'City': d.city || '',
    'Status on Roadcast': d.newStatus || d.roadcastStatus || d.status || '',
    'Last update': d.newDate || d.lastUpdate || '',
    'Final Status': d.finalStatus || '',
    'VTS Type': d.vtsType || 'VTS Package 4G',
    'Remark': d.remark || d.renewalRemark || '',
    'License End': d.newLicenseEnd || d.licenseEnd || ''
  }));
}

/**
 * Format Inactive + Running anomaly records for dedicated export
 */
export function formatAnomalyForExport(devices = []) {
  return devices.map((d, idx) => ({
    'Sr.': idx + 1,
    'Vehicle Name': d.name || d.vehicle || '',
    'Uniqueid (IMEI)': '\'' + String(d.uniqueid || d.imei || ''),
    'Phone (SIM)': '\'' + String(d.phone || d.sim || ''),
    'City': d.city || '',
    'VTS Status': 'Inactive',
    'Vehicle Status': 'RUNNING',
    'Last Roadcast Update': d.lastUpdate || '',
    'VTS Type': d.vtsType || 'VTS Package 4G',
    'Remark': d.remark || ''
  }));
}

/**
 * Force text format for IMEI and Phone columns to prevent scientific notation
 */
function forceTextColumns(worksheet, data) {
  if (!data || data.length === 0) return;

  const cols = Object.keys(data[0]);
  cols.forEach((colName, colIdx) => {
    const lc = colName.toLowerCase();
    if (lc.includes('uniqueid') || lc.includes('imei') || lc.includes('phone') || lc.includes('sim')) {
      // Set every cell in this column to text format
      for (let r = 0; r <= data.length; r++) {
        const cellRef = XLSX.utils.encode_cell({ r: r + 1, c: colIdx }); // +1 for header row
        if (worksheet[cellRef]) {
          worksheet[cellRef].t = 's'; // Force string type
          // Remove the leading apostrophe from display value
          const val = String(worksheet[cellRef].v || '');
          if (val.startsWith("'")) {
            worksheet[cellRef].v = val.slice(1);
          }
        }
      }
    }
  });
}

/**
 * Export data array to Excel (.xlsx) file
 */
export function exportToExcelFile(data, fileNamePrefix = '900_Master_Fleet') {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  // Handle already-formatted objects (e.g. from VehicleHistoryView)
  const isAlreadyFormatted = data[0] && (data[0]['Vehicle Name'] || data[0]['IMEI / Unique ID'] || (data[0]['Name'] && data[0]['Uniqueid']));
  const exportData = isAlreadyFormatted ? data : formatDevicesForExport(data);
  const worksheet = XLSX.utils.json_to_sheet(exportData);

  // Force IMEI & Phone as text (not scientific notation)
  forceTextColumns(worksheet, exportData);

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
 * Export Inactive + Running anomaly data to Excel with proper columns
 */
export function exportAnomalyToExcel(data, fileNamePrefix = 'Inactive_Running_Vehicles') {
  if (!data || data.length === 0) {
    alert('No anomaly data available to export.');
    return;
  }

  const exportData = formatAnomalyForExport(data);
  const worksheet = XLSX.utils.json_to_sheet(exportData);

  // Force IMEI & Phone as text
  forceTextColumns(worksheet, exportData);

  worksheet['!cols'] = [
    { wch: 6 },  // Sr.
    { wch: 22 }, // Vehicle Name
    { wch: 20 }, // Uniqueid (IMEI)
    { wch: 18 }, // Phone (SIM)
    { wch: 14 }, // City
    { wch: 12 }, // VTS Status
    { wch: 14 }, // Vehicle Status
    { wch: 18 }, // Last Roadcast Update
    { wch: 18 }, // VTS Type
    { wch: 35 }  // Remark
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inactive_Running');

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

