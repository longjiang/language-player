import React from 'react';
import { Text, View } from 'react-native';
import type { DialogueStimulus } from '@langplayer/textbooks';
import { TokenizedText } from '@/components/TokenizedText';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Speaker-labelled L2 lines carrying inline blanks.
 *
 * Each line is its own `TokenizedText`, which is what keeps blanks interactive
 * here: a whole dialogue in one tokenized block would take the plain inline path
 * on this platform, where a blank can only render read-only.
 *
 * The speaker label is printed only when it changes, so a back-and-forth reads
 * as a conversation rather than a repeated name column.
 */
export function DialoguePassage({ dialogue }: { dialogue: DialogueStimulus }) {
  const { l2Lang } = useLanguage();

  return (
    <View className="gap-2">
      {dialogue.lines.map((line, i) => {
        const previous = dialogue.lines[i - 1]?.speaker;
        const showSpeaker = Boolean(line.speaker) && line.speaker !== previous;
        return (
          <View key={i} className="flex-row gap-2">
            <Text className="w-16 pt-0.5 text-sm font-medium text-muted-foreground">
              {showSpeaker ? line.speaker : ''}
            </Text>
            <View className="min-w-0 flex-1">
              <TokenizedText text={line.text} l2Code={l2Lang.code} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
