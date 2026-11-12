// Install dialog: folder (with Browse), desktop-shortcut checkbox, Install / Cancel.
import { open as pickFolder } from '@tauri-apps/plugin-dialog';
import type { Tool } from '../api';
import { h, svg } from '../dom';
import { toolName } from '../format';
import { t as tr } from '../i18n';
import { icons } from '../icons';
import { state } from '../store';
import { toolIcon } from './cards';
import { modalHeader, openModal } from './dialog';

export interface InstallChoice {
  dest: string;
  desktopShortcut: boolean;
}

/** Resolves with the user's choice, or `null` if the dialog was cancelled. */
export function askInstallOptions(tool: Tool): Promise<InstallChoice | null> {
  return new Promise(resolve => {
    let answered = false;
    const finish = (v: InstallChoice | null) => {
      if (answered) return;
      answered = true;
      resolve(v);
      m.close();
    };
    const name = toolName(tool);
    const dir = h('input', { class: 'text-input mono', type: 'text', value: tool.targetDir, spellcheck: 'false', 'aria-label': tr('install.folder') }) as HTMLInputElement;
    const browse = h('button', {
      class: 'btn ghost small',
      onclick: async () => {
        const picked = await pickFolder({ directory: true, title: tr('install.pick', { name }), defaultPath: dir.value || undefined });
        if (typeof picked === 'string') dir.value = picked;
      },
    }, svg(icons.folder), tr('common.browse'));
    const desktopBox = h('input', { type: 'checkbox', checked: state.view?.settings.desktopShortcut ?? true }) as HTMLInputElement;
    const ok = h('button', {
      class: 'btn primary',
      autofocus: true,
      onclick: () => {
        const value = dir.value.trim();
        if (!value) return dir.focus();
        finish({ dest: value, desktopShortcut: desktopBox.checked });
      },
    }, svg(icons.download), tr('install.confirm'));
    dir.addEventListener('keydown', e => {
      if (e.key === 'Enter') ok.click();
    });
    const root = h('div', { class: 'install-dialog' },
      modalHeader(tr('install.title', { name }), () => finish(null)),
      h('div', { class: 'install-body' },
        h('div', { class: 'install-ident' },
          toolIcon(tool, 44),
          h('div', null, h('div', { class: 'name' }, name), tool.release && h('div', { class: 'muted mono' }, `V${tool.release.version}`)),
        ),
        h('h3', { class: 'caps' }, tr('install.folder')),
        h('div', { class: 'folder-row' }, dir, browse),
        h('label', { class: 'set-row check-row' },
          h('div', { class: 'set-text' }, h('div', { class: 'set-title' }, tr('install.desktop')), h('div', { class: 'hint' }, tr('install.startMenu'))),
          h('span', { class: 'switch' }, desktopBox, h('span')),
        ),
      ),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn ghost', onclick: () => finish(null) }, tr('common.cancel')), ok),
    );
    const m = openModal(root, 'install', () => {
      if (!answered) {
        answered = true;
        resolve(null);
      }
    });
  });
}
