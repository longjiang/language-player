// @/src/styles.ts

import { StyleSheet } from "react-native";
import { Typography } from "@/constants/Typography";
import { Swatches } from "@/constants/Swatches";

export const popupDictionaryContentStyles = StyleSheet.create({
  container: {},
  entryContainer: {
    marginVertical: 2,
    borderRadius: 8,
    padding: 20,
  },
  entryText: {
    fontWeight: "bold",
  },
  definitionText: {
    fontSize: Typography.fontSize.xsmall,
  },
  saveWordButton: { position: "absolute", top: 16, right: 16 },
  
});

export const popupDictionaryHeaderStyles = StyleSheet.create({
  headerContainer: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  contextText: {
    marginVertical: 4,
    textAlign: "left",
    width: "100%",
  },
  translatedContextText: {
    marginVertical: 4,
    textAlign: "left",
    width: "100%",
  },
  translationText: {
    textAlign: "left",
    width: "100%",
    marginBottom: 20,
  },
  iconStyle: {
    marginHorizontal: 5,
    color: "white", // Adjust based on theme if needed
  },
  contextRow: { flexDirection: "row", alignItems: "flex-start" },
  actionButtons: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  header: { flexDirection: "row", justifyContent: "space-between" },
});


export const settingsStyles = StyleSheet.create({
  container: {
    paddingTop: 20,
    height: '100%',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  subtitle: {
    marginBottom: 10,
  }
});

export const videoControlBarStyles = StyleSheet.create({
  container: {
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  progressBarContainer: {
    width: "100%",
    height: 10,
    borderRadius: 5,
  },
  progressBar: {
    height: "100%",
    width: "50%", // Example progress: 50%
    borderRadius: 5,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    width: "100%",
    marginTop: 10,
  },
});

export const dictionaryEntryStyles = StyleSheet.create({
  header: {
    paddingHorizontal: 26,
  },
  character: {

  },
  spinnerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 100,
  },
  entryContainer: {

  },
  entryHeader: {
    padding: 26
  },
  detailsContainer: {
    borderRadius: 24,
    paddingTop: 26,
    minHeight: 600,
    paddingBottom: 150,
  }
});



export const wordListStyles = StyleSheet.create({
  container: {
    marginBottom: 250,
  },
  item: {
    marginVertical: 8,
  },
  chinese: {},
  pinyin: {
    fontSize: 16,
  },
  english: {
    fontSize: 14,
  }
});

export const selectL1Styles = StyleSheet.create({
  item: {
    padding: 16,
  },
  image: {
    width: "100%",
    marginBottom: 20,
    position: "relative",
    top: -230,
  },
  instructions: {
    marginBottom: 20,
  },
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
});

export const dictionaryLoadingModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  modalContainer: {
    padding: 20,
    borderRadius: 8,
    width: '80%',
    maxHeight: '80%',
  },
  loadingText: {
    marginBottom: 10,
    textAlign: 'center',
  },
  logsContainer: {
    maxHeight: '80%',
  },
  logText: {
    textAlign: 'center',
  },
});

// @/src/styles.ts


export const youtubeVideoCardStyles = StyleSheet.create({
  details: {
  },
  card: {
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.2,
  },
  thumbnailContainer: {
    position: 'relative',
  },
  thumbnail: {
    width: "100%", // Makes the image fill the container
    aspectRatio: 16 / 9, // Maintains a 16:9 aspect ratio
    borderRadius: 8,
  },
  title: {
    marginBottom: 3,
  },
  infoContainer: {
    marginTop: 16,
  },
  badge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#6c757d',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  durationText: {
    color: 'white',
  },
});

