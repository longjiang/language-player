import React, { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { PdfReaderPanel } from '@/components/reader/PdfReaderPanel';
import { ICON_MUTED } from '@/lib/theme-colors';
import { ArrowLeft, FileText } from 'lucide-react-native';

/**
 * Standalone PDF reader — open a PDF from the document picker and read its
 * pages via DeepSeek Vision (rendered by the native @dariyd/pdf-page-image
 * TurboModule; no pdf.js WebView, no assetExts change).
 */
export default function PdfReaderScreen() {
  const t = useT();
  const router = useRouter();
  const [pdf, setPdf] = useState<{ uri: string; fileName: string } | null>(null);

  const choosePdf = useCallback(async () => {
    const pick = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (pick.canceled || !pick.assets?.[0]) return;
    const asset = pick.assets[0];
    setPdf({ uri: asset.uri, fileName: asset.name ?? 'document.pdf' });
  }, []);

  const header = (
    <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
      <Pressable
        onPress={() => router.back()}
        className="rounded-md p-1.5 active:bg-muted"
        accessibilityRole="button"
        accessibilityLabel={t('action.back')}
      >
        <ArrowLeft size={20} color={ICON_MUTED} />
      </Pressable>
      <Text numberOfLines={1} className="flex-1 text-lg font-bold text-foreground">
        {t('title.pdf_reader')}
      </Text>
    </View>
  );

  if (!pdf) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="flex-1 items-center justify-center gap-4 px-8 py-10">
          <FileText size={44} color={ICON_MUTED} />
          <Text className="text-center text-sm font-medium text-foreground">
            {t('msg.pdf_open_prompt')}
          </Text>
          <Pressable
            onPress={() => void choosePdf()}
            className="flex-row items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel={t('action.select_files')}
          >
            <Text className="text-xs font-medium text-primary-foreground">{t('action.select_files')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <PdfReaderPanel uri={pdf.uri} fileName={pdf.fileName} onClose={() => setPdf(null)} />
    </View>
  );
}
