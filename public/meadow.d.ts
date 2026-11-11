export function readPreference(key: string): string | null;
export function savePreference(key: string, value: string | null): void;
export interface MeadowUI {
  paintBuddy(root?: Document | Element): void;
  closeSidebar(restore?: boolean): void;
  setView(hasMessages: boolean): void;
  setBusy(busy: boolean): void;
}
export function initMeadow(): MeadowUI;
