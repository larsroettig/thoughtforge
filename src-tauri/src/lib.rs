mod watcher;
mod llm;
pub mod vault;
pub mod search;
pub mod mcp_tools;
mod mcp;

use sha2::{Sha256, Digest};
use tauri::Manager;

#[tauri::command]
async fn get_binary_checksum() -> Result<String, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let bytes = std::fs::read(&exe_path).map_err(|e| e.to_string())?;
    let hash = Sha256::digest(&bytes);
    Ok(hex::encode(hash))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(mcp::McpServer(std::sync::Mutex::new(None)))
        .manage(watcher::WatcherState(std::sync::Mutex::new(None)))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            vault::init_vault,
            vault::change_vault_path,
            vault::read_tasks,
            vault::write_task,
            vault::delete_task,
            vault::read_config,
            vault::write_config,
            vault::regenerate_mcp_token,
            vault::list_uploads,
            vault::read_file_content,
            vault::get_system_info,
            vault::read_spaces,
            vault::write_space,
            vault::delete_space,
            vault::read_space_notes,
            vault::write_space_note,
            vault::delete_space_note,
            watcher::start_watching,
            watcher::stop_watching,
            llm::list_models,
            llm::chat_completion,
            llm::stream_chat,
            search::index_space_notes,
            search::search_space_notes,
            search::space_index_status,
            mcp::start_mcp_server,
            mcp::stop_mcp_server,
            mcp::get_mcp_info,
            get_binary_checksum,
            vault::list_skills,
            vault::write_skill,
            vault::delete_skill,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                let _tray = app.tray_by_id("main");
                // Spawn MCP sidecar in background so startup is not blocked.
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = handle.state::<mcp::McpServer>();
                    mcp::try_spawn_sidecar(&handle, &state);
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal application error: {}", e);
            std::process::exit(1);
        });
}
