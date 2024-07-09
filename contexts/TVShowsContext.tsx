import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { getCollectionItems } from '@/src/api/directus';
import { useLanguage } from '@/contexts/LanguageContext';
import { getVideosByL2Code } from '@/src/api/directus/youtube-video';
import { Show } from '@/components/ShowCard';

interface TVShowsContextType {
  shows: Show[];
  isLoading: boolean;
  loadShows: () => Promise<void>;
  loadEpisodes: (showId: number) => Promise<void>;
}

const TVShowsContext = createContext<TVShowsContextType | undefined>(undefined);

export const useTVShows = () => {
  const context = useContext(TVShowsContext);
  if (!context) {
    throw new Error('useTVShows must be used within a TVShowsProvider');
  }
  return context;
};

export const TVShowsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [shows, setShows] = useState<Show[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { l2Lang } = useLanguage();

  const loadShows = async () => {
    if (!l2Lang) return;
    setIsLoading(true);
    try {
      const tvShows = await getCollectionItems('tv_shows', {
        filter: { l2: { eq: l2Lang.id } },
      });
      setShows(tvShows.map((show: any) => ({ ...show, episodes: [] })));
    } catch (error) {
      console.error('Failed to load shows:', error);
    }
    setIsLoading(false);
  };

  const loadEpisodes = async (showId: number) => {
    if (!l2Lang) return;
    setIsLoading(true);
    try {
      const videoEpisodes = await getVideosByL2Code(l2Lang, false, {
        filter: { tv_show: { eq: showId } },
      });
      setShows(prevShows => prevShows.map(show => 
        show.id === showId ? { ...show, episodes: videoEpisodes } : show
      ));
    } catch (error) {
      console.error(`Failed to load episodes for show ${showId}:`, error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadShows();
  }, [l2Lang]);

  const value = {
    shows,
    isLoading,
    loadShows,
    loadEpisodes,
  };

  return <TVShowsContext.Provider value={value}>{children}</TVShowsContext.Provider>;
};