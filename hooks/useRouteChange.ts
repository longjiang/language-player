// useRouteChange.ts
import { useEffect, useRef } from 'react';
import { NavigationContainerRef } from '@react-navigation/native';

export const useRouteChange = (
  navigation: NavigationContainerRef<ReactNavigation.RootParamList>,
  callback: () => void
) => {
  const routeNameRef = useRef<string | undefined>();

  useEffect(() => {
    const unsubscribe = navigation.addListener('state', () => {
      const previousRouteName = routeNameRef.current;
      const currentRouteName = navigation.getCurrentRoute()?.name;

      if (previousRouteName !== currentRouteName) {
        callback();
      }

      routeNameRef.current = currentRouteName;
    });

    return unsubscribe;
  }, [navigation, callback]);
};