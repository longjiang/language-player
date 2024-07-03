import { StyleSheet } from "react-native";
import { Typography } from "@/constants/Typography";

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
  actionButtons: { flexDirection: "row", justifyContent: "space-between" },
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
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