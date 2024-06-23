// Convert ISO 8601 duration to a readable format
export const formatDuration = (duration) => {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  return `${hours ? `${hours}:` : ""}${minutes}:${
    seconds < 10 ? `0${seconds}` : seconds
  }`;
};

// Format number of seconds to a readable format
export const formatSeconds = (seconds) => {
  // Round the seconds to an int
  seconds = Math.round(seconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  return `${hours ? `${hours}:` : ""}${minutes}:${
    sec < 10 ? `0${sec}` : sec
  }`;
};