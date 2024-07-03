// @/components/BookmarkButton.tsx
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ThemedButton } from './ThemedButton';

interface BookmarkButtonProps {
    bookmarkColor: string;
}

const BookmarkButton: React.FC<BookmarkButtonProps> = ({ bookmarkColor }) => {
    return (
        <ThemedButton
            type="ghost"
            size="small"
            style={{ marginRight: 10, color: bookmarkColor }}
            trailingIcon={<Ionicons name="bookmark" size={24} />}
        />
    );
};

export default BookmarkButton;
