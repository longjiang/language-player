import React from 'react';
import { Slot } from 'expo-router';

/**
 * Settings routes are deep-link targets only (ADR-0042) — the UI itself is the
 * app-wide settings modal (`SettingsDialogProvider` in the root layout), so this
 * layout just hosts the (empty) route screens. The "Settings saved" pill lives
 * in the modal, not here.
 */
export default function SettingsLayout() {
  return <Slot />;
}
