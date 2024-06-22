import React, { useState, useEffect, useCallback } from "react";
import { View, Text, SafeAreaView, Dimensions, BackHandler } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { useRoute } from '@react-navigation/native';

const screenHeight = Dimensions.get('window').height;
const screenWidth = Dimensions.get('window').width;

const YouTubeVideoScreen = () => {
  const params = useLocalSearchParams();
  const youtubeId = params?.youtube_id;
  const [playerMode, setPlayerMode] = useState("full"); // 'full', 'mini', 'closed'

  const navigation = useNavigation();
  const route = useRoute();  // This hook fetches information about the current route


  const position = useSharedValue({ x: 0, y: 0 });
  const size = useSharedValue({ width: screenWidth, height: screenHeight });

  const minimizePlayer = () => {
    size.value = withSpring({ width: screenWidth / 2, height: screenHeight / 4 });
    position.value = withSpring({ x: screenWidth / 2, y: screenHeight - (screenHeight / 4) });
    setPlayerMode('mini');
  };

  // Prevent the screen from being removed when the player mode is 'full'
  useFocusEffect(
    useCallback(() => {
      // Log route information when the component is focused
      console.log(`Hello, I am focused! Current route is: ${route.name}`);
      setPlayerMode('full');

      return () => {
        // This code runs when the component loses focus
        console.log(`This route '${route.name}' is now unfocused.`);
        if (route.name === 'video/youtube/[youtube_id]' && playerMode === 'full') {
          minimizePlayer();
        }
      };
    }, [route])  // Include `route` in the dependency array if you need to react to changes in the route
  );

  return (
    <View>
      <SafeAreaView
        style={{ flexDirection: "row", justifyContent: "space-between" }}
      >
        <View>
          <ThemedButton
            type="ghost"
            trailingIcon={<Icon name="chevron-down" />}
            onPress={() => router.push("../")}
          />
        </View>
        <View style={{ flexDirection: "row" }}>
          <ThemedButton
            type="ghost"
            trailingIcon={<Icon name="text-long" />}
            onPress={() => router.push("/(tabs)/(media)/youtube-video")}
          />
          <ThemedButton
            type="ghost"
            trailingIcon={<Icon name="cog-outline" />}
            onPress={() => router.push("/(tabs)/(media)/youtube-video")}
          />
        </View>
      </SafeAreaView>
      <View>
        <YouTubeVideo youtubeId={youtubeId} />
      </View>
    </View>
  );
};

export default YouTubeVideoScreen;
