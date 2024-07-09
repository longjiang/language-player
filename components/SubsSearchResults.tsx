// @/components/SubsSearchResults.tsx

import React, { useRef, useState, useEffect, useCallback } from "react";
import { View, Text, Dimensions } from "react-native";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { VideoWithTranscript } from "./VideoWithTranscript";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "./ThemedButton";
import Icon from "react-native-vector-icons/FontAwesome";
import { SubsSearchResultsList } from "./SubsSearchResultsList";
import { ThemedRBSheet } from "./ThemedRBSheet";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { ProFeatureModal } from "./ProFeatureModal";
import { timeout } from "@/src/utils";
import { useLanguage } from '@/contexts/LanguageContext';
import { getBestL1Subs } from '@/src/api/python/video';

const MAX_FREE_SUBS_SEARCH_RESULTS = 3;

export const SubsSearchResults = ({ term }: { term: string }) => {
  const { video, syncedLines, playlist, updateStartTime, currentVideoIndex, skipToVideo } =
    useVideoWithTranscriptContext();
  const refRBSheet = useRef();

  const { isProUser } = useSubscription();
  const [showProModal, setShowProModal] = useState(false);
  const previousIndexRef = useRef(currentVideoIndex);
  const { t, l2Lang, l1Lang, languages } = useLanguage();
  if (!languages || !l2Lang || !l1Lang) return null;

  useEffect(() => {
    const fetchBestTranslatedSubs = async () => {
      if (video && !video.subs_l1?.length) {
        const l1Subs = await getBestL1Subs(video.youtube_id, l1Lang.code, l2Lang.code);
        if (video.youtube_id === video.youtube_id) {
          // Instead of directly mutating video, use the appropriate update method
          // from your context or state management solution
          // For example:
          // updateVideoSubtitles(video.youtube_id, l1Subs);
        }
      }
    };

    fetchBestTranslatedSubs();
  }, [video, l1Lang.code, l2Lang.code]);

  useEffect(() => {
    if (!isProUser() && currentVideoIndex >= MAX_FREE_SUBS_SEARCH_RESULTS) {
      setShowProModal(true);
      skipToVideo(previousIndexRef.current); // Revert to previous index
    } else {
      previousIndexRef.current = currentVideoIndex; // Update the previous index
    }
  }, [currentVideoIndex, isProUser, skipToVideo]);

  const closeProModal = useCallback(() => {
    setShowProModal(false);
  }, []);

  const onSelect = useCallback(async (index: number) => {
    refRBSheet.current.close();
    if (!isProUser() && index >= MAX_FREE_SUBS_SEARCH_RESULTS) {
      await timeout(1000);
      setShowProModal(true);
      skipToVideo(previousIndexRef.current); // Revert to previous index
      return;
    }
    updateStartTime(playlist[index].starttime || 0);
    skipToVideo(index);
  }, [isProUser, playlist, skipToVideo, updateStartTime]);

  useEffect(() => {
    const foundLine = syncedLines.find((line) => 
      typeof line.l2Line === 'string' && line.l2Line.includes(term)
    );

    if (foundLine) {
      updateStartTime(foundLine.starttime);
    } else {
      console.log(`Term "${term}" not found in synced lines.`);
    }
  }, [term, syncedLines, updateStartTime]);

  const openModal = useCallback(() => {
    refRBSheet.current.open();
  }, []);

  const screenHeight = Dimensions.get("screen").height;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: "space-between", paddingHorizontal: 26, paddingBottom: 16 }}>
        <ThemedText>
          {t('title.video_count', { index: currentVideoIndex + 1, total: playlist.length })}
        </ThemedText>
        <ThemedButton
          type="ghost"
          size="small"
          title={t('action.list_all')}
          trailingIcon={<Icon name="caret-down" />}
          onPress={openModal}
          style={{ fontWeight: "regular" }}
        />
      </View>
      <VideoWithTranscript isMini={false} showHeader={false} isProCheckEnabled={false} />
      <ThemedRBSheet
        ref={refRBSheet}
        height={screenHeight - 200}
      >
        <SubsSearchResultsList results={playlist} term={term} onSelect={onSelect} />
      </ThemedRBSheet>
      <ProFeatureModal
        visible={showProModal}
        onClose={closeProModal}
        upgradeText={t('msg.upgrade_text')}
      />
    </View>
  );
};