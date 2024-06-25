import { YouTubeVideo } from "@/types";
import { parseDuration } from "@/src/utils";
import { parseSubtitles } from "@/src/subs";

export const normalizeVideoData = (videoData: any): YouTubeVideo => {
  return {
    ...videoData,
    date: videoData.date ? new Date(videoData.date) : null,
    duration: parseDuration(videoData.duration),
    subs_l1: videoData.subs_l1 ? parseSubtitles(videoData.subs_l1) : [],
    subs_l2: videoData.subs_l2 ? parseSubtitles(videoData.subs_l2) : [],
  };
};
