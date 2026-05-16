---
layout: default
title: User Guide
description: Get started with ThoughtForge — local AI planning for macOS.
prose: true
---

# ThoughtForge User Guide

ThoughtForge is a local-first AI planning assistant for macOS. It keeps everything on your machine — tasks, notes, and AI conversations never leave your computer.

## Getting Started

### 1. Install LM Studio

ThoughtForge uses a local LLM for all AI features. Download [LM Studio](https://lmstudio.ai) and load a chat model:

```
lms load qwen2.5-14b-instruct        # recommended for 16–32 GB RAM
lms load qwen2.5-7b-instruct         # works on 8 GB RAM
```

For semantic search in notes, also load an embedding model:

```
lms load nomic-embed-text-v1.5
```

Make sure LM Studio's local server is running (green dot in the LM Studio menu bar).

### 2. First Launch

When you open ThoughtForge for the first time, it creates a vault at `~/Documents/ThoughtForge/`. The app creates a **General** space automatically — your default workspace for personal tasks and daily notes.

Open **Settings** (gear icon, bottom-left) and:
- Set your **Name** (used for task assignment and personalized planning)
- Verify the **LM Studio URL** is `http://localhost:1234`
- Select your **Chat Model** from the dropdown

---

## The Dashboard

The dashboard gives you a filtered view of all your tasks across every project.

### Smart Filters

| Filter | What it shows |
|--------|---------------|
| **My Tasks** | Open tasks assigned to you (matched by your name in Settings) |
| **Overdue** | Any task with a past due date |
| **Due Today** | Tasks due today |
| **Due This Week** | Tasks due in the next 7 days |
| **In Progress** | Everything currently in progress |
| **Blocked** | Tasks with status = blocked |
| **Unassigned** | Open tasks with no owner |
| **No Date** | Open tasks with no due date set |
| **Recently Done** | Tasks completed in the last 7 days |
| **All Open** | Every non-archived, non-done task |

### Creating Tasks

Click **+ New Task** (top-right) to open the task editor. Fill in:
- **Title** — what needs to be done
- **Project** — which space it belongs to (determines who can see it in the space's task list)
- **Priority** — Critical / High / Medium / Low
- **Urgency** — when it needs to happen (Today, This Week, etc.)
- **Due date**, **Owner**, **Estimated hours**

You can also create tasks directly from AI Chat (see below) or by uploading a transcript.

### Task Actions (Right-click / three-dot menu)

- **Quick-assign**: set owner to yourself with one click
- **Timer**: start/stop time tracking on a task
- **Archive**: hide a task without deleting it
- **Delete**: permanently remove

---

## Kanban Board

The Kanban board shows the same tasks in a columnar layout. Switch views with the tabs at the top:

| View | Layout |
|------|--------|
| **Time** | Columns by urgency: Critical · This Week · Next 2 Weeks · Ongoing |
| **Status** | Columns by workflow: Todo · In Progress · Review · Done |
| **Day** | A timeline for today with booked slots |
| **Calendar** | Monthly calendar with due dates |

**Drag & drop** tasks between columns to change their urgency or status.

Use the **Project** and **Owner** filter dropdowns to narrow the board to a specific team member or project.

---

## Project Spaces

Spaces are your project workspaces. Each space has its own notes, tasks, booked hours, and AI knowledge base.

### Creating a Space

Click **+ New Space** in the left sidebar, or Tasks automatically create their parent space when you set a project name on a task.

### Tabs Inside a Space

| Tab | What's here |
|-----|-------------|
| **Dashboard** | Task summary, time booked this week, overdue count, progress towards goals |
| **Notes** | Daily notes and general notes |
| **Meetings** | Meeting notes (same as notes but filtered by type = meeting) |
| **Documents** | Uploaded files (transcripts, PDFs, markdown) |
| **Tasks** | All tasks belonging to this space |
| **AI Context** | Semantic search over all notes in this space |

### Booking Time

In the Dashboard tab, click **Book Time** to log hours. Each entry records a date, duration, and optional description. The weekly chart and Stats view both use these entries.

### Semantic Search (AI Context Tab)

1. Click **Index Space** to embed all notes using your LM Studio embedding model
2. Type a natural language query in the search box
3. Results show the most relevant notes with a preview

Indexing is incremental — only notes changed since the last index run are re-embedded.

### Goals (SMART Goals)

Create goals from the overview tab. Each goal tracks:
- **Metric** — what you're measuring (e.g., "active users")
- **Target** / **Current** — progress bar
- **Difficulty** — Easy / Moderate / Stretch
- **Due date** and **Status** (active / completed / abandoned)

Goals are also accessible via the dedicated **Goals** view in the left sidebar.

---

## AI Chat

The chat uses your local LLM. It can answer questions, plan your week, and propose task changes.

### How Task Changes Work

The AI never modifies your vault directly. Instead:
1. You ask: "Set task X to in progress and move it to this week"
2. The AI responds and includes a **change card** listing the proposed modifications
3. You review each change and click **Apply** or **Skip**

This means you stay in control — the AI suggests, you decide.

### Slash Commands

Type `/` to see available commands:

| Command | What it does |
|---------|-------------|
| `/plan-day` | Asks the AI to build a focused plan for today |
| `/plan-week` | Day-by-day breakdown for the week |
| `/status` | Overview of all projects and any blockers |
| `/blocked` | Show blocked or overdue items with context |
| `/extract` | Paste any text — AI extracts action items as tasks |
| `/summarize [project]` | Summarise a specific project |
| `/prioritize` | AI suggests a priority ordering |

### Tips

- The AI receives your full task list as context (up to the last 30 active tasks). The more detail you add to tasks (notes, due dates, owners), the better the planning suggestions.
- For meeting-heavy days, try "what should I focus on between meetings?" after booking your meeting slots.

---

## Document Processing

Upload transcripts and documents for AI-powered action item extraction.

1. Go to **Documents** in any space
2. Click **Upload** and select a `.txt`, `.md`, or `.pdf` file
3. After processing, click **Extract Tasks** to run the AI over the document
4. Review the extracted tasks in the preview modal, edit as needed, then confirm

For meeting recordings, paste the transcript text directly into chat with `/extract`.

---

## Time Tracking

Every task has a built-in timer. Click the **play button** on any task card to start tracking. Click stop when you're done — the elapsed time is added to `actual_hours` on the task.

For longer projects, use **Book Time** inside a space to log hours with a description. These entries appear in the **Stats** view weekly breakdown.

### Stats View

The Stats view shows:
- **This Week** vs previous week hours
- **Hours by project** pie chart
- **Daily activity** heatmap
- **Weekly target** — set your target hours in Settings

---

## Settings

| Setting | Description |
|---------|-------------|
| **Vault Path** | Where your data lives (default: `~/Documents/ThoughtForge/`) |
| **Name** | Your display name for task assignment |
| **LM Studio URL** | Usually `http://localhost:1234` |
| **Chat Model** | The model to use for AI chat |
| **Embedding Model** | The model used for semantic search |
| **Status Colors** | Customize the color of each task status |
| **Weekly Hours Target** | Your target work hours for the Stats view |
| **MCP Server** | Enable/disable the MCP integration |
| **Auto-Start** | Launch ThoughtForge at login |

### Changing the Vault Path

Go to Settings → **Change Vault Location**. ThoughtForge will use the new path immediately — your existing data stays in the old location, you'll need to copy it manually if you want to migrate.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘N` | New task (from Dashboard or Board) |
| `⌘K` | Focus the sidebar search / navigation |
| `Esc` | Close modal / cancel edit |

---

## Data & Privacy

All your data is stored locally in `~/Documents/ThoughtForge/`:

```
ThoughtForge/
  spaces/
    {id}/
      space.json          # Space metadata and time entries
      notes/{id}.md       # Notes (YAML frontmatter + markdown)
      tasks/{id}.md       # Tasks (YAML frontmatter + notes)
      search_index.json   # Local vector index for semantic search
  boards/
    kanban.md             # Board layout settings
  uploads/
    transcripts/          # Uploaded text files
    documents/            # Uploaded PDFs
  config.yaml             # App configuration
```

ThoughtForge makes **zero outbound network calls** except to `localhost` (LM Studio). No telemetry, no cloud sync, no tracking.

---

## Troubleshooting

**AI chat says "Connection failed":**  
LM Studio is not running or the URL is wrong. Start LM Studio, make sure the server is running (green dot), and verify Settings → LM Studio URL.

**No models in the dropdown:**  
Click the refresh icon next to the model dropdown. If it stays empty, check that LM Studio is running on the correct port.

**Semantic search returns no results:**  
You need to index the space first (AI Context tab → Index Space) and have an embedding model loaded in LM Studio.

**App is slow to start:**  
If your vault is on a slow or network drive, initial load takes longer. Consider moving the vault path to a local SSD.

**Task timer won't stop:**  
The timer stops automatically when you quit the app. If you see a stuck timer on restart, click the timer icon on the task to force-stop it.
