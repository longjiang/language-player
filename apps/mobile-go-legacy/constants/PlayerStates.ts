// @/constants/PlayerStates.ts
// Local replacement for the PLAYER_STATES enum from react-native-youtube-iframe.
// Values match the YouTube IFrame API player state constants.

/** Maps to YouTube IFrame API player states. */
export const PLAYER_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  VIDEO_CUED: 5,
} as const;

export type PLAYER_STATES = (typeof PLAYER_STATES)[keyof typeof PLAYER_STATES];
