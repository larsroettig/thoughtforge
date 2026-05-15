use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;

use crate::vault::{space_dir, vault_config, read_space_notes_internal};

// ── Public result type returned to the frontend ──────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteSearchResult {
    pub note_id: String,
    pub title: String,
    pub date: String,
    pub note_type: String,
    pub preview: String,
    pub score: f32,
}

// ── On-disk index format ─────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
struct IndexEntry {
    note_id: String,
    title: String,
    date: String,
    note_type: String,
    preview: String,
    fingerprint: String,
    embedding: Vec<f32>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct NoteIndex {
    entries: Vec<IndexEntry>,
}

// ── Index persistence ────────────────────────────────────────────────────

fn index_path(space_id: &str) -> std::path::PathBuf {
    space_dir(space_id).join("search_index.json")
}

fn load_index(space_id: &str) -> NoteIndex {
    let path = index_path(space_id);
    if !path.exists() {
        return NoteIndex::default();
    }
    let content = fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_default()
}

fn save_index(space_id: &str, index: &NoteIndex) -> Result<(), String> {
    let content = serde_json::to_string(index)
        .map_err(|e| format!("Failed to serialize index: {}", e))?;
    fs::write(index_path(space_id), content)
        .map_err(|e| format!("Failed to write index: {}", e))?;
    Ok(())
}

// ── Math ─────────────────────────────────────────────────────────────────

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}

/// Cheap change-detection fingerprint for a note.
fn fingerprint(title: &str, content: &str) -> String {
    let preview = &content[..content.len().min(128)];
    format!("{}:{}:{}", title.len(), content.len(), preview)
}

// ── Embedding API ────────────────────────────────────────────────────────

#[derive(Serialize)]
struct EmbedRequest {
    model: String,
    input: Vec<String>,
}

#[derive(Deserialize)]
struct EmbedResponse {
    data: Vec<EmbedData>,
}

#[derive(Deserialize)]
struct EmbedData {
    embedding: Vec<f32>,
}

async fn fetch_embeddings(texts: Vec<String>, lm_url: &str) -> Result<Vec<Vec<f32>>, String> {
    let client = reqwest::Client::new();
    let req = EmbedRequest {
        // LM Studio ignores the model field; any name works.
        model: "text-embedding-ada-002".to_string(),
        input: texts,
    };
    let resp = client
        .post(format!("{}/v1/embeddings", lm_url))
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("Embedding API unreachable: {}. Is LM Studio running with an embedding model loaded?", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Embedding API returned HTTP {}: {}. Load an embedding model in LM Studio (e.g. nomic-embed-text or all-minilm).",
            status, body
        ));
    }

    let data: EmbedResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse embedding response: {}", e))?;

    Ok(data.data.into_iter().map(|d| d.embedding).collect())
}

// ── Tauri commands ───────────────────────────────────────────────────────

/// Index all notes for a space. Only re-embeds notes that changed since last run.
/// Returns the number of notes that were (re-)embedded.
#[tauri::command]
pub async fn index_space_notes(space_id: String) -> Result<usize, String> {
    let config = vault_config();
    let notes = read_space_notes_internal(&space_id)?;

    if notes.is_empty() {
        return Ok(0);
    }

    let mut index = load_index(&space_id);

    // Build lookup: note_id → existing fingerprint
    let existing: HashMap<String, String> = index
        .entries
        .iter()
        .map(|e| (e.note_id.clone(), e.fingerprint.clone()))
        .collect();

    // Determine which notes need (re-)embedding
    let dirty: Vec<_> = notes
        .iter()
        .filter(|n| {
            existing
                .get(&n.id)
                .map_or(true, |fp| fp != &fingerprint(&n.title, &n.content))
        })
        .collect();

    if dirty.is_empty() {
        return Ok(0);
    }

    // Embed in batches of 50
    let mut indexed = 0usize;
    for batch in dirty.chunks(50) {
        let texts: Vec<String> = batch
            .iter()
            .map(|n| {
                let body = &n.content[..n.content.len().min(2000)];
                format!("{}: {}", n.title, body)
            })
            .collect();

        let embeddings = fetch_embeddings(texts, &config.lm_studio_url).await?;

        for (note, embedding) in batch.iter().zip(embeddings) {
            let preview: String = note
                .content
                .lines()
                .find(|l| !l.trim().is_empty())
                .unwrap_or("")
                .chars()
                .take(200)
                .collect();

            let entry = IndexEntry {
                note_id: note.id.clone(),
                title: note.title.clone(),
                date: note.date.clone(),
                note_type: note.note_type.clone(),
                preview,
                fingerprint: fingerprint(&note.title, &note.content),
                embedding,
            };
            index.entries.retain(|e| e.note_id != note.id);
            index.entries.push(entry);
            indexed += 1;
        }
    }

    // Drop entries for notes that no longer exist
    let live_ids: HashSet<String> = notes.iter().map(|n| n.id.clone()).collect();
    index.entries.retain(|e| live_ids.contains(&e.note_id));

    save_index(&space_id, &index)?;
    Ok(indexed)
}

/// Semantic search over indexed notes for a space.
#[tauri::command]
pub async fn search_space_notes(
    space_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<NoteSearchResult>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(vec![]);
    }

    let config = vault_config();
    let top_k = limit.unwrap_or(5);

    let embeddings = fetch_embeddings(vec![query], &config.lm_studio_url).await?;
    let query_vec = embeddings
        .into_iter()
        .next()
        .ok_or("No embedding returned for query")?;

    let index = load_index(&space_id);
    if index.entries.is_empty() {
        return Err("No index yet — click Index Notes first.".to_string());
    }

    let mut scored: Vec<(f32, &IndexEntry)> = index
        .entries
        .iter()
        .map(|e| (cosine_similarity(&query_vec, &e.embedding), e))
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    Ok(scored
        .into_iter()
        .take(top_k)
        .map(|(score, e)| NoteSearchResult {
            note_id: e.note_id.clone(),
            title: e.title.clone(),
            date: e.date.clone(),
            note_type: e.note_type.clone(),
            preview: e.preview.clone(),
            score,
        })
        .collect())
}

/// How many notes are in the index and when was it last written.
#[tauri::command]
pub fn space_index_status(space_id: String) -> serde_json::Value {
    let path = index_path(&space_id);
    let index = load_index(&space_id);
    let indexed_count = index.entries.len();
    let last_modified = path
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_secs())
        });

    serde_json::json!({
        "indexed_count": indexed_count,
        "last_modified_unix": last_modified,
    })
}
