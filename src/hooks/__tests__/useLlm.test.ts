import { describe, it, expect } from "vitest";
import { parseActions, findTaskByTitle } from "@/hooks/useLlm";
import type { Task } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    status: "todo",
    priority: "medium",
    urgency: "ongoing",
    project: "",
    owner: "",
    collaborators: [],
    source: "",
    source_quote: "",
    created: "2026-05-12",
    due: "",
    estimated_hours: 0,
    actual_hours: 0,
    blocked_by: [],
    subtasks: [],
    notes: "",
    archived: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseActions
// ---------------------------------------------------------------------------

describe("parseActions", () => {
  it("extracts a single action block from LLM response text", () => {
    const text = `I've updated the task for you.\n[[ACTION: set_due | quarterly report | 2026-05-15]]`;
    const { cleanText, actions } = parseActions(text);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      type: "set_due",
      titleMatch: "quarterly report",
      value: "2026-05-15",
    });
    expect(cleanText).toContain("I've updated the task for you.");
  });

  it("returns empty actions array and unchanged text when no actions present", () => {
    const text = "Sure, here is a summary of your tasks.\nYou have 5 tasks due this week.";
    const { cleanText, actions } = parseActions(text);

    expect(actions).toHaveLength(0);
    expect(cleanText).toBe(text);
  });

  it("extracts multiple actions from one response", () => {
    const text = [
      "Here is your plan for the day:",
      "[[ACTION: set_due | quarterly report | 2026-05-12]]",
      "[[ACTION: set_due | design mockup | 2026-05-12]]",
      "[[ACTION: set_priority | design mockup | high]]",
    ].join("\n");

    const { actions } = parseActions(text);

    expect(actions).toHaveLength(3);
    expect(actions[0]).toEqual({
      type: "set_due",
      titleMatch: "quarterly report",
      value: "2026-05-12",
    });
    expect(actions[1]).toEqual({
      type: "set_due",
      titleMatch: "design mockup",
      value: "2026-05-12",
    });
    expect(actions[2]).toEqual({
      type: "set_priority",
      titleMatch: "design mockup",
      value: "high",
    });
  });

  it("handles all action types (set_due, set_priority, set_status, set_owner, archive)", () => {
    const text = [
      "[[ACTION: set_due | task A | 2026-06-01]]",
      "[[ACTION: set_priority | task B | critical]]",
      "[[ACTION: set_status | task C | in_progress]]",
      "[[ACTION: set_owner | task D | Alice]]",
      "[[ACTION: archive | task E]]",
    ].join("\n");

    const { actions } = parseActions(text);

    expect(actions).toHaveLength(5);
    expect(actions[0].type).toBe("set_due");
    expect(actions[1].type).toBe("set_priority");
    expect(actions[1].value).toBe("critical");
    expect(actions[2].type).toBe("set_status");
    expect(actions[2].value).toBe("in_progress");
    expect(actions[3].type).toBe("set_owner");
    expect(actions[3].value).toBe("Alice");
    expect(actions[4].type).toBe("archive");
    expect(actions[4].titleMatch).toBe("task E");
    expect(actions[4].value).toBe("");
  });

  it("removes action lines from cleanText", () => {
    const text = [
      "I've scheduled these tasks for today:",
      "",
      "1. Quarterly report",
      "2. Design mockup",
      "",
      "[[ACTION: set_due | quarterly report | 2026-05-12]]",
      "[[ACTION: set_due | design mockup | 2026-05-12]]",
    ].join("\n");

    const { cleanText } = parseActions(text);

    expect(cleanText).not.toContain("[[ACTION:");
    expect(cleanText).toContain("I've scheduled these tasks for today:");
    expect(cleanText).toContain("1. Quarterly report");
    expect(cleanText).toContain("2. Design mockup");
  });
});

// ---------------------------------------------------------------------------
// findTaskByTitle
// ---------------------------------------------------------------------------

describe("findTaskByTitle", () => {
  const tasks: Task[] = [
    makeTask({ id: "1", title: "Submit compliance approval" }),
    makeTask({ id: "2", title: "Review quarterly report" }),
    makeTask({ id: "3", title: "Update design mockup for homepage" }),
    makeTask({ id: "4", title: "Fix critical production bug" }),
  ];

  it("finds a task by exact substring match", () => {
    const result = findTaskByTitle(tasks, "quarterly report");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("2");
  });

  it("finds a task with case-insensitive matching", () => {
    const result = findTaskByTitle(tasks, "COMPLIANCE APPROVAL");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("1");
  });

  it("finds a task via fuzzy word matching", () => {
    // "design homepage" doesn't appear as a substring,
    // but both words appear in "Update design mockup for homepage"
    const result = findTaskByTitle(tasks, "design homepage");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("3");
  });

  it("returns null when no task matches", () => {
    const result = findTaskByTitle(tasks, "nonexistent zebra migration");
    expect(result).toBeNull();
  });
});
