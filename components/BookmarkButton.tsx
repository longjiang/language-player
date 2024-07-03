// @/components/BookmarkButton.tsx
import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ThemedButton } from './ThemedButton';
import { useUserData } from '@/contexts/UserDataContext';  // Import user data context
import { useThemeColor } from '@/hooks/useThemeColor';    // Import the hook for theme colors
import { useLanguage } from '@/contexts/LanguageContext'; // Import the hook for language context

interface BookmarkButtonProps {
    wordId: string;
}

const BookmarkButton: React.FC<BookmarkButtonProps> = ({ wordId }) => {
    const { hasSavedWord } = useUserData();
    const [isBookmarked, setIsBookmarked] = useState(false);
    const bookmarkColor = useThemeColor({}, 'semanticWarning');  // Set the bookmark color
    const { l2Lang } = useLanguage();  // Assume this hook provides current language code

    useEffect(() => {
        // Check the saved status when wordId or l2Lang changes
        setIsBookmarked(hasSavedWord(l2Lang.code, wordId));
    }, [wordId, l2Lang, hasSavedWord]);

    return (
        <ThemedButton
            type="ghost"
            size="small"
            style={{ marginRight: 10, color: bookmarkColor }}
            trailingIcon={
                <Ionicons 
                    name={isBookmarked ? "bookmark" : "bookmark-outline"} 
                    size={24}
                />
            }
        />
    );
};

export default BookmarkButton;
