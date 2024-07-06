// @/src/api/python/video

import { YouTubeVideo } from "@/types";
import { getCollectionItems } from "@/src/api/directus";
import { Language } from "@/src/languages";
import axios, { AxiosResponse } from "axios";
import { API } from "@/src/api/python";
import { normalizeVideoData } from "@/src/api/directus/youtube-video";

// Utility functions
const handleResponse = <T>(response: AxiosResponse<T>): T => response.data;
const handleError = (error: any): never => {
  if (axios.isAxiosError(error)) {
    console.error('Axios error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
  throw error;
};
const request = async <T>(config: any): Promise<T> => {
  try {
    const response = await API.request<T>(config);
    return handleResponse(response);
  } catch (error) {
    return handleError(error);
  }
};

// YouTube video tables configuration
export const YOUTUBE_VIDEOS_TABLES = {
  2: ['eu', 'vi'],
  3: ['ko'],
  4: ['zh'],
  5: ['en'],
  6: ['de'],
  7: ['ja'],
  8: ['fr'],
  9: ['es', 'ca', 'ru'],
  10: ['tr', 'pl', 'nl'],
  11: ['he', 'pt', 'el', 'uk', 'cs', 'ar', 'sk', 'ms'],
  12: ['it'],
  13: ['id', 'sv', 'no', 'nan'],
  14: ['th', 'my']
};

export function youtubeVideoTableSuffixByL2Code(l2Code: string): string {
  for (const [suffix, codes] of Object.entries(YOUTUBE_VIDEOS_TABLES)) {
    if (codes.includes(l2Code)) {
      return `_${suffix}`;
    }
  }
  return '';
}

export function hasUniqueSuffix(l2Code: string) {
  let unique = false;
  let indexCount = 0;
  for (const [key, codes] of Object.entries(YOUTUBE_VIDEOS_TABLES)) {
    if (codes.includes(l2Code)) {
      indexCount++;
      unique = codes.length === 1;
      if (indexCount > 1) {
        return false;
      }
    }
  }
  return unique && indexCount === 1;
}

export const youtubeVideoCollectionName = (l2Code: string) => {
  const suffix = youtubeVideoTableSuffixByL2Code(l2Code);
  return `youtube_videos${suffix}`;
}

export const getVideosByL2Code = async (l2Lang: Language, includeSubs: boolean = false, params: any = {}) => {
  const collectionName = youtubeVideoCollectionName(l2Lang.code);
  let fields = 'id,l2,title,youtube_id,tv_show,talk,date,lex_div,word_freq,difficulty,views,tags,category,locale,duration,made_for_kids,views,likes,comments,type';
  if (includeSubs) fields = fields + ',subs_l1,subs_l2';
  const filter = 'filter' in params ? params.filter : {};
  if (hasUniqueSuffix(l2Lang.code)) filter.l2 = {
    eq: l2Lang.id,
  };
  const items = await getCollectionItems(collectionName, {
    fields,
    filter,
    ...params
  });
  return items.map(normalizeVideoData) as YouTubeVideo[];
}

// Function to normalize caption data
const normalizeCaptionData = (data: any[]): Array<{ line: string; starttime: number; duration: number }> => {
  return data.map(line => ({
    line: line.text,
    starttime: line.start,
    duration: line.duration
  })).sort((a, b) => a.starttime - b.starttime);
};

// Video-related functions
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
    return normalizeCaptionData(response);
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
  const response = await request<YouTubeVideo[]>({ method: 'get', url: "/recommend-videos", params });
  return response.map(normalizeVideoData);
};

export const subsSearch = async (
  terms: string[],
  langCode: string,
  category?: string,
  tvShow?: string,
  limit: number = 500,
  context: number = 5,
  sort?: string
): Promise<YouTubeVideo[]> => {
  const params: any = {
    terms: terms.join(','),
    l2: langCode,
    category,
    tv_show: tvShow,
    limit,
    context,
    sort
  };
  const response = await request<YouTubeVideo[]>({ method: 'get', url: "/subs-search", params });
  return response.map(normalizeVideoData);
};

export const getTokenizerCacheForVideo = async (videoId: string, l2Code: string) => {
  const response = await API.get("/lemmatize-video", { params: { video_id: videoId, lang: l2Code } });
  if (response && response.data) {
    return response.data;
  }
};


// Function to get the best L1 subtitles
export const getBestL1Subs = async (
  videoId: string,
  l1Code: string,
  l2Code: string
): Promise<Array<{ line: string; starttime: number; duration: number }>> => {
  const params = {
    v: videoId,
    l1: l1Code,
    l2: l2Code
  };
  const response = await request<Array<{ line: string; starttime: number; duration: number }>>({
    method: 'get',
    url: "/get_best_l1_subs",
    params
  });
  if (response && Array.isArray(response)) {
    return normalizeCaptionData(response);
  }
  return [];
};