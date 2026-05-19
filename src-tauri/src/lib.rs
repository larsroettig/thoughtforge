mod llm;
pub mod vault;
pub mod search;
pub mod mcp_tools;
pub mod cli;
mod server;

pub fn run(open_browser: bool, port: u16) {
    tokio::runtime::Runtime::new()
        .expect("tokio runtime init failed")
        .block_on(server::serve(open_browser, port));
}
