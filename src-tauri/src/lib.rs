mod watcher;
mod llm;
mod vault;

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
        .invoke_handler(tauri::generate_handler![
            vault::init_vault,
            vault::read_tasks,
            vault::write_task,
            vault::delete_task,
            vault::read_projects,
            vault::read_config,
            vault::write_config,
            vault::list_uploads,
            vault::read_file_content,
            watcher::start_watching,
            watcher::stop_watching,
            llm::list_models,
            llm::chat_completion,
            llm::stream_chat,
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
