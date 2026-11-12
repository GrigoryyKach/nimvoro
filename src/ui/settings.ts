// Launcher settings.
import { open as pickFolder } from '@tauri-apps/plugin-dialog';
import * as act from '../actions';
import { api, type Settings } from '../api';
import { h, svg } from '../dom';
import { LANGS, errorText, t as tr, tn } from '../i18n';
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
    toast(errorText(e), 'error');
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
    const langSelect = h('select', { class: 'select', 'aria-label': tr('settings.language') },
      ...LANGS.map(l => h('option', { value: l.code, selected: l.code === s.language }, l.name)),
    ) as HTMLSelectElement;
    langSelect.addEventListener('change', () => save({ language: langSelect.value as Settings['language'] }));
    root.replaceChildren(
      modalHeader(tr('settings.title'), () => m.close(), `NIMVORO ${v.launcherVersion}`),
      h('div', { class: 'settings-body' },
        h('h3', { class: 'caps' }, tr('settings.install')),
        h('div', { class: 'set-card' },
          h('div', { class: 'set-row' },
            h('div', { class: 'set-text' },
              h('div', { class: 'set-title' }, tr('settings.root')),
              h('div', { class: 'hint' }, tr('settings.root.hint')),
              h('div', { class: 'path mono', title: s.installRoot }, s.installRoot),
            ),
            h('div', { class: 'set-actions' },
              h('button', { class: 'btn ghost small', onclick: () => api.openPath(s.installRoot) }, tr('settings.open')),
              h('button', {
                class: 'btn ghost small',
                onclick: async () => {
                  const picked = await pickFolder({ directory: true, title: tr('settings.root'), defaultPath: s.installRoot });
                  if (typeof picked === 'string') save({ installRoot: picked });
                },
              }, svg(icons.folder), tr('settings.change')),
            ),
          ),
        ),
        h('h3', { class: 'caps' }, tr('settings.updates')),
        h('div', { class: 'set-card' },
          switchRow(tr('settings.checkOnStart'), tr('settings.checkOnStart.hint'), s.checkUpdatesOnStart, v => save({ checkUpdatesOnStart: v })),
          switchRow(tr('settings.autoInstall'), tr('settings.autoInstall.hint'), s.autoInstallUpdates, v => save({ autoInstallUpdates: v })),
          switchRow(tr('settings.checkLauncher'), tr('settings.checkLauncher.hint'), s.checkLauncherUpdates, v => save({ checkLauncherUpdates: v })),
          h('div', { class: 'set-row' },
            h('div', { class: 'set-text' }, h('div', { class: 'set-title' }, tr('settings.checkNow')), h('div', { class: 'hint' }, tr('settings.checkNow.hint'))),
            h('button', {
              class: 'btn ghost small',
              onclick: async () => {
                await act.reload(true);
                await checkLauncherUpdate(true);
                const n = act.updatable().length;
                toast(n ? tn('toast.updatesAvailable', n) : tr('toast.upToDate'), n ? 'info' : 'ok');
              },
            }, svg(icons.refresh), tr('settings.check')),
          ),
        ),
        h('h3', { class: 'caps' }, tr('settings.appearance')),
        h('div', { class: 'set-card' },
          h('div', { class: 'set-row' },
            h('div', { class: 'set-text' }, h('div', { class: 'set-title' }, tr('settings.theme'))),
            h('div', { class: 'segmented' }, themeBtn('system', tr('settings.theme.system')), themeBtn('light', tr('settings.theme.light')), themeBtn('dark', tr('settings.theme.dark'))),
          ),
          h('div', { class: 'set-row' },
            h('div', { class: 'set-text' }, h('div', { class: 'set-title' }, tr('settings.language')), h('div', { class: 'hint' }, tr('settings.language.hint'))),
            langSelect,
          ),
        ),
        h('h3', { class: 'caps' }, tr('settings.about')),
        h('div', { class: 'set-card' },
          h('div', { class: 'set-row' },
            h('div', { class: 'set-text' },
              h('div', { class: 'set-title' }, `NIMVORO ${v.launcherVersion}`),
              h('div', { class: 'hint' }, tr('settings.about.text')),
            ),
            h('div', { class: 'set-actions' },
              h('button', { class: 'btn ghost small', onclick: () => api.openPath(v.dataDir) }, tr('settings.dataFolder')),
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
