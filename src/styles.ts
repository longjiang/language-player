import { StyleSheet } from "react-native";

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
