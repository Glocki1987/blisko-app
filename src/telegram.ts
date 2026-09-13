export type TelegramUser = { id: number; first_name: string; username?: string };

export const telegram = {
  user: { id: 0, first_name: '' } as TelegramUser,
  initData: '',
  init() {
    const webApp = (window as Window & { Telegram?: { WebApp?: { ready: () => void; expand: () => void; initData?: string; initDataUnsafe?: { user?: TelegramUser } } } }).Telegram?.WebApp;
    webApp?.ready(); webApp?.expand();
    this.initData = webApp?.initData || '';
    if (webApp?.initDataUnsafe?.user) {
      this.user = webApp.initDataUnsafe.user;
    }
  },
  haptic() { navigator.vibrate?.(8); }
};
