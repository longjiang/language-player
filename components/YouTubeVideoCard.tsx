// @/components/YouTubeVideoCard.tsx

import React from "react";
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
} from "react-native";
import { ThemedText } from "./ThemedText";
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { formatDuration } from '@/src/utils';
import { YouTubeVideo } from '@/types';
import { languageLevelsByL2Code } from '@/src/language-levels';
import { useLanguage } from '@/contexts/LanguageContext';
import { youtubeVideoCardStyles } from '@/src/styles';
import { useThemeColorForLevel } from '@/hooks/useThemeColor';

export const YouTubeVideoCard = ({ 
  video, 
  videos = [], 
  variant = 'vertical' 
}: { 
  video: YouTubeVideo; 
  videos: YouTubeVideo[]; 
  variant?: 'vertical' | 'horizontal';
  style?: object 
}) => {
  if (videos.length === 0) videos = [video];
  const { setVideoAndQueue } = useVideoPlayer();
  const { l2Lang, t } = useLanguage();
  if (!l2Lang) return null;

  const handlePress = () => {
    setVideoAndQueue(video, videos);
  };

  const