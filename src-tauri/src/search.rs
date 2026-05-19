use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::time::Duration;

use crate::vault::{space_dir, vault_config, read_space_notes_internal, VaultConfig};

// ── Public result type returned to the frontend ──────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteSearchResult {
    pub note_id: String,
    pub title: String,
    pub date: String,
    pub note_type: String,
    pub preview: String,
    pub score: f32,
}

// ── On-disk cache format ─────────────────────────────────────────────────────

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
struct EmbedCache {
    entries: Vec<IndexEntry>,
}

// ── Cache persistence ────────────────────────────────────────────────────────

fn embed_cache_path(space_id: &str) -> std::path::PathBuf {
    space_dir(space_id).join("embed_cache.json")
}

fn load_cache(space_id: &str) -> EmbedCache {
    let new_path = embed_cache_path(space_id);
    if new_path.exists() {
        let content = fs::read_to_string(&new_path).unwrap_or_default();
        return serde_json::from_str(&content)
            .unwrap_or_else(|e| { eprintln!("[search] cache parse error: {e}"); Default::default() });
    }
    // One-time migration from old search_index.json
    let old_path = space_dir(space_id).join("search_index.json");
    if old_path.exists() {
        let content = fs::read_to_string(&old_path).unwrap_or_default();
        let cache: EmbedCache = serde_json::from_str(&content)
            .unwrap_or_else(|e| { eprintln!("[search] cache parse error: {e}"); Default::default() });
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

// ── turbovec index builder ───────────────────────────────────────────────────

fn build_turbovec(entries: &[IndexEntry]) -> Option<(turbovec::TurboQuantIndex, Vec<usize>)> {
    let first_dim = entries.iter().find_map(|e| {
        if e.embedding.is_empty() { None } else { Some(e.embedding.len()) }
    })?;
    let valid: Vec<usize> = entries
        .iter()
        .enumerate()
        .filter_map(|(i, e)| if e.embedding.len() == first_dim { Some(i) } else { None })
        .collect();
    if valid.is_empty() { return None; }
    let mut flat = Vec::with_capacity(valid.len() * first_dim);
    for &idx in &valid {
        flat.extend_from_slice(&entries[idx].embedding);
    }
    let mut index = turbovec::TurboQuantIndex::new(first_dim, 4);
    index.add(&flat);
    index.prepare();
    Some((index, valid))
}

// ── Fingerprint ──────────────────────────────────────────────────────────────

fn fingerprint(title: &str, content: &str) -> String {
    let preview = &content[..content.len().min(128)];
    format!("{}:{}:{}", title.len(), content.len(), preview)
}

// ── Embedding API ────────────────────────────────────────────────────────────

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

// ── BM25 search ──────────────────────────────────────────────────────────────

fn bm25_search(entries: &[IndexEntry], keywords: &str, limit: usize) -> Vec<(String, f32)> {
    use bm25::{Document, SearchEngineBuilder};

    if entries.is_empty() || keywords.trim().is_empty() {
        return vec![];
    }

    let engine = SearchEngineBuilder::<String>::with_documents(
        bm25::Language::English,
        entries.iter().map(|e| Document::new(
            e.note_id.clone(),
            format!("{} {}", e.title, e.preview),
        )),
    ).build();

    engine.search(keywords, limit)
        .into_iter()
        .map(|r| (r.document.id, r.score))
        .collect()
}

// ── Vector search ────────────────────────────────────────────────────────────

async fn vector_search(entries: &[IndexEntry], query: &str, lm_url: &str, limit: usize) -> Vec<(String, f32)> {
    if entries.is_empty() { return vec![]; }

    let embeddings = match fetch_embeddings(vec![query.to_string()], lm_url).await {
        Ok(e) => e,
        Err(_) => return vec![],
    };
    let query_vec = match embeddings.into_iter().next() {
        Some(v) => v,
        None => return vec![],
    };
    let (tv_index, pos_map) = match build_turbovec(entries) {
        Some(r) => r,
        None => return vec![],
    };
    let k = limit.min(pos_map.len());
    let results = tv_index.search(&query_vec, k);
    let indices = results.indices_for_query(0);
    let scores  = results.scores_for_query(0);

    indices.iter()
        .zip(scores.iter())
        .filter_map(|(&tv_pos, &score)| {
            let entry_idx = *pos_map.get(tv_pos as usize)?;
            let e = entries.get(entry_idx)?;
            Some((e.note_id.clone(), score))
        })
        .collect()
}

// ── Reciprocal Rank Fusion (weighted) ────────────────────────────────────────

/// Each element is (result_list, weight). Contribution per rank: weight / (k + rank + 1).
fn rrf_weighted(lists: &[(&Vec<(String, f32)>, f32)], k: f32) -> Vec<(String, f32)> {
    let mut scores: HashMap<String, f32> = HashMap::new();
    for (list, weight) in lists {
        for (rank, (note_id, _)) in list.iter().enumerate() {
            *scores.entry(note_id.clone()).or_insert(0.0) += weight / (k + rank as f32 + 1.0);
        }
    }
    let mut sorted: Vec<(String, f32)> = scores.into_iter().collect();
    sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    sorted
}

// ── Query expansion ──────────────────────────────────────────────────────────

struct ExpandedQuery {
    hyde:     String,
    alt1:     String,
    alt2:     String,
    keywords: String,
}

/// Calls the configured LLM to expand the query into 4 complementary forms.
/// Times out after 4 seconds; on any failure every field falls back to the raw query.
async fn expand_query(query: &str, config: &VaultConfig) -> ExpandedQuery {
    let fallback = || ExpandedQuery {
        hyde:     query.to_string(),
        alt1:     query.to_string(),
        alt2:     query.to_string(),
        keywords: query.to_string(),
    };

    if config.active_model.is_empty() {
        return fallback();
    }

    let prompt = format!(
        "Query: {}\n\nReply in this EXACT format (one line each, no extra text):\n\
         HYDE: [Short paragraph a relevant document would contain]\n\
         ALT1: [Alternative phrasing, different wording]\n\
         ALT2: [Another alternative, different emphasis]\n\
         KEYWORDS: [6-8 space-separated keywords for full-text search, no punctuation]",
        query
    );

    let base_url = crate::llm::provider_base_url(config);
    let fut = crate::llm::chat_completion(
        base_url,
        config.active_model.clone(),
        vec![
            crate::llm::ChatMessage {
                role: "system".to_string(),
                content: "You expand search queries. Be concise. Reply only in the exact format shown.".to_string(),
            },
            crate::llm::ChatMessage { role: "user".to_string(), content: prompt },
        ],
        Some(0.2),
        Some(256),
        config.llm_provider.clone(),
        config.api_key.clone(),
    );

    match tokio::time::timeout(Duration::from_secs(4), fut).await {
        Ok(Ok(text)) => parse_expansion(&text, query),
        _ => fallback(),
    }
}

fn parse_expansion(text: &str, fallback: &str) -> ExpandedQuery {
    let mut hyde     = fallback.to_string();
    let mut alt1     = fallback.to_string();
    let mut alt2     = fallback.to_string();
    let mut keywords = fallback.to_string();

    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("HYDE:")     { let s = rest.trim().to_string(); if !s.is_empty() { hyde     = s; } }
        if let Some(rest) = line.strip_prefix("ALT1:")     { let s = rest.trim().to_string(); if !s.is_empty() { alt1     = s; } }
        if let Some(rest) = line.strip_prefix("ALT2:")     { let s = rest.trim().to_string(); if !s.is_empty() { alt2     = s; } }
        if let Some(rest) = line.strip_prefix("KEYWORDS:") { let s = rest.trim().to_string(); if !s.is_empty() { keywords = s; } }
    }

    ExpandedQuery { hyde, alt1, alt2, keywords }
}

// ── LLM Reranker ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct RankScore {
    i: usize,
    relevant: bool,
}

