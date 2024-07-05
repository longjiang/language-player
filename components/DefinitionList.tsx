import React from 'react';
import { View } from 'react-native';
import { ThemedText } from './ThemedText'; // Assuming ThemedText is in the same directory

interface DefinitionListProps {
  definitions: string[];
  type?: 'default' | 'defaultBold' | 'link' | 'linkBold' | 'large' | 'subtitle' | 'xlarge' | 'title' | 'xxlarge';
}

const DefinitionList: React.FC<DefinitionListProps> = ({ definitions, type = "default" }) => {
  if (!definitions || definitions.length === 0) {
    return null;
  }

  return (
    <View>
      <ThemedText type={type} style={{ marginBottom: 8 }}>
        {definitions.map((definition, index) => (
          <React.Fragment key={index}>
            {index > 0 && '; '}
            {definition}
          </React.Fragment>
        ))}
      </ThemedText>
    </View>
  );
};

export default DefinitionList;