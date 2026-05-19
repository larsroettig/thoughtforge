use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use axum::response::sse::{Event, KeepAlive, Sse};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::{convert::Infallible, net::SocketAddr, sync::Arc};
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt as _;

use crate::{llm, search, vault};

// ── Locate the frontend static directory ────────────────────────────────
//
// Resolution order:
//   1. THOUGHTFORGE_PUBLIC env var (dev override or custom install)
//   2. <exe-dir>/dist/          (binary shipped next to dist/)
//   3. <exe-dir>/../share/thoughtforge/  (Homebrew: bin/ → share/)
//   4. ./dist/                  (cargo run from repo root)

fn find_static_dir() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("THOUGHTFORGE_PUBLIC") {
        return std::path::PathBuf::from(p);
    }
    if let Ok(exe) = std::env::current_exe() {
        let exe_dir = exe.parent().unwrap_or(std::path::Path::new("."));
        let next_to = exe_dir.join("dist");
        if next_to.join("index.html").exists() {
            return next_to;
        }
        let homebrew = exe_dir.parent().unwrap_or(std::path::Path::new("."))
            .join("share").join("thoughtforge");
        if homebrew.join("index.html").exists() {
            return homebrew;
        }
    }
    std::path::PathBuf::from("dist")
}

// ── App state ────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    /// Directory containing the compiled React SPA
    pub static_dir: std::path::PathBuf,
    /// Pending SSE stream sessions: session_id → stream request params
    pub sessions: Arc<DashMap<String, StreamChatSession>>,
    /// Running MCP child process
    pub mcp_child: Arc<std::sync::Mutex<Option<std::process::Child>>>,
}

#[derive(Clone, Debug)]
pub struct StreamChatSession {
    pub base_url: String,
    pub model: String,
    pub messages: Vec<llm::ChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub provider: vault::LlmProvider,
    pub api_key: String,
}

// ── Entry point ──────────────────────────────────────────────────────────

pub async fn serve(open_browser: bool, port: u16) {
    let static_dir = find_static_dir();
    eprintln!("Serving frontend from: {}", static_dir.display());

    let state = AppState {
        static_dir,
        sessions: Arc::new(DashMap::new()),
        mcp_child: Arc::new(std::sync::Mutex::new(None)),
    };

    // Spawn session TTL cleanup every 60 s
    let cleanup_sessions = state.sessions.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            cleanup_sessions.retain(|_, _| false); // simple: drop all after 60 s
        }
    });

    let app = Router::new()
        // vault
        .route("/api/init_vault",           post(init_vault))
        .route("/api/change_vault_path",    post(change_vault_path))
        .route("/api/read_tasks",           post(read_tasks))
        .route("/api/write_task",           post(write_task))
        .route("/api/delete_task",          post(delete_task))
        .route("/api/read_config",          post(read_config))
        .route("/api/write_config",         post(write_config))
        .route("/api/regenerate_mcp_token", post(regenerate_mcp_token))
        .route("/api/read_spaces",          post(read_spaces))
        .route("/api/write_space",          post(write_space))
        .route("/api/delete_space",         post(delete_space))
        .route("/api/read_space_notes",     post(read_space_notes))
        .route("/api/write_space_note",     post(write_space_note))
        .route("/api/delete_space_note",    post(delete_space_note))
        .route("/api/read_file_content",    post(read_file_content))
        .route("/api/list_uploads",         post(list_uploads))
        .route("/api/list_skills",          post(list_skills))
        .route("/api/write_skill",          post(write_skill))
        .route("/api/delete_skill",         post(delete_skill))
        .route("/api/get_system_info",      post(get_system_info))
        .route("/api/get_binary_checksum",  post(get_binary_checksum))
        // llm
        .route("/api/list_models",          post(list_models))
        .route("/api/chat_completion",      post(chat_completion))
        .route("/api/stream_chat",          post(stream_chat_init))
        .route("/api/stream_chat/{id}",     get(stream_chat_sse))
        // search
        .route("/api/index_space_notes",    post(index_space_notes))
        .route("/api/search_space_notes",   post(search_space_notes))
        .route("/api/space_index_status",   post(space_index_status))
        // mcp
        .route("/api/start_mcp_server",     post(start_mcp_server))
        .route("/api/stop_mcp_server",      post(stop_mcp_server))
        .route("/api/get_mcp_info",         post(get_mcp_info))
        // version
        .route("/api/version",              get(version))
        // SPA fallback
        .fallback(serve_spa)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|_| panic!("failed to bind port {}", port));

    let url = format!("http://127.0.0.1:{}", port);
    eprintln!("ThoughtForge running at {}", url);

    if open_browser {
        let url_clone = url.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            let _ = open::that(url_clone);
        });
    }

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    eprintln!("\nThoughtForge shutting down…");
}

