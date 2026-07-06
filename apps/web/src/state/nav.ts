export type ScreenName =
  | 'onboarding'
  | 'login'
  | 'home'
  | 'watch'
  | 'calendar'
  | 'smart'
  | 'investor'
  | 'settings'
  | 'alerts'
  | 'notifications'
  | 'account'
  | 'pricing'
  | 'billing'
  | 'stock'
  | 'market'
  | 'earnings'
  | 'simulator'
  | 'search'
  | 'news'
  | 'admin';

export interface Screen {
  name: ScreenName;
  params: Record<string, string>;
}

export type Nav = (name: ScreenName, params?: Record<string, string>) => void;

export interface ScreenProps {
  nav: Nav;
  back: () => void;
  params: Record<string, string>;
}
