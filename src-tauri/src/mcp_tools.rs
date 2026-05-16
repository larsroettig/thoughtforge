use rmcp::{
    handler::server::wrapper::Parameters,
    model::*,
    schemars,
    ServerHandler,
};
use serde::Deserialize;
use serde_json::json;
use crate::vault::{self, TaskData, NoteData};

#[derive(Clone)]
pub struct VaultMcpServer {
    pub token: String,
}

impl VaultMcpServer {
    pub fn new(token: impl Into<String>) -> Self {
        Self { token: token.into() }
    }
}

fn result_to_text<T: serde::Serialize>(res: Result<T, String>) -> CallToolResult {
    match res {
        Ok(val) => CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&val).unwrap_or_default()
        )]),
        Err(e) => CallToolResult::error(vec![Content::text(e)]),
    }
}

fn err_text(msg: impl std::fmt::Display) -> CallToolResult {
    CallToolResult::error(vec![Content::text(msg.to_string())])
}

// ── Parameter structs ──────────────────────────────────────────────────────

#[derive(Deserialize, schemars::JsonSchema)]
struct ListTasksParams {
    space_id: Option<String>,
    status: Option<String>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct GetTaskParams {
    id: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct CreateTaskParams {
    title: String,
    project: Option<String>,
    priority: Option<String>,
    urgency: Option<String>,
    due: Option<String>,
    notes: Option<String>,
    owner: Option<String>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct UpdateTaskParams {
    id: String,
    title: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    urgency: Option<String>,
    due: Option<String>,
    notes: Option<String>,
    owner: Option<String>,
    archived: Option<bool>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct DeleteTaskParams {
    id: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct ListNotesParams {
    space_id: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct CreateNoteParams {
    space_id: String,
    title: String,
    content: String,
    note_type: Option<String>,
    tags: Option<String>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct DeleteNoteParams {
    space_id: String,
    note_id: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct SearchNotesParams {
    space_id: String,
    query: String,
    limit: Option<usize>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct ListGoalsParams {
    space_id: Option<String>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct CreateGoalParams {
    title: String,
    space_id: String,
    metric: Option<String>,
    target: Option<String>,
    current: Option<String>,
    difficulty: Option<String>,
    due: Option<String>,
    notes: Option<String>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct UpdateGoalParams {
    goal_id: String,
    space_id: String,
    title: Option<String>,
    metric: Option<String>,
    target: Option<String>,
    current: Option<String>,
    difficulty: Option<String>,
    due: Option<String>,
    status: Option<String>,
    notes: Option<String>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct DeleteGoalParams {
    goal_id: String,
    space_id: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct GetSkillParams {
    id: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct CreateSkillParams {
    name: String,
    description: Option<String>,
    content: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct DeleteSkillParams {
    id: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct DownloadSkillParams {
    /// HTTPS URL to a raw skill markdown file (e.g. GitHub raw content URL).
    url: String,
    /// Override the skill name parsed from the file's frontmatter.
    name: Option<String>,
}

// ── Tool implementations ───────────────────────────────────────────────────

#[rmcp::tool_router]
impl VaultMcpServer {
    #[rmcp::tool(description = "List tasks. Optional params: space_id (string), status (todo|in_progress|review|done|blocked)")]
    fn list_tasks(&self, Parameters(p): Parameters<ListTasksParams>) -> CallToolResult {
        let res = vault::read_tasks().map(|tasks| {
            tasks.into_iter()
                .filter(|t| p.space_id.as_deref().map_or(true, |id| t.project == id))
                .filter(|t| p.status.as_deref().map_or(true, |s| t.status == s))
                .collect::<Vec<_>>()
        });
        result_to_text(res)
    }

    #[rmcp::tool(description = "Get a task by ID")]
    fn get_task(&self, Parameters(p): Parameters<GetTaskParams>) -> CallToolResult {
        match vault::read_tasks() {
            Ok(tasks) => match tasks.into_iter().find(|t| t.id == p.id) {
                Some(task) => result_to_text::<TaskData>(Ok(task)),
                None => err_text(format!("Task '{}' not found", p.id)),
            },
            Err(e) => err_text(e),
        }
    }

    #[rmcp::tool(description = "Create a task. Required: title. Optional: project, priority (critical|high|medium|low), urgency (overdue|today|this_week|next_2weeks|ongoing), due (YYYY-MM-DD), notes, owner")]
    async fn create_task(&self, Parameters(p): Parameters<CreateTaskParams>) -> CallToolResult {
        let task = TaskData {
            id: format!("task_{}", uuid::Uuid::new_v4()),
            title: p.title,
            status: "todo".to_string(),
            priority: p.priority.unwrap_or_else(|| "medium".to_string()),
            urgency: p.urgency.unwrap_or_else(|| "ongoing".to_string()),
            project: p.project.unwrap_or_default(),
            owner: p.owner.unwrap_or_default(),
            collaborators: vec![],
            source: String::new(),
            source_quote: String::new(),
            created: chrono::Local::now().format("%Y-%m-%d").to_string(),
            due: p.due.unwrap_or_default(),
            estimated_hours: 0.0,
            actual_hours: 0.0,
            blocked_by: vec![],
            subtasks: vec![],
            notes: p.notes.unwrap_or_default(),
            archived: false,
            time_only: false,
        };
        match vault::write_task(task.clone()).await {
            Ok(()) => result_to_text::<TaskData>(Ok(task)),
            Err(e) => err_text(e),
        }
    }

    #[rmcp::tool(description = "Update a task. Required: id. Optional: title, status, priority, urgency, due, notes, owner, archived")]
    async fn update_task(&self, Parameters(p): Parameters<UpdateTaskParams>) -> CallToolResult {
        match vault::read_tasks() {
            Err(e) => return err_text(e),
            Ok(tasks) => {
                let Some(mut task) = tasks.into_iter().find(|t| t.id == p.id) else {
                    return err_text(format!("Task '{}' not found", p.id));
                };
                if let Some(v) = p.title    { task.title    = v; }
                if let Some(v) = p.status   { task.status   = v; }
                if let Some(v) = p.priority { task.priority = v; }
                if let Some(v) = p.urgency  { task.urgency  = v; }
                if let Some(v) = p.due      { task.due      = v; }
                if let Some(v) = p.notes    { task.notes    = v; }
                if let Some(v) = p.owner    { task.owner    = v; }
                if let Some(v) = p.archived { task.archived = v; }
                match vault::write_task(task.clone()).await {
                    Ok(()) => result_to_text::<TaskData>(Ok(task)),
                    Err(e) => err_text(e),
                }
            }
        }
    }

    #[rmcp::tool(description = "Delete a task by ID")]
    async fn delete_task(&self, Parameters(p): Parameters<DeleteTaskParams>) -> CallToolResult {
        result_to_text(vault::delete_task(p.id, None).await)
    }

    #[rmcp::tool(description = "List all project spaces in the vault")]
    fn list_spaces(&self) -> CallToolResult {
        result_to_text(vault::read_spaces())
    }

    #[rmcp::tool(description = "List notes in a project space. Required: space_id")]
    fn list_notes(&self, Parameters(p): Parameters<ListNotesParams>) -> CallToolResult {
        result_to_text(vault::read_space_notes_internal(&p.space_id))
    }

    #[rmcp::tool(description = "Create a note. Required: space_id, title, content. Optional: note_type (daily|meeting|note), tags (comma-separated)")]
    async fn create_note(&self, Parameters(p): Parameters<CreateNoteParams>) -> CallToolResult {
        let note = NoteData {
            id: format!("note_{}", uuid::Uuid::new_v4()),
            title: p.title,
            note_type: p.note_type.unwrap_or_else(|| "note".to_string()),
            date: chrono::Local::now().format("%Y-%m-%d").to_string(),
            content: p.content,
            tags: p.tags.as_deref().unwrap_or("").split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
        };
        match vault::write_space_note(p.space_id, note.clone()).await {
            Ok(()) => result_to_text::<NoteData>(Ok(note)),
            Err(e) => err_text(e),
        }
    }

    #[rmcp::tool(description = "Delete a note. Required: space_id, note_id")]
    async fn delete_note(&self, Parameters(p): Parameters<DeleteNoteParams>) -> CallToolResult {
        result_to_text(vault::delete_space_note(p.space_id, p.note_id).await)
    }

    #[rmcp::tool(description = "Semantic search in a space's notes. Required: space_id, query. Optional: limit (default 5). Returns error if LM Studio unavailable.")]
    async fn search_notes(&self, Parameters(p): Parameters<SearchNotesParams>) -> CallToolResult {
        result_to_text(crate::search::search_space_notes(p.space_id, p.query, p.limit).await)
    }

    #[rmcp::tool(description = "List SMART goals. Optional: space_id filter")]
    fn list_goals(&self, Parameters(p): Parameters<ListGoalsParams>) -> CallToolResult {
        match vault::read_spaces() {
            Err(e) => err_text(e),
            Ok(spaces) => {
                let goals: Vec<serde_json::Value> = spaces.iter()
                    .filter(|s| p.space_id.as_ref().map_or(true, |id| {
                        s.get("id").and_then(|v| v.as_str()) == Some(id.as_str())
                    }))
                    .flat_map(|s| s.get("goals").and_then(|g| g.as_array()).cloned().unwrap_or_default())
                    .collect();
                result_to_text::<Vec<serde_json::Value>>(Ok(goals))
            }
        }
    }

    #[rmcp::tool(description = "Create a SMART goal. Required: title, space_id. Optional: metric, target, current, difficulty (easy|moderate|stretch), due (YYYY-MM-DD), notes")]
    async fn create_goal(&self, Parameters(p): Parameters<CreateGoalParams>) -> CallToolResult {
        let goal = json!({
            "id": format!("goal_{}", uuid::Uuid::new_v4()),
            "title": p.title,
            "metric": p.metric.unwrap_or_default(),
            "target": p.target.unwrap_or_default(),
            "current": p.current.unwrap_or_default(),
            "difficulty": p.difficulty.unwrap_or_else(|| "moderate".to_string()),
            "space": p.space_id.clone(),
            "due": p.due.unwrap_or_default(),
            "status": "active",
            "linked_tasks": [],
            "notes": p.notes.unwrap_or_default(),
            "created": chrono::Local::now().format("%Y-%m-%d").to_string(),
        });
        upsert_goal(p.space_id, goal).await
    }

    #[rmcp::tool(description = "Update a goal. Required: goal_id, space_id. Optional: title, metric, target, current, difficulty, due, status (active|completed|abandoned), notes")]
    async fn update_goal(&self, Parameters(p): Parameters<UpdateGoalParams>) -> CallToolResult {
        match vault::read_spaces() {
            Err(e) => return err_text(e),
            Ok(mut spaces) => {
                let Some(space_val) = spaces.iter_mut().find(|s| {
                    s.get("id").and_then(|v| v.as_str()) == Some(&p.space_id)
                }) else {
                    return err_text(format!("Space '{}' not found", p.space_id));
                };
                let goals = space_val.get_mut("goals").and_then(|g| g.as_array_mut());
                let Some(goals) = goals else {
                    return err_text(format!("No goals in space '{}'", p.space_id));
                };
                let Some(goal) = goals.iter_mut().find(|g| {
                    g.get("id").and_then(|v| v.as_str()) == Some(&p.goal_id)
                }) else {
                    return err_text(format!("Goal '{}' not found", p.goal_id));
                };
                if let Some(v) = p.title      { goal["title"]      = json!(v); }
                if let Some(v) = p.metric     { goal["metric"]     = json!(v); }
                if let Some(v) = p.target     { goal["target"]     = json!(v); }
                if let Some(v) = p.current    { goal["current"]    = json!(v); }
                if let Some(v) = p.difficulty { goal["difficulty"] = json!(v); }
                if let Some(v) = p.due        { goal["due"]        = json!(v); }
                if let Some(v) = p.status     { goal["status"]     = json!(v); }
                if let Some(v) = p.notes      { goal["notes"]      = json!(v); }
                let updated_goal = goal.clone();
                let updated_space = space_val.clone();
                if let Err(e) = vault::write_space(updated_space).await {
                    return err_text(e);
                }
                result_to_text::<serde_json::Value>(Ok(updated_goal))
            }
        }
    }

    #[rmcp::tool(description = "List all skills stored in the vault's skills/ folder")]
    fn list_skills(&self) -> CallToolResult {
        result_to_text(vault::read_skills())
    }

    #[rmcp::tool(description = "Get a skill by ID. Required: id")]
    fn get_skill(&self, Parameters(p): Parameters<GetSkillParams>) -> CallToolResult {
        match vault::read_skills() {
            Ok(skills) => match skills.into_iter().find(|s| s.id == p.id) {
                Some(s) => result_to_text::<vault::SkillData>(Ok(s)),
                None => err_text(format!("Skill '{}' not found", p.id)),
            },
            Err(e) => err_text(e),
        }
    }

    #[rmcp::tool(description = "Create a skill in the vault. Required: name, content. Optional: description")]
    async fn create_skill(&self, Parameters(p): Parameters<CreateSkillParams>) -> CallToolResult {
        let skill = vault::SkillData {
            id: format!("skill_{}", uuid::Uuid::new_v4()),
            name: p.name,
            description: p.description.unwrap_or_default(),
            content: p.content,
            source_url: String::new(),
            created: chrono::Local::now().format("%Y-%m-%d").to_string(),
        };
        match vault::write_skill(skill.clone()).await {
            Ok(()) => result_to_text::<vault::SkillData>(Ok(skill)),
            Err(e) => err_text(e),
        }
    }

    #[rmcp::tool(description = "Delete a skill by ID. Required: id")]
    async fn delete_skill(&self, Parameters(p): Parameters<DeleteSkillParams>) -> CallToolResult {
        result_to_text(vault::delete_skill(p.id).await)
    }

    #[rmcp::tool(description = "Download a skill from a remote HTTPS URL and save it to the vault. Required: url (must be https://). Optional: name override")]
    async fn download_skill(&self, Parameters(p): Parameters<DownloadSkillParams>) -> CallToolResult {
        let url = match crate::llm::validate_external_url(&p.url) {
            Ok(u) => u,
            Err(e) => return err_text(e),
        };
        let body = match reqwest::get(url).await {
            Ok(resp) => match resp.text().await {
                Ok(t) => t,
                Err(e) => return err_text(format!("Failed to read response: {}", e)),
            },
            Err(e) => return err_text(format!("Download failed: {}", e)),
        };
        // Parse frontmatter if present; otherwise use the whole body as content.
        let (name, description, content) = if body.starts_with("---\n") {
            let inner = body.trim_start_matches("---\n");
            if let Some((fm, rest)) = inner.split_once("\n---") {
                let get = |key: &str| -> String {
                    fm.lines()
                        .find(|l| l.starts_with(&format!("{}:", key)))
                        .and_then(|l| l.splitn(2, ':').nth(1))
                        .map(|v| v.trim().trim_matches('"').to_string())
                        .unwrap_or_default()
                };
                (get("name"), get("description"), rest.trim_start_matches('\n').to_string())
            } else {
                (String::new(), String::new(), body.clone())
            }
        } else {
            (String::new(), String::new(), body.clone())
        };
        let skill = vault::SkillData {
            id: format!("skill_{}", uuid::Uuid::new_v4()),
            name: p.name.unwrap_or(name).trim().to_string(),
            description,
            content,
            source_url: p.url,
            created: chrono::Local::now().format("%Y-%m-%d").to_string(),
        };
        match vault::write_skill(skill.clone()).await {
            Ok(()) => result_to_text::<vault::SkillData>(Ok(skill)),
            Err(e) => err_text(e),
        }
    }

    #[rmcp::tool(description = "Delete a goal. Required: goal_id, space_id")]
    async fn delete_goal(&self, Parameters(p): Parameters<DeleteGoalParams>) -> CallToolResult {
        match vault::read_spaces() {
            Err(e) => return err_text(e),
            Ok(mut spaces) => {
                let Some(space_val) = spaces.iter_mut().find(|s| {
                    s.get("id").and_then(|v| v.as_str()) == Some(&p.space_id)
                }) else {
                    return err_text(format!("Space '{}' not found", p.space_id));
                };
                if let Some(goals) = space_val.get_mut("goals").and_then(|g| g.as_array_mut()) {
                    goals.retain(|g| g.get("id").and_then(|v| v.as_str()) != Some(&p.goal_id));
                }
                let updated_space = space_val.clone();
                if let Err(e) = vault::write_space(updated_space).await {
                    return err_text(e);
                }
                CallToolResult::success(vec![Content::text("Goal deleted")])
            }
        }
    }
}

async fn upsert_goal(space_id: String, goal: serde_json::Value) -> CallToolResult {
    match vault::read_spaces() {
        Err(e) => return err_text(e),
        Ok(mut spaces) => {
            let Some(space_val) = spaces.iter_mut().find(|s| {
                s.get("id").and_then(|v| v.as_str()) == Some(&space_id)
            }) else {
                return err_text(format!("Space '{}' not found", space_id));
            };
            match space_val.get_mut("goals") {
                Some(serde_json::Value::Array(goals)) => goals.push(goal.clone()),
                _ => { space_val["goals"] = serde_json::Value::Array(vec![goal.clone()]); }
            }
            let updated_space = space_val.clone();
            if let Err(e) = vault::write_space(updated_space).await {
                return err_text(e);
            }
            result_to_text::<serde_json::Value>(Ok(goal))
        }
    }
}

#[rmcp::tool_handler]
impl ServerHandler for VaultMcpServer {}
