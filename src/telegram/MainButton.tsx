import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { haptic, supports, tg } from './webapp';

/**
 * Главная кнопка внизу экрана. В Telegram — нативная MainButton, в браузере — своя панель.
 * Кнопку может объявить и экран, и открытая поверх него шторка: показывается последняя объявленная.
 */

interface Params {
  text: string;
  onClick: () => void;
  disabled?: boolean;
}

interface Api {
  set(id: number, params: Params): void;
  remove(id: number): void;
}

const Ctx = createContext<Api | null>(null);
const native = supports('6.0');
let nextId = 1;

export function MainButtonHost({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<number, Params>());
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  const api = useMemo<Api>(() => ({
    set(id, params) {
      const prev = entries.current.get(id);
      entries.current.set(id, params);
      if (!prev || prev.text !== params.text || prev.disabled !== params.disabled) rerender();
    },
    remove(id) {
      entries.current.delete(id);
      rerender();
    },
  }), []);

  const top = [...entries.current.values()].at(-1);
  const click = () => {
    const current = [...entries.current.values()].at(-1);
    if (current && !current.disabled) {
      haptic.tap();
      current.onClick();
    }
  };
  const clickRef = useRef(click);
  clickRef.current = click;

  useEffect(() => {
    if (!native) return;
    const handler = () => clickRef.current();
    tg!.MainButton.onClick(handler);
    return () => tg!.MainButton.offClick(handler);
  }, []);

  useEffect(() => {
    if (!native) return;
    if (!top) {
      tg!.MainButton.hide();
      return;
    }
    const p = tg!.themeParams;
    tg!.MainButton.setParams({
      text: top.text,
      is_active: !top.disabled,
      is_visible: true,
      color: top.disabled ? p.hint_color : p.button_color,
      text_color: p.button_text_color,
    });
  }, [top?.text, top?.disabled, !!top]);

  useEffect(() => {
    document.body.classList.toggle('has-mainbar', !native && !!top);
  }, [!!top]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {!native && top && (
        <div className="mainbar">
          <button className="btn btn-primary btn-block" disabled={top.disabled} onClick={click}>{top.text}</button>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function MainButton(props: Params) {
  const api = useContext(Ctx);
  const id = useRef(0);
  if (!id.current) id.current = nextId++;
  useLayoutEffect(() => {
    api?.set(id.current, props);
  });
  useEffect(() => () => api?.remove(id.current), [api]);
  return null;
}
