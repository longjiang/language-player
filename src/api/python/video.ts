import { AxiosResponse } from "axios";
import { API } from "@/src/api/python";


export const getTimedText = async (
  videoId: string,
  type: 'list' | 'caption',
  name?: string,
  lang?: string,
  tlangs?: string[],
  generated?: boolean
): Promise<AxiosResponse<any>> => {
  const params: any = { v: videoId, type };
  if (type === 'caption') {
    params.name = name;
    params.lang = lang;
    params.tlangs = tlangs?.join(',');
    params.generated = generated;
  }
  return API.get("/timedtext", { params });
};

export const syncSubtitles = async (youtubeId: string, srtContent: string): Promise<AxiosResponse<any>> => {
  return API.post("/sync-srt", { youtube_id: youtubeId, srt_content: srtContent });
};

export const checkYouTube = async (youtubeIds: string[]): Promise<AxiosResponse<any>> => {
  return API.get("/check-youtube", { params: { youtube_ids: youtubeIds.join(',') } });
};

export const recommendVideos = async (
  userId: string,
  langCode: string,
  level?: number,
  preferredCategories?: number[],
  excludeIds?: string[],
  madeForKids?: string,
  limit?: number
): Promise<AxiosResponse<any>> => {
  const params: any = {
    user_id: userId,
    l2: langCode,
    level,
    preferred_categories: preferredCategories?.join(','),
    exclude_ids: excludeIds?.join(','),
    made_for_kids: madeForKids,
    limit,
  };
  return API.get("/recommend-videos", { params });
};

export const subsSearch = async (
  terms: string[],
  langCode: string,
  category?: string,
  tvShow?: string,
  limit: number = 500,
  context: number = 5,
  sort?: string
  ): Promise<AxiosResponse<any>> => {
  const params: any = {
    terms: terms.join(','),
    l2: langCode,
    category,
    tv_show: tvShow,
    limit,
    context,
    sort
  };
  return API.get("/subs-search", { params });
};