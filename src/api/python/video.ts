// @/src/api/python/video

import axios, { AxiosResponse } from "axios";
import { API } from "@/src/api/python";
import { YouTubeVideo } from "@/types";

// Centralized error handling
const handleResponse = <T>(response: AxiosResponse<T>): T => response.data;

const handleError = (error: any): never => {
  // Customize error handling logic as needed
  if (axios.isAxiosError(error)) {
    // Handle Axios-specific errors
    console.error('Axios error:', error.message);
  } else {
    // Handle non-Axios errors
    console.error('Unexpected error:', error);
  }
  throw error;
};

// Wrapper to handle responses and errors centrally
const request = async <T>(config: any): Promise<T> => {
  try {
    const response = await API.request<T>(config);
    return handleResponse(response);
  } catch (error) {
    return handleError(error);
  }
};


/**
 * Fetches and processes captions for a YouTube video.
 * 
 * @param {string} videoId - The YouTube video ID to fetch captions for.
 * @param {string} [name] - The name of the specific transcript to look for (e.g., 'English' or 'Spanish').
 * @param {string} [lang] - The language code of the desired caption (e.g., 'en' for English).
 * @param {string[]} [tlangs] - List of target language codes for translation.
 * @param {boolean} [generated] - Whether to accept auto-generated captions.
 * 
 * @returns {Promise<Array<{line: string, starttime: number, duration: number}>>} 
 *          A promise that resolves to an array of caption objects, each containing:
 *          - line: The text content of the caption.
 *          - starttime: The start time of the caption in seconds.
 *          - duration: The duration of the caption in seconds.
 * 
 * @throws {Error} If the request fails or returns an unexpected response format.
 * 
 * @example
 * // Fetch English captions for a video
 * const captions = await getCaption('dQw4w9WgXcQ', 'English', 'en');
 * 
 * // Fetch auto-generated captions in Spanish
 * const autoCaptions = await getCaption('dQw4w9WgXcQ', undefined, 'es', undefined, true);
 */
export const getCaption = async (
  videoId: string,
  name?: string,
  lang?: string,
  tlangs?: string[],
  generated?: boolean
): Promise<Array<{ line: string; starttime: number; duration: number }>> => {
  const params: any = {
    v: videoId,
    type: 'caption',
    name,
    lang,
    tlangs: tlangs?.join(','),
    generated
  };
  const response = await request({ method: 'get', url: "/timedtext", params });

  if (response && Array.isArray(response)) {
    return response.map(line => ({
      line: line.text,
      starttime: line.start,
      duration: line.duration
    })).sort((a, b) => a.starttime - b.starttime);
  }

  return [];
};

export const getCaptionList = async (videoId: string): Promise<any> => {
  const params = {
    v: videoId,
    type: 'list'
  };
  return request({ method: 'get', url: "/timedtext", params });
};

export const syncSubtitles = async (youtubeId: string, srtContent: string): Promise<any> => {
  return request({ method: 'post', url: "/sync-srt", data: { youtube_id: youtubeId, srt_content: srtContent } });
};

export const checkYouTube = async (youtubeIds: string[]): Promise<any> => {
  return request({ method: 'get', url: "/check-youtube", params: { youtube_ids: youtubeIds.join(',') } });
};

export const recommendVideos = async (
  userId: number,
  langCode: string,
  level?: number,
  preferredCategories?: number[],
  excludeIds?: number[],
  madeForKids?: number,
  limit?: number
): Promise<YouTubeVideo[]> => {
  const params: any = {
    user_id: userId,
    l2: langCode,
    level,
    preferred_categories: preferredCategories?.join(','),
    exclude_ids: excludeIds?.join(','),
    made_for_kids: madeForKids,
    limit,
  };
  return request({ method: 'get', url: "/recommend-videos", params });
};

export const subsSearch = async (
  terms: string[],
  langCode: string,
  category?: string,
  tvShow?: string,
  limit: number = 500,
  context: number = 5,
  sort?: string
): Promise<any> => {
  const params: any = {
    terms: terms.join(','),
    l2: langCode,
    category,
    tv_show: tvShow,
    limit,
    context,
    sort
  };
  return request({ method: 'get', url: "/subs-search", params });
};


export const getTokenizerCacheForVideo = async (videoId: string, l2Code: string) => {
  const response = await API.get("/lemmatize-video", { params: { video_id: videoId, lang: l2Code } });
  if (response && response.data) {
    return response.data;
  }
};