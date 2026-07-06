/* App shell — stack navigation, auth gating, responsive shells
   (phone fullscreen / tablet rail / native desktop sidebar) */
import React from 'react';
import { TabBar, NotificationBanner, PaywallModal } from './components/ui';
import { useAuth } from './auth/AuthContext';
import { useNotifications } from './data/hooks';
import { DesktopNativeShell, TabletShell } from './shell/DesktopShell';
import { OnboardingScreen, LoginScreen } from './screens/auth';
import { HomeScreen } from './screens/home';
import { WatchScreen } from './screens/watch';
import { CalendarScreen } from './screens/calendar';
import { SettingsScreen } from './screens/settings';
import { SearchScreen } from './screens/search';
import { AlertsScreen } from './screens/alerts';
import { NotificationsScreen } from './screens/notifications';
import { AccountScreen } from './screens/account';
import { StockDetailScreen } from './screens/stock';
import { EarningsDetailScreen } from './screens/earnings';
import { SimulatorScreen } from './screens/simulator';
import { MarketDetailScreen } from './screens/market';
import { SmartMoneyScreen } from './screens/smart';
import { InvestorDetailScreen } from './screens/investor';
import { NewsScreen } from './screens/news';
import { PricingScreen, BillingScreen } from './screens/pricing';
import { AdminScreen } from './admin/AdminScreen';
import type { Screen, ScreenName, Nav } from './state/nav';
import type { Notification } from './lib/types';

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [vp, setVp] = React.useState(read);
  React.useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const isPhone = vp.w <= 640 || (coarse && vp.w < 820);
  const isTablet = !isPhone && coarse && vp.w > vp.h && vp.w >= 820 && vp.w <= 1366;
  return { isPhone, isTablet };
}

export default function App() {
  const { user, loading } = useAuth();
  const { isPhone, isTablet } = useViewport();

  const initialScreen: Screen =
    window.location.hash === '#/admin'
      ? { name: 'admin', params: {} }
      : { name: 'onboarding', params: {} };
  const [screen, setScreen] = React.useState<Screen>(initialScreen);
  const [history, setHistory] = React.useState<Screen[]>([]);
  const [paywallOpen, setPaywallOpen] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.dataset.device = isPhone ? 'phone' : isTablet ? 'tablet' : 'native';
  }, [isPhone, isTablet]);

  const nav = React.useCallback<Nav>(
    (name, params = {}) => {
      setHistory((h) => [...h, screen]);
      setScreen({ name, params });
    },
    [screen],
  );

  const back = React.useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) {
        setScreen({ name: 'home', params: {} });
        return [];
      }
      const prev = h[h.length - 1]!;
      setScreen(prev);
      return h.slice(0, -1);
    });
  }, []);

  const goTab = React.useCallback((id: string) => {
    setHistory([]);
    setScreen({ name: id as ScreenName, params: {} });
  }, []);

  // Auth gating: once authenticated, leave the auth flow; on logout, return to it
  const isAuthScreen = screen.name === 'onboarding' || screen.name === 'login';
  React.useEffect(() => {
    if (user && isAuthScreen) {
      setHistory([]);
      setScreen(
        window.location.hash === '#/admin' && user.role === 'admin'
          ? { name: 'admin', params: {} }
          : { name: 'home', params: {} },
      );
    }
    if (!user && !loading && !isAuthScreen) {
      setHistory([]);
      setScreen({ name: 'onboarding', params: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  // Notification banner: surfaces newly arrived server notifications
  const { data: notifData } = useNotifications(Boolean(user));
  const [toast, setToast] = React.useState<Notification | null>(null);
  const seenIds = React.useRef<Set<string> | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    const list = notifData?.notifications ?? [];
    if (!user || list.length === 0) return;
    if (seenIds.current === null) {
      seenIds.current = new Set(list.map((n) => n.id));
      return;
    }
    const fresh = list.find((n) => !seenIds.current!.has(n.id) && !n.read);
    list.forEach((n) => seenIds.current!.add(n.id));
    if (fresh) {
      setToast(fresh);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 4200);
    }
  }, [notifData, user]);

  const dismissToast = React.useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  const openToast = React.useCallback(() => {
    if (!toast) return;
    dismissToast();
    if (toast.navScreen)
      nav(toast.navScreen as ScreenName, toast.navParams as Record<string, string>);
    else nav('notifications');
  }, [toast, nav, dismissToast]);

  const openPaywall = React.useCallback(() => setPaywallOpen(true), []);
  const { setPremium } = useAuth();
  const subscribe = React.useCallback(() => {
    void setPremium(true);
    setPaywallOpen(false);
  }, [setPremium]);

  const currentTab = (() => {
    if (['home', 'stock', 'simulator', 'search', 'market', 'news'].includes(screen.name))
      return 'home';
    if (screen.name === 'watch') return 'watch';
    if (['calendar', 'earnings'].includes(screen.name)) return 'calendar';
    if (['smart', 'investor'].includes(screen.name)) return 'smart';
    if (screen.name === 'settings') return 'settings';
    return 'home';
  })();

  if (loading) {
    return (
      <div
        style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 26,
            color: 'var(--ink-2)',
          }}
        >
          Monere<span style={{ color: 'var(--accent)' }}>.</span>
        </div>
      </div>
    );
  }

  const common = { nav, back, params: screen.params };
  const renderScreen = () => {
    if (!user) {
      return screen.name === 'login' ? (
        <LoginScreen {...common} />
      ) : (
        <OnboardingScreen {...common} />
      );
    }
    switch (screen.name) {
      case 'home':
        return <HomeScreen {...common} />;
      case 'watch':
        return <WatchScreen {...common} />;
      case 'calendar':
        return <CalendarScreen {...common} />;
      case 'smart':
        return <SmartMoneyScreen {...common} />;
      case 'investor':
        return <InvestorDetailScreen {...common} />;
      case 'settings':
        return <SettingsScreen {...common} />;
      case 'alerts':
        return <AlertsScreen {...common} />;
      case 'notifications':
        return <NotificationsScreen {...common} />;
      case 'account':
        return <AccountScreen {...common} openPaywall={openPaywall} />;
      case 'pricing':
        return <PricingScreen {...common} openPaywall={openPaywall} />;
      case 'billing':
        return <BillingScreen {...common} openPaywall={openPaywall} />;
      case 'stock':
        return <StockDetailScreen {...common} />;
      case 'market':
        return <MarketDetailScreen {...common} />;
      case 'earnings':
        return <EarningsDetailScreen {...common} openPaywall={openPaywall} />;
      case 'simulator':
        return <SimulatorScreen {...common} />;
      case 'search':
        return <SearchScreen {...common} />;
      case 'news':
        return <NewsScreen {...common} />;
      case 'admin':
        return <AdminScreen {...common} />;
      default:
        return <HomeScreen {...common} />;
    }
  };

  const isAuthFlow = !user;
  const isNative = !isPhone && !isTablet;
  const appBody = (
    <div className="app" key={screen.name + JSON.stringify(screen.params)}>
      {isAuthFlow ? (
        renderScreen()
      ) : (
        <>
          <div className="scroll">{renderScreen()}</div>
          {isPhone && <TabBar current={currentTab} onChange={goTab} />}
        </>
      )}
      <NotificationBanner notif={toast} onOpen={openToast} onDismiss={dismissToast} />
    </div>
  );

  return (
    <>
      {isPhone ? (
        <div className="app-viewport">{appBody}</div>
      ) : isTablet ? (
        <TabletShell
          currentTab={currentTab}
          goTab={goTab}
          nav={nav}
          appBody={appBody}
          isAuthFlow={isAuthFlow}
        />
      ) : (
        <DesktopNativeShell
          currentTab={currentTab}
          goTab={goTab}
          nav={nav}
          appBody={appBody}
          isAuthFlow={isAuthFlow}
        />
      )}

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onSubscribe={subscribe}
        onSeePlans={() => nav('pricing')}
      />
    </>
  );
}
