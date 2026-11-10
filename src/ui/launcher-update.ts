// Обновление самого лаунчера: плашка над каталогом.
import { api } from '../api';
import { patch, state } from '../store';
import { toast } from './toast';

export async function checkLauncherUpdate(manual = false): Promise<void> {
  try {
    const rel = await api.launcherUpdateCheck();
    patch({ launcherUpdate: rel });
  } catch (e) {
    if (manual) toast(`Не удалось проверить обновления NIMVORO: ${e}`, 'error');
  }
}

export async function applyLauncherUpdate(btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  try {
    await api.launcherUpdateApply(p => {
      if (p.stage === 'download') btn.textContent = `Загрузка ${p.total ? Math.floor((p.received / p.total) * 100) : 0}%`;
      else btn.textContent = 'Запуск установщика…';
    });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = `Обновить до ${state.launcherUpdate?.version ?? ''}`;
    toast(String(e), 'error');
  }
}
