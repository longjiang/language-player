import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { type IconProps } from 'react-native-vector-icons/Icon';
import { type ComponentProps } from 'react';

export function TabBarIcon({ style, ...rest }: IconProps<ComponentProps<typeof Icon>['name']>) {
  return <Icon size={28} style={[{ marginBottom: -3 }, style]} {...rest} />;
}
