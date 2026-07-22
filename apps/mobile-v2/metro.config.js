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
module.exports = withNativeWind(config, { input: './global.css' });