// ── SPA static file handler ───────────────────────────────────────────────

async fn serve_spa(State(state): State<AppState>, uri: axum::http::Uri) -> Response {
    let req_path = uri.path().trim_start_matches('/');

    // Unknown /api/* routes are not SPA pages — return 404.
    if req_path.starts_with("api/") {
        return (StatusCode::NOT_FOUND, "Unknown API endpoint").into_response();
    }

    let file = if req_path.is_empty() { "index.html" } else { req_path };
    let full = state.static_dir.join(file);

    if let Ok(bytes) = tokio::fs::read(&full).await {
        let mime = mime_guess::from_path(&full).first_or_octet_stream();
        return ([(header::CONTENT_TYPE, mime.as_ref())], bytes).into_response();
    }

    // SPA routing: unknown paths serve index.html so client-side router handles them.
    match tokio::fs::read(state.static_dir.join("index.html")).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], bytes).into_response(),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            "Frontend not built. Run: bun run build",
        ).into_response(),
    }
}

async fn version() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "version": env!("CARGO_PKG_VERSION") }))
}

// ── Vault handlers ────────────────────────────────────────────────────────

type ApiResult<T> = Result<Json<T>, (StatusCode, String)>;

fn err(e: String) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, e)
}

fn bad(e: String) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, e)
}

async fn init_vault() -> ApiResult<String> {
    vault::init_vault().await.map(Json).map_err(err)
}

#[derive(Deserialize)]
struct ChangeVaultPathArgs { new_path: String }

async fn change_vault_path(Json(args): Json<ChangeVaultPathArgs>) -> ApiResult<String> {
    vault::change_vault_path(args.new_path).map(Json).map_err(err)
}

async fn read_tasks() -> ApiResult<serde_json::Value> {
    vault::read_tasks().map(|v| Json(serde_json::to_value(v).unwrap())).map_err(err)
}

#[derive(Deserialize)]
struct WriteTaskArgs { task: serde_json::Value }

async fn write_task(Json(args): Json<WriteTaskArgs>) -> ApiResult<()> {
    let task = serde_json::from_value(args.task).map_err(|e| bad(e.to_string()))?;
    vault::write_task(task).await.map(Json).map_err(err)
}

#[derive(Deserialize)]
struct DeleteTaskArgs { id: String, space_id: Option<String> }

async fn delete_task(Json(args): Json<DeleteTaskArgs>) -> ApiResult<()> {
    vault::delete_task(args.id, args.space_id).await.map(Json).map_err(err)
}

async fn read_config() -> ApiResult<serde_json::Value> {
    vault::read_config()
        .map(|c| Json(serde_json::to_value(c).unwrap()))
        .map_err(err)
}

#[derive(Deserialize)]
struct WriteConfigArgs { config: serde_json::Value }

async fn write_config(Json(args): Json<WriteConfigArgs>) -> ApiResult<()> {
    let config = serde_json::from_value(args.config).map_err(|e| bad(e.to_string()))?;
    vault::write_config(config).await.map(Json).map_err(err)
}

async fn regenerate_mcp_token() -> ApiResult<String> {
    vault::regenerate_mcp_token().map(Json).map_err(err)
}

async fn read_spaces() -> ApiResult<serde_json::Value> {
    vault::read_spaces()
        .map(|v| Json(serde_json::to_value(v).unwrap()))
        .map_err(err)
}

#[derive(Deserialize)]
struct WriteSpaceArgs { space: serde_json::Value }

async fn write_space(Json(args): Json<WriteSpaceArgs>) -> ApiResult<()> {
    let space = serde_json::from_value(args.space).map_err(|e| bad(e.to_string()))?;
    vault::write_space(space).await.map(Json).map_err(err)
}

