/**
 * Public holidays by country code (ISO 3166-1 alpha-2).
 * Fixed-date holidays. Easter-based holidays computed dynamically.
 * Covers 2025-2027.
 */

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

export const SUPPORTED_COUNTRIES: { code: string; name: string }[] = [
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czech Republic" },
  { code: "RO", name: "Romania" },
  { code: "IN", name: "India" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "JP", name: "Japan" },
];

// Easter calculation (Anonymous Gregorian algorithm)
function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Fixed holidays per country (month-day pairs)
const FIXED_HOLIDAYS: Record<string, { md: string; name: string }[]> = {
  DE: [
    { md: "01-01", name: "New Year's Day" },
    { md: "05-01", name: "Labour Day" },
    { md: "10-03", name: "German Unity Day" },
    { md: "12-25", name: "Christmas Day" },
    { md: "12-26", name: "2nd Christmas Day" },
  ],
  AT: [
    { md: "01-01", name: "New Year's Day" },
    { md: "01-06", name: "Epiphany" },
    { md: "05-01", name: "Labour Day" },
    { md: "08-15", name: "Assumption" },
    { md: "10-26", name: "National Day" },
    { md: "11-01", name: "All Saints' Day" },
    { md: "12-08", name: "Immaculate Conception" },
    { md: "12-25", name: "Christmas Day" },
    { md: "12-26", name: "St. Stephen's Day" },
  ],
  CH: [
    { md: "01-01", name: "New Year's Day" },
    { md: "08-01", name: "National Day" },
    { md: "12-25", name: "Christmas Day" },
  ],
  US: [
    { md: "01-01", name: "New Year's Day" },
    { md: "07-04", name: "Independence Day" },
    { md: "12-25", name: "Christmas Day" },
  ],
  GB: [
    { md: "01-01", name: "New Year's Day" },
    { md: "12-25", name: "Christmas Day" },
    { md: "12-26", name: "Boxing Day" },
  ],
  FR: [
    { md: "01-01", name: "New Year's Day" },
    { md: "05-01", name: "Labour Day" },
    { md: "05-08", name: "Victory Day" },
    { md: "07-14", name: "Bastille Day" },
    { md: "08-15", name: "Assumption" },
    { md: "11-01", name: "All Saints' Day" },
    { md: "11-11", name: "Armistice Day" },
    { md: "12-25", name: "Christmas Day" },
  ],
  NL: [
    { md: "01-01", name: "New Year's Day" },
    { md: "04-27", name: "King's Day" },
    { md: "05-05", name: "Liberation Day" },
    { md: "12-25", name: "Christmas Day" },
    { md: "12-26", name: "2nd Christmas Day" },
  ],
};

// Easter-relative holidays (offset from Easter Sunday)
const EASTER_HOLIDAYS: Record<string, { offset: number; name: string }[]> = {
  DE: [
    { offset: -2, name: "Good Friday" },
    { offset: 1, name: "Easter Monday" },
    { offset: 39, name: "Ascension Day" },
    { offset: 50, name: "Whit Monday" },
  ],
  AT: [
    { offset: 1, name: "Easter Monday" },
    { offset: 39, name: "Ascension Day" },
    { offset: 50, name: "Whit Monday" },
    { offset: 60, name: "Corpus Christi" },
  ],
  CH: [
    { offset: -2, name: "Good Friday" },
    { offset: 1, name: "Easter Monday" },
    { offset: 39, name: "Ascension Day" },
    { offset: 50, name: "Whit Monday" },
  ],
  US: [],
  GB: [
    { offset: -2, name: "Good Friday" },
    { offset: 1, name: "Easter Monday" },
  ],
  FR: [
    { offset: 1, name: "Easter Monday" },
    { offset: 39, name: "Ascension Day" },
    { offset: 50, name: "Whit Monday" },
  ],
  NL: [
    { offset: -2, name: "Good Friday" },
    { offset: 1, name: "Easter Monday" },
    { offset: 39, name: "Ascension Day" },
    { offset: 50, name: "Whit Monday" },
  ],
};

/**
 * Get all public holidays for a country in a given year.
 */
export function getHolidays(country: string, year: number): Holiday[] {
  const holidays: Holiday[] = [];

  // Fixed holidays
  const fixed = FIXED_HOLIDAYS[country] || FIXED_HOLIDAYS["US"] || [];
  for (const h of fixed) {
    holidays.push({ date: `${year}-${h.md}`, name: h.name });
  }

  // Easter-based holidays
  const easter = easterDate(year);
  const easterHols = EASTER_HOLIDAYS[country] || [];
  for (const h of easterHols) {
    holidays.push({ date: fmt(addDays(easter, h.offset)), name: h.name });
  }

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Check if a given date is a working day (not weekend, not public holiday).
 */
export function isWorkingDay(dateStr: string, country: string): boolean {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();

  // Saturday = 6, Sunday = 0
  if (day === 0 || day === 6) return false;

  // Check public holidays
  const year = d.getFullYear();
  const holidays = getHolidays(country, year);
  return !holidays.some((h) => h.date === dateStr);
}

/**
 * Get the next working day on or after the given date.
 */
export function nextWorkingDay(dateStr: string, country: string): string {
  let d = new Date(dateStr + "T12:00:00");
  for (let i = 0; i < 30; i++) {
    const s = fmt(d);
    if (isWorkingDay(s, country)) return s;
    d = addDays(d, 1);
  }
  return dateStr; // fallback
}

/**
 * Get non-working days in a date range (for LLM context).
 */
export function getNonWorkingDays(startDate: string, endDate: string, country: string): Holiday[] {
  const result: Holiday[] = [];
  let d = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");

  while (d <= end) {
    const s = fmt(d);
    const day = d.getDay();

    if (day === 0) {
      result.push({ date: s, name: "Sunday" });
    } else if (day === 6) {
      result.push({ date: s, name: "Saturday" });
    } else {
      const year = d.getFullYear();
      const holidays = getHolidays(country, year);
      const holiday = holidays.find((h) => h.date === s);
      if (holiday) {
        result.push(holiday);
      }
    }

    d = addDays(d, 1);
  }

  return result;
}
