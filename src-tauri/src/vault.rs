use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    /// Total physical RAM in gigabytes (rounded down).
    pub total_ram_gb: u64,
    /// CPU architecture: "aarch64" (Apple Silicon / ARM) or "x86_64" (Intel/AMD).
    pub cpu_arch: String,
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    use sysinfo::System;
    let sys = System::new_all();
    let total_ram_gb = sys.total_memory() / 1_073_741_824;
    let cpu_arch = std::env::consts::ARCH.to_string();
    SystemInfo { total_ram_gb, cpu_arch }
}

fn home_dir() -> PathBuf {
    std::env::var("HOME").ok().map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
}

fn vault_path_override_file() -> PathBuf {
    home_dir().join(".thoughtforge_path")
}

pub fn vault_dir() -> PathBuf {
    if let Ok(content) = fs::read_to_string(vault_path_override_file()) {
        let p = content.trim().to_string();
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    home_dir().join("Documents").join("ThoughtForge")
}

#[tauri::command]
pub fn change_vault_path(new_path: String) -> Result<String, String> {
    let override_file = vault_path_override_file();
    if new_path.is_empty() {
        if override_file.exists() {
            fs::remove_file(&override_file).map_err(|e| e.to_string())?;
        }
    } else {
        fs::write(&override_file, &new_path).map_err(|e| e.to_string())?;
    }
    Ok(vault_dir().to_string_lossy().to_string())
}

fn spaces_dir() -> PathBuf {
    vault_dir().join("spaces")
}

pub fn space_dir(id: &str) -> PathBuf {
    spaces_dir().join(id)
}

/// Read config without going through the Tauri command layer.
pub fn vault_config() -> VaultConfig {
    let config_path = vault_dir().join("config.yaml");
    if !config_path.exists() {
        return VaultConfig::default();
    }
    let content = fs::read_to_string(&config_path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_default()
}

/// Read notes for a space — shared logic for both the Tauri command and search indexer.
pub fn read_space_notes_internal(space_id: &str) -> Result<Vec<NoteData>, String> {
    let notes_dir = space_dir(space_id).join("notes");
    if !notes_dir.exists() {
        return Ok(vec![]);
    }
    let mut notes = Vec::new();
    let entries = fs::read_dir(&notes_dir)
        .map_err(|e| format!("Failed to read notes dir: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        if let Some(note) = parse_note_markdown(&content) {
            notes.push(note);
        }
    }
    Ok(notes)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskData {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub urgency: String,
    pub project: String,
    pub owner: String,
    pub collaborators: Vec<String>,
    pub source: String,
    pub source_quote: String,
    pub created: String,
    pub due: String,
    pub estimated_hours: f32,
    pub actual_hours: f32,
    pub blocked_by: Vec<String>,
    pub subtasks: Vec<String>,
    pub notes: String,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub time_only: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteData {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub date: String,
    pub content: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StatusColors {
    #[serde(default = "default_todo_color")]
    pub todo: String,
    #[serde(default = "default_in_progress_color")]
    pub in_progress: String,
    #[serde(default = "default_review_color")]
    pub review: String,
    #[serde(default = "default_done_color")]
    pub done: String,
    #[serde(default = "default_blocked_color")]
    pub blocked: String,
}

fn default_todo_color() -> String { "#8b949e".to_string() }
fn default_in_progress_color() -> String { "#d29922".to_string() }
fn default_review_color() -> String { "#58a6ff".to_string() }
fn default_done_color() -> String { "#3fb950".to_string() }
fn default_blocked_color() -> String { "#f85149".to_string() }

impl Default for StatusColors {
    fn default() -> Self {
        Self {
            todo: default_todo_color(),
            in_progress: default_in_progress_color(),
            review: default_review_color(),
            done: default_done_color(),
            blocked: default_blocked_color(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultConfig {
    pub vault_path: String,
    pub lm_studio_url: String,
    pub active_model: String,
    pub watched_folders: Vec<String>,
    pub auto_process: bool,
    pub theme: String,
    #[serde(default)]
    pub user_name: String,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub status_colors: StatusColors,
}

impl Default for VaultConfig {
    fn default() -> Self {
        Self {
            vault_path: vault_dir().to_string_lossy().to_string(),
            lm_studio_url: "http://localhost:1234".to_string(),
            active_model: String::new(),
            watched_folders: vec![],
            auto_process: true,
            theme: "dark".to_string(),
            user_name: String::new(),
            country: "DE".to_string(),
            status_colors: StatusColors::default(),
        }
    }
}

#[tauri::command]
pub fn init_vault() -> Result<String, String> {
    let base = vault_dir();
    let dirs = [
        "boards",
        "uploads/transcripts",
        "uploads/documents",
        "spaces",
    ];

    for dir in &dirs {
        let path = base.join(dir);
        fs::create_dir_all(&path).map_err(|e| format!("Failed to create {}: {}", dir, e))?;
    }

    let config_path = base.join("config.yaml");
    if !config_path.exists() {
        let config = VaultConfig::default();
        let yaml = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        fs::write(&config_path, yaml)
            .map_err(|e| format!("Failed to write config: {}", e))?;
    }

    let board_path = base.join("boards").join("kanban.md");
    if !board_path.exists() {
        let default_board = r#"---
title: Main Board
view: time
columns_time:
  - critical
  - this_week
  - next_2weeks
  - ongoing
columns_status:
  - todo
  - in_progress
  - review
  - done
filters: []
---

# Main Kanban Board
"#;
        fs::write(&board_path, default_board)
            .map_err(|e| format!("Failed to write board: {}", e))?;
    }

    Ok(base.to_string_lossy().to_string())
}

// ── Tasks ────────────────────────────────────────────────────────────────

fn find_task_path(id: &str) -> Option<PathBuf> {
    let sd = spaces_dir();
    if let Ok(entries) = fs::read_dir(&sd) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let p = entry.path().join("tasks").join(format!("{}.md", id));
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn read_tasks() -> Result<Vec<TaskData>, String> {
    let mut tasks = Vec::new();

    // Read from each space's tasks/ directory
    let sd = spaces_dir();
    if sd.exists() {
        if let Ok(entries) = fs::read_dir(&sd) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let space_tasks = entry.path().join("tasks");
                    if space_tasks.exists() {
                        read_tasks_from_dir(&space_tasks, &mut tasks)?;
                    }
                }
            }
        }
    }

    Ok(tasks)
}

fn read_tasks_from_dir(dir: &std::path::Path, tasks: &mut Vec<TaskData>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read tasks dir {}: {}", dir.display(), e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        if let Some(task) = parse_task_markdown(&content) {
            tasks.push(task);
        }
    }
    Ok(())
}

fn parse_task_markdown(content: &str) -> Option<TaskData> {
    let parts: Vec<&str> = content.splitn(3, "---").collect();
    if parts.len() < 3 {
        return None;
    }

    let frontmatter = parts[1].trim();
    let notes = parts[2].trim().to_string();

    let mut task = TaskData {
        id: String::new(),
        title: String::new(),
        status: "todo".to_string(),
        priority: "medium".to_string(),
        urgency: "ongoing".to_string(),
        project: String::new(),
        owner: String::new(),
        collaborators: vec![],
        source: String::new(),
        source_quote: String::new(),
        created: String::new(),
        due: String::new(),
        estimated_hours: 0.0,
        actual_hours: 0.0,
        blocked_by: vec![],
        subtasks: vec![],
        notes,
        archived: false,
        time_only: false,
    };

    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = value.trim().trim_matches('"');
            match key {
                "id" => task.id = value.to_string(),
                "title" => task.title = value.to_string(),
                "status" => task.status = value.to_string(),
                "priority" => task.priority = value.to_string(),
                "urgency" => task.urgency = value.to_string(),
                "project" => task.project = value.to_string(),
                "owner" => task.owner = value.to_string(),
                "source" => task.source = value.to_string(),
                "source_quote" => task.source_quote = value.to_string(),
                "created" => task.created = value.to_string(),
                "due" => task.due = value.to_string(),
                "estimated_hours" => {
                    task.estimated_hours = value.parse().unwrap_or(0.0)
                }
                "actual_hours" => {
                    task.actual_hours = value.parse().unwrap_or(0.0)
                }
                "archived" => {
                    task.archived = value == "true"
                }
                "time_only" => {
                    task.time_only = value == "true"
                }
                _ => {}
            }
        }
    }

    if task.id.is_empty() {
        return None;
    }

    Some(task)
}

#[tauri::command]
pub fn write_task(task: TaskData) -> Result<(), String> {
    // Resolve target directory:
    //   - task has a project → spaces/{project}/tasks/  (create if needed)
    //   - no project         → spaces/general/tasks/    (create if needed)
    let target_dir = if !task.project.is_empty() {
        space_dir(&task.project).join("tasks")
    } else {
        space_dir("general").join("tasks")
    };

    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create tasks dir: {}", e))?;

    let path = target_dir.join(format!("{}.md", task.id));

    let collaborators_str = if task.collaborators.is_empty() {
        "[]".to_string()
    } else {
        format!("[{}]", task.collaborators.join(", "))
    };

    let blocked_by_str = if task.blocked_by.is_empty() {
        "[]".to_string()
    } else {
        format!("[{}]", task.blocked_by.join(", "))
    };

    let subtasks_str = task
        .subtasks
        .iter()
        .map(|s| format!("  - \"{}\"", s))
        .collect::<Vec<_>>()
        .join("\n");

    let content = format!(
        r#"---
id: "{}"
title: "{}"
status: {}
priority: {}
urgency: {}
project: {}
owner: {}
collaborators: {}
source: "{}"
source_quote: "{}"
created: {}
due: {}
estimated_hours: {}
actual_hours: {}
blocked_by: {}
archived: {}
time_only: {}
subtasks:
{}
---

{}
"#,
        task.id,
        task.title.replace('"', r#"\""#),
        task.status,
        task.priority,
        task.urgency,
        task.project,
        task.owner,
        collaborators_str,
        task.source.replace('"', r#"\""#),
        task.source_quote.replace('"', r#"\""#),
        task.created,
        task.due,
        task.estimated_hours,
        task.actual_hours,
        blocked_by_str,
        task.archived,
        task.time_only,
        subtasks_str,
        task.notes
    );

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write task: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn delete_task(id: String) -> Result<(), String> {
    if let Some(path) = find_task_path(&id) {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete task: {}", e))?;
    }
    Ok(())
}

// ── Config ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn read_config() -> Result<VaultConfig, String> {
    let config_path = vault_dir().join("config.yaml");
    if !config_path.exists() {
        return Ok(VaultConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))
}

#[tauri::command]
pub fn write_config(config: VaultConfig) -> Result<(), String> {
    let config_path = vault_dir().join("config.yaml");
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

// ── Uploads ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_uploads() -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let uploads_dir = vault_dir().join("uploads");

    fn walk_dir(dir: &std::path::Path, files: &mut Vec<String>) -> Result<(), String> {
        if !dir.exists() {
            return Ok(());
        }
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("Failed to read dir: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_dir(&path, files)?;
            } else {
                files.push(path.to_string_lossy().to_string());
            }
        }
        Ok(())
    }

    walk_dir(&uploads_dir, &mut files)?;
    Ok(files)
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file {}: {}", path, e))
}

// ── Project Spaces ───────────────────────────────────────────────────────

fn ensure_space_dirs(id: &str) -> Result<(), String> {
    let dir = space_dir(id);
    fs::create_dir_all(dir.join("notes"))
        .map_err(|e| format!("Failed to create notes dir: {}", e))?;
    fs::create_dir_all(dir.join("tasks"))
        .map_err(|e| format!("Failed to create tasks dir: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn read_spaces() -> Result<Vec<serde_json::Value>, String> {
    let sd = spaces_dir();
    if !sd.exists() {
        return Ok(vec![]);
    }

    let mut spaces = Vec::new();
    let entries = fs::read_dir(&sd)
        .map_err(|e| format!("Failed to read spaces dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let space_json = path.join("space.json");
        if !space_json.exists() {
            continue;
        }
        let content = fs::read_to_string(&space_json)
            .map_err(|e| format!("Failed to read {}: {}", space_json.display(), e))?;
        match serde_json::from_str::<serde_json::Value>(&content) {
            Ok(val) => spaces.push(val),
            Err(e) => eprintln!("Failed to parse {}: {}", space_json.display(), e),
        }
    }

    Ok(spaces)
}

#[tauri::command]
pub fn write_space(space: serde_json::Value) -> Result<(), String> {
    let id = space.get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Space must have an id".to_string())?;

    ensure_space_dirs(id)?;

    // Strip notes array — notes live as individual files
    let mut meta = space.clone();
    if let Some(obj) = meta.as_object_mut() {
        obj.remove("notes");
    }

    let content = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Failed to serialize space: {}", e))?;

    fs::write(space_dir(id).join("space.json"), content)
        .map_err(|e| format!("Failed to write space: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn delete_space(id: String) -> Result<(), String> {
    let dir = space_dir(&id);
    if dir.exists() {
        fs::remove_dir_all(&dir)
            .map_err(|e| format!("Failed to delete space: {}", e))?;
    }
    Ok(())
}

// ── Space Notes ──────────────────────────────────────────────────────────

fn note_to_markdown(note: &NoteData) -> String {
    let tags = serde_json::to_string(&note.tags).unwrap_or_else(|_| "[]".to_string());
    format!(
        "---\nid: \"{}\"\ntitle: \"{}\"\ntype: {}\ndate: {}\ntags: {}\n---\n\n{}",
        note.id,
        note.title.replace('"', r#"\""#),
        note.note_type,
        note.date,
        tags,
        note.content,
    )
}

fn parse_note_markdown(content: &str) -> Option<NoteData> {
    let parts: Vec<&str> = content.splitn(3, "---").collect();
    if parts.len() < 3 {
        return None;
    }

    let frontmatter = parts[1].trim();
    let body = parts[2].trim().to_string();

    let mut note = NoteData {
        id: String::new(),
        title: String::new(),
        note_type: "note".to_string(),
        date: String::new(),
        content: body,
        tags: vec![],
    };

    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = value.trim();
            match key {
                "id" => note.id = value.trim_matches('"').to_string(),
                "title" => note.title = value.trim_matches('"').to_string(),
                "type" => note.note_type = value.trim_matches('"').to_string(),
                "date" => note.date = value.trim_matches('"').to_string(),
                "tags" => {
                    if let Ok(tags) = serde_json::from_str::<Vec<String>>(value) {
                        note.tags = tags;
                    }
                }
                _ => {}
            }
        }
    }

    if note.id.is_empty() {
        return None;
    }

    Some(note)
}

#[tauri::command]
pub fn read_space_notes(space_id: String) -> Result<Vec<NoteData>, String> {
    read_space_notes_internal(&space_id)
}

#[tauri::command]
pub fn write_space_note(space_id: String, note: NoteData) -> Result<(), String> {
    let notes_dir = space_dir(&space_id).join("notes");
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("Failed to create notes dir: {}", e))?;

    let path = notes_dir.join(format!("{}.md", note.id));
    let content = note_to_markdown(&note);
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write note: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn delete_space_note(space_id: String, note_id: String) -> Result<(), String> {
    let path = space_dir(&space_id).join("notes").join(format!("{}.md", note_id));
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete note: {}", e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task_md(frontmatter: &str, notes: &str) -> String {
        format!("---\n{}\n---\n\n{}", frontmatter, notes)
    }

    #[test]
    fn parse_task_full_frontmatter() {
        let md = task_md(
            r#"id: "task-001"
title: "Implement search feature"
status: in_progress
priority: high
urgency: this_week
project: testproject
owner: lars
source: "meeting-notes"
source_quote: "We need search ASAP"
created: 2025-06-01
due: 2025-06-15
estimated_hours: 8
actual_hours: 2.5
archived: false"#,
            "Some detailed notes here.",
        );

        let task = parse_task_markdown(&md).expect("should parse a valid task");

        assert_eq!(task.id, "task-001");
        assert_eq!(task.title, "Implement search feature");
        assert_eq!(task.status, "in_progress");
        assert_eq!(task.priority, "high");
        assert_eq!(task.urgency, "this_week");
        assert_eq!(task.project, "testproject");
        assert_eq!(task.owner, "lars");
        assert_eq!(task.source, "meeting-notes");
        assert_eq!(task.source_quote, "We need search ASAP");
        assert_eq!(task.created, "2025-06-01");
        assert_eq!(task.due, "2025-06-15");
        assert!((task.estimated_hours - 8.0).abs() < f32::EPSILON);
        assert!((task.actual_hours - 2.5).abs() < f32::EPSILON);
        assert!(!task.archived);
        assert_eq!(task.notes, "Some detailed notes here.");
    }

    #[test]
    fn parse_task_missing_fields_uses_defaults() {
        let md = task_md("id: task-minimal", "");

        let task = parse_task_markdown(&md).expect("should parse with only id");

        assert_eq!(task.id, "task-minimal");
        assert_eq!(task.status, "todo");
        assert_eq!(task.priority, "medium");
        assert_eq!(task.urgency, "ongoing");
        assert_eq!(task.title, "");
        assert_eq!(task.project, "");
        assert_eq!(task.owner, "");
        assert!((task.estimated_hours - 0.0).abs() < f32::EPSILON);
        assert!((task.actual_hours - 0.0).abs() < f32::EPSILON);
        assert!(!task.archived);
    }

    #[test]
    fn parse_task_invalid_frontmatter_returns_none() {
        assert!(parse_task_markdown("just some plain text").is_none());
        assert!(parse_task_markdown("---\nid: abc\nno closing delimiter").is_none());
    }

    #[test]
    fn parse_task_unquotes_values() {
        let md = task_md(
            r#"id: "task-quoted"
title: "My Quoted Title"
source: "some-source""#,
            "",
        );

        let task = parse_task_markdown(&md).expect("should parse quoted values");

        assert_eq!(task.id, "task-quoted");
        assert_eq!(task.title, "My Quoted Title");
        assert_eq!(task.source, "some-source");
    }

    #[test]
    fn parse_task_archived_true() {
        let md = task_md("id: task-archived\narchived: true", "");
        let task = parse_task_markdown(&md).expect("should parse archived flag");
        assert!(task.archived, "archived should be true");
    }

    #[test]
    fn parse_task_captures_notes_section() {
        let notes_text = "## Meeting notes\n\n- Action item 1\n- Action item 2\n\nMore context here.";
        let md = task_md("id: task-notes", notes_text);
        let task = parse_task_markdown(&md).expect("should capture notes");
        assert_eq!(task.notes, notes_text);
    }

    #[test]
    fn parse_task_missing_id_returns_none() {
        let md = task_md("title: No ID task\nstatus: todo", "notes");
        assert!(parse_task_markdown(&md).is_none());
    }

    #[test]
    fn parse_task_non_numeric_hours_defaults_to_zero() {
        let md = task_md(
            "id: task-badhours\nestimated_hours: not_a_number\nactual_hours: ???",
            "",
        );
        let task = parse_task_markdown(&md).expect("should still parse");
        assert!((task.estimated_hours - 0.0).abs() < f32::EPSILON);
        assert!((task.actual_hours - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn parse_note_roundtrip() {
        let note = NoteData {
            id: "note_123".to_string(),
            title: "Daily Note - 2026-05-15".to_string(),
            note_type: "daily".to_string(),
            date: "2026-05-15".to_string(),
            content: "## What I worked on\n- things".to_string(),
            tags: vec!["work".to_string()],
        };
        let md = note_to_markdown(&note);
        let parsed = parse_note_markdown(&md).expect("should round-trip");
        assert_eq!(parsed.id, note.id);
        assert_eq!(parsed.title, note.title);
        assert_eq!(parsed.note_type, note.note_type);
        assert_eq!(parsed.date, note.date);
        assert_eq!(parsed.content, note.content);
        assert_eq!(parsed.tags, note.tags);
    }
}
