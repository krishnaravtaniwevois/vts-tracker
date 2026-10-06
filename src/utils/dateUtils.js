/**
 * Universal Date Utility for VTS Tracker
 * Handles: "29-Aug-2026", "8-Sep-2026", "11 Sep 2026", "1 Nov 2025", "2026-08-29", "29/08/2026", Excel serial numbers, etc.
 */

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_MAP = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

export function parseFlexibleDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

  // Handle Excel Serial Number (e.g. 46263)
  if (typeof val === 'number' && val > 20000 && val < 70000) {
    const utcDays = Math.floor(val - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return isNaN(date.getTime()) ? null : date;
  }

  const s = String(val).trim();
  if (!s) return null;

  // Match "29-Aug-2026", "8-Sep-2026", "11 Sep 2026", "1 Nov 2025"
  const textMonthMatch = s.match(/^(\d{1,2})[-/\s]+([A-Za-z]{3,9})[-/\s]+(\d{2,4})$/);
  if (textMonthMatch) {
    const day = parseInt(textMonthMatch[1], 10);
    const mStr = textMonthMatch[2].toLowerCase();
    const month = MONTH_MAP[mStr] !== undefined ? MONTH_MAP[mStr] : MONTH_MAP[mStr.slice(0, 3)];
    let year = parseInt(textMonthMatch[3], 10);
    if (year < 100) year += 2000;
    if (month !== undefined && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  // Match "YYYY-MM-DD" or "YYYY/MM/DD"
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    return new Date(year, month, day);
  }

  // Match "DD-MM-YYYY" or "DD/MM/YYYY"
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }

  // Standard fallback
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
}

export function formatDisplayDate(val) {
  const d = parseFlexibleDate(val);
  if (!d) return String(val || '').trim();
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES_SHORT[d.getMonth()] || 'Jan';
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export function getMonthYearKey(val) {
  const d = parseFlexibleDate(val);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

export function getMonthYearLabel(val) {
  const d = parseFlexibleDate(val);
  if (!d) return '';
  return `${MONTH_NAMES_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

export function calculateDaysRemaining(licenseEndVal) {
  const d = parseFlexibleDate(licenseEndVal);
  if (!d) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffTime = d.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getRechargeStatus(remainingDays) {
  if (remainingDays === undefined || remainingDays === null) return 'Unknown';
  if (remainingDays < 0) return 'Expired';
  if (remainingDays <= 15) return 'Recharge Soon';
  return 'Safe';
}


