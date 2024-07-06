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
import { getBestTranslatedSubs } from "@/src/subs";

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
  const l1Locales = languages.getLocales(l1Lang);

  useEffect(() => {
    const fetchBestTranslatedSubs = async () => {
      if (video && !video.subs_l1?.length) {
        const l1Subs = await getBestTranslatedSubs(video.youtube_id, l2Lang.code, l1Locales);
        if (video.youtube_id === video.youtube_id) {
          video.subs_l1 = l1Subs || [];
        }
      }
    };

    fetchBestTranslatedSubs();
  }, [currentVideoIndex]);

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

  const onSelect = async (index: number) => {
    refRBSheet.current.close();
    if (!isProUser() && index >= MAX_FREE_SUBS_SEARCH_RESULTS) {
      await timeout(1000);
      setShowProModal(true);
      skipToVideo(previousIndexRef.current); // Revert to previous index
      return;
    }
    updateStartTime(playlist[index].starttime || 0);
    skipToVideo(index);
  };

  syncedLines.find((line) => {
    if (typeof line.l2Line === 'string' && line.l2Line.includes(term)) {
      const foundLine = syncedLines.find((item) => item.l2Line && item.l2Line?.includes(term));

      if (foundLine) {
        const { starttime, l1Line, l2Line } = foundLine;
        updateStartTime(starttime);
      } else {
        console.log(`Term "${term}" not found in synced lines.`);
      }
    }
  });

  const openModal = () => {
    refRBSheet.current.open();
  };

  const screenHeight = Dimensions.get("screen").height;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: "space-between", paddingHorizontal: 26, paddingBottom: 16 }}>
        <ThemedText>
          {currentVideoIndex + 1} {t('of')} {playlist.length}
        </ThemedText>
        <ThemedButton
          type="ghost"
          size="small"
          title={t('list_all')}
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
        upgradeText={t('upgrade_text')}
      />
    </View>
  );
};