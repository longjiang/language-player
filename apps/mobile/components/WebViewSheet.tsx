import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  Animated,
  Modal,
  useWindowDimensions,
  Share,
  ActivityIndicator,
} from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExternalLink, Share2, X } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';

interface WebViewSheetProps {
  visible: boolean;
  url: string;
  title?: string;
  onClose: () => void;
}

/**
 * A bottom sheet that opens a URL in an in-app WebView with action buttons
 * for sharing and opening in the system browser.
 */
export function WebViewSheet({ visible, url, title, onClose }: WebViewSheetProps) {
  const t = useT();
  const { height: screenHeight } = useWindowDimensions();
  const { isMd } = useResponsive();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setLoadError(false);
      Animated.parallel([
        ...(isMd ? [] : [Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 30,
          stiffness: 300,
          mass: 0.8,
        })]),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        ...(isMd ? [] : [Animated.timing(slideAnim, {
          toValue: screenHeight,
          duration: 200,
          useNativeDriver: true,
        })]),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, screenHeight, slideAnim, overlayOpacity, isMd]);

  const handleShare = async () => {
    try {
      await Share.share({ url, title: title ?? url });
    } catch {
      // user cancelled
    }
  };

  const handleOpenInBrowser = () => {
    // Close the sheet first, then open
    onClose();
    setTimeout(() => {
      // Use the polyfill approach — expo-linking's openURL is the same as Linking.openURL
      const { Linking } = require('react-native');
      Linking.openURL(url);
    }, 300);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Overlay */}
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        className="absolute inset-0 z-50"
        style={{ opacity: overlayOpacity }}
      >
        <Pressable className="absolute inset-0 bg-black/40" onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        pointerEvents={visible ? 'box-none' : 'none'}
        className={isMd ? 'absolute inset-0 z-50 items-center justify-center px-4' : 'absolute inset-x-0 bottom-0 z-50'}
        style={{ transform: isMd ? undefined : [{ translateY: slideAnim }] }}
      >
        <View
          className={isMd ? 'w-full max-w-2xl overflow-hidden rounded-xl bg-background' : 'rounded-t-xl bg-background overflow-hidden'}
          style={{ maxHeight: screenHeight * 0.85 }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <View className="flex-1 mr-2">
              {title ? (
                <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={handleShare}
                className="rounded-full bg-muted p-2 active:opacity-70"
                hitSlop={8}
              >
                <Share2 size={16} color={ICON_MUTED} />
              </Pressable>
              <Pressable
                onPress={handleOpenInBrowser}
                className="rounded-full bg-muted p-2 active:opacity-70"
                hitSlop={8}
              >
                <ExternalLink size={16} color={ICON_MUTED} />
              </Pressable>
              <Pressable
                onPress={onClose}
                className="rounded-full bg-muted p-2 active:opacity-70"
                hitSlop={8}
              >
                <X size={16} color={ICON_MUTED} />
              </Pressable>
            </View>
          </View>

          {/* WebView */}
          {visible && (
            <View style={{ height: screenHeight * 0.75 }}>
              {loading && !loadError && (
                <View className="absolute inset-0 items-center justify-center z-10">
                  <ActivityIndicator size="large" color={ICON_MUTED} />
                </View>
              )}
              {loadError ? (
                <View className="flex-1 items-center justify-center px-6">
                  <Text className="text-sm text-muted-foreground text-center">
                    {t('msg.load_failed')}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setLoadError(false);
                      setLoading(true);
                    }}
                    className="mt-3 rounded-lg bg-primary px-4 py-2"
                  >
                    <Text className="text-sm font-medium text-primary-foreground">
                      {t('action.retry')}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <WebView
                  source={{ uri: url }}
                  className="flex-1 bg-background"
                  onLoadEnd={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setLoadError(true);
                  }}
                  javaScriptEnabled
                  domStorageEnabled
                  startInLoadingState
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction
                />
              )}
            </View>
          )}

          {/* Bottom safe area spacer */}
          <View style={{ height: insets.bottom }} />
        </View>
      </Animated.View>
    </Modal>
  );
}
