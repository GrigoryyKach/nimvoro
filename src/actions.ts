// Tool actions: install, update, uninstall, launch.
import { api, RUNNING_PREFIX, type Tool } from './api';
import { toolName } from './format';
import { errorText, t as tr, tn } from './i18n';
import { setProgress, setView, state, tool } from './store';
import { confirmDialog } from './ui/dialog';
import { askInstallOptions } from './ui/install-dialog';
import { toast } from './ui/toast';

interface InstallOpts {
  closeRunning?: boolean;
  launchAfter?: boolean;
  quiet?: boolean;
  /** Install folder and shortcut choice from the install dialog (first install only). */
  dest?: string;
  desktopShortcut?: boolean;
}

/** Install button: a first install asks for the folder and shortcut first; reinstalling goes straight through. */
export async function requestInstall(id: string): Promise<boolean> {
  const t = tool(id);
  if (!t || t.busy || state.progress[id]) return false;
  if (t.installed) return install(id);
  const choice = await askInstallOptions(t);
  if (!choice) return false;
  return install(id, { dest: choice.dest, desktopShortcut: choice.desktopShortcut });
}

/** Installs or updates a tool. If the program is running, asks whether to close it. */
export async function install(id: string, opts: InstallOpts = {}): Promise<boolean> {
  const t = tool(id);
  if (!t || t.busy || state.progress[id]) return false;
  const updating = !!t.installed;
  setProgress(id, { stage: 'download', received: 0, total: t.release?.assetSize ?? 0 });
  try {
    const view = await api.install(id, !!opts.closeRunning, p => setProgress(id, p), opts.dest, opts.desktopShortcut);
    setProgress(id, undefined);
    setView(view);
    const v = tool(id)?.installed?.version ?? '';
    if (!opts.quiet) {
      toast(updating ? tr('toast.updated', { name: toolName(t), v }) : tr('toast.installed', { name: toolName(t) }), 'ok', updating ? undefined : { label: tr('toast.open'), run: () => launch(id) });
    }
    if (opts.launchAfter) await launch(id);
    return true;
  } catch (e) {
    setProgress(id, undefined);
    const raw = typeof e === 'string' ? e : String(e);
    if (raw.startsWith(RUNNING_PREFIX)) {
      const names = raw.slice(RUNNING_PREFIX.length);
      const ok = await confirmDialog({
        title: tr('running.title', { name: toolName(t) }),
        text: tr(updating ? 'running.text.update' : 'running.text.install', { names }),
        confirm: tr('running.confirm'),
      });
      if (ok) return install(id, { ...opts, closeRunning: true });
      return false;
    }
    toast(`${toolName(t)}: ${errorText(e)}`, 'error');
    return false;
  }
}

export async function uninstall(id: string): Promise<void> {
  const t = tool(id);
  if (!t?.installed) return;
  const settingsDir = t.manifest?.settingsDir;
  const ok = await confirmDialog({
    title: tr('uninstall.title', { name: toolName(t) }),
    text: tr('uninstall.text', { dir: t.installed.dir, where: settingsDir ? tr('uninstall.where', { p: settingsDir }) : '' }),
    confirm: tr('uninstall.confirm'),
    danger: true,
  });
  if (!ok) return;
  try {
    setView(await api.uninstall(id, false));
    toast(tr('toast.uninstalled', { name: toolName(t) }), 'ok');
  } catch (e) {
    const raw = typeof e === 'string' ? e : String(e);
    if (raw.startsWith(RUNNING_PREFIX)) {
      const again = await confirmDialog({ title: tr('running.title', { name: toolName(t) }), text: tr('running.uninstallText'), confirm: tr('running.uninstallConfirm'), danger: true });
      if (again) {
        try {
          setView(await api.uninstall(id, true));
          toast(tr('toast.uninstalled', { name: toolName(t) }), 'ok');
        } catch (e2) {
          toast(errorText(e2), 'error');
        }
      }
      return;
    }
    toast(errorText(e), 'error');
  }
}

export async function launch(id: string): Promise<void> {
  try {
    await api.launch(id);
  } catch (e) {
    toast(errorText(e), 'error');
  }
}

export async function openFolder(id: string): Promise<void> {
  try {
    await api.openToolDir(id);
  } catch (e) {
    toast(errorText(e), 'error');
  }
}

export async function openUrl(url: string): Promise<void> {
  try {
    await api.openUrl(url);
  } catch (e) {
    toast(errorText(e), 'error');
  }
}

/** Reloads the catalog. `refresh` goes to GitHub. */
export async function reload(refresh: boolean): Promise<void> {
  try {
    setView(await api.loadCatalog(refresh));
  } catch (e) {
    toast(errorText(e), 'error');
  }
}

export function updatable(): Tool[] {
  return state.view?.tools.filter(t => t.updateAvailable) ?? [];
}

/** Updates all tools one by one. */
export async function updateAll(): Promise<void> {
  const list = updatable();
  let done = 0;
  for (const t of list) {
    if (await install(t.id, { quiet: true })) done++;
  }
  if (done) toast(done === 1 ? tr('toast.updatedName', { name: toolName(list[0]) }) : tn('toast.updatedMany', done), 'ok');
}
