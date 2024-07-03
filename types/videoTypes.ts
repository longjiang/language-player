export interface YouTubeVideo {
  difficulty?: number;
  starttime?: number; // Used for subs search results
  date?: Date;
  youtube_id: string; // The ID of the video on YouTube
  id?: string; // The ID in our own database
  title?: string;
  subs_l1?: Line[];
  subs_l2?: Line[];
  views?: number;
  comments?: number;
  likes?: number;
  duration?: number; // Duration in seconds
  locale?: string;
}

export interface VideoWithTranscriptProps {
  router: any; // Adjust the type according to your router's type
  video: YouTubeVideo;
}

export interface Line {
  line: string;
  starttime: number;
}

export interface SyncedLine {
  starttime: number;
  l1Line: string;
  l2Line: string;
}