import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import { ThemedText } from './ThemedText';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export const YouTubeVideoCard = ({ video, style }) => {
  // Convert ISO 8601 duration to a readable format
  const formatDuration = (duration) => {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = (parseInt(match[1]) || 0);
    const minutes = (parseInt(match[2]) || 0);
    const seconds = (parseInt(match[3]) || 0);
    return `${hours ? `${hours}:` : ''}${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
  };

  // Calculating width and height based on screen width for 16:9 aspect ratio
  const screenWidth = Dimensions.get('window').width;
  const thumbnailWidth = screenWidth - 20; // considering margin
  const thumbnailHeight = thumbnailWidth * 9 / 16; // 16:9 aspect ratio

  return (
    <View style={[styles.card, style]}>
      <Image
        source={{ uri: `https://img.youtube.com/vi/${video.youtube_id}/0.jpg` }}
        style={[styles.thumbnail]}
      />
      <View style={styles.infoContainer}>
        <ThemedText style={styles.title} type="defaultBold">{video.title}</ThemedText>
        <ThemedText style={styles.details} type="small" variant="secondary">
          {`${video.views.toLocaleString()} Views / ${formatDuration(video.duration)} / ${video.locale}`}
        </ThemedText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.2,
  },
  thumbnail: {
    width: '100%', // Makes the image fill the container
    aspectRatio: 16 / 9, // Maintains a 16:9 aspect ratio
    borderRadius: 8
  },
  title: {
    marginBottom: 3,
  },
  infoContainer: {
    marginTop: 16,
  },
});

export default YouTubeVideoCard;