export const videoWithTranscriptStyles = StyleSheet.create({
  headerButton: { padding: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  miniPlayerVideoInfo: {
    overflow: "hidden", // Ensures overflow is hidden
  },
  miniPlayerVideoTitle: { fontSize: 14, color: Swatches.neutral[0] },
  miniPlayerVideoSubTitle: { fontSize: 12, color: Swatches.neutral[0] },
  fullPlayerContainer: { paddingVertical: 26 },
  miniPlayerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  miniPlayerVideoContainer: {
    width: 70 * 1.777777777777778,
  },
  miniPlayerControlsContainer: {
    paddingHorizontal: 13,
    flexDirection: "row",
  },
  miniPlayerTextContainer: {
    justifyContent: "center",
    marginLeft: 10,
    width: 160,
  },
});

// @/src/styles.ts

export const proFeatureModalStyles = StyleSheet.create({
  iconStyle: {
    color: "#fff",
  },
  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
  modalContainer: {
    padding: 26,
    alignItems: "center",
    position: 'relative', // Added to allow absolute positioning inside
  },
  modalCloseIcon: {
    position: "absolute",
    top: 16,
    right: 16,
  },
  modalTitle: {
    marginBottom: 10,
  },
  modalText: {
    marginBottom: 28,
    textAlign: 'center',
  },
  upgradeButtonText: {
    color: "#fff",
    fontSize: 16,
  },
});

export const goProStyles = StyleSheet.create({
  paymentButton: { justifyContent: "space-between", marginBottom: 8 },
  subHeader: { fontSize: 18, marginBottom: 20 },
  features: { alignItems: "flex-start", marginBottom: 0 },
  feature: { flexDirection: "row", alignItems: "center", marginBottom: 10, justifyContent: "space-between", width: "100%" },
  featureText: { marginLeft: 10, width: 290 },
  choosePlan: { alignSelf: "center", marginBottom: 20 },
  footerText: { marginTop: 10 },
  rocketImage: { width: 59, height: 51, position: "absolute", top: 20, right: 20 },
});

export const tvShowsStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    marginBottom: 26,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  spinnerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
});

export const showCardStyles = StyleSheet.create({
  card: {
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.2,
  },
  thumbStack: {
    width: "100%", // Makes the image fill the container
    aspectRatio: 16 / 9, // Maintains a 16:9 aspect ratio
    borderRadius: 8,
    backgroundColor: "white",
    // Shadow properties for iOS
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 3.84,
  },
  title: {
    marginBottom: 3,
  },
  infoContainer: {
    marginTop: 16,
  },
});


export const subsSearchResultsListStyles = StyleSheet.create({
  fullContainer: {
    flex: 1,
  },
  sortContainer: {
    marginBottom: 16,
    alignItems: "center",
  },
  sortLabel: {
    fontSize: 16,
  },
  searchInput: {
    marginBottom: 16,
  },
  thumbnail: {
    width: 75,
    aspectRatio: 16 / 9,
    borderRadius: 4,
  },
  item: {
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  line: {
    width: "100%",
    textAlign: "left",
    paddingLeft: 16,
    paddingRight: 50,
  },
  highlight: {
    color: Swatches.warning[500],
    fontFamily: "Nunito_700Bold",
  },
});




export const indexScreenStyles = StyleSheet.create({
  image: {
    width: "100%",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    marginBottom: 20,
  },
});


export const themedScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
  },
  contentContainer: {
    padding: 26,
    textAlign: "left",
    width: "100%", // Full width container
  },
  header: {
    flexDirection: 'row',
    marginBottom: 20,
    marginLeft: -15,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: 'row',
  },
  title: {
    marginLeft: 10,
  },
  image: {
    width: "100%",
    marginBottom: 20,
  },
});



export const registerScreenStyles = StyleSheet.create({
  input: {
      marginBottom: 10,
  },
  textButton: {
      marginTop: 26,
      alignSelf: 'flex-start',
  },
  orText: {
      textAlign: 'center',
      color: 'white',
      marginTop: 20,
      marginBottom: 10,
  },
  socialButton: {
      flex: 1,
      marginHorizontal: 4,
      marginBottom: 10,
  },
  socialButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      columnGap: 10,
  },
});


export const mediaHomeScreenStyles = StyleSheet.create({
  container: {
    padding: 26
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 26,
  },
  logo: {
    width: 32,
    height: 32
  },
  headerTitle: {
    marginLeft: 10,
  },
  iconsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  }
});