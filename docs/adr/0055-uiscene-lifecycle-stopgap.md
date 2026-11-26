# ADR-0055 — The UIScene lifecycle stopgap for iOS 27 development builds

- **Status**: accepted (temporary)
- **Date**: 2026-11-26
- **Supersedes**: —
- **Related**: [ARCH-028](../arch/028-local-development-runbook.md), [SPEC-111](../specs/111-task-data-sync-and-recordings.md)

## Context

Xcode 27 builds with the iOS 27 SDK, and UIKit now refuses to launch an app that has
not adopted the scene-based life cycle. React Native's template — and therefore Expo
SDK 57's `AppDelegate` — creates its window in
`application(_:didFinishLaunchingWithOptions:)` and declares no `UIApplicationSceneManifest`,
so a Debug build installs, launches, and dies before the first frame.

Observed on the iPad Air M4 (iPadOS 27.2.1) with dev build 46:

- the app vanished from `devicectl … info processes` within seconds;
- `devicectl … process launch --console` reported **signal 5**;
- the crash report (pulled from `systemCrashLogs`) showed
  `EXC_BREAKPOINT (SIGTRAP)` in
  `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke`.

Nothing in the JS bundle logs, so this looks like a broken native module; it is not.

## Decision

Add `react-native-uiscene-bridge` (MIT, a Swift pod, no JS API and no config plugin).
It installs a scene configuration only when the app declares no scene, hands the app
delegate's existing window to the scene, and forwards links, quick actions and
foreground/background transitions to the app delegate methods that used to receive them.

Rebuild the dev app with it (pods are re-installed, then `scripts/dev-build.mjs
ios-device`).

## Consequences

- iOS 27 development builds launch again; Android is unaffected.
- This is a **stopgap**, not scene adoption. It must be removed when the app moves to
  React Native 0.88+ / Expo SDK 58, which ship real scene support: the pod then compiles
  to nothing (the app declares a scene) and can be uninstalled.
- It is tested by its author in the simulator only, and supports one window — iPad
  multi-window remains unsupported until the app adopts scenes itself.
- Universal links and Handoff use the same forwarding as custom-scheme links but were
  not tested by the package's author; our own deep links go through `expo-linking`,
  which the bridge feeds.

## Alternatives considered

1. **Write the scene delegate ourselves.** The correct end state, but it means patching
   the generated `ios/` project (AppDelegate, a new `SceneDelegate.swift`, the pbxproj)
   through a config plugin, and re-verifying every deep-link path. Larger than the
   problem, and duplicated work once RN 0.88 lands.
2. **Build with Xcode 26.** Not available on this machine, and the SDK requirement is
   tied to the toolchain, not to a build setting.
3. **Ship nothing.** The capture feature cannot be exercised on a device without a
   launchable build, so this blocked verification of SPEC-111 Phase 3.
