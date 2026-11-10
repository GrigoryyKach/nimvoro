// Настройки лаунчера.
import { open as pickFolder } from '@tauri-apps/plugin-dialog';
import * as act from '../actions';
import { api, type Settings } from '../api';
import { h, svg } from '../dom';
import { icons } from '../icons';
import { setView, state, subscribe } from '../store';
import { checkLauncherUpdate } from './launcher-update';
import { modalHeader, openModal } from './dialog';
import { toast } from './toast';

let rerender: (() => void) | null = null;
subscribe(() => rerender?.());

async function save(p: Partial<Settings>): Promise<void> {
  const s = state.view?.settings;
  if (!s) return;
  try {
    setView(await api.saveSettings({ ...s, ...p }));
  } catch (e) {
    toast(String(e), 'error');
  }
}

function switchRow(title: string, hint: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: value });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'set-row' },
    h('div', { class: 'set-text' }, h('div', { class: 'set-title' }, title), h('div', { class: 'hint' }, hint)),
    h('span', { class: 'switch' }, input, h('span')),
  );
}

export function openSettings(): void {
  const root = h('div', { class: 'settings' });
  const render = () => {
    const v = state.view;
    if (!v) return;
    const s = v.settings;
    const themeBtn = (val: Settings['theme'], label: string) =>
      h('button', { class: `seg${s.theme === val ? ' active' : ''}`, onclick: () => save({ theme: val }) }, label);
    root.replaceChildren(
      modalHeader('Настройки', () => m.close(), `NIMVORO ${v.launcherVersion}`),
      h('div', { class: 'settings-body' },
        h('h3', { class: 'caps' }, 'Установка'),
        h('div', { class: 'set-card' },
          h('div', { class: 'set-row' },
            h('div', { class: 'set-text' },
              h('div', { class: 'set-title' }, 'Папка для программ'),
              h('div', { class: 'hint' }, 'Каждый инструмент ставится в свою подпапку. Для отдельного инструмента папку можно сменить в его карточке до установки.'),
              h('div', { class: 'path mono', title: s.installRoot }, s.installRoot),
            ),
            h('div', { class: 'set-actions' },
              h('button', { class: 'btn ghost small', onclick: () => api.openPath(s.installRoot) }, 'Открыть'),
              h('button', {
                class: 'btn ghost small',
                onclick: async () => {
                  const picked = await pickFolder({ directory: true, title: 'Папка для программ', defaultPath: s.installRoot });
                  if (typeof picked === 'string') save({ installRoot: picked });
                },
              }, svg(icons.folder), 'Изменить…'),
            ),
          ),
        ),
        h('h3', { class: 'caps' }, 'Обновления'),
        h('div', { class: 'set-card' },
          switchRow('Проверять обновления при запуске', 'При каждом запуске NIMVORO сверяет версии всех установленных инструментов с GitHub.', s.checkUpdatesOnStart, v => save({ checkUpdatesOnStart: v })),
          switchRow('Устанавливать обновления автоматически', 'Найденные обновления ставятся сразу. Если программа запущена, NIMVORO спросит, можно ли её закрыть.', s.autoInstallUpdates, v => save({ autoInstallUpdates: v })),
          switchRow('Проверять обновления NIMVORO', 'Сообщать о новой версии самого лаунчера.', s.checkLauncherUpdates, v => save({ checkLauncherUpdates: v })),
          h('div', { class: 'set-row' },
            h('div', { class: 'set-text' }, h('div', { class: 'set-title' }, 'Проверить сейчас'), h('div', { class: 'hint' }, 'Инструменты и сам лаунчер')),
            h('button', {
              class: 'btn ghost small',
              onclick: async () => {
                await act.reload(true);
                await checkLauncherUpdate(true);
                const n = act.updatable().length;
                toast(n ? `Доступно обновлений: ${n}` : 'Всё обновлено', n ? 'info' : 'ok');
              },
            }, svg(icons.refresh), 'Проверить'),
          ),
        ),
        h('h3', { class: 'caps' }, 'Оформление'),
        h('div', { class: 'set-card' },
          h('div', { class: 'set-row' },
            h('div', { class: 'set-text' }, h('div', { class: 'set-title' }, 'Тема')),
            h('div', { class: 'segmented' }, themeBtn('system', 'Как в системе'), themeBtn('light', 'Светлая'), themeBtn('dark', 'Тёмная')),
          ),
        ),
        h('h3', { class: 'caps' }, 'О программе'),
        h('div', { class: 'set-card' },
          h('div', { class: 'set-row' },
            h('div', { class: 'set-text' },
              h('div', { class: 'set-title' }, `NIMVORO ${v.launcherVersion}`),
              h('div', { class: 'hint' }, 'Лаунчер набора утилит. Каталог инструментов берётся из GitHub, новый инструмент добавляется одной строкой в catalog.json.'),
            ),
            h('div', { class: 'set-actions' },
              h('button', { class: 'btn ghost small', onclick: () => api.openPath(v.dataDir) }, 'Папка данных'),
              h('button', { class: 'btn ghost small', onclick: () => act.openUrl('https://github.com/GrigoryyKach/nimvoro') }, 'GitHub', svg(icons.external, 'ico tiny')),
            ),
          ),
        ),
      ),
    );
  };
  rerender = render;
  const m = openModal(root, 'medium', () => (rerender = null));
  render();
}
