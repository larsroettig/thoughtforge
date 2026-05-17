import { mockTasks, mockSpaces, mockConfig, mockNotes } from "../fixtures/vault-data";

/**
 * Returns a script string that installs a window.__TAURI_INTERNALS__ mock
 * before any app code runs. Playwright injects this via page.addInitScript().
 *
 * The mock routes every invoke() call to fixture data so tests run against
 * the Vite dev server without a real Rust backend.
 */
export function buildTauriMockScript(): string {
  const tasks = JSON.stringify(mockTasks);
  const spaces = JSON.stringify(mockSpaces);
  const config = JSON.stringify(mockConfig);
  const notes = JSON.stringify(mockNotes);

  return `
(function () {
  const tasks = ${tasks};
  const spaces = ${spaces};
  const config = ${config};
  const notes = ${notes};

  const savedTasks = [...tasks];
  const savedSpaces = [...spaces];

  async function mockInvoke(cmd, args) {
    switch (cmd) {
      case "init_vault":
        return config.vault_path;
      case "read_config":
        return config;
      case "write_config":
        return null;
      case "read_tasks":
        return savedTasks;
      case "write_task": {
        const t = args && args.task;
        if (t) {
          const idx = savedTasks.findIndex((x) => x.id === t.id);
          if (idx >= 0) savedTasks[idx] = t;
          else savedTasks.push(t);
        }
        return null;
      }
      case "delete_task": {
        const id = args && args.id;
        const idx = savedTasks.findIndex((x) => x.id === id);
        if (idx >= 0) savedTasks.splice(idx, 1);
        return null;
      }
      case "read_spaces":
        return savedSpaces;
      case "write_space": {
        const s = args && (args.space || args);
        if (s && s.id) {
          const idx = savedSpaces.findIndex((x) => x.id === s.id);
          if (idx >= 0) savedSpaces[idx] = s;
          else savedSpaces.push(s);
        }
        return null;
      }
      case "delete_space":
        return null;
      case "read_space_notes":
        return notes;
      case "write_space_note":
        return null;
      case "delete_space_note":
        return null;
      case "list_skills":
        return [];
      case "write_skill":
        return null;
      case "delete_skill":
        return null;
      case "start_watching":
        return null;
      case "stop_watching":
        return null;
      case "list_models":
        return [];
      case "get_system_info":
        return { total_memory_mb: 32768, arch: "aarch64" };
      case "get_binary_checksum":
        return "mock-checksum-abc123";
      case "get_mcp_info":
        return { token: "mock-token", port: 3000, enabled: false };
      case "start_mcp_server":
        return null;
      case "stop_mcp_server":
        return null;
      case "list_uploads":
        return [];
      case "space_index_status":
        return { indexed: 0, total: 0 };
      default:
        if (cmd.startsWith("plugin:")) return null;
        console.warn("[tauri-mock] unhandled invoke:", cmd, args);
        return null;
    }
  }

  window.__TAURI_INTERNALS__ = {
    invoke: mockInvoke,
    listen: async function (_event, _handler) {
      return function unlisten() {};
    },
    emit: async function () {},
    transformCallback: function (fn, once) {
      const id = window.__TAURI_CB_ID__ = (window.__TAURI_CB_ID__ || 0) + 1;
      window.__TAURI_CALLBACKS__ = window.__TAURI_CALLBACKS__ || {};
      window.__TAURI_CALLBACKS__[id] = { fn, once };
      return id;
    },
    ipc: function () {},
  };

  // Also expose the mock on window for test assertions
  window.__E2E_MOCK__ = { invokeCalls: [] };
  const orig = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = async function (cmd, args) {
    window.__E2E_MOCK__.invokeCalls.push({ cmd, args });
    return orig(cmd, args);
  };
})();
`;
}
