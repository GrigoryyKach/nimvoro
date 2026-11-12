// Dropdown "..." menu on a card.
import { h, svg } from '../dom';

export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  run: () => void;
}

let current: HTMLElement | null = null;

export function closeMenu(): void {
  current?.remove();
  current = null;
}

export function openMenu(anchor: HTMLElement, items: MenuItem[]): void {
  closeMenu();
  const menu = h(
    'div',
    { class: 'menu', role: 'menu' },
    ...items.map(it =>
      h(
        'button',
        {
          class: `menu-item${it.danger ? ' danger' : ''}`,
          role: 'menuitem',
          onclick: (e: Event) => {
            e.stopPropagation();
            closeMenu();
            it.run();
          },
        },
        it.icon ? svg(it.icon) : h('span', { class: 'ico' }),
        it.label,
      ),
    ),
  );
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  const left = Math.min(window.innerWidth - mw - 8, r.right - mw);
  const top = r.bottom + 6 + mh > window.innerHeight ? r.top - mh - 6 : r.bottom + 6;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  current = menu;
  (menu.querySelector('button') as HTMLElement | null)?.focus();
}

document.addEventListener('mousedown', e => {
  if (current && !current.contains(e.target as Node)) closeMenu();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMenu();
});
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);
