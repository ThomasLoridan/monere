import type { CapacitorConfig } from '@capacitor/cli';

// Native shells (iOS/Android) — run `npm run cap:add:ios` / `cap:add:android`
// then `npm run cap:sync`. The webDir is the production Vite build.
const config: CapacitorConfig = {
  appId: 'app.monere.mobile',
  appName: 'Monere',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
