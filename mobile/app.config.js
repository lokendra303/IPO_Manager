/** @type {import('expo/config').ExpoConfig} */
export default ({ config }) => ({
  ...config,
  name: 'IPO Team Manager',
  slug: 'ipo-team-manager',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'ipo-manager',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.ipoteam.manager',
  },
  android: {
    package: 'com.ipoteam.manager',
    usesCleartextTraffic: true,
    adaptiveIcon: {
      backgroundColor: '#0f172a',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: ['expo-router', 'expo-sharing'],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ||
      'https://ipo-manager-one.vercel.app/api',
  },
});
