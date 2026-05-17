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

// ── On-disk cache format ─────────────────────────────────────────────────

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

/// JSON file that caches embeddings for incremental re-indexing.
/// Structurally identical to the old NoteIndex so existing search_index.json
/// files deserialise into this type without any data loss.
#[derive(Debug, Serialize, Deserialize, Default)]
struct EmbedCache {
    entries: Vec<IndexEntry>,
}

// ── Cache persistence ────────────────────────────────────────────────────

fn embed_cache_path(space_id: &str) -> std::path::PathBuf {
    space_dir(space_id).join("embed_cache.json")
}

/// Load the embedding cache. Silently migrates from the old search_index.json
/// on first access — no re-indexing required for existing users.
fn load_cache(space_id: &str) -> EmbedCache {
    let new_path = embed_cache_path(space_id);
    if new_path.exists() {
        let content = fs::read_to_string(&new_path).unwrap_or_default();
        return serde_json::from_str(&content)
            .unwrap_or_else(|e| { eprintln!("[search] cache parse error: {e}"); Default::default() });
    }

    // One-time migration: old path is search_index.json (same JSON shape).
    let old_path = space_dir(space_id).join("search_index.json");
    if old_path.exists() {
        let content = fs::read_to_string(&old_path).unwrap_or_default();
        let cache: EmbedCache = serde_json::from_str(&content)
            .unwrap_or_else(|e| { eprintln!("[search] cache parse error: {e}"); Default::default() });
        // Persist under the new name so this branch is only hit once.
        let _ = save_cache(space_id, &cache);
        return cache;
    }

    EmbedCache::default()
}

fn save_cache(space_id: &str, cache: &EmbedCache) -> Result<(), String> {
    let content = serde_json::to_string(cache)
        .map_err(|e| format!("Failed to serialize cache: {}", e))?;
    fs::write(embed_cache_path(space_id), content)
        .map_err(|e| format!("Failed to write cache: {}", e))?;
    Ok(())
}

// ── turbovec index builder ───────────────────────────────────────────────

/// Build a TurboQuantIndex from the entries in the cache.
///
/// Returns `None` when there are no valid (non-empty) embeddings.
/// Returns the index and a position map: `pos_map[turbovec_position]` is the
/// index into `entries` for that vector, allowing result indices to be mapped
/// back to note metadata after search.
fn build_turbovec(
    entries: &[IndexEntry],
) -> Option<(turbovec::TurboQuantIndex, Vec<usize>)> {
    // Filter to entries with non-empty embeddings and a consistent dimension.
    let first_dim = entries.iter().find_map(|e| {
        if e.embedding.is_empty() { None } else { Some(e.embedding.len()) }
    })?;

    let valid: Vec<usize> = entries
        .iter()
        .enumerate()
        .filter_map(|(i, e)| {
            if e.embedding.len() == first_dim { Some(i) } else { None }
        })
        .collect();

    if valid.is_empty() {
        return None;
    }

    // Build a flat f32 array: [vec_0, vec_1, ..., vec_n] each of length first_dim.
    let mut flat = Vec::with_capacity(valid.len() * first_dim);
    for &idx in &valid {
        flat.extend_from_slice(&entries[idx].embedding);
    }

    let mut index = turbovec::TurboQuantIndex::new(first_dim, 4);
    index.add(&flat);
    index.prepare(); // pre-warm SIMD caches for deterministic first-query latency

    Some((index, valid))
}

// ── Change-detection fingerprint ─────────────────────────────────────────

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
    crate::llm::validate_llm_url(lm_url)?;
    let client = crate::llm::http_client();
    let req = EmbedRequest {
        model: "text-embedding-ada-002".to_string(),
        input: texts,
    };
    let resp = client
        .post(format!("{}/v1/embeddings", lm_url))
        .json(&req)
        .send()
        .await
        .map_err(|e| format!(
            "Embedding API unreachable: {}. Is LM Studio running with an embedding model loaded?",
            e
        ))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Embedding API returned HTTP {}: {}. \
             Load an embedding model in LM Studio (e.g. nomic-embed-text or all-minilm).",
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

    let mut cache = load_cache(&space_id);

    // Build fingerprint lookup: note_id → existing fingerprint
    let existing: HashMap<String, String> = cache
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
        // Still prune entries for deleted notes even if nothing needs re-embedding.
        let live_ids: HashSet<String> = notes.iter().map(|n| n.id.clone()).collect();
        cache.entries.retain(|e| live_ids.contains(&e.note_id));
        save_cache(&space_id, &cache)?;
        return Ok(0);
    }

    // Embed dirty notes in batches of 50
    let mut indexed = 0usize;
    let mut new_dim: Option<usize> = None;

    for batch in dirty.chunks(50) {
        let texts: Vec<String> = batch
            .iter()
            .map(|n| {
                let body = &n.content[..n.content.len().min(2000)];
                format!("{}: {}", n.title, body)
            })
            .collect();

        let embeddings = match fetch_embeddings(texts, &config.lm_studio_url).await {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[search] Embedding batch failed, skipping (will retry on next index): {}", e);
                continue;
            }
        };

        for (note, embedding) in batch.iter().zip(embeddings) {
            // Track the embedding dimension of newly-produced vectors.
            if let Some(d) = new_dim {
                if embedding.len() != d {
                    // Dimension inconsistency within a single batch — skip.
                    continue;
                }
            } else {
                new_dim = Some(embedding.len());
            }

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
            cache.entries.retain(|e| e.note_id != note.id);
            cache.entries.push(entry);
            indexed += 1;
        }
    }

    // If the embedding model changed (dimension mismatch), drop stale entries
    // so the cache stays dimension-homogeneous.
    if let Some(dim) = new_dim {
        cache.entries.retain(|e| e.embedding.len() == dim || e.embedding.is_empty());
    }

    // Drop entries for notes that no longer exist.
    let live_ids: HashSet<String> = notes.iter().map(|n| n.id.clone()).collect();
    cache.entries.retain(|e| live_ids.contains(&e.note_id));

    save_cache(&space_id, &cache)?;
    Ok(indexed)
}

/// Semantic search over indexed notes for a space using turbovec.
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

    let cache = load_cache(&space_id);
    if cache.entries.is_empty() {
        return Err("No index yet — click Index Notes first.".to_string());
    }

    let (tv_index, pos_map) = build_turbovec(&cache.entries)
        .ok_or("No index yet — click Index Notes first.")?;

    // Clamp k to the number of indexed vectors to avoid out-of-bounds.
    let k = top_k.min(pos_map.len());

    let results = tv_index.search(&query_vec, k);
    let indices = results.indices_for_query(0);
    let scores  = results.scores_for_query(0);

    Ok(indices
        .iter()
        .zip(scores.iter())
        .filter_map(|(&tv_pos, &score)| {
            let entry_idx = *pos_map.get(tv_pos as usize)?;
            let e = cache.entries.get(entry_idx)?;
            Some(NoteSearchResult {
                note_id:   e.note_id.clone(),
                title:     e.title.clone(),
                date:      e.date.clone(),
                note_type: e.note_type.clone(),
                preview:   e.preview.clone(),
                score,
            })
        })
        .collect())
}

/// How many notes are in the cache and when was it last written.
#[tauri::command]
pub fn space_index_status(space_id: String) -> serde_json::Value {
    let path = embed_cache_path(&space_id);
    let cache = load_cache(&space_id);
    let indexed_count = cache.entries.len();
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
