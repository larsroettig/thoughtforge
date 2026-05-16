use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub struct WatcherHandle {
    _watcher: Box<dyn Watcher + Send>,
    _debounce: tokio::task::JoinHandle<()>,
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        self._debounce.abort();
    }
}

pub struct WatcherState(pub Mutex<Option<WatcherHandle>>);

fn lock_or_recover<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| {
        eprintln!("[warn] WatcherState mutex poisoned — recovering");
        e.into_inner()
    })
}

#[tauri::command]
pub fn start_watching(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    let state = app.state::<WatcherState>();

    let (tx, mut rx) = tokio::sync::mpsc::channel::<serde_json::Value>(64);

    // Debounce task: emit a single event 300 ms after the last file-system change.
    let debounce_handle = {
        let app_handle = app.clone();
        tokio::task::spawn(async move {
            use tokio::time::{sleep_until, Duration, Instant};
            let mut pending: Option<serde_json::Value> = None;
            let mut deadline = Instant::now() + Duration::from_secs(3600);
            loop {
                tokio::select! {
                    msg = rx.recv() => match msg {
                        Some(payload) => {
                            pending = Some(payload);
                            deadline = Instant::now() + Duration::from_millis(300);
                        }
                        None => break, // channel closed — watcher dropped
                    },
                    _ = sleep_until(deadline) => {
                        if let Some(p) = pending.take() {
                            let _ = app_handle.emit("file-changed", p);
                        }
                        deadline = Instant::now() + Duration::from_secs(3600);
                    }
                }
            }
        })
    };

    let new_watcher =
        notify::recommended_watcher(move |res: Result<Event, notify::Error>| match res {
            Ok(event) => {
                if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                    for path in &event.paths {
                        if let Some(ext) = path.extension() {
                            let ext = ext.to_string_lossy().to_lowercase();
                            if ext == "txt" || ext == "md" || ext == "pdf" {
                                let payload = serde_json::json!({
                                    "path": path.to_string_lossy().to_string(),
                                    "kind": format!("{:?}", event.kind),
                                });
                                // try_send is non-blocking — safe from notify's internal thread
                                let _ = tx.try_send(payload);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Watch error: {:?}", e);
            }
        })
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

    let mut boxed: Box<dyn Watcher + Send> = Box::new(new_watcher);

    let home = std::env::var("HOME")
        .ok()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    for path_str in &paths {
        let path = std::path::Path::new(path_str);
        if !path.exists() {
            continue;
        }
        let canonical = path
            .canonicalize()
            .unwrap_or_else(|_| path.to_path_buf());
        if !canonical.starts_with(&home) {
            return Err(format!(
                "Watched path '{}' is outside the home directory",
                path_str
            ));
        }
        boxed
            .watch(path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch {}: {}", path_str, e))?;
    }

    let mut guard = lock_or_recover(&state.0);
    *guard = Some(WatcherHandle {
        _watcher: boxed,
        _debounce: debounce_handle,
    });

    Ok(())
}

#[tauri::command]
pub fn stop_watching(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let mut guard = lock_or_recover(&state.0);
    // Dropping WatcherHandle aborts the debounce task and releases the watcher's FDs.
    *guard = None;
    Ok(())
}
