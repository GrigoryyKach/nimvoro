import { h, svg } from '../dom';
import { icons } from '../icons';

let host: HTMLElement | null = null;

export function toast(text: string, kind: 'ok' | 'error' | 'info' = 'info', action?: { label: string; run: () => void }): void {
  host ??= document.body.appendChild(h('div', { class: 'toasts' }));
  const el = h(
    'div',
    { class: `toast ${kind}`, role: 'status' },
    svg(kind === 'error' ? icons.alert : kind === 'ok' ? icons.check : icons.info),
    h('span', { class: 'toast-text' }, text),
    action && h('button', { class: 'btn link', onclick: () => { action.run(); close(); } }, action.label),
    h('button', { class: 'icon-btn small', 'aria-label': 'Закрыть', onclick: () => close() }, svg(icons.close)),
  );
  const close = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 180);
  };
  host.append(el);
  setTimeout(close, kind === 'error' ? 9000 : 5000);
}
