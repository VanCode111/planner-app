import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supports, tg } from './telegram/webapp';

export type Tab = 'order' | 'stock' | 'stats';

export type Route =
  | { name: 'item'; id: string }
  | { name: 'checkout'; kind: 'planned' | 'extra' }
  | { name: 'settings' };

export type SheetSpec =
  | { kind: 'quickAdd' }
  | { kind: 'line'; itemId: string };

interface NavCtx {
  tab: Tab;
  setTab: (tab: Tab) => void;
  route: Route | null;
  push: (route: Route) => void;
  back: () => void;
  /** Вернуться к вкладке, закрыв все экраны. */
  home: (tab?: Tab) => void;
  sheet: SheetSpec | null;
  openSheet: (sheet: SheetSpec) => void;
  closeSheet: () => void;
  toast: (message: string) => void;
}

const Ctx = createContext<NavCtx | null>(null);

export function useNav(): NavCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNav вне NavProvider');
  return ctx;
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>('order');
  const [stack, setStack] = useState<Route[]>([]);
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef(0);

  const back = useCallback(() => {
    if (sheet) setSheet(null);
    else setStack((s) => s.slice(0, -1));
  }, [sheet]);

  const toast = useCallback((message: string) => {
    setToastText(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(null), 2600);
  }, []);

  const value = useMemo<NavCtx>(() => ({
    tab,
    setTab: (t) => {
      setTabState(t);
      setStack([]);
    },
    route: stack.at(-1) ?? null,
    push: (r) => {
      setSheet(null);
      setStack((s) => [...s, r]);
    },
    back,
    home: (t) => {
      setSheet(null);
      setStack([]);
      if (t) setTabState(t);
    },
    sheet,
    openSheet: setSheet,
    closeSheet: () => setSheet(null),
    toast,
  }), [tab, stack, sheet, back, toast]);

  // Нативная кнопка «назад» в шапке Telegram.
  const canGoBack = stack.length > 0 || !!sheet;
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    if (!supports('6.1')) return;
    const handler = () => backRef.current();
    tg!.BackButton.onClick(handler);
    return () => tg!.BackButton.offClick(handler);
  }, []);
  useEffect(() => {
    if (!supports('6.1')) return;
    if (canGoBack) tg!.BackButton.show();
    else tg!.BackButton.hide();
  }, [canGoBack]);

  // Каждый новый экран — с начала страницы.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stack.length, tab]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastText && <div className="toast" role="status">{toastText}</div>}
    </Ctx.Provider>
  );
}
