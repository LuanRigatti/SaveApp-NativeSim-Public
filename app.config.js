const toolbarVariant = process.env.SAVEAPP_TOOLBAR_MORPH_VARIANT === 'B' ? 'B' : 'A';
const saveAppEasProjectId = 'dfbb0a6a-a41f-4b57-a956-583264e6e162';
const saveAppEasProjectIdOverride = process.env.SAVEAPP_EAS_PROJECT_ID;

if (saveAppEasProjectIdOverride && saveAppEasProjectIdOverride !== saveAppEasProjectId) {
  throw new Error('SAVEAPP_EAS_PROJECT_ID must match the permanently linked SaveApp EAS project.');
}

module.exports = {
  expo: {
    name: 'SaveApp',
    slug: 'saveapp',
    owner: 'luanrigattis1-team',
    scheme: 'saveapp',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
    },
    ios: {
      bundleIdentifier: 'com.luanrigatti.saveapp',
      supportsTablet: true,
      deploymentTarget: '16.4',
      icon: {
        light: './assets/icon.png',
        dark: './assets/icon-dark.png',
      },
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
      'expo-asset',
      // Expo composes same-type mods in reverse declaration order. The Quick Save
      // Podfile mod must run after expo-widgets has installed its post_install hook.
      './plugins/withSaveLinkQuickSave',
      [
        'expo-widgets',
        {
          groupIdentifier: 'group.com.luanrigatti.saveapp',
          enablePushNotifications: false,
          frequentUpdates: false,
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'O SaveApp acessa fotos e vídeos selecionados para salvá-los na galeria local do app.',
          cameraPermission: false,
          microphonePermission: false,
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#FFFFFF',
          image: './assets/splash.png',
          dark: {
            image: './assets/splash-dark.png',
            backgroundColor: '#000000',
          },
          imageWidth: 160,
          resizeMode: 'contain',
        },
      ],
      [
        'expo-local-authentication',
        {
          faceIDPermission: 'O SaveApp utiliza o Face ID para proteger o acesso às suas pastas privadas.',
        },
      ],
      './plugins/withStarterToolbarSync',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      saveAppDemo: true,
      eas: { projectId: saveAppEasProjectId },
    },
  },
};
