/**
 * Мелкие помощники для DOM-интерфейса.
 *
 * Меню, настройки, верхняя панель и итоги сделаны на DOM, а не внутри Phaser:
 * так работают нативные поля ввода, экранные читалки и `env(safe-area-inset-*)`,
 * а адаптивная вёрстка не требует ручного пересчёта на каждый ресайз.
 * Игровой мир и сенсорные кнопки при этом остаются в Phaser.
 */

export type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (key.startsWith('data-') || key === 'role' || key.startsWith('aria-')) {
      node.setAttribute(key, String(value));
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

let stylesInstalled = false;

export function installStyles(): void {
  if (stylesInstalled) return;
  stylesInstalled = true;
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);
}

const STYLES = `
.uc-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right))
           calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));
  background: radial-gradient(circle at 50% 25%, rgba(35,45,66,0.96), rgba(11,14,20,0.98));
  overflow-y: auto;
  overscroll-behavior: contain;
}
.uc-overlay[hidden] { display: none; }

.uc-card {
  width: min(680px, 100%);
  background: #161c28;
  border: 1px solid #263149;
  border-radius: 18px;
  padding: clamp(16px, 3vw, 26px);
  box-shadow: 0 24px 60px rgba(0,0,0,0.5);
  display: grid;
  gap: 14px;
}
.uc-title { margin: 0; font-size: clamp(20px, 4vw, 30px); letter-spacing: 0.01em; }
.uc-sub { margin: 0; opacity: 0.62; font-size: 14px; line-height: 1.5; }

.uc-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.uc-grid { display: grid; gap: 10px; }
.uc-grid.cols2 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }

.uc-btn {
  appearance: none;
  border: 1px solid #34405c;
  background: #212a3c;
  color: #e8eef7;
  font: inherit;
  font-weight: 600;
  padding: 12px 18px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.08s ease, border-color 0.15s ease;
  min-height: 46px;
}
.uc-btn:hover { background: #2a3549; border-color: #44527a; }
.uc-btn:active { transform: translateY(1px); }
.uc-btn.primary { background: #ffc93c; border-color: #ffc93c; color: #171c26; }
.uc-btn.primary:hover { background: #ffd45e; }
.uc-btn.ghost { background: transparent; }
.uc-btn[disabled] { opacity: 0.45; cursor: default; }

.uc-input, .uc-select {
  width: 100%;
  background: #101724;
  border: 1px solid #2b3750;
  color: #e8eef7;
  border-radius: 10px;
  padding: 11px 12px;
  font: inherit;
  min-height: 44px;
}
.uc-input:focus, .uc-select:focus { outline: 2px solid #ffc93c; outline-offset: 1px; }
.uc-label { display: grid; gap: 6px; font-size: 13px; opacity: 0.8; }

.uc-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.uc-swatch {
  width: 34px; height: 34px; border-radius: 10px; cursor: pointer;
  border: 2px solid transparent; padding: 0; appearance: none;
}
.uc-swatch[aria-pressed="true"] { border-color: #e8eef7; transform: scale(1.08); }

.uc-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; }
.uc-toggle span { font-size: 14px; }
.uc-toggle small { display: block; opacity: 0.55; font-size: 12px; margin-top: 2px; }
.uc-switch {
  appearance: none; width: 48px; height: 28px; border-radius: 14px;
  background: #2b3750; position: relative; cursor: pointer; flex: none; border: none;
}
.uc-switch::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px;
  border-radius: 50%; background: #8395b5; transition: transform 0.15s ease, background 0.15s ease;
}
.uc-switch:checked { background: #6b5a1f; }
.uc-switch:checked::after { transform: translateX(20px); background: #ffc93c; }

.uc-range { width: 100%; accent-color: #ffc93c; }

.uc-error { color: #ff8a8a; font-size: 13px; min-height: 18px; }
.uc-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.uc-tab {
  border: none; background: transparent; color: #93a3c0; font: inherit; font-weight: 600;
  padding: 8px 12px; border-radius: 10px; cursor: pointer;
}
.uc-tab[aria-selected="true"] { background: #212a3c; color: #e8eef7; }

/* ---------------------------------------------------------------- верхний HUD */
.uc-hud {
  position: fixed;
  inset: 0;
  z-index: 12;
  pointer-events: none;
  padding: calc(10px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right))
           calc(10px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 8px;
  font-size: 14px;
}
.uc-hud[hidden] { display: none; }

.uc-hud-top { display: grid; justify-items: center; gap: 6px; }
.uc-objective {
  background: rgba(16,21,32,0.82);
  border: 1px solid #2b3750;
  border-radius: 12px;
  padding: 7px 14px;
  max-width: min(560px, 92vw);
  text-align: center;
  backdrop-filter: blur(6px);
}
.uc-objective b { font-weight: 700; }
.uc-objective .steps { display: grid; gap: 4px; margin-top: 6px; }
.uc-step { display: flex; align-items: center; gap: 8px; font-size: 12.5px; opacity: 0.9; }
.uc-step .bar { flex: 1; height: 4px; background: #2b3750; border-radius: 3px; overflow: hidden; }
.uc-step .bar i { display: block; height: 100%; background: #ffc93c; transition: width 0.2s ease; }
.uc-step.done { opacity: 0.55; }
.uc-step.done .bar i { background: #7ee081; }

.uc-gauge {
  width: min(420px, 88vw);
  height: 8px;
  border-radius: 5px;
  background: #2b1d1d;
  overflow: hidden;
  border: 1px solid #5a2b2b;
}
.uc-gauge i { display: block; height: 100%; background: linear-gradient(90deg, #ffc93c, #ff4d5a); transition: width 0.2s linear; }

.uc-roster {
  position: absolute;
  top: calc(10px + env(safe-area-inset-top));
  left: calc(12px + env(safe-area-inset-left));
  display: grid;
  gap: 4px;
}
.uc-mate {
  display: flex; align-items: center; gap: 6px;
  background: rgba(16,21,32,0.72); border-radius: 9px; padding: 4px 8px; font-size: 12px;
}
.uc-mate .dot { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.uc-mate.downed { color: #ff9a9a; }
.uc-mate.offline { opacity: 0.45; }

.uc-status {
  position: absolute;
  top: calc(10px + env(safe-area-inset-top));
  right: calc(12px + env(safe-area-inset-right));
  display: grid; gap: 4px; justify-items: end; font-size: 12px; opacity: 0.72;
  text-align: right;
}

.uc-hint {
  justify-self: center;
  align-self: end;
  background: rgba(16,21,32,0.9);
  border: 1px solid #38455f;
  border-radius: 12px;
  padding: 9px 16px;
  max-width: min(520px, 90vw);
  text-align: center;
  transition: opacity 0.25s ease, transform 0.25s ease;
  margin-bottom: 6px;
}
.uc-hint[hidden] { display: none; }

.uc-subtitles {
  justify-self: center; align-self: end;
  display: grid; gap: 3px; font-size: 12px; opacity: 0.75; text-align: center;
  margin-bottom: 4px;
}

.uc-banner {
  justify-self: center; align-self: center;
  font-size: clamp(20px, 5vw, 34px); font-weight: 800; text-align: center;
  text-shadow: 0 4px 24px rgba(0,0,0,0.7);
  padding: 12px 22px;
}
.uc-banner[hidden] { display: none; }

.uc-hud button { pointer-events: auto; }

.uc-corner {
  position: absolute;
  bottom: calc(10px + env(safe-area-inset-bottom));
  left: calc(12px + env(safe-area-inset-left));
  display: flex; gap: 6px;
}
.uc-icon-btn {
  pointer-events: auto;
  width: 42px; height: 42px; border-radius: 12px;
  background: rgba(16,21,32,0.75); border: 1px solid #2b3750;
  color: #e8eef7; font-size: 17px; cursor: pointer; line-height: 1;
}

.uc-results-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.uc-results-table th, .uc-results-table td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #253048; }
.uc-results-table th { opacity: 0.6; font-weight: 600; }

.uc-grades { display: flex; gap: 12px; flex-wrap: wrap; }
.uc-grade { background: #101724; border-radius: 12px; padding: 10px 14px; text-align: center; min-width: 92px; }
.uc-grade b { display: block; font-size: 20px; color: #ffc93c; }
.uc-grade span { font-size: 12px; opacity: 0.6; }

@media (max-width: 720px) {
  .uc-roster { font-size: 11px; }
  .uc-mate { padding: 3px 6px; }
}
`;
