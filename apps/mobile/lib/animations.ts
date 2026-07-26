import { FadeIn, FadeOut, SlideInDown, SlideOutDown, SlideInLeft, SlideOutLeft } from 'react-native-reanimated';

/** Dialog overlay fade-in. */
export const overlayEnter = FadeIn.duration(200);

/** Dialog overlay fade-out. */
export const overlayExit = FadeOut.duration(150);

/** Dialog content slide-up from bottom (sheet style). */
export const dialogEnter = SlideInDown.duration(250).springify().damping(25).stiffness(200);

/** Dialog content slide-out to bottom. */
export const dialogExit = SlideOutDown.duration(200).springify().damping(25).stiffness(200);

/** Drawer slide-in from left edge. */
export const drawerEnter = SlideInLeft.duration(250).springify().damping(25).stiffness(200);

/** Drawer slide-out to left edge. */
export const drawerExit = SlideOutLeft.duration(200).springify().damping(25).stiffness(200);
