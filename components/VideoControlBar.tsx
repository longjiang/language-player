// @/components/VideoControlBar.tsx
import React, { useRef, useMemo } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { ThemedButton } from "./ThemedButton";
import Ionicon from "react-native-vector-icons/Ionicons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Swatches } from "@/constants/Swatches";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { Dimensions } from "react-native";
import { ThemedText } from "./ThemedText";
import { formatDuration } from "@/src/utils";
import { ThemedRBSheet } from "./ThemedRBSheet";
import { videoControlBarStyles as styles } from "@/src/styles";
import { useLanguage } from "@/contexts/LanguageContext";

const formatNumber = (num: number): string => {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
};

export const VideoControlBar: React.FC = () => {
  const { t, i18n } = useLanguage();
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const disabledColor = useThemeColor({}, "disabled");
  const {
    video,
    playlist,
    playVideo,
    duration,
    currentTime,
    currentLine,
    syncedLines,
    currentVideoIndex,
    updatePlayVideo,
    seekTo,
    rewind,
    seekToNextLine,
    seekToPreviousLine,
    skipToNextVideo,
    skipToPreviousVideo,
  } = useVideoWithTranscriptContext();

  const handlePress = (evt: { nativeEvent: { locationX: number; }; }) => {
    const { locationX } = evt.nativeEvent;
    const progressBarWidth = Dimensions.get("window").width;
    const newTime = (locationX / progressBarWidth) * duration;
    seekTo(newTime);
  };

  const refRBSheet = useRef<typeof ThemedRBSheet>(null);

  const currentLineIndex = useMemo(() => {
    return syncedLines.findIndex(line => line.starttime === currentLine?.starttime);
  }, [syncedLines, currentLine]);

  const isPreviousLineDisabled = currentLineIndex <= 0;
  const isNextLineDisabled = currentLineIndex >= syncedLines.length - 1;
  const isPreviousVideoDisabled = currentVideoIndex <= 0;
  const isNextVideoDisabled = currentVideoIndex >= playlist.length - 1;

  const videoInfo = [
    video.duration ? formatDuration(video.duration, i18n.locale) : undefined,
    video.date instanceof Date ? video.date.toLocaleDateString(i18n.locale, { month: 'long', day: 'numeric', year: 'numeric' }) : undefined,
    t('lang.' + video.locale)
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.progressBarContainer, { backgroundColor: useThemeColor({}, 'secondaryBackground') }]}>
        <TouchableOpacity activeOpacity={1} onPress={handlePress}>
          <LinearGradient
            colors={[Swatches.primary[700], Swatches.primary[400]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.progressBar,
              {
                width: currentTime && duration
                  ? `${(currentTime / duration) * 100}%`
                  : "0%",
              },
            ]}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.controls}>
        <ThemedButton
          type="ghost"
          trailingIcon={<Ionicon name="information-circle-outline" />}
          onPress={() => refRBSheet.current?.open()}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Ionicon name="play-skip-back-outline" color={isPreviousVideoDisabled ? disabledColor : undefined} />}
          onPress={skipToPreviousVideo}
          disabled={isPreviousVideoDisabled}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Ionicon name="arrow-back-outline" color={isPreviousLineDisabled ? disabledColor : undefined} />}
          onPress={seekToPreviousLine}
          disabled={isPreviousLineDisabled}
        />
        <TouchableOpacity onPress={() => updatePlayVideo(!playVideo)}>
          <Ionicon
            name={playVideo ? "pause" : "play"}
            size={51}
            style={{ color: primaryBrandColor }}
          />
        </TouchableOpacity>
        <ThemedButton
          type="ghost"
          trailingIcon={<Ionicon name="arrow-forward-outline" color={isNextLineDisabled ? disabledColor : undefined} />}
          onPress={seekToNextLine}
          disabled={isNextLineDisabled}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Ionicon name="play-skip-forward-outline" color={isNextVideoDisabled ? disabledColor : undefined} />}
          onPress={skipToNextVideo}
          disabled={isNextVideoDisabled}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Ionicon name="refresh-circle-outline" />}
          onPress={rewind}
        />
      </View>
      <ThemedRBSheet ref={refRBSheet}>
        <View>
          <ThemedText type="subtitle">{video.title}</ThemedText>
          <ThemedText variant="secondary" style={{ marginTop: 10 }}>
            {videoInfo.filter(Boolean).map((info, index) => (
              <React.Fragment key={index}>
                {info}
                {index < videoInfo.length - 1 && ' • '}
              </React.Fragment>
            ))}          
          </ThemedText>
          <ThemedText variant="secondary" style={{ marginTop: 10, flexDirection: "row", alignItems: "center" }}>
            <Ionicon name="eye" size={16} /> {formatNumber(video.views || 0)} {t('video.views')} {" "}
            <Ionicon name="thumbs-up" size={16} style={{ marginLeft: 5 }} /> {formatNumber(video.likes || 0)} {t('video.likes')} {" "}
            <Ionicon name="chatbubble" size={16} style={{ marginLeft: 5 }} /> {formatNumber(video.comments || 0)} {t('video.comments')}
          </ThemedText>
        </View>
      </ThemedRBSheet>
    </View>
  );
};