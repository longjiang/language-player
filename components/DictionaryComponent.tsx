// @/components/DictionaryComponent.tsx
import React, { useState, useEffect } from "react";
import { View, ScrollView } from "react-native";
import { ThemedInput } from "./ThemedInput";
import { ThemedText } from "./ThemedText";
import { useDictionary } from "@/contexts/DictionaryContext";
import { TouchableOpacity } from "react-native-gesture-handler";
import { router } from "expo-router";
import { DictionaryEntry } from "@/src/dictionary-types";
import { debounce } from "lodash";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSettings } from "@/contexts/SettingsContext";
import DefinitionList from "./DefinitionList";
import { Language } from "@/src/languages";
import { Dictionary } from "@/src/dictionary";
import { ThemedButton } from "./ThemedButton";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

export function getDictionaryPlaceholder(
  l2Lang,  // Assuming 'Language' type is properly imported and used in your actual code
  dictionary,  // Assuming 'Dictionary' type is properly imported and used in your actual code
  t
) {
  const altFieldKey = {
    zh: "pinyin",
    ja: "kana",
    ko: "hanja",
  }[l2Lang.code];

  const fields = [
    t("lang." + dictionary?.l1Code),
    altFieldKey ? t("word." + altFieldKey) : null,
    t("lang." + l2Lang.code),
  ].filter(Boolean);  // Filter out falsy values

  const convertArrayToParams = (array) => {
    return array.reduce((acc, item, index) => {
      acc[`param${index + 1}`] = item;
      return acc;
    }, {});
  };

  if (fields.length === 3) return t("placeholder.dict_search_3", convertArrayToParams(fields));
  if (fields.length === 2) return t("placeholder.dict_search_2", convertArrayToParams(fields));
  return t("placeholder.dict_search_1", convertArrayToParams(fields));
}


interface DictionaryComponentProps {
  searchBarSize?: "small" | "medium" | "large";
  showBackIcon?: boolean;
  showSettingsIcon?: boolean;
  setItems?: (items: DictionaryEntry[]) => void;
}

export const DictionaryComponent: React.FC<DictionaryComponentProps> = ({
  searchBarSize = "small",
  showBackIcon = false,
  showSettingsIcon = false,
  setItems = () => {},
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DictionaryEntry[]>([]);
  const { dictionary } = useDictionary();
  const { settings } = useSettings();
  const { l2Lang, t } = useLanguage();
  if (!dictionary) return null;

  if (!l2Lang) return null;

  const headKey =
    l2Lang.code === "zh" && settings.useTraditional ? "alternate" : "head";
  const alternateKey =
    l2Lang.code === "zh" && settings.useTraditional ? "head" : "alternate";

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (dictionary) {
      const searchResults = await dictionary.search(text, 25)
      setResults(searchResults);
      setItems(searchResults);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: 'center' }}>
        {showBackIcon && (
          <ThemedButton
            type="ghost"
            size="medium"
            trailingIcon={<Icon name="chevron-left" />}
            onPress={() => router.navigate("../")}
            style={{ marginRight: 8 }}
          />
        )}
        <ThemedInput
          placeholder={getDictionaryPlaceholder(l2Lang, dictionary, t)}
          value={query}
          onChangeText={debounce(handleSearch, 300)}
          style={{ flex: 1 }}
          size={searchBarSize}
          icon="magnify"
        />
        {showSettingsIcon && (
          <ThemedButton
            type="ghost"
            size="medium"
            trailingIcon={<Icon name="cog-outline" />}
            onPress={() => router.navigate("/settings")}
            style={{ marginLeft: 8 }}
          />
        )}
      </View>
      <ScrollView>
        {results.map((entry, index) => (
          <View key={index} style={{ marginTop: 16 }}>
            <TouchableOpacity
              onPress={() => router.navigate(`/dictionary/word/${entry.id}`)}
            >
              <ThemedText>
                <ThemedText type="title" level={entry.level}>
                  {entry[headKey]}
                </ThemedText>
                <ThemedText type="default" variant="secondary">
                  {" "}
                  {entry[alternateKey]}
                </ThemedText>
                <ThemedText type="defaultBold">
                  {" "}
                  {entry.pronunciation}
                </ThemedText>
              </ThemedText>
              {entry.definitions?.length && (
                <DefinitionList
                  definitions={entry.definitions.slice(0, 2)}
                  type="default"
                />
              )}
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};