// @/components/ThemedSwitch.tsx
import React from 'react';
import { Switch } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

const ThemedSwitch = ({ isEnabled, toggleSwitch }) => {
  const primaryBrandColor = useThemeColor({}, 'primaryBrand');
  const secondaryBackgroundColor = useThemeColor({}, 'secondaryBackground');
  const primaryTextColor = useThemeColor({}, 'primaryText');

  return (
    <Switch
      trackColor={{ false: secondaryBackgroundColor, true: primaryBrandColor }}
      thumbColor={primaryTextColor}
      ios_backgroundColor={secondaryBackgroundColor}
      onValueChange={toggleSwitch}
      value={isEnabled}
    />
  );
};

export default ThemedSwitch;
