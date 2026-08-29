const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// 0. Fix monorepo hoisting: expo/AppEntry.js resolves ../../App to the wrong place.
//    Force the entry point to use expo-router, which handles the project root correctly.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '../../App' || moduleName === './App') {
    return {
      filePath: path.resolve(projectRoot, 'App.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// 1. Watch the monorepo packages folder so changes trigger rebuilds
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(workspaceRoot, 'packages'),
];

// 2. Allow Metro to resolve modules from the monorepo root's node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Ensure Metro transpiles the shared packages (they ship raw TypeScript)
const blockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [config.resolver.blockList];

config.resolver.blockList = blockList.filter(
  (pattern) => !pattern.toString().includes('packages'),
);

// 4. NativeWind integration
// `inlineRem: 16` matches web: NativeWind's default inlines `rem` units as
// 1rem = 14 on native (RN's default Text size), so e.g. text-sm (0.875rem)
// compiled to 12.25 instead of web's 14. Setting it to 16 makes every
// rem-based class resolve to the same px on mobile as on web.
module.exports = withNativeWind(config, {
  input: './global.css',
  inlineRem: 16,
});
