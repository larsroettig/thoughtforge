mod watcher;
mod llm;
mod vault;
mod search;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                let _tray = app.tray_by_id("main");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
