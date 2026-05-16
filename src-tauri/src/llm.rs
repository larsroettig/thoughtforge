use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};
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

/// Validate that a base URL is safe to use as an LLM endpoint.
/// Allows only http/https to localhost / 127.0.0.1 / ::1 or explicit LAN hosts.
/// Validates an external (non-localhost) HTTPS URL for use in skill downloads.
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

    // Block RFC-1918 and APIPA ranges via prefix matching.
    if host.starts_with("10.")
        || host.starts_with("192.168.")
        || host.starts_with("169.254.")
        || host.starts_with("127.")
    {
        return Err(format!("Private/loopback address not allowed: '{}'", host));
    }
    // 172.16.0.0/12
    if let Some(rest) = host.strip_prefix("172.") {
        if let Some(second) = rest.split('.').next().and_then(|s| s.parse::<u8>().ok()) {
            if (16..=31).contains(&second) {
                return Err(format!("Private address not allowed: '{}'", host));
            }
        }
    }

    Ok(url)
}

/// Blocks cloud metadata endpoints, private subnets and non-http(s) schemes.
pub fn validate_llm_url(base_url: &str) -> Result<(), String> {
    let url = url::Url::parse(base_url)
        .map_err(|_| format!("Invalid LM Studio URL: '{}'", base_url))?;

    match url.scheme() {
        "http" | "https" => {}
        s => return Err(format!("Disallowed URL scheme '{}': only http/https allowed", s)),
    }

    let host = url.host_str().unwrap_or("").to_lowercase();

    // Block cloud metadata services and common SSRF targets.
    let blocked_hosts = [
        "169.254.169.254",  // AWS/GCP/Azure metadata
        "metadata.google.internal",
        "100.100.100.200",  // Alibaba metadata
    ];
    if blocked_hosts.contains(&host.as_str()) {
        return Err(format!("Blocked host: '{}'", host));
    }

    // Allow only localhost and loopback — LM Studio always runs locally.
    let allowed = matches!(
        host.as_str(),
        "localhost" | "127.0.0.1" | "::1" | "[::1]"
    );
    if !allowed {
        return Err(format!(
            "LM Studio URL must point to localhost (got '{}'). \
             Remote LLM endpoints are not supported.",
            host
        ));
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmModel {
    pub id: String,
    pub object: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelsResponse {
    pub data: Vec<LlmModel>,
}

#[derive(Debug, Serialize, Deserialize)]
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

#[tauri::command]
pub async fn list_models(base_url: String) -> Result<Vec<LlmModel>, String> {
    validate_llm_url(&base_url)?;
    let url = format!("{}/v1/models", base_url);

    let client = http_client();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to LM Studio at {}: {}", url, e))?;

    let models: ModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse models response: {}", e))?;

    Ok(models.data)
}

#[tauri::command]
pub async fn chat_completion(
    base_url: String,
    model: String,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<i32>,
) -> Result<String, String> {
    validate_llm_url(&base_url)?;
    let url = format!("{}/v1/chat/completions", base_url);

    let request = ChatRequest {
        model,
        messages,
        temperature,
        max_tokens,
        stream: false,
    };

    let client = http_client();
    let response = client
        .post(&url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let chat_response: ChatResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

    chat_response
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "No response from LLM".to_string())
}

#[tauri::command]
pub async fn stream_chat(
    app: AppHandle,
    base_url: String,
    model: String,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<i32>,
    stream_id: String,
) -> Result<(), String> {
    validate_llm_url(&base_url)?;
    let url = format!("{}/v1/chat/completions", base_url);

    let request = ChatRequest {
        model,
        messages,
        temperature,
        max_tokens,
        stream: true,
    };

    if stream_id.len() > 64 || !stream_id.chars().all(|c| c.is_alphanumeric() || c == '-') {
        return Err("Invalid stream_id".to_string());
    }

    let client = http_client();
    let response = client
        .post(&url)
        .json(&request)
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
                        let _ = app.emit(
                            &format!("stream-chunk-{}", stream_id),
                            content.clone(),
                        );
                    }
                    if choice.finish_reason.is_some() {
                        let _ = app.emit(&format!("stream-done-{}", stream_id), ());
                        return Ok(());
                    }
                }
            }
        }
    }

    let _ = app.emit(&format!("stream-done-{}", stream_id), ());
    Ok(())
}
