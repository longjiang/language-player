/**
 * Logout guard: warn before logging out while effectively offline.
 *
 * Logout wipes user data and turns Offline Mode off, so on a plane (or any
 * dead-connection situation) the user would be stranded at the login screen
 * until they get network back. Confirm first; only proceed if they insist.
 */

import { Alert } from 'react-native';

type Translate = (key: string) => string;

export function confirmLogoutIfOffline(
  t: Translate,
  effectiveOffline: boolean,
  onConfirm: () => void,
): void {
  if (!effectiveOffline) {
    onConfirm();
    return;
  }
  Alert.alert(
    t('msg.logout_offline_title'),
    t('msg.logout_offline_warning'),
    [
      { text: t('action.cancel'), style: 'cancel' },
      {
        text: t('action.log_out'),
        style: 'destructive',
        onPress: onConfirm,
      },
    ],
  );
}