/// Extracts complete JSON objects from potentially truncated text (mirrors TS parsePartialJsonArray).
fn extract_rank_scores(text: &str) -> Vec<RankScore> {
    // Try full parse first
    let trimmed = text.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
    if let Ok(v) = serde_json::from_str::<Vec<RankScore>>(trimmed) {
        return v;
    }

    // Partial recovery: extract complete {...} objects
    let mut results = Vec::new();
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut depth = 0i32;
    let mut start = None;
    let mut in_string = false;
    let mut escape = false;

    for i in 0..len {
        let ch = bytes[i];
        if escape { escape = false; continue; }
        if ch == b'\\' && in_string { escape = true; continue; }
        if ch == b'"' { in_string = !in_string; continue; }
        if in_string { continue; }
        match ch {
            b'{' => {
                if depth == 0 { start = Some(i); }
                depth += 1;
            }
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    if let Some(s) = start {
                        if let Ok(score) = serde_json::from_slice::<RankScore>(&bytes[s..=i]) {
                            results.push(score);
                        }
                    }
                    start = None;
                }
            }
            _ => {}
        }
    }
    results
}

/// Re-ranks `candidates` using the configured LLM (Yes/No per result).
/// Falls back to the original order on timeout or any parse failure.
async fn llm_rerank(
    query: &str,
    candidates: Vec<NoteSearchResult>,
    top_k: usize,
    config: &VaultConfig,
) -> Vec<NoteSearchResult> {
    let model = if !config.reranker_model.is_empty() {
        &config.reranker_model
    } else if !config.active_model.is_empty() {
        &config.active_model
    } else {
        return candidates;
    };

    // Only rerank when there are more candidates than we'll return
    if candidates.len() <= top_k {
        return candidates;
    }

    let passages: String = candidates
        .iter()
        .enumerate()
        .map(|(i, r)| format!("[{}] {} — {}", i + 1, r.title, r.preview.chars().take(120).collect::<String>()))
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = format!(
        "Query: \"{}\"\n\nFor each passage decide if it is relevant.\nReply ONLY with a JSON array: \
         [{{\"i\":1,\"relevant\":true}},{{\"i\":2,\"relevant\":false}},...]\n\n{}",
        query, passages
    );

    let base_url = crate::llm::provider_base_url(config);
    let fut = crate::llm::chat_completion(
        base_url,
        model.clone(),
        vec![
            crate::llm::ChatMessage {
                role: "system".to_string(),
                content: "You are a search result relevance filter. Reply only with the JSON array requested.".to_string(),
            },
            crate::llm::ChatMessage { role: "user".to_string(), content: prompt },
        ],
        Some(0.0),
        Some(512),
        config.llm_provider.clone(),
        config.api_key.clone(),
    );

    let scores = match tokio::time::timeout(Duration::from_secs(5), fut).await {
        Ok(Ok(text)) => extract_rank_scores(&text),
        _ => return candidates, // timeout or error → RRF order
    };

    if scores.is_empty() {
        return candidates;
    }

    // Build relevance lookup (1-indexed from prompt)
    let relevant_set: HashSet<usize> = scores.iter()
        .filter(|s| s.relevant)
        .map(|s| s.i.saturating_sub(1)) // convert to 0-indexed
        .collect();

    // Relevant results first (preserving RRF sub-order), then irrelevant
    let mut relevant: Vec<NoteSearchResult> = Vec::new();
    let mut irrelevant: Vec<NoteSearchResult> = Vec::new();
    for (i, result) in candidates.into_iter().enumerate() {
        if relevant_set.contains(&i) {
            relevant.push(result);
        } else {
            irrelevant.push(result);
        }
    }
    relevant.extend(irrelevant);
    relevant
}

