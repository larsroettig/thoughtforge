use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .connect_timeout(std::time::Duration::from_secs(5))
            .pool_max_idle_per_host(4)
            .build()
            // Safe: only fails on invalid TLS config; none of the options above can cause that
            .expect("reqwest client init failed")
    })
}

/// Validates an external (non-localhost) HTTPS URL.
/// Blocks metadata endpoints, RFC-1918 private ranges, and loopback.
pub fn validate_external_url(raw: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(raw).map_err(|_| format!("Invalid URL: '{}'", raw))?;

    if url.scheme() != "https" {
        return Err("Only https:// URLs are allowed for external downloads".to_string());
    }

    let host = url.host_str().unwrap_or("").to_lowercase();

    let blocked = [
        "169.254.169.254", "metadata.google.internal", "100.100.100.200",
        "localhost", "127.0.0.1", "::1", "[::1]",
    ];
    if blocked.contains(&host.as_str()) {
        return Err(format!("Blocked host: '{}'", host));
    }

    if host.starts_with("10.")
        || host.starts_with("192.168.")
        || host.starts_with("169.254.")
        || host.starts_with("127.")
    {
        return Err(format!("Private/loopback address not allowed: '{}'", host));
    }
    if let Some(rest) = host.strip_prefix("172.") {
        if let Some(second) = rest.split('.').next().and_then(|s| s.parse::<u8>().ok()) {
            if (16..=31).contains(&second) {
                return Err(format!("Private address not allowed: '{}'", host));
            }
        }
    }

    Ok(url)
}

/// Provider-aware URL validator.
/// - LmStudio / Ollama: localhost only, http or https.
/// - OpenAi: api.openai.com only, https required.
/// - Anthropic: api.anthropic.com only, https required.
/// - Custom: any HTTPS non-private host; blocks RFC-1918 and metadata endpoints.
pub fn validate_provider_url(base_url: &str, provider: &crate::vault::LlmProvider) -> Result<(), String> {
    use crate::vault::LlmProvider;

    let url = url::Url::parse(base_url)
        .map_err(|_| format!("Invalid URL: '{}'", base_url))?;

    match url.scheme() {
        "http" | "https" => {}
        s => return Err(format!("Disallowed URL scheme '{}': only http/https allowed", s)),
    }

    let host = url.host_str().unwrap_or("").to_lowercase();

    let metadata = ["169.254.169.254", "metadata.google.internal", "100.100.100.200"];
    if metadata.contains(&host.as_str()) {
        return Err(format!("Blocked metadata host: '{}'", host));
    }

    match provider {
        LlmProvider::LmStudio | LlmProvider::Ollama => {
            let is_local = matches!(host.as_str(), "localhost" | "127.0.0.1" | "::1" | "[::1]");
            if !is_local {
                return Err(format!("Local provider URL must point to localhost (got '{}')", host));
            }
        }
        LlmProvider::OpenAi => {
            if host != "api.openai.com" {
                return Err(format!("OpenAI provider only allows api.openai.com (got '{}')", host));
            }
            if url.scheme() != "https" {
                return Err("OpenAI requires https".to_string());
            }
        }
        LlmProvider::Anthropic => {
            if host != "api.anthropic.com" {
                return Err(format!("Anthropic provider only allows api.anthropic.com (got '{}')", host));
            }
            if url.scheme() != "https" {
                return Err("Anthropic requires https".to_string());
            }
        }
        LlmProvider::Custom => {
            if url.scheme() != "https" {
                return Err("Custom provider requires https".to_string());
            }
            if host.starts_with("10.") || host.starts_with("192.168.") || host.starts_with("169.254.") {
                return Err(format!("Private address not allowed for custom provider: '{}'", host));
            }
            if let Some(rest) = host.strip_prefix("172.") {
                if let Some(second) = rest.split('.').next().and_then(|s| s.parse::<u8>().ok()) {
                    if (16..=31).contains(&second) {
                        return Err(format!("Private address not allowed: '{}'", host));
                    }
                }
            }
        }
    }

    Ok(())
}

