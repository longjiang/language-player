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

export const getTimedText = async (
  videoId: string,
  type: 'list' | 'caption',
  name?: string,
  lang?: string,
  tlangs?: string[],
  generated?: boolean
): Promise<any> => {
  const params: any = { v: videoId, type };
  if (type === 'caption') {
    params.name = name;
    params.lang = lang;
    params.tlangs = tlangs?.join(',');
    params.generated = generated;
  }
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