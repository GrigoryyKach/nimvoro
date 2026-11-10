// Действия над инструментами: установка, обновление, удаление, запуск.
import { open as pickFolder } from '@tauri-apps/plugin-dialog';
import { api, RUNNING_PREFIX, type Tool } from './api';
import { toolName } from './format';
import { setProgress, setView, settings, state, tool } from './store';
import { confirmDialog } from './ui/dialog';
import { toast } from './ui/toast';

function errText(e: unknown): string {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
}

/** Ставит или обновляет инструмент. Если программа запущена — спрашивает, закрыть ли её. */
export async function install(id: string, opts: { closeRunning?: boolean; launchAfter?: boolean; quiet?: boolean } = {}): Promise<boolean> {
  const t = tool(id);
  if (!t || t.busy || state.progress[id]) return false;
  const updating = !!t.installed;
  setProgress(id, { stage: 'download', received: 0, total: t.release?.assetSize ?? 0 });
  try {
    const view = await api.install(id, !!opts.closeRunning, p => setProgress(id, p));
    setProgress(id, undefined);
    setView(view);
    const v = tool(id)?.installed?.version ?? '';
    if (!opts.quiet) toast(updating ? `${toolName(t)} обновлён до ${v}` : `${toolName(t)} установлен`, 'ok', updating ? undefined : { label: 'Открыть', run: () => launch(id) });
    if (opts.launchAfter) await launch(id);
    return true;
  } catch (e) {
    setProgress(id, undefined);
    const msg = errText(e);
    if (msg.startsWith(RUNNING_PREFIX)) {
      const names = msg.slice(RUNNING_PREFIX.length);
      const ok = await confirmDialog({
        title: `${toolName(t)} сейчас запущен`,
        text: `Чтобы ${updating ? 'обновить' : 'установить'} программу, её нужно закрыть (${names}). Несохранённые данные в ней могут потеряться.`,
        confirm: 'Закрыть и продолжить',
      });
      if (ok) return install(id, { ...opts, closeRunning: true });
      return false;
    }
    toast(`${toolName(t)}: ${msg}`, 'error');
    return false;
  }
}

export async function uninstall(id: string): Promise<void> {
  const t = tool(id);
  if (!t?.installed) return;
  const ok = await confirmDialog({
    title: `Удалить ${toolName(t)}?`,
    text: `Файлы программы будут удалены из папки ${t.installed.dir}. Настройки и данные${t.manifest?.settingsDir ? ` (${t.manifest.settingsDir})` : ''} останутся.`,
    confirm: 'Удалить',
    danger: true,
  });
  if (!ok) return;
  try {
    setView(await api.uninstall(id, false));
    toast(`${toolName(t)} удалён`, 'ok');
  } catch (e) {
    const msg = errText(e);
    if (msg.startsWith(RUNNING_PREFIX)) {
      const again = await confirmDialog({ title: `${toolName(t)} запущен`, text: 'Закрыть программу и удалить?', confirm: 'Закрыть и удалить', danger: true });
      if (again) {
        try {
          setView(await api.uninstall(id, true));
          toast(`${toolName(t)} удалён`, 'ok');
        } catch (e2) {
          toast(errText(e2), 'error');
        }
      }
      return;
    }
    toast(msg, 'error');
  }
}

export async function launch(id: string): Promise<void> {
  try {
    await api.launch(id);
  } catch (e) {
    toast(errText(e), 'error');
  }
}

export async function openFolder(id: string): Promise<void> {
  try {
    await api.openToolDir(id);
  } catch (e) {
    toast(errText(e), 'error');
  }
}

export async function openUrl(url: string): Promise<void> {
  try {
    await api.openUrl(url);
  } catch (e) {
    toast(errText(e), 'error');
  }
}

/** Выбор своей папки для инструмента (до установки). */
export async function chooseToolDir(t: Tool): Promise<void> {
  const s = settings();
  const picked = await pickFolder({ directory: true, title: `Куда установить ${toolName(t)}`, defaultPath: s?.toolDirs[t.id] ?? s?.installRoot });
  if (typeof picked !== 'string') return;
  try {
    setView(await api.setToolDir(t.id, picked));
  } catch (e) {
    toast(errText(e), 'error');
  }
}

export async function resetToolDir(t: Tool): Promise<void> {
  setView(await api.setToolDir(t.id, null));
}

/** Перечитать каталог. `refresh` — сходить в GitHub. */
export async function reload(refresh: boolean): Promise<void> {
  try {
    setView(await api.loadCatalog(refresh));
  } catch (e) {
    toast(errText(e), 'error');
  }
}

export function updatable(): Tool[] {
  return state.view?.tools.filter(t => t.updateAvailable) ?? [];
}

/** Обновить все инструменты по очереди. */
export async function updateAll(): Promise<void> {
  const list = updatable();
  let done = 0;
  for (const t of list) {
    if (await install(t.id, { quiet: true })) done++;
  }
  if (done) toast(done === 1 ? `${toolName(list[0])} обновлён` : `Обновлено инструментов: ${done}`, 'ok');
}
