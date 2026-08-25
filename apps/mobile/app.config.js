// Dynamic Expo config per SPEC-076: reads the product version and shared
// store build number from packages/shared/src/version.json so there is a
// single source of truth across web, mobile, and the release tooling.
const {
  PRODUCT_VERSION,
  PRODUCT_BUILD_NUMBER,
} = require('../../packages/shared/src/version.json');

module.exports = {
  expo: {
    name: 'Language Player 3',
    slug: 'language-player',
    version: PRODUCT_VERSION,
    orientation: 'default',
    icon: './assets/icon.png',
    scheme: 'languageplayer',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#1b1e3c',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'ca.zerotohero.go',
      buildNumber: String(PRODUCT_BUILD_NUMBER),
      infoPlist: {
        // The app only uses standard, exempt encryption (TLS/HTTPS through
        // Apple frameworks). ITSAppUsesNonExemptEncryption=false tells App
        // Store Connect this, so TestFlight skips the export-compliance
        // prompt ("Missing Compliance") and builds become available
        // immediately instead of waiting for a manual answer.
        ITSAppUsesNonExemptEncryption: false,
        // OS file open ("Open in Language Player…" from Files): declare the
        // document types each reader handles — media, ebooks/pdf, text/notes,
        // images. Files arrive through expo-linking (file:// URL) and are
        // routed by lib/file-open.ts.
        CFBundleDocumentTypes: [
          {
            CFBundleTypeName: 'Audio',
            CFBundleTypeRole: 'Viewer',
            LSHandlerRank: 'Alternate',
            LSItemContentTypes: ['public.audio'],
          },
          {
            CFBundleTypeName: 'Video',
            CFBundleTypeRole: 'Viewer',
            LSHandlerRank: 'Alternate',
            LSItemContentTypes: ['public.movie'],
          },
          {
            CFBundleTypeName: 'Image',
            CFBundleTypeRole: 'Viewer',
            LSHandlerRank: 'Alternate',
            LSItemContentTypes: ['public.image'],
          },
          {
            CFBundleTypeName: 'Ebook',
            CFBundleTypeRole: 'Viewer',
            LSHandlerRank: 'Alternate',
            LSItemContentTypes: ['org.idpf.epub-container', 'com.adobe.pdf'],
          },
          {
            CFBundleTypeName: 'Text',
            CFBundleTypeRole: 'Viewer',
            LSHandlerRank: 'Alternate',
            LSItemContentTypes: ['public.text', 'public.plain-text', 'net.daringfireball.markdown'],
          },
        ],
      },
      associatedDomains: [
        'applinks:languageplayer.io',
        'applinks:language-player.netlify.app',
      ],
    },
    android: {
      versionCode: PRODUCT_BUILD_NUMBER,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1b1e3c',
      },
      package: 'ca.zerotohero.go',
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            { scheme: 'https', host: 'languageplayer.io', pathPrefix: '/' },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'language-player.netlify.app',
              pathPrefix: '/',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
        // OS file open: Android VIEW intents by MIME type (routed by
        // lib/file-open.ts through expo-linking).
        { action: 'VIEW', data: [{ mimeType: 'audio/*' }], category: ['BROWSABLE', 'DEFAULT'] },
        { action: 'VIEW', data: [{ mimeType: 'video/*' }], category: ['BROWSABLE', 'DEFAULT'] },
        { action: 'VIEW', data: [{ mimeType: 'image/*' }], category: ['BROWSABLE', 'DEFAULT'] },
        { action: 'VIEW', data: [{ mimeType: 'text/plain' }], category: ['BROWSABLE', 'DEFAULT'] },
        { action: 'VIEW', data: [{ mimeType: 'text/markdown' }], category: ['BROWSABLE', 'DEFAULT'] },
        { action: 'VIEW', data: [{ mimeType: 'application/pdf' }], category: ['BROWSABLE', 'DEFAULT'] },
        { action: 'VIEW', data: [{ mimeType: 'application/epub+zip' }], category: ['BROWSABLE', 'DEFAULT'] },
      ],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-font',
      'expo-localization',
      'expo-video',
      'expo-sharing',
      'expo-sqlite',
      'expo-splash-screen',
      'expo-web-browser',
    ],
    experiments: {
      typedRoutes: true,
    },
  },
};
