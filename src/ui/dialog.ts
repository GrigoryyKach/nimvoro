// Модальные окна: общая обёртка и диалог подтверждения.
import { h, svg } from '../dom';
import { icons } from '../icons';

export interface ModalHandle {
  el: HTMLElement;
  close: () => void;
}

/** Открывает модальное окно. Esc и щелчок по фону закрывают его. */
export function openModal(content: HTMLElement, cls = '', onClose?: () => void): ModalHandle {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: `modal ${cls}`, role: 'dialog', 'aria-modal': 'true' }, content);
  backdrop.append(box);
  const prevFocus = document.activeElement as HTMLElement | null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    backdrop.classList.add('out');
    setTimeout(() => backdrop.remove(), 160);
    prevFocus?.focus?.();
    onClose?.();
  };
  backdrop.addEventListener('mousedown', e => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  requestAnimationFrame(() => (box.querySelector('[autofocus]') as HTMLElement | null)?.focus());
  return { el: box, close };
}

export function modalHeader(title: string, close: () => void, sub?: string): HTMLElement {
  return h(
    'div',
    { class: 'modal-head' },
    h('div', null, h('div', { class: 'modal-title' }, title), sub && h('div', { class: 'modal-sub' }, sub)),
    h('button', { class: 'icon-btn', 'aria-label': 'Закрыть', onclick: close }, svg(icons.close)),
  );
}

export function confirmDialog(o: { title: string; text: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise(resolve => {
    let answered = false;
    const finish = (v: boolean) => {
      if (answered) return;
      answered = true;
      resolve(v);
      m.close();
    };
    const body = h(
      'div',
      { class: 'confirm' },
      h('div', { class: 'modal-title' }, o.title),
      h('p', { class: 'confirm-text' }, o.text),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => finish(false) }, 'Отмена'),
        h('button', { class: `btn ${o.danger ? 'danger' : 'primary'}`, autofocus: true, onclick: () => finish(true) }, o.confirm),
      ),
    );
    const m = openModal(body, 'small', () => {
      if (!answered) {
        answered = true;
        resolve(false);
      }
    });
  });
}