#[derive(Deserialize)]
struct DeleteSpaceArgs { id: String }

async fn delete_space(Json(args): Json<DeleteSpaceArgs>) -> ApiResult<()> {
    vault::delete_space(args.id).map(Json).map_err(err)
}

#[derive(Deserialize)]
struct SpaceIdArgs { space_id: String }

async fn read_space_notes(Json(args): Json<SpaceIdArgs>) -> ApiResult<serde_json::Value> {
    vault::read_space_notes(args.space_id)
        .map(|v| Json(serde_json::to_value(v).unwrap()))
        .map_err(err)
}

#[derive(Deserialize)]
struct WriteSpaceNoteArgs { space_id: String, note: serde_json::Value }

async fn write_space_note(Json(args): Json<WriteSpaceNoteArgs>) -> ApiResult<()> {
    let note = serde_json::from_value(args.note).map_err(|e| bad(e.to_string()))?;
    vault::write_space_note(args.space_id, note).await.map(Json).map_err(err)
}

#[derive(Deserialize)]
struct DeleteSpaceNoteArgs { space_id: String, note_id: String }

async fn delete_space_note(Json(args): Json<DeleteSpaceNoteArgs>) -> ApiResult<()> {
    vault::delete_space_note(args.space_id, args.note_id).await.map(Json).map_err(err)
}

#[derive(Deserialize)]
struct ReadFileArgs { path: String }

async fn read_file_content(Json(args): Json<ReadFileArgs>) -> ApiResult<String> {
    vault::read_file_content(args.path).map(Json).map_err(err)
}

async fn list_uploads() -> ApiResult<serde_json::Value> {
    vault::list_uploads()
        .map(|v| Json(serde_json::to_value(v).unwrap()))
        .map_err(err)
}

async fn list_skills() -> ApiResult<serde_json::Value> {
    vault::list_skills()
        .map(|v| Json(serde_json::to_value(v).unwrap()))
        .map_err(err)
}

#[derive(Deserialize)]
struct WriteSkillArgs { skill: serde_json::Value }

async fn write_skill(Json(args): Json<WriteSkillArgs>) -> ApiResult<()> {
    let skill = serde_json::from_value(args.skill).map_err(|e| bad(e.to_string()))?;
    vault::write_skill(skill).await.map(Json).map_err(err)
}

#[derive(Deserialize)]
struct DeleteSkillArgs { skill_id: String }

async fn delete_skill(Json(args): Json<DeleteSkillArgs>) -> ApiResult<()> {
    vault::delete_skill(args.skill_id).await.map(Json).map_err(err)
}

async fn get_system_info() -> Json<serde_json::Value> {
    Json(serde_json::to_value(vault::get_system_info()).unwrap_or_default())
}

async fn get_binary_checksum() -> ApiResult<String> {
    use sha2::{Digest, Sha256};
    let exe_path = std::env::current_exe().map_err(|e| err(e.to_string()))?;
    let bytes = std::fs::read(&exe_path).map_err(|e| err(e.to_string()))?;
    Ok(Json(hex::encode(Sha256::digest(&bytes))))
}

// ── LLM handlers ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ListModelsArgs {
    base_url: String,
    #[serde(default)]
    provider: vault::LlmProvider,
    #[serde(default)]
    api_key: String,
}

async fn list_models(Json(args): Json<ListModelsArgs>) -> ApiResult<serde_json::Value> {
    llm::list_models(args.base_url, args.provider, args.api_key)
        .await
        .map(|v| Json(serde_json::to_value(v).unwrap()))
        .map_err(err)
}

#[derive(Deserialize)]
struct ChatCompletionArgs {
    model: String,
    messages: Vec<llm::ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<i32>,
}

async fn chat_completion(Json(args): Json<ChatCompletionArgs>) -> ApiResult<String> {
    let config = vault::vault_config();
    let base_url = llm::provider_base_url(&config);
    llm::chat_completion(base_url, args.model, args.messages, args.temperature, args.max_tokens, config.llm_provider, config.api_key)
        .await
        .map(Json)
        .map_err(err)
}

// Two-step SSE: POST to register session, GET to consume stream

