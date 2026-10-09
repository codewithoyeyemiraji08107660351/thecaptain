import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thecaptain.app',
  appName: 'The Captain',
  webDir: 'dist',

  ios: {
    backgroundColor: '#0f1015',
  },

  android:{
    allowMixedContent: true,
  },

  plugins: {
    "SplashScreen": {
      "launchShowDuration": 2000,
      "launchAutoHide": true,
      "backgroundColor": "#0a0a1a",
      "androidSplashResourceName": "splash",
      "androidScaleType": "CENTER_CROP",
      "showSpinner": false,
      "splashFullScreen": true,
      "splashImmersive": true
    }
  }
};

export default config;
