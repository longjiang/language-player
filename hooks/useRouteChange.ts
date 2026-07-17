// useRouteChange.ts
import { useEffect, useRef } from 'react';
import { NavigationContainerRef } from '@react-navigation/native';

export const useRouteChange = (
  navigation: NavigationContainerRef<ReactNavigation.RootParamList>,
  callback: (routeName: string | undefined, previousRouteName: string | undefined) => void
) => {
  const routeNameRef = useRef<string | undefined>();

  useEffect(() => {
    const unsubscribe = navigation.addListener('state', () => {
      const previousRouteName = routeNameRef.current;
      // React Navigation v7: use getState() instead of getCurrentRoute()
      const state = navigation.getState();
      const currentRouteName = state?.routes[state.index ?? 0]?.name;

      if (previousRouteName !== currentRouteName) {
        callback(previousRouteName, currentRouteName);
      }

      routeNameRef.current = currentRouteName;
    });

    return unsubscribe;
  }, [navigation, callback]);
};