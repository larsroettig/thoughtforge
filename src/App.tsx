import { lazy, Suspense, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "@/components/layout/Sidebar";
import { StatusBar } from "@/components/layout/StatusBar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import type { ProjectSpace } from "@/types";
import { useLlm } from "@/hooks/useLlm";

const DashboardView   = lazy(() => import("@/components/board/DashboardView").then((m) => ({ default: m.DashboardView })));
const KanbanBoard     = lazy(() => import("@/components/board/KanbanBoard").then((m) => ({ default: m.KanbanBoard })));
const ArchiveView     = lazy(() => import("@/components/board/ArchiveView").then((m) => ({ default: m.ArchiveView })));
const StatsView       = lazy(() => import("@/components/board/StatsView").then((m) => ({ default: m.StatsView })));
const ProjectSpaceView = lazy(() => import("@/components/spaces/ProjectSpaceView").then((m) => ({ default: m.ProjectSpaceView })));
const ChatView        = lazy(() => import("@/components/chat/ChatView").then((m) => ({ default: m.ChatView })));
const DocumentsView   = lazy(() => import("@/components/documents/DocumentsView").then((m) => ({ default: m.DocumentsView })));
const SettingsView    = lazy(() => import("@/components/settings/SettingsView").then((m) => ({ default: m.SettingsView })));
const EisenhowerMatrix = lazy(() => import("@/components/matrix/EisenhowerMatrix").then((m) => ({ default: m.EisenhowerMatrix })));
const GoalsView       = lazy(() => import("@/components/goals/GoalsView").then((m) => ({ default: m.GoalsView })));
const ExtractionModal = lazy(() => import("@/components/documents/ExtractionModal").then((m) => ({ default: m.ExtractionModal })));

function App() {
  const { currentView, extractionPreview } = useAppStore();
  const { initVault, loadTasks, loadConfig, startWatching, loadSpaces, saveSpace } = useVault();
  const { checkConnection } = useLlm();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await initVault();
        if (cancelled) return;
        const config = await loadConfig();
        if (cancelled) return;
        await loadTasks();
        if (cancelled) return;
        const spaces = await loadSpaces();
        if (cancelled) return;
        await checkConnection();

        // Create "General" space if it doesn't exist
        const spaceIds = new Set(spaces.map((s: { id: string }) => s.id));
        if (!spaceIds.has("general")) {
          const generalSpace: ProjectSpace = {
            id: "general",
            name: "General",
            description: "Daily notes, fleeting thoughts, and personal tasks",
            color: "#6c5ce7",
            created: new Date().toISOString().split("T")[0],
            archived: false,
            documents: [],
            timeEntries: [],
          };
          useAppStore.getState().addProjectSpace(generalSpace);
          await saveSpace(generalSpace);
          spaceIds.add("general");
        }

        // Auto-create spaces from existing task projects
        const currentTasks = useAppStore.getState().tasks;
        const projectNames = [...new Set(currentTasks.map((t) => t.project).filter(Boolean))];
        for (const projId of projectNames) {
          if (cancelled) return;
          if (spaceIds.has(projId)) continue;
          const newSpace: ProjectSpace = {
            id: projId,
            name: projId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            description: "",
            color: "",
            created: new Date().toISOString().split("T")[0],
            archived: false,
            documents: [],
            timeEntries: [],
          };
          useAppStore.getState().addProjectSpace(newSpace);
          await saveSpace(newSpace);
          spaceIds.add(projId);
        }

        if (!cancelled && config && config.watched_folders.length > 0) {
          await startWatching(config.watched_folders);
        }
      } catch (err) {
        if (!cancelled) console.error("Bootstrap failed:", err);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      invoke("stop_watching").catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return <DashboardView />;
      case "board":
        return <KanbanBoard />;
      case "matrix":
        return <EisenhowerMatrix />;
      case "goals":
        return <GoalsView />;
      case "archive":
        return <ArchiveView />;
      case "stats":
        return <StatsView />;
      case "project-space":
        return <ProjectSpaceView />;
      case "chat":
        return <ChatView />;
      case "documents":
        return <DocumentsView />;
      case "settings":
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-sm text-vault-text-muted h-full">
                  Loading…
                </div>
              }
            >
              {renderView()}
            </Suspense>
          </ErrorBoundary>
        </div>
        <StatusBar />
      </div>
      {extractionPreview && (
        <Suspense fallback={null}>
          <ExtractionModal />
        </Suspense>
      )}
    </div>
  );
}

export default App;
