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