#[derive(Deserialize)]
struct StreamChatArgs {
    model: String,
    messages: Vec<llm::ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<i32>,
}

#[derive(Serialize)]
struct StreamChatInitResponse { session_id: String }

async fn stream_chat_init(
    State(state): State<AppState>,
    Json(args): Json<StreamChatArgs>,
) -> ApiResult<StreamChatInitResponse> {
    let config = vault::vault_config();
    let base_url = llm::provider_base_url(&config);
    let session_id = uuid::Uuid::new_v4().to_string();
    state.sessions.insert(session_id.clone(), StreamChatSession {
        base_url,
        model: args.model,
        messages: args.messages,
        temperature: args.temperature,
        max_tokens: args.max_tokens,
        provider: config.llm_provider,
        api_key: config.api_key,
    });
    Ok(Json(StreamChatInitResponse { session_id }))
}

async fn stream_chat_sse(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Response {
    let Some((_, session)) = state.sessions.remove(&session_id) else {
        return (StatusCode::NOT_FOUND, "Session not found").into_response();
    };

    let (tx, rx) = tokio::sync::mpsc::channel::<String>(64);

    tokio::spawn(async move {
        let _ = llm::stream_chat_inner(
            session.base_url,
            session.model,
            session.messages,
            session.temperature,
            session.max_tokens,
            tx,
            session.provider,
            session.api_key,
        ).await;
    });

    let stream = ReceiverStream::new(rx)
        .map(|chunk| -> Result<Event, Infallible> {
            Ok(Event::default().data(chunk))
        });

    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}

// ── Search handlers ───────────────────────────────────────────────────────

async fn index_space_notes(Json(args): Json<SpaceIdArgs>) -> ApiResult<usize> {
    search::index_space_notes(args.space_id).await.map(Json).map_err(err)
}

#[derive(Deserialize)]
struct SearchArgs { space_id: String, query: String, limit: Option<usize> }

async fn search_space_notes(Json(args): Json<SearchArgs>) -> ApiResult<serde_json::Value> {
    search::search_space_notes(args.space_id, args.query, args.limit)
        .await
        .map(|v| Json(serde_json::to_value(v).unwrap()))
        .map_err(err)
}

async fn space_index_status(Json(args): Json<SpaceIdArgs>) -> Json<serde_json::Value> {
    Json(search::space_index_status(args.space_id))
}

// ── MCP server handlers ───────────────────────────────────────────────────

async fn start_mcp_server(State(state): State<AppState>) -> ApiResult<()> {
    let config = vault::vault_config();
    if !config.mcp_http_enabled {
        return Ok(Json(()));
    }

    let mut guard = state.mcp_child.lock().map_err(|e| err(e.to_string()))?;
    if guard.is_some() {
        return Ok(Json(()));
    }

    let mcp_bin = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("vaultmind-mcp")))
        .unwrap_or_else(|| std::path::PathBuf::from("vaultmind-mcp"));

    let child = std::process::Command::new(&mcp_bin)
        .args(["--http", "--port", "7532"])
        .env("VAULTMIND_MCP_TOKEN", &config.mcp_token)
        .spawn()
        .map_err(|e| err(format!("Failed to start MCP server: {}", e)))?;

    *guard = Some(child);
    Ok(Json(()))
}

async fn stop_mcp_server(State(state): State<AppState>) -> ApiResult<()> {
    let mut guard = state.mcp_child.lock().map_err(|e| err(e.to_string()))?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
    }
    Ok(Json(()))
}

#[derive(Serialize)]
struct McpInfo {
    enabled: bool,
    http_enabled: bool,
    token: String,
    port: u16,
    binary_path: String,
    running: bool,
}

async fn get_mcp_info(State(state): State<AppState>) -> ApiResult<McpInfo> {
    let config = vault::vault_config();
    let mcp_bin = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("vaultmind-mcp")))
        .unwrap_or_else(|| std::path::PathBuf::from("vaultmind-mcp"));

    let running = state.mcp_child
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false);

    Ok(Json(McpInfo {
        enabled: config.mcp_enabled,
        http_enabled: config.mcp_http_enabled,
        token: config.mcp_token,
        port: 7532,
        binary_path: mcp_bin.to_string_lossy().to_string(),
        running,
    }))
}
