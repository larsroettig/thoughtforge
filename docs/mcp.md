---
layout: default
title: MCP Server Docs
description: Connect Claude Desktop and other MCP clients to your ThoughtForge vault.
---

# ThoughtForge MCP Server

ThoughtForge ships a built-in **Model Context Protocol (MCP) server** that lets Claude and other MCP clients read and write your vault directly — without the GUI. This means you can ask Claude to create tasks, update goals, search your notes, and manage project spaces from any MCP-compatible chat interface.

## What is MCP?

MCP (Model Context Protocol) is an open standard that lets AI assistants connect to local tools and data. ThoughtForge's MCP server exposes your entire vault as structured tools that any MCP client can call.

## Enabling the Server

1. Open ThoughtForge → **Settings** → **MCP & Integrations**
2. Toggle **Enable MCP Server** → ON
3. Copy the **Bearer Token** (auto-generated, never sent to the internet)
4. Optionally enable **HTTP Transport** if you want Claude Desktop or other clients to connect over HTTP

The server runs on `http://localhost:7532` by default.

## Claude Desktop Setup

Add this to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "thoughtforge": {
      "command": "/path/to/ThoughtForge.app/Contents/MacOS/vaultmind-mcp",
      "args": ["--stdio"],
      "env": {}
    }
  }
}
```

> The binary path is shown in **Settings → MCP → Binary Path** after enabling the server.

For HTTP transport (alternative):

```json
{
  "mcpServers": {
    "thoughtforge": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-proxy", "http://localhost:7532/sse"],
      "env": {
        "BEARER_TOKEN": "<your-token>"
      }
    }
  }
}
```

## Available Tools

### Task Management

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_tasks` | `space_id?`, `status?` | List tasks, optionally filtered by space or status |
| `get_task` | `id` | Get a single task by ID |
| `create_task` | `title`, `project?`, `priority?`, `urgency?`, `due?`, `notes?`, `owner?` | Create a new task |
| `update_task` | `id`, `title?`, `status?`, `priority?`, `urgency?`, `due?`, `notes?`, `owner?`, `archived?` | Update task fields |
| `delete_task` | `id` | Delete a task permanently |

**Status values:** `todo` · `in_progress` · `review` · `done` · `blocked`  
**Priority values:** `critical` · `high` · `medium` · `low`  
**Urgency values:** `overdue` · `today` · `this_week` · `next_2weeks` · `ongoing`

### Project Spaces

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_spaces` | — | List all project spaces |
| `list_notes` | `space_id` | List notes in a space |
| `create_note` | `space_id`, `title`, `content`, `note_type?`, `tags?` | Create a note |
| `delete_note` | `space_id`, `note_id` | Delete a note |
| `search_notes` | `space_id`, `query`, `limit?` | Semantic search within a space's notes (requires LM Studio + embedding model) |

**Note types:** `daily` · `meeting` · `note`

### Goals

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_goals` | `space_id?` | List SMART goals, optionally filtered by space |
| `create_goal` | `title`, `space_id`, `metric?`, `target?`, `current?`, `difficulty?`, `due?`, `notes?` | Create a SMART goal |
| `update_goal` | `goal_id`, `space_id`, `title?`, `metric?`, `target?`, `current?`, `difficulty?`, `due?`, `status?`, `notes?` | Update a goal |
| `delete_goal` | `goal_id`, `space_id` | Delete a goal |

**Difficulty values:** `easy` · `moderate` · `stretch`  
**Goal status:** `active` · `completed` · `abandoned`

## Example Prompts

Once connected in Claude Desktop, try:

```
Create a task "Write Q3 blog post" in my marketing space, high priority, due 2026-06-01

List all my overdue tasks

Search my "product" space notes for "API design decisions"

Update the status of task-abc123 to in_progress

Create a SMART goal: Launch beta by Q3, metric: user signups, target: 500, space: product
```

## Security

- All communication is local-only — the MCP server never makes outbound connections
- Bearer tokens are stored in `~/Documents/ThoughtForge/config.yaml`
- HTTP transport binds only to `127.0.0.1` — not reachable from other machines on your network
- Tokens use constant-time comparison to prevent timing attacks
- Path traversal and injection are validated on every request

## Troubleshooting

**Server won't start:**  
Check that the MCP binary exists: Settings → MCP → Binary Path should show a valid path.

**Claude can't connect:**  
Verify the token in claude_desktop_config matches the one in ThoughtForge Settings. Restart Claude Desktop after changing config.

**Semantic search fails:**  
`search_notes` requires an embedding model loaded in LM Studio. Load `nomic-embed-text-v1.5` and run Settings → Index this Space before searching.

**stdio vs HTTP:**  
`--stdio` mode is recommended for Claude Desktop. HTTP mode is useful for debugging (you can call it with curl) but requires managing the token in environment variables.
