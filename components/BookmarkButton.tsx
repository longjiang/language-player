// @/components/BookmarkButton.tsx
import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ThemedButton } from './ThemedButton';
import { useUserData } from '@/contexts/UserDataContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useLanguage } from '@/contexts/LanguageContext';
import { SavedWordMeta } from '@/contexts/UserDataContext';
import { Context } from '@/contexts/UserDataContext';

interface BookmarkButtonProps {
    wordId: string;
    head: string;
    alternate?: string;
    forms?: string[];
    size?: "title" | "large" | "medium" | "small";
    context?: {
        form: string;
        starttime?: number;
        youtube_id?: string;
        text: string;
    };
}

const BookmarkButton: React.FC<BookmarkButtonProps> = ({ wordId, head, alternate, forms, context, size = "small" }) => {
    const { hasSavedWord, saveWord, removeSavedWord } = useUserData();
    const [isBookmarked, setIsBookmarked] = useState(false);
    const bookmarkColor = useThemeColor({}, 'semanticWarning');  // Set the bookmark color
    const { l2Lang } = useLanguage();  // Assume this hook provides current language code
    if (!l2Lang) return null;

    useEffect(() => {
        // Check the saved status when wordId or l2Lang changes
        setIsBookmarked(hasSavedWord(l2Lang.code, wordId));
    }, [wordId, l2Lang, hasSavedWord]);

    const toggleBookmark = async () => {
        if (isBookmarked) {
            await removeSavedWord(l2Lang.code, wordId);
        } else {
            const currentDatetime = Date.now();
            const wordForms = forms || [head, ...(alternate ? [alternate] : [])];
            const wordContext = context || { form: head, text: '' };
            const word: SavedWordMeta = { id: wordId, forms: wordForms, date: currentDatetime, context: wordContext };
            await saveWord(l2Lang.code, word);
        }
        setIsBookmarked(!isBookmarked);
    };

    return (
        <ThemedButton
            type="ghost"
            size={size}
            style={{ color: bookmarkColor }}
            trailingIcon={
                <Ionicons 
                    name={isBookmarked ? "bookmark" : "bookmark-outline"} 
                    size={24}
                />
            }
            onPress={toggleBookmark}  // Add onPress handler
        />
    );
};

export default BookmarkButton;
