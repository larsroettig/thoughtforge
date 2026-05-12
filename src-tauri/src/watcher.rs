use notify::{RecursiveMode, Watcher, Event, EventKind};
use tauri::{AppHandle, Emitter};
use std::path::Path;

#[tauri::command]
pub fn start_watching(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    let app_handle = app.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        match res {
            Ok(event) => {
                if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                    for path in &event.paths {
                        if let Some(ext) = path.extension() {
                            let ext = ext.to_string_lossy().to_lowercase();
                            if ext == "txt" || ext == "md" || ext == "pdf" {
                                let _ = app_handle.emit("file-changed", serde_json::json!({
                                    "path": path.to_string_lossy().to_string(),
                                    "kind": format!("{:?}", event.kind),
                                }));
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Watch error: {:?}", e);
            }
        }
    })
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    for path_str in &paths {
        let path = Path::new(path_str);
        if path.exists() {
            watcher
                .watch(path, RecursiveMode::Recursive)
                .map_err(|e| format!("Failed to watch {}: {}", path_str, e))?;
        }
    }

    // Store watcher to keep it alive (simplified - in production use State)
    std::mem::forget(watcher);

    Ok(())
}

#[tauri::command]
pub fn stop_watching() -> Result<(), String> {
    // In a full implementation, we'd stop the stored watcher
    Ok(())
}
