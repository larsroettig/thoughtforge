use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::ShellExt;

use crate::vault::{vault_config, vault_dir};

pub struct McpServer(pub Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

fn lock_or_recover<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| {
        eprintln!("[warn] McpServer mutex poisoned — recovering");
        e.into_inner()
    })
}

#[derive(serde::Serialize)]
pub struct McpInfo {
    pub token: String,
    pub port: u16,
    pub binary_path: String,
    pub enabled: bool,
    pub http_enabled: bool,
    pub vault_path: String,
}

#[tauri::command]
pub async fn start_mcp_server(
    app: AppHandle,
    state: State<'_, McpServer>,
) -> Result<(), String> {
    let config = vault_config();
    if !config.mcp_http_enabled {
        return Ok(()); // HTTP transport disabled; stdio is managed by the MCP client
    }
    let mut guard = lock_or_recover(&state.0);
    if guard.is_some() {
        return Ok(()); // already running
    }
    let (_, child) = app
        .shell()
        .sidecar("vaultmind-mcp")
        .map_err(|e| e.to_string())?
        .args(["--http", "--port", "7532", "--token", &config.mcp_token])
        .spawn()
        .map_err(|e| e.to_string())?;
    *guard = Some(child);
    Ok(())
}

#[tauri::command]
pub fn stop_mcp_server(state: State<'_, McpServer>) -> Result<(), String> {
    let mut guard = lock_or_recover(&state.0);
    if let Some(child) = guard.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_mcp_info(app: AppHandle) -> McpInfo {
    let config = vault_config();

    // Resolve binary path — looks next to the main executable in release builds.
    let binary_path = app
        .path()
        .resource_dir()
        .ok()
        .and_then(|p| {
            // In macOS .app bundles, binaries live in Contents/MacOS alongside the main exe.
            let candidates: [std::path::PathBuf; 2] = [
                p.parent()?.join("MacOS").join("vaultmind-mcp"),
                p.join("vaultmind-mcp"),
            ];
            candidates.into_iter().find(|c| c.exists()).map(|c| c.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| {
            // Fallback: same directory as the current executable (dev mode).
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.join("vaultmind-mcp").to_string_lossy().to_string()))
                .unwrap_or_else(|| "vaultmind-mcp".to_string())
        });

    McpInfo {
        token: config.mcp_token,
        port: 7532,
        binary_path,
        enabled: config.mcp_enabled,
        http_enabled: config.mcp_http_enabled,
        vault_path: vault_dir().to_string_lossy().to_string(),
    }
}

/// Convenience helper used in lib.rs setup.
pub fn try_spawn_sidecar(app: &AppHandle, state: &McpServer) {
    let config = vault_config();
    if !config.mcp_enabled || !config.mcp_http_enabled {
        return;
    }
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if guard.is_some() {
        return;
    }
    match app
        .shell()
        .sidecar("vaultmind-mcp")
        .and_then(|cmd| {
            cmd.args(["--http", "--port", "7532", "--token", &config.mcp_token])
                .spawn()
        }) {
        Ok((_, child)) => {
            *guard = Some(child);
        }
        Err(e) => {
            eprintln!("[mcp] Failed to start sidecar: {}", e);
        }
    }
}
