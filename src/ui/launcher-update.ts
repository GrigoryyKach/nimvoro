// Update of the launcher itself: the banner above the catalog, and the overlay that shows the progress.
import { api } from '../api';
import { errorText, t as tr } from '../i18n';
import { patch, state } from '../store';
import { toast } from './toast';
import { showUpdateOverlay } from './update-overlay';

export async function checkLauncherUpdate(manual = false): Promise<void> {
  try {
    const rel = await api.launcherUpdateCheck();
    patch({ launcherUpdate: rel });
  } catch (e) {
    if (manual) toast(tr('toast.launcherCheckFailed', { e: errorText(e) }), 'error');
  }
}

/** Banner button: "Update to X", or "Open release page" where the launcher cannot update itself (a deb without pkexec). */
export function updateLabel(): string {
  const u = state.launcherUpdate;
  return u?.mode === 'page' ? tr('banner.openPage') : tr('banner.updateTo', { v: u?.version ?? '' });
}

export async function applyLauncherUpdate(): Promise<void> {
  const u = state.launcherUpdate;
  if (!u) return;
  if (u.mode === 'page') {
    // Nothing to download: the backend opens the release page.
    try {
      await api.launcherUpdateApply(() => {});
    } catch (e) {
      toast(errorText(e), 'error');
    }
    return;
  }
  showUpdateOverlay(state.view?.launcherVersion ?? '', u.version, u.url);
}
