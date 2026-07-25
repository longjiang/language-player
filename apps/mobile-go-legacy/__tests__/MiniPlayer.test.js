import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { MiniPlayer } from '../components/MiniPlayer'; // Adjust this path as needed
import { VideoPlayerProvider } from '@/contexts/VideoPlayerContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { DictionaryProvider } from '@/contexts/DictionaryContext';
import * as VideoAPI from '@/src/api/python/video';
import * as DirectusAPI from '@/src/api/directus/youtube-video';
import * as WatchHistoryAPI from '@/src/api/directus/user-watch-history';

// Mock the context hooks
jest.mock('@/contexts/VideoPlayerContext', () => ({
  ...jest.requireActual('@/contexts/VideoPlayerContext'),
  useVideoPlayer: jest.fn(),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  ...jest.requireActual('@/contexts/LanguageContext'),
  useLanguage: jest.fn(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: jest.fn(),
}));

jest.mock('@/contexts/DictionaryContext', () => ({
  ...jest.requireActual('@/contexts/DictionaryContext'),
  useDictionary: jest.fn(),
}));

// Mock the API calls
jest.mock('@/src/api/python/video');
jest.mock('@/src/api/directus/youtube-video');
jest.mock('@/src/api/directus/user-watch-history');

// Mock the VideoWithTranscript component
jest.mock('@/components/VideoWithTranscript', () => 'VideoWithTranscript');

// Mock the ThemedText component
jest.mock('../components/ThemedText', () => ({
  ThemedText: ({ children }) => children,
}));

// Mock font loading
jest.mock('@expo-google-fonts/nunito', () => ({
  useFonts: jest.fn().mockReturnValue([true, null]),
}));

describe('MiniPlayer', () => {
  const mockVideo = {
    youtube_id: 'test123',
    id: 1,
    title: 'Test Video',
  };

  const mockVideoPlayerState = {
    video: mockVideo,
    queue: [],
    isMini: true,
  };

  const mockSetVideoPlayerState = jest.fn();
  const mockGetStoredAuthToken = jest.fn().mockResolvedValue('test-token');
  const mockTokenizer = { loadCache: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();

    require('@/contexts/VideoPlayerContext').useVideoPlayer.mockReturnValue({
      videoPlayerState: mockVideoPlayerState,
      setVideoPlayerState: mockSetVideoPlayerState,
    });

    require('@/contexts/LanguageContext').useLanguage.mockReturnValue({
      l1Lang: { code: 'en', id: 1 },
      l2Lang: { code: 'es', id: 2 },
    });

    require('@/contexts/AuthContext').useAuth.mockReturnValue({
      getStoredAuthToken: mockGetStoredAuthToken,
    });

    require('@/contexts/DictionaryContext').useDictionary.mockReturnValue({
      tokenizer: mockTokenizer,
    });

    DirectusAPI.getVideosByL2Code.mockResolvedValue([mockVideo]);
    VideoAPI.getBestL2Subs.mockResolvedValue(['Test L2 subtitle']);
    VideoAPI.getBestL1Subs.mockResolvedValue(['Test L1 subtitle']);
    VideoAPI.getTokenizerCacheForVideo.mockResolvedValue({ testCache: true });
    WatchHistoryAPI.addToWatchHistory.mockResolvedValue({});
  });

  it('renders null when there is no video', async () => {
    require('@/contexts/VideoPlayerContext').useVideoPlayer.mockReturnValueOnce({
      videoPlayerState: { video: null },
      setVideoPlayerState: mockSetVideoPlayerState,
    });

    let tree;
    await act(async () => {
      tree = render(<MiniPlayer />);
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('renders the MiniPlayer when there is a video', async () => {
    await act(async () => {
      const { getByTestId } = render(
        <VideoPlayerProvider>
          <LanguageProvider>
            <AuthProvider>
              <DictionaryProvider>
                <MiniPlayer />
              </DictionaryProvider>
            </AuthProvider>
          </LanguageProvider>
        </VideoPlayerProvider>
      );
      await waitFor(() => {
        expect(getByTestId('mini-player')).toBeTruthy();
      });
    });
  });

});