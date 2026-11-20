// Full-window overlay for the launcher's own update: title, versions, a thin progress bar, then "Installing…" and the restart.
// No installer window is ever shown: the backend installs quietly and the app comes back by itself.
import { api, type Progress } from '../api';
import { clear, h } from '../dom';
import { errorText, t as tr } from '../i18n';
import { fail, fraction, initialState, reduce, sizeText, type UpdateState } from './update-state';

export function showUpdateOverlay(from: string, to: string, releaseUrl: string): void {
  const title = h('div', { class: 'modal-title' }, tr('update.title'));
  const fill = h('div', { class: 'upd-fill' });
  const status = h('div', { class: 'upd-status' });
  const sizes = h('div', { class: 'upd-size' });
  const actions = h('div', { class: 'modal-actions upd-actions' });
  const bar = h('div', { class: 'upd-bar', role: 'progressbar' }, fill);
  const box = h('div', { class: 'modal small upd', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'upd-body' },
      title,
      h('div', { class: 'upd-versions' }, tr('update.versions', { from, to })),
      bar,
      h('div', { class: 'upd-row' }, status, sizes),
      actions,
    ),
  );
  const backdrop = h('div', { class: 'modal-backdrop upd-backdrop' }, box);
  document.body.append(backdrop);

  let s: UpdateState = initialState();

  const draw = () => {
    const busy = s.phase === 'downloading' && s.total <= 0;
    // The busy and error looks come from CSS (a sliding piece, a full red bar), so they must not be overridden inline.
    fill.style.transform = busy || s.phase === 'error' ? '' : `scaleX(${fraction(s)})`;
    bar.classList.toggle('busy', busy);
    bar.classList.toggle('error', s.phase === 'error');
    if (s.phase === 'error') {
      title.textContent = tr('update.failed');
      status.textContent = s.error ?? '';
      status.classList.add('err');
      sizes.textContent = '';
    } else {
      title.textContent = tr('update.title');
      status.classList.remove('err');
      status.textContent = tr(s.phase === 'downloading' ? 'update.downloading' : s.phase === 'installing' ? 'update.installing' : 'update.restarting');
      sizes.textContent = s.phase === 'downloading' ? `${sizeText(s.received, s.total)} ${tr('unit.mb')}` : '';
    }
    clear(actions);
    if (s.phase === 'error') {
      const retry = h('button', { class: 'btn primary', onclick: () => void start() }, tr('update.retry'));
      actions.append(
        h('button', { class: 'btn link', onclick: () => api.openUrl(releaseUrl).catch(() => {}) }, tr('update.manual')),
        h('button', { class: 'btn', onclick: () => backdrop.remove() }, tr('update.close')),
        retry,
      );
      retry.focus();
    }
  };

  const start = async () => {
    s = initialState();
    draw();
    try {
      await api.launcherUpdateApply((p: Progress) => {
        s = reduce(s, p);
        draw();
      });
    } catch (e) {
      s = fail(s, errorText(e));
      draw();
    }
  };

  void start();
}