/// Backward-compatible alias: validates as LmStudio (localhost only).
/// Still used by search.rs for embedding URL validation.
pub fn validate_llm_url(base_url: &str) -> Result<(), String> {
    validate_provider_url(base_url, &crate::vault::LlmProvider::LmStudio)
}

/// Resolve the effective base URL for a provider (api_base_url override takes precedence).
pub fn provider_base_url(config: &crate::vault::VaultConfig) -> String {
    use crate::vault::LlmProvider;
    if !config.api_base_url.is_empty() {
        return config.api_base_url.clone();
    }
    match config.llm_provider {
        LlmProvider::LmStudio => config.lm_studio_url.clone(),
        LlmProvider::Ollama   => "http://localhost:11434".to_string(),
        LlmProvider::OpenAi   => "https://api.openai.com".to_string(),
        LlmProvider::Anthropic => "https://api.anthropic.com".to_string(),
        LlmProvider::Custom   => config.lm_studio_url.clone(),
    }
}

// ── Static model list for Anthropic (no /v1/models endpoint) ─────────────

const CLAUDE_MODELS: &[&str] = &[
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
];

// ── Shared request / response types ──────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmModel {
    pub id: String,
    pub object: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelsResponse {
    pub data: Vec<LlmModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<i32>,
    #[serde(default)]
    pub stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatChoice {
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub choices: Vec<ChatChoice>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamDelta {
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamChoice {
    pub delta: StreamDelta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamResponse {
    pub choices: Vec<StreamChoice>,
}

// ── Anthropic-specific types ──────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    max_tokens: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[derive(Debug, Deserialize)]
struct AnthropicStreamDelta {
    #[serde(rename = "type")]
    delta_type: Option<String>,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicStreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<AnthropicStreamDelta>,
}

// ── Helpers ───────────────────────────────────────────────────────────────

/// Extract the system message and return the remaining messages.
fn extract_system_message(messages: &[ChatMessage]) -> (Option<String>, Vec<ChatMessage>) {
    let system = messages.iter()
        .find(|m| m.role == "system")
        .map(|m| m.content.clone());
    let filtered = messages.iter()
        .filter(|m| m.role != "system")
        .cloned()
        .collect();
    (system, filtered)
}

// ── Public API ────────────────────────────────────────────────────────────

/// List available models. For Anthropic, returns a static list of known Claude models.
/// For all other providers, calls `GET /v1/models` with an optional Bearer token.
pub async fn list_models(
    base_url: String,
    provider: crate::vault::LlmProvider,
    api_key: String,
) -> Result<Vec<LlmModel>, String> {
    use crate::vault::LlmProvider;

    if provider == LlmProvider::Anthropic {
        return Ok(CLAUDE_MODELS.iter().map(|id| LlmModel {
            id: id.to_string(),
            object: "model".to_string(),
        }).collect());
    }

    validate_provider_url(&base_url, &provider)?;
    let url = format!("{}/v1/models", base_url);

    let client = http_client();
    let mut req = client.get(&url);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = req
        .send()
        .await
        .map_err(|e| format!("Failed to connect at {}: {}", url, e))?;

    let status = response.status();
    let body = response.text().await
        .map_err(|e| format!("Failed to read models response body: {}", e))?;

    if !status.is_success() {
        return Err(format!("Models API returned HTTP {}: {}", status, body.chars().take(300).collect::<String>()));
    }

    let models: ModelsResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse models response ({}): {}", e, body.chars().take(300).collect::<String>()))?;

    Ok(models.data)
}

/// Non-streaming chat completion. Dispatches to the Anthropic or OpenAI-compatible path.
pub async fn chat_completion(
    base_url: String,
    model: String,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<i32>,
    provider: crate::vault::LlmProvider,
    api_key: String,
) -> Result<String, String> {
    use crate::vault::LlmProvider;

    validate_provider_url(&base_url, &provider)?;
    let client = http_client();

    if provider == LlmProvider::Anthropic {
        let (system, msgs) = extract_system_message(&messages);
        let req_body = AnthropicRequest {
            model,
            messages: msgs,
            system,
            max_tokens: max_tokens.unwrap_or(4096),
            temperature,
            stream: false,
        };
        let response = client
            .post(format!("{}/v1/messages", base_url))
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&req_body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {}", e))?;

        let status = response.status();
        let body = response.text().await
            .map_err(|e| format!("Failed to read Anthropic response body: {}", e))?;

        if !status.is_success() {
            return Err(format!("Anthropic returned HTTP {}: {}", status, body.chars().take(300).collect::<String>()));
        }

        let ant_resp: AnthropicResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Failed to parse Anthropic response ({}): {}", e, body.chars().take(300).collect::<String>()))?;

        return ant_resp.content.into_iter()
            .find(|c| c.content_type == "text")
            .and_then(|c| c.text)
            .ok_or_else(|| "No text content in Anthropic response".to_string());
    }

    // OpenAI-compatible providers
    let url = format!("{}/v1/chat/completions", base_url);
    let request = ChatRequest { model, messages, temperature, max_tokens, stream: false };

    let mut req = client.post(&url).json(&request);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = req
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let status = response.status();
    let body = response.text().await
        .map_err(|e| format!("Failed to read LLM response body: {}", e))?;

    if !status.is_success() {
        return Err(format!("LLM returned HTTP {}: {}", status, body.chars().take(300).collect::<String>()));
    }

    let chat_response: ChatResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse LLM response ({}): {}", e, body.chars().take(300).collect::<String>()))?;

    chat_response
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "No response from LLM".to_string())
}

/// Streaming chat completion. Sends each text chunk to `tx`.
/// The channel is closed when streaming finishes or the client disconnects.
pub async fn stream_chat_inner(
    base_url: String,
    model: String,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<i32>,
    tx: tokio::sync::mpsc::Sender<String>,
    provider: crate::vault::LlmProvider,
    api_key: String,
) -> Result<(), String> {
    use crate::vault::LlmProvider;

    validate_provider_url(&base_url, &provider)?;
    let client = http_client();

    if provider == LlmProvider::Anthropic {
        let (system, msgs) = extract_system_message(&messages);
        let req_body = AnthropicRequest {
            model,
            messages: msgs,
            system,
            max_tokens: max_tokens.unwrap_or(4096),
            temperature,
            stream: true,
        };
        let response = client
            .post(format!("{}/v1/messages", base_url))
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&req_body)
            .send()
            .await
            .map_err(|e| format!("Anthropic stream request failed: {}", e))?;

        let byte_stream = response
            .bytes_stream()
            .map(|r| r.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)));
        let mut lines = BufReader::new(StreamReader::new(byte_stream)).lines();

        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim().to_string();
            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }
            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(event) = serde_json::from_str::<AnthropicStreamEvent>(data) {
                    match event.event_type.as_str() {
                        "content_block_delta" => {
                            if let Some(delta) = event.delta {
                                if delta.delta_type.as_deref() == Some("text_delta") {
                                    if let Some(text) = delta.text {
                                        if tx.send(text).await.is_err() {
                                            return Ok(()); // client disconnected
                                        }
                                    }
                                }
                            }
                        }
                        "message_stop" => return Ok(()),
                        _ => {}
                    }
                }
            }
        }
        return Ok(());
    }

    // OpenAI-compatible providers
    let url = format!("{}/v1/chat/completions", base_url);
    let request = ChatRequest { model, messages, temperature, max_tokens, stream: true };

    let mut req = client.post(&url).json(&request);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = req
        .send()
        .await
        .map_err(|e| format!("LLM stream request failed: {}", e))?;

    let byte_stream = response
        .bytes_stream()
        .map(|r| r.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)));
    let mut lines = BufReader::new(StreamReader::new(byte_stream)).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim().to_string();
        if line.is_empty() || line == "data: [DONE]" {
            continue;
        }
        if let Some(data) = line.strip_prefix("data: ") {
            if let Ok(chunk) = serde_json::from_str::<StreamResponse>(data) {
                if let Some(choice) = chunk.choices.first() {
                    if let Some(content) = &choice.delta.content {
                        if tx.send(content.clone()).await.is_err() {
                            return Ok(()); // client disconnected
                        }
                    }
                    if choice.finish_reason.is_some() {
                        return Ok(());
                    }
                }
            }
        }
    }

    Ok(())
}
