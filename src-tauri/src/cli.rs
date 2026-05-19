use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "thoughtforge", about = "ThoughtForge — local AI planning assistant")]
#[command(version = env!("CARGO_PKG_VERSION"))]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,

    /// Start HTTP server without opening the browser
    #[arg(long, global = true)]
    pub http: bool,

    /// Detach from terminal and run as a background daemon
    #[arg(long, global = true)]
    pub daemon: bool,

    /// HTTP port to listen on (default: 7432)
    #[arg(long, global = true, default_value = "7432")]
    pub port: u16,
}

#[derive(Subcommand)]
pub enum Command {
    /// Start the HTTP server (default when no command given)
    Serve,

    /// Show vault status: path, spaces, task counts
    Status,

    /// List all project spaces
    Spaces,

    /// List tasks, optionally filtered by space or status
    Tasks {
        /// Filter by space id
        #[arg(long)]
        space: Option<String>,
        /// Filter by status: todo | in_progress | review | done | blocked
        #[arg(long)]
        status: Option<String>,
        /// Output raw JSON array
        #[arg(long)]
        json: bool,
    },

    /// List notes in a space
    Notes {
        /// Space id (e.g. "general")
        space: String,
        /// Filter by type: daily | meeting | note
        #[arg(long)]
        r#type: Option<String>,
    },

    /// Search notes in a space using hybrid BM25 + vector search
    Search {
        /// Space id (e.g. "general")
        space: String,
        /// Query string
        query: String,
        /// Maximum results
        #[arg(long, short, default_value = "8")]
        limit: usize,
        /// Output raw JSON
        #[arg(long)]
        json: bool,
    },

    /// Index a space for semantic search (requires embedding model)
    Index {
        /// Space id (e.g. "general")
        space: String,
    },
}

pub fn run_cli(cmd: Command) {
    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    rt.block_on(async move {
        match cmd {
            Command::Serve => unreachable!("handled by caller"),
            Command::Status    => cmd_status(),
            Command::Spaces    => cmd_spaces(),
            Command::Tasks { space, status, json } => cmd_tasks(space, status, json),
            Command::Notes { space, r#type }       => cmd_notes(space, r#type),
            Command::Search { space, query, limit, json } => cmd_search(space, query, limit, json).await,
            Command::Index { space }               => cmd_index(space).await,
        }
    });
}

// ── status ───────────────────────────────────────────────────────────────

fn cmd_status() {
    let _ = crate::vault::init_vault_sync();
    let config = crate::vault::vault_config();
    let tasks = crate::vault::read_tasks().unwrap_or_default();
    let spaces = crate::vault::read_spaces().unwrap_or_default();

    let out = serde_json::json!({
        "vault_path": config.vault_path,
        "version": env!("CARGO_PKG_VERSION"),
        "spaces": spaces.len(),
        "tasks": tasks.len(),
        "tasks_active": tasks.iter().filter(|t| !t.archived && t.status != "done").count(),
        "llm_provider": format!("{:?}", config.llm_provider).to_lowercase(),
        "active_model": config.active_model,
    });
    println!("{}", serde_json::to_string_pretty(&out).unwrap());
}

// ── spaces ────────────────────────────────────────────────────────────────

fn cmd_spaces() {
    let _ = crate::vault::init_vault_sync();
    match crate::vault::read_spaces() {
        Ok(spaces) => println!("{}", serde_json::to_string_pretty(&spaces).unwrap()),
        Err(e) => { eprintln!("Error: {e}"); std::process::exit(1); }
    }
}

// ── tasks ────────────────────────────────────────────────────────────────

fn cmd_tasks(space: Option<String>, status_filter: Option<String>, json: bool) {
    let _ = crate::vault::init_vault_sync();
    let tasks = match crate::vault::read_tasks() {
        Ok(t) => t,
        Err(e) => { eprintln!("Error: {e}"); std::process::exit(1); }
    };

    let filtered: Vec<_> = tasks.iter().filter(|t| {
        if t.archived { return false; }
        if let Some(ref s) = space {
            if &t.project != s { return false; }
        }
        if let Some(ref st) = status_filter {
            if &t.status != st { return false; }
        }
        true
    }).collect();

    if json {
        println!("{}", serde_json::to_string_pretty(&filtered).unwrap());
        return;
    }

    // Human-readable table
    println!("{:<12} {:<12} {:<8} {}", "ID", "STATUS", "PRIORITY", "TITLE");
    println!("{}", "-".repeat(70));
    for t in &filtered {
        println!("{:<12} {:<12} {:<8} {}",
            short(&t.id, 12),
            &t.status,
            &t.priority,
            &t.title,
        );
    }
    println!("\n{} tasks", filtered.len());
}

// ── notes ────────────────────────────────────────────────────────────────

fn cmd_notes(space: String, type_filter: Option<String>) {
    let _ = crate::vault::init_vault_sync();
    let notes = match crate::vault::read_space_notes(space.clone()) {
        Ok(n) => n,
        Err(e) => { eprintln!("Error: {e}"); std::process::exit(1); }
    };

    let filtered: Vec<_> = notes.iter().filter(|n| {
        type_filter.as_deref().map_or(true, |t| n.note_type == t)
    }).collect();

    println!("{}", serde_json::to_string_pretty(&filtered).unwrap());
}

// ── search ───────────────────────────────────────────────────────────────

async fn cmd_search(space: String, query: String, limit: usize, json: bool) {
    let _ = crate::vault::init_vault_sync();
    match crate::search::search_space_notes(space, query, Some(limit)).await {
        Ok(results) => {
            if json {
                println!("{}", serde_json::to_string_pretty(&results).unwrap());
                return;
            }
            if results.is_empty() {
                println!("No results.");
                return;
            }
            println!("{:<8} {:<20} {:<10} {}", "SCORE", "DATE", "TYPE", "TITLE");
            println!("{}", "-".repeat(70));
            for r in &results {
                println!("{:<8.3} {:<20} {:<10} {}",
                    r.score,
                    short(&r.date, 20),
                    short(&r.note_type, 10),
                    r.title,
                );
                if !r.preview.is_empty() {
                    println!("         {}", truncate(&r.preview, 80));
                }
            }
        }
        Err(e) => { eprintln!("Search error: {e}"); std::process::exit(1); }
    }
}

// ── index ────────────────────────────────────────────────────────────────

async fn cmd_index(space: String) {
    let _ = crate::vault::init_vault_sync();
    eprintln!("Indexing space '{space}'…");
    match crate::search::index_space_notes(space.clone()).await {
        Ok(n) => {
            let status = crate::search::space_index_status(space);
            println!("{}", serde_json::json!({
                "indexed": n,
                "total": status.get("indexed_count"),
                "status": "ok",
            }));
        }
        Err(e) => { eprintln!("Index error: {e}"); std::process::exit(1); }
    }
}

// ── helpers ──────────────────────────────────────────────────────────────

fn short(s: &str, n: usize) -> String {
    if s.len() <= n { s.to_string() } else { format!("{}…", &s[..n.saturating_sub(1)]) }
}

fn truncate(s: &str, n: usize) -> String {
    let line = s.lines().next().unwrap_or("");
    if line.len() <= n { line.to_string() } else { format!("{}…", &line[..n.saturating_sub(1)]) }
}
