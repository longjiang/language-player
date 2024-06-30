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
export const formatDuration = (totalSeconds: number): string => {
  if (totalSeconds === 0) {
      return "Invalid duration format";
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours ? `${hours}:` : ""}${minutes < 10 ? `0${minutes}` : minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
};

export const stripAccents = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export const isHangul = (text: string): boolean => {
  // Example implementation; you should define this based on actual usage.
  return /[\uac00-\ud7af]/.test(text);
}