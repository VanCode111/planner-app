import { NavProvider, useNav } from './nav';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { ItemScreen } from './screens/ItemScreen';
import { Onboarding } from './screens/Onboarding';
import { OrderScreen } from './screens/OrderScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { LineSheet, QuickAddSheet } from './screens/sheets';
import { StatsScreen } from './screens/StatsScreen';
import { StockScreen } from './screens/StockScreen';
import { AppProvider, useApp } from './state';
import { MainButtonHost } from './telegram/MainButton';

export function App() {
  return (
    <AppProvider fallback={<div className="splash" aria-busy="true" />}>
      <MainButtonHost>
        <NavProvider>
          <Root />
        </NavProvider>
      </MainButtonHost>
    </AppProvider>
  );
}

function Root() {
  const { state } = useApp();
  if (!state.onboarded) return <Onboarding />;
  return (
    <>
      <Screen />
      <SheetLayer />
    </>
  );
}

function Screen() {
  const { tab, route } = useNav();
  if (route?.name === 'item') return <ItemScreen key={route.id} id={route.id} />;
  if (route?.name === 'checkout') return <CheckoutScreen key={route.kind} kind={route.kind} />;
  if (route?.name === 'settings') return <SettingsScreen />;
  if (tab === 'stock') return <StockScreen />;
  if (tab === 'stats') return <StatsScreen />;
  return <OrderScreen />;
}

function SheetLayer() {
  const { sheet } = useNav();
  if (sheet?.kind === 'quickAdd') return <QuickAddSheet />;
  if (sheet?.kind === 'line') return <LineSheet key={sheet.itemId} itemId={sheet.itemId} />;
  return null;
}
