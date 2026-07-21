const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// 1. Watch the monorepo packages folder so changes trigger rebuilds
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(workspaceRoot, 'packages'),
];

// 2. Allow Metro to resolve modules from the monorepo root's node_modules
//    (needed for @langplayer/api-client's dependency on axios if not in GO's node_modules)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Ensure Metro transpiles the shared packages (they ship raw TypeScript)
//    Expo SDK 57's getDefaultConfig already handles this via the
//    resolver.unstable_enablePackageExports + sourceExts, but we also
//    need to make sure files outside the project root are included.
//    The watchFolders above handles watching; the resolver.blockList
//    must not exclude the packages folder.
const blockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [config.resolver.blockList];

// Remove any blockList entry that would exclude the packages directory
config.resolver.blockList = blockList.filter(
  (pattern) => !pattern.toString().includes('packages')
);

module.exports = config;
