// @/src/contexts/VideoWithTranscriptContext/useSyncedLines

import { useState, useEffect } from "react";
import { syncLines } from "@/src/subs";
import { SyncedLine, YouTubeVideo } from "@/types";

export const useSyncedLines = (video: YouTubeVideo) => {
  const [syncedLines, setSyncedLines] = useState<SyncedLine[]>([]);

  useEffect(() => {
    if (!video?.subs_l2?.length) setSyncedLines([]);
    const l1Lines = video.subs_l1 || [];
    const l2Lines = video.subs_l2 || [];
    const syncedLines = syncLines(l1Lines, l2Lines);
    setSyncedLines(syncedLines);
  }, [video?.subs_l2, video?.subs_l1]);

  return syncedLines;
};