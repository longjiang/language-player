// @/src/utils.tsx

// Convert ISO 8601 duration string to total seconds
export const parseDuration = (duration: string): number => {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const match = duration.match(regex);
  if (!match) {
      return 0; // Returns 0 for invalid format
  }
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
};

// Convert seconds into a human-readable format HH:MM:SS
export const formatDuration = (seconds: number, locale: string): string => {
  const date = new Date(0);
  date.setSeconds(seconds);
  return date.toLocaleTimeString(locale, { timeZone: 'UTC', hour12: false, minute: '2-digit', second: '2-digit' });
};

export const stripAccents = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

export const isHangul = (text: string): boolean => {
  // Example implementation; you should define this based on actual usage.
  return /[\uac00-\ud7af]/.test(text);
}

export const getDeltaDate = (expiresOn) => {
  const now = new Date();
  const expirationDate = new Date(expiresOn);
  const deltaMilliseconds = expirationDate - now;
  const deltaDays = Math.ceil(deltaMilliseconds / (1000 * 60 * 60 * 24));
  return deltaDays;
};

export const timeout = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Function to construct a URL with query parameters
export function constructUrlWithQueryParams(baseUrl: string | URL, params: { [s: string]: unknown; } | ArrayLike<unknown>) {
  const url = new URL(baseUrl);
  const searchParams = new URLSearchParams(url.search);

  for (const [key, value] of Object.entries(params)) {
    searchParams.append(key, value as string);
  }

  url.search = searchParams.toString();
  return url.toString();
}