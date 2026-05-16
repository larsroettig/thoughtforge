use clap::Parser;
use rmcp::ServiceExt;
use thoughtforge_lib::{mcp_tools::VaultMcpServer, vault};

#[derive(Parser)]
#[command(name = "vaultmind-mcp", about = "VaultMind MCP server")]
struct Args {
    /// Use stdio transport (for Claude Desktop)
    #[arg(long)]
    stdio: bool,

    /// HTTP port (default 7532)
    #[arg(long, default_value = "7532")]
    port: u16,

    /// Override vault path
    #[arg(long)]
    vault: Option<String>,

    /// Override Bearer token (defaults to config.yaml mcp_token)
    #[arg(long)]
    token: Option<String>,
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    if let Some(p) = &args.vault {
        std::env::set_var("VAULTMIND_PATH", p);
    }

    let config = vault::vault_config();
    let token = args.token.unwrap_or(config.mcp_token);
    let server = VaultMcpServer::new(token.clone());

    if args.stdio {
        eprintln!("[vaultmind-mcp] stdio transport");
        let ct = server
            .serve(rmcp::transport::io::stdio())
            .await
            .expect("stdio transport failed");
        ct.waiting().await.ok();
    } else {
        eprintln!("[vaultmind-mcp] HTTP transport on port {}", args.port);
        if let Err(e) = serve_http(server, token, args.port).await {
            eprintln!("[vaultmind-mcp] HTTP error: {}", e);
            std::process::exit(1);
        }
    }
}

async fn serve_http(
    server: VaultMcpServer,
    token: String,
    port: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    use axum::{
        Router,
        extract::{Request, State},
        http::StatusCode,
        middleware::{self, Next},
        response::Response,
    };
    use rmcp::transport::streamable_http_server::{
        StreamableHttpService,
        session::local::LocalSessionManager,
    };
    use std::sync::Arc;

    async fn require_bearer(
        State(expected): State<Arc<String>>,
        req: Request,
        next: Next,
    ) -> Result<Response, StatusCode> {
        let auth = req
            .headers()
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let expected_header = format!("Bearer {}", expected);
        // Constant-time comparison to prevent timing side-channel attacks.
        if constant_time_eq(auth.as_bytes(), expected_header.as_bytes()) {
            Ok(next.run(req).await)
        } else {
            Err(StatusCode::UNAUTHORIZED)
        }
    }

    fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
        if a.len() != b.len() {
            return false;
        }
        a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
    }

    let session_manager = Arc::new(LocalSessionManager::default());
    let mcp_service = StreamableHttpService::new(
        move || Ok(server.clone()),
        Arc::clone(&session_manager),
        Default::default(),
    );

    let token_arc = Arc::new(token);
    let app = Router::new()
        .nest_service("/", mcp_service)
        .layer(middleware::from_fn_with_state(token_arc, require_bearer));

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port)).await?;
    eprintln!("[vaultmind-mcp] listening on 127.0.0.1:{}", port);
    axum::serve(listener, app).await?;
    Ok(())
}
