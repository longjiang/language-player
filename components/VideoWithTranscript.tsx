// @/components/VideoWithTranscript/index.tsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Dimensions } from "react-native";
import Ionicon from "react-native-vector-icons/Ionicons";
import { YouTubeVideo } from "./YouTubeVideo";
import { VideoControlBar } from "./VideoControlBar";
import { SyncedTranscript } from "./SyncedTranscript";
import { ThemedText } from "./ThemedText";
import { ProFeatureModal } from './ProFeatureModal';
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { SyncedLine } from "@/types";
import { Swatches } from "@/constants/Swatches";
import { formatDuration } from "@/src/utils";
import { videoWithTranscriptStyles as styles } from "@/src/styles";
import { TouchableOpacity } from "react-native-gesture-handler";
import { ThemedRBSheet } from "./ThemedRBSheet";
import { YouTubeVideoList } from "./YouTubeVideoList";
import { useTVShows } from "@/contexts/TVShowsContext";

const MAX_FREE_LINES = 10;

interface VideoWithTranscriptProps {
  isMini: boolean;
  refRBSheet: React.RefObject<typeof ThemedRBSheet>;
  isProCheckEnabled?: boolean;
}

export const VideoWithTranscript: React.FC<VideoWithTranscriptProps> = ({
  isMini,
  refRBSheet,
  isProCheckEnabled = true
}) => {
  const { syncedLines, currentLine, video, playVideo, updatePlayVideo, currentTime, startTime, playlist } = useVideoWithTranscriptContext();
  const { isProUser } = useSubscription();
  const { t } = useLanguage();
  const { closePlayer, maximizePlayer } = useVideoPlayer();
  const [showProModal, setShowProModal] = useState(false);
  const hasShownModalRef = useRef(false);
  const { getShow } = useTVShows();
  const [tvShow, setTvShow] = useState<string | undefined>(undefined);
  
  useEffect(() => {
    if (video) {
      setTvShow(getShow(video.tv_show));
    }
  }, [video]);

  const screenWidth = Dimensions.get("window").width;
  const videoHeight = isMini ? 70 : screenWidth * 0.5625; // 16:9 aspect ratio for full mode

  const currentLineIndex = syncedLines.findIndex(
    (line: SyncedLine) => 
      line.starttime === currentLine?.starttime &&
      line.l1Line === currentLine?.l1Line &&
      line.l2Line === currentLine?.l2Line
  );

  useEffect(() => {
    if (isProCheckEnabled && !isProUser() && currentLineIndex >= MAX_FREE_LINES && !hasShownModalRef.current) {
      setShowProModal(true);
      hasShownModalRef.current = true;
    }
  }, [currentLineIndex, isProCheckEnabled, isProUser]);

  const closeProModal = useCallback(() => {
    setShowProModal(false);
  }, []);

  function removeTextInBrackets(text: string) {
    const regex = /[\(\[\{［【｛].*?[\)\]\}］】｝]/g;
    return text.replace(regex, "");
  }

  if (!video) {
    return null;
  }

  return (
    <View style={isMini ? styles.miniPlayerContainer : styles.fullPlayerContainer}>
      <View style={isMini ? styles.miniPlayerVideoContainer : null}>
        <YouTubeVideo
          youtubeId={video.youtube_id}
          height={videoHeight}
          controls={false}
          startTime={isMini ? 0 : startTime}
        />
      </View>
      
      {isMini ? (
        <>
          <TouchableOpacity style={{ ...styles.miniPlayerTextContainer }} onPress={maximizePlayer}>
            <View >
              {video.title && (
                <ThemedText
                  style={styles.miniPlayerVideoTitle}
                  numberOfLines={1}
                  type="defaultBold"
                >
                  {removeTextInBrackets(video.title)}
                </ThemedText>
              )}
              <ThemedText
                style={styles.miniPlayerVideoSubTitle}
                numberOfLines={1}
                type="small"
              >
                {formatDuration(currentTime)}
              </ThemedText>
            </View>
          </TouchableOpacity>
          <View style={styles.miniPlayerControlsContainer}>
            <Ionicon
              name={playVideo ? "pause" : "play"}
              size={26}
              style={{ color: Swatches.neutral[0] }}
              onPress={() => updatePlayVideo(!playVideo)}
            />
            <Ionicon
              name="close"
              size={26}
              style={{ color: Swatches.neutral[0], marginLeft: 10 }}
              onPress={closePlayer}
            />
          </View>
        </>
      ) : (
        <>
          <VideoControlBar />
          <View style={{ paddingHorizontal: 26 }}>
            <SyncedTranscript transcriptLimitReached={isProCheckEnabled && !isProUser() && currentLineIndex >= MAX_FREE_LINES} />
          </View>
        </>
      )}

      <ThemedRBSheet ref={refRBSheet}>
        <View>
          { tvShow && <ThemedText type="subtitle">{tvShow.title}</ThemedText>}
          
          <YouTubeVideoList videos={playlist} variant="horizontal" currentVideoId={ video ? video.youtube_id : undefined } showDetails={false}/>
        </View>
      </ThemedRBSheet>
      
      <ProFeatureModal
        visible={showProModal}
        onClose={closeProModal}
        upgradeText={t('msg.pro_transcript')}
      />
    </View>
  );
};