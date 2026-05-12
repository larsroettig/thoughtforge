use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

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
    let url = format!("{}/v1/models", base_url);

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(5))
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
    let url = format!("{}/v1/chat/completions", base_url);

    let request = ChatRequest {
        model,
        messages,
        temperature,
        max_tokens,
        stream: false,
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&request)
        .timeout(std::time::Duration::from_secs(300))
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
    let url = format!("{}/v1/chat/completions", base_url);

    let request = ChatRequest {
        model,
        messages,
        temperature,
        max_tokens,
        stream: true,
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&request)
        .timeout(std::time::Duration::from_secs(300))
        .send()
        .await
        .map_err(|e| format!("LLM stream request failed: {}", e))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read stream: {}", e))?;

    let text = String::from_utf8_lossy(&bytes);

    // Parse SSE events
    for line in text.lines() {
        let line = line.trim();
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
                        let _ = app.emit(
                            &format!("stream-done-{}", stream_id),
                            (),
                        );
                    }
                }
            }
        }
    }

    let _ = app.emit(&format!("stream-done-{}", stream_id), ());

    Ok(())
}
