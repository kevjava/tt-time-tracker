import { format } from "date-fns";
import { DEFAULT_CONFIG } from "../types/config";

// Cached config and locale for the process lifetime
let cachedConfig: {
  dateFormat: string;
  dateFormatShort: string;
  timeFormat: string;
  locale: string;
} | null = null;
let cachedLocale: any = undefined; // undefined = not loaded yet, null = no locale

function getConfig() {
  if (!cachedConfig) {
    try {
      // Dynamic require to avoid issues when config module is mocked in tests
      const { loadConfig } = require("./config");
      const config = loadConfig();
      cachedConfig = {
        dateFormat: config.dateFormat ?? DEFAULT_CONFIG.dateFormat,
        dateFormatShort:
          config.dateFormatShort ?? DEFAULT_CONFIG.dateFormatShort,
        timeFormat: config.timeFormat ?? DEFAULT_CONFIG.timeFormat,
        locale: config.locale ?? DEFAULT_CONFIG.locale,
      };
    } catch {
      // Fall back to defaults if loadConfig is not available (e.g. in tests with partial mocks)
      cachedConfig = {
        dateFormat: DEFAULT_CONFIG.dateFormat,
        dateFormatShort: DEFAULT_CONFIG.dateFormatShort,
        timeFormat: DEFAULT_CONFIG.timeFormat,
        locale: DEFAULT_CONFIG.locale,
      };
    }
  }
  return cachedConfig;
}

/**
 * Convert locale name to camelCase export key
 * e.g. "en-GB" -> "enGB", "de" -> "de", "ar-SA" -> "arSA"
 */
function localeToCamelCase(name: string): string {
  return name.replace(/-([a-zA-Z])/g, (_, c) => c.toUpperCase());
}

function getLocale(): any {
  if (cachedLocale !== undefined) {
    return cachedLocale;
  }

  const config = getConfig();
  let localeName = config.locale;

  // Auto-detect from system if empty
  if (!localeName) {
    try {
      const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
      // Only use non-English locales (English is the default for date-fns)
      if (systemLocale && !systemLocale.startsWith("en")) {
        localeName = systemLocale;
      }
    } catch {
      // Ignore detection failures
    }
  }

  if (!localeName) {
    cachedLocale = null;
    return null;
  }

  try {
    const localeModule = require(`date-fns/locale/${localeName}`);
    const key = localeToCamelCase(localeName);
    cachedLocale = localeModule[key] || null;
    return cachedLocale;
  } catch {
    // Try base language (e.g. "de" from "de-AT")
    const baseLang = localeName.split("-")[0];
    if (baseLang !== localeName) {
      try {
        const localeModule = require(`date-fns/locale/${baseLang}`);
        cachedLocale = localeModule[baseLang] || null;
        return cachedLocale;
      } catch {
        // Fall through
      }
    }
    if (localeName) {
      console.warn(
        `Could not load locale data for '${localeName}'. Falling back to default English formatting.`,
      );
    }
    cachedLocale = null;
    return null;
  }
}

function fmt(date: Date, formatStr: string): string {
  const locale = getLocale();
  return locale ? format(date, formatStr, { locale }) : format(date, formatStr);
}

function getTimeFormatStr(): string {
  return getConfig().timeFormat === "12h" ? "h:mm a" : "HH:mm";
}

function getTimeSecondsFormatStr(): string {
  return getConfig().timeFormat === "12h" ? "h:mm:ss a" : "HH:mm:ss";
}

/** Format a full date with year: "Jan 15, 2024" */
export function formatDate(date: Date): string {
  return fmt(date, getConfig().dateFormat);
}

/** Format a short date without year: "Jan 15" */
export function formatDateShort(date: Date): string {
  return fmt(date, getConfig().dateFormatShort);
}

/** Format day + short date: "Mon, Jan 15" */
export function formatDayDate(date: Date): string {
  return fmt(date, `EEE, ${getConfig().dateFormatShort}`);
}

/** Format day + full date: "Mon, Jan 15, 2024" */
export function formatDayDateFull(date: Date): string {
  return fmt(date, `EEE, ${getConfig().dateFormat}`);
}

/** Format time: "09:30" or "9:30 AM" */
export function formatTime(date: Date): string {
  return fmt(date, getTimeFormatStr());
}

/** Format time with seconds: "09:30:45" */
export function formatTimeSeconds(date: Date): string {
  return fmt(date, getTimeSecondsFormatStr());
}

/** Format full date + time: "Jan 15, 2024 09:30" */
export function formatDateTime(date: Date): string {
  return fmt(date, `${getConfig().dateFormat} ${getTimeFormatStr()}`);
}

/** Format full date + time with seconds: "Jan 15, 2024 09:30:45" */
export function formatDateTimeSeconds(date: Date): string {
  return fmt(date, `${getConfig().dateFormat} ${getTimeSecondsFormatStr()}`);
}

/** Format short date + time: "Jan 15, 09:30" */
export function formatDateShortTime(date: Date): string {
  return fmt(date, `${getConfig().dateFormatShort}, ${getTimeFormatStr()}`);
}

/** Format a time range: "09:30-10:45" */
export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)}-${formatTime(end)}`;
}

/** Format a date range: "Jan 15 - Jan 21, 2024" */
export function formatDateRange(start: Date, end: Date): string {
  return `${formatDateShort(start)} - ${formatDate(end)}`;
}

/** Reset cached config and locale (for tests) */
export function resetFormatCache(): void {
  cachedConfig = null;
  cachedLocale = undefined;
}
