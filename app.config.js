const toolbarVariant = process.env.SAVEAPP_TOOLBAR_MORPH_VARIANT === 'B' ? 'B' : 'A';
const saveAppEasProjectId = process.env.SAVEAPP_EAS_PROJECT_ID;

if (
  saveAppEasProjectId &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saveAppEasProjectId)
) {
  throw new Error('SAVEAPP_EAS_PROJECT_ID must be a UUID for the independently created SaveApp EAS project.');
}

module.exports = {
  expo: {
    name: 'SaveApp',
    slug: 'saveapp',
    scheme: 'saveapp',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#F7F8FC',
    },
    ios: {
      bundleIdentifier: 'com.luanrigatti.saveapp',
      supportsTablet: true,
      deploymentTarget: '16.4',
      infoPlist: {
        // Compatibility-only: the inherited toolbar plugin reads this key.
        StarterToolbarMorphExperimentVariant: toolbarVariant,
      },
    },
    android: {
      package: 'com.luanrigatti.saveapp',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#F7F8FC',
      },
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#F7F8FC',
          image: './assets/splash.png',
          imageWidth: 160,
          resizeMode: 'contain',
        },
      ],
      './plugins/withStarterToolbarSync',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      saveAppDemo: true,
      ...(saveAppEasProjectId ? { eas: { projectId: saveAppEasProjectId } } : {}),
    },
  },
};