// ── Index command ────────────────────────────────────────────────────────────

pub async fn index_space_notes(space_id: String) -> Result<usize, String> {
    let config = vault_config();
    let notes = read_space_notes_internal(&space_id)?;

    if notes.is_empty() { return Ok(0); }

    let mut cache = load_cache(&space_id);

    let existing: HashMap<String, String> = cache.entries.iter()
        .map(|e| (e.note_id.clone(), e.fingerprint.clone()))
        .collect();

    let dirty: Vec<_> = notes.iter()
        .filter(|n| existing.get(&n.id).map_or(true, |fp| fp != &fingerprint(&n.title, &n.content)))
        .collect();

    if dirty.is_empty() {
        let live_ids: HashSet<String> = notes.iter().map(|n| n.id.clone()).collect();
        cache.entries.retain(|e| live_ids.contains(&e.note_id));
        save_cache(&space_id, &cache)?;
        return Ok(0);
    }

    let mut indexed = 0usize;
    let mut new_dim: Option<usize> = None;

    for batch in dirty.chunks(50) {
        let texts: Vec<String> = batch.iter().map(|n| {
            let body = &n.content[..n.content.len().min(2000)];
            format!("{}: {}", n.title, body)
        }).collect();

        let embeddings = match fetch_embeddings(texts, &config.lm_studio_url).await {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[search] Embedding batch failed, skipping: {}", e);
                continue;
            }
        };

        for (note, embedding) in batch.iter().zip(embeddings) {
            if let Some(d) = new_dim {
                if embedding.len() != d { continue; }
            } else {
                new_dim = Some(embedding.len());
            }
            let preview: String = note.content.lines()
                .find(|l| !l.trim().is_empty())
                .unwrap_or("")
                .chars().take(200).collect();
            let entry = IndexEntry {
                note_id:     note.id.clone(),
                title:       note.title.clone(),
                date:        note.date.clone(),
                note_type:   note.note_type.clone(),
                preview,
                fingerprint: fingerprint(&note.title, &note.content),
                embedding,
            };
            cache.entries.retain(|e| e.note_id != note.id);
            cache.entries.push(entry);
            indexed += 1;
        }
    }

    if let Some(dim) = new_dim {
        cache.entries.retain(|e| e.embedding.len() == dim || e.embedding.is_empty());
    }
    let live_ids: HashSet<String> = notes.iter().map(|n| n.id.clone()).collect();
    cache.entries.retain(|e| live_ids.contains(&e.note_id));

    save_cache(&space_id, &cache)?;
    Ok(indexed)
}

