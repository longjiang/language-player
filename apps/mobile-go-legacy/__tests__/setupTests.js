// Mock the VideoPlayerContext
jest.mock('@/contexts/VideoPlayerContext', () => ({
  ...jest.requireActual('@/contexts/VideoPlayerContext'),
  useVideoPlayer: jest.fn().mockReturnValue({
    videoPlayerState: {
      video: { youtube_id: 'test123', id: 1, title: 'Test Video' },
      queue: [],
      isMini: true,
    },
    setVideoPlayerState: jest.fn(),
  }),
}));

// Mock the LanguageContext
jest.mock('@/contexts/LanguageContext', () => ({
  ...jest.requireActual('@/contexts/LanguageContext'),
  useLanguage: jest.fn().mockReturnValue({
    l1Lang: { code: 'en', id: 1 },
    l2Lang: { code: 'es', id: 2 },
    t: jest.fn((key) => key), // Simple translation mock
  }),
}));

// Mock the AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: jest.fn().mockReturnValue({
    getStoredAuthToken: jest.fn().mockResolvedValue('test-token'),
  }),
}));

// Mock the DictionaryContext
jest.mock('@/contexts/DictionaryContext', () => ({
  ...jest.requireActual('@/contexts/DictionaryContext'),
  useDictionary: jest.fn().mockReturnValue({
    tokenizer: { loadCache: jest.fn() },
  }),
}));

// Mock the API calls
jest.mock('@/src/api/python/video', () => ({
  getBestL2Subs: jest.fn().mockResolvedValue(['Test L2 subtitle']),
  getBestL1Subs: jest.fn().mockResolvedValue(['Test L1 subtitle']),
  getTokenizerCacheForVideo: jest.fn().mockResolvedValue({ testCache: true }),
}));

jest.mock('@/src/api/directus/youtube-video', () => ({
  getVideosByL2Code: jest.fn().mockResolvedValue([
    { youtube_id: 'test123', id: 1, title: 'Test Video' },
  ]),
}));

jest.mock('@/src/api/directus/user-watch-history', () => ({
  addToWatchHistory: jest.fn().mockResolvedValue({}),
}));

// Mock the VideoWithTranscript component
jest.mock('@/components/VideoWithTranscript', () => 'VideoWithTranscript');

// Mock the hooks
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn().mockReturnValue('#000000'),
}));