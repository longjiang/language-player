// @/components/SubsSearchResults.tsx

import React, { useRef, useState, useEffect, useCallback } from "react";
import { View, Text, Dimensions } from "react-native";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { VideoWithTranscript } from "./VideoWithTranscript";
import { ThemedText } from "./ThemedText";
import { ThemedButton } from "./ThemedButton";
import Icon from "react-native-vector-icons/FontAwesome";
import { useThemeColor } from "@/hooks/useThemeColor";
import RBSheet from "react-native-raw-bottom-sheet";
import { SubsSearchResultsList } from "./SubsSearchResultsList";
import { ThemedRBSheet } from "./ThemedRBSheet";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { ProFeatureModal } from "./ProFeatureModal";

export const SubsSearchResults = ({ term }: { term: string }) => {
  const { video, syncedLines, playlist, updateStartTime, currentVideoIndex, skipToVideo } =
    useVideoWithTranscriptContext();
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const secondaryBackgroundColor = useThemeColor({}, "secondaryBackground");
  const refRBSheet = useRef();

  const { isProUser } = useSubscription();
  const [showProModal, setShowProModal] = useState(false);
  const previousIndexRef = useRef(currentVideoIndex);

  useEffect(() => {
    if (!isProUser() && currentVideoIndex > 2) {
      setShowProModal(true);
      skipToVideo(previousIndexRef.current); // Revert to previous index
    } else {
      previousIndexRef.current = currentVideoIndex; // Update the previous index
    }
  }, [currentVideoIndex, isProUser, skipToVideo]);

  const closeProModal = useCallback(() => {
    setShowProModal(false);
  }, []);

  const onSelect = (index: number) => {
    if (!isProUser() && index > 2) {
      setShowProModal(true);
      skipToVideo(previousIndexRef.current); // Revert to previous index
      return;
    }
    updateStartTime(playlist[index].starttime || 0);
    skipToVideo(index);
    refRBSheet.current.close();
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
          {currentVideoIndex + 1} of {playlist.length}
        </ThemedText>
        <ThemedButton
          type="ghost"
          size="small"
          title="List All"
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
        upgradeText="Upgrade to Pro to access more videos!"
      />
    </View>
  );
};
