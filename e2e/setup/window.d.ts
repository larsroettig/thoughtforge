export {};

declare global {
  interface Window {
    __TAURI_INTERNALS__: {
      invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      listen: (event: string, handler: unknown) => Promise<() => void>;
      emit: (event: string, payload?: unknown) => Promise<void>;
      transformCallback?: (fn: unknown, once?: boolean) => number;
      ipc?: () => void;
    };
    __E2E_MOCK__: {
      invokeCalls: Array<{ cmd: string; args?: unknown }>;
    };
    __TAURI_CB_ID__?: number;
    __TAURI_CALLBACKS__?: Record<number, { fn: unknown; once?: boolean }>;
  }
}
