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

export async function applyLauncherUpdate(btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  try {
    await api.launcherUpdateApply(p => {
      if (p.stage === 'download') btn.textContent = tr('banner.downloading', { p: p.total ? Math.floor((p.received / p.total) * 100) : 0 });
      else btn.textContent = tr('banner.launching');
    });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = tr('banner.updateTo', { v: state.launcherUpdate?.version ?? '' });
    toast(errorText(e), 'error');
  }
}
