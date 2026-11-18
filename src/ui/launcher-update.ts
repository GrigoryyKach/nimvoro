// Update of the launcher itself: the banner above the catalog.
import { api } from '../api';
import { errorText, t as tr } from '../i18n';
import { patch, state } from '../store';
import { toast } from './toast';

export async function checkLauncherUpdate(manual = false): Promise<void> {
  try {
    const rel = await api.launcherUpdateCheck();
    patch({ launcherUpdate: rel });
  } catch (e) {
    if (manual) toast(tr('toast.launcherCheckFailed', { e: errorText(e) }), 'error');
  }
}

/** Banner button: "Update to X", or "Open release page" where the launcher cannot replace itself (deb install). */
export function updateLabel(): string {
  const u = state.launcherUpdate;
  return u?.mode === 'page' ? tr('banner.openPage') : tr('banner.updateTo', { v: u?.version ?? '' });
}

export async function applyLauncherUpdate(btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  try {
    await api.launcherUpdateApply(p => {
      if (state.launcherUpdate?.mode === 'appimage' && p.stage === 'done') btn.textContent = tr('banner.restarting');
      else
      if (p.stage === 'download') btn.textContent = tr('banner.downloading', { p: p.total ? Math.floor((p.received / p.total) * 100) : 0 });
      else btn.textContent = tr('banner.launching');
    });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = updateLabel();
    toast(errorText(e), 'error');
  }
}