// ── Hybrid search: 6-lane BM25 + vector → weighted RRF → LLM reranker ───────

pub async fn search_space_notes(
    space_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<NoteSearchResult>, String> {
    let query = query.trim().to_string();
    if query.is_empty() { return Ok(vec![]); }

    let config  = vault_config();
    let top_k   = limit.unwrap_or(8);
    let fetch_k = (top_k * 3).max(15);
    let rerank_k = fetch_k; // candidates passed to reranker before trimming to top_k

    let cache = load_cache(&space_id);
    if cache.entries.is_empty() {
        return Err("No index yet — click Index Notes first.".to_string());
    }

    // Step 1 — query expansion (4s timeout; falls back to raw query on failure)
    let expanded = expand_query(&query, &config).await;

    // Step 2 — 6 parallel search lanes
    let entries = &cache.entries;
    let lm_url  = &config.lm_studio_url;

    let (v_orig, v_hyde, v_alt1, b_keys, b_alt1, b_alt2) = tokio::join!(
        vector_search(entries, &query,          lm_url, fetch_k), // orig vector (×2 weight)
        vector_search(entries, &expanded.hyde,  lm_url, fetch_k), // HyDE vector
        vector_search(entries, &expanded.alt1,  lm_url, fetch_k), // alt1 vector
        async { bm25_search(entries, &expanded.keywords, fetch_k) }, // orig BM25 (×2 weight)
        async { bm25_search(entries, &expanded.alt1,     fetch_k) }, // alt1 BM25
        async { bm25_search(entries, &expanded.alt2,     fetch_k) }, // alt2 BM25
    );

    // Step 3 — weighted RRF: original lanes ×2, expanded lanes ×1
    let rrf = rrf_weighted(&[
        (&v_orig, 2.0), (&v_hyde, 1.0), (&v_alt1, 1.0),
        (&b_keys, 2.0), (&b_alt1, 1.0), (&b_alt2, 1.0),
    ], 60.0);

    if rrf.is_empty() { return Ok(vec![]); }

    // Step 4 — map RRF results to NoteSearchResult (take rerank_k candidates)
    let entry_map: HashMap<&str, &IndexEntry> = cache.entries.iter()
        .map(|e| (e.note_id.as_str(), e))
        .collect();

    let candidates: Vec<NoteSearchResult> = rrf.iter()
        .take(rerank_k)
        .filter_map(|(note_id, score)| {
            let e = entry_map.get(note_id.as_str())?;
            Some(NoteSearchResult {
                note_id:   e.note_id.clone(),
                title:     e.title.clone(),
                date:      e.date.clone(),
                note_type: e.note_type.clone(),
                preview:   e.preview.clone(),
                score:     *score,
            })
        })
        .collect();

    // Step 5 — LLM reranker (5s timeout; returns candidates unchanged on failure)
    let reranked = llm_rerank(&query, candidates, top_k, &config).await;

    Ok(reranked.into_iter().take(top_k).collect())
}

// ── Index status ─────────────────────────────────────────────────────────────

pub fn space_index_status(space_id: String) -> serde_json::Value {
    let path  = embed_cache_path(&space_id);
    let cache = load_cache(&space_id);
    let last_modified = path
        .metadata().ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_secs()));
    serde_json::json!({
        "indexed_count": cache.entries.len(),
        "last_modified_unix": last_modified,
    })
}
