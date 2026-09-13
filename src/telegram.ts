export type TelegramUser = { id: number; first_name: string; username?: string };

export const telegram = {
  user: { id: 1001, first_name: 'Алекс' } as TelegramUser,
  initData: '',
  init() {
    const webApp = (window as Window & { Telegram?: { WebApp?: { ready: () => void; expand: () => void; initData?: string; initDataUnsafe?: { user?: TelegramUser } } } }).Telegram?.WebApp;
    webApp?.ready(); webApp?.expand();
    this.initData = webApp?.initData || '';
    if (webApp?.initDataUnsafe?.user) {
      this.user = webApp.initDataUnsafe.user;
      return;
    }
    const storedId = Number(localStorage.getItem('blisko-demo-user-id'));
    if (storedId) {
      this.user = { id: storedId, first_name: localStorage.getItem('blisko-demo-first-name') || 'Пользователь' };
    } else {
      const id = Math.floor(100000 + Math.random() * 900000);
      this.user = { id, first_name: 'Пользователь' };
      localStorage.setItem('blisko-demo-user-id', String(id));
    }
  },
  haptic() { navigator.vibrate?.(8); }
};
