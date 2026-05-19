import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { StatusBar } from "@/components/layout/StatusBar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import type { ProjectSpace } from "@/types";
import { useLlm } from "@/hooks/useLlm";

const DashboardView    = lazy(() => import("@/components/board/DashboardView").then((m) => ({ default: m.DashboardView })));
const KanbanBoard      = lazy(() => import("@/components/board/KanbanBoard").then((m) => ({ default: m.KanbanBoard })));
const ArchiveView      = lazy(() => import("@/components/board/ArchiveView").then((m) => ({ default: m.ArchiveView })));
const StatsView        = lazy(() => import("@/components/board/StatsView").then((m) => ({ default: m.StatsView })));
const ProjectSpaceView = lazy(() => import("@/components/spaces/ProjectSpaceView").then((m) => ({ default: m.ProjectSpaceView })));
const ChatView         = lazy(() => import("@/components/chat/ChatView").then((m) => ({ default: m.ChatView })));
const DocumentsView    = lazy(() => import("@/components/documents/DocumentsView").then((m) => ({ default: m.DocumentsView })));
const SettingsView     = lazy(() => import("@/components/settings/SettingsView").then((m) => ({ default: m.SettingsView })));
const EisenhowerMatrix = lazy(() => import("@/components/matrix/EisenhowerMatrix").then((m) => ({ default: m.EisenhowerMatrix })));
const GoalsView        = lazy(() => import("@/components/goals/GoalsView").then((m) => ({ default: m.GoalsView })));
const ExtractionModal  = lazy(() => import("@/components/documents/ExtractionModal").then((m) => ({ default: m.ExtractionModal })));

const Spinner = (
  <div className="flex-1 flex items-center justify-center text-sm text-vault-text-muted h-full">
    Loading…
  </div>
);

function App() {
  const { extractionPreview } = useAppStore();
  const { initVault, loadTasks, loadConfig, startWatching, loadSpaces, saveSpace } = useVault();
  const { checkConnection } = useLlm();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await initVault();
        if (cancelled) return;
        const [config, , spaces] = await Promise.all([loadConfig(), loadTasks(), loadSpaces()]);
        if (cancelled) return;
        void checkConnection();

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

        const currentTasks = useAppStore.getState().tasks;
        const projectNames = [...new Set(currentTasks.map((t) => t.project).filter(Boolean))];
        const toCreate = projectNames.filter((id) => !spaceIds.has(id)).map((projId) => ({
          id: projId,
          name: projId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          description: "",
          color: "",
          created: new Date().toISOString().split("T")[0],
          archived: false,
          documents: [],
          timeEntries: [],
        } as ProjectSpace));
        toCreate.forEach((s) => useAppStore.getState().addProjectSpace(s));
        if (!cancelled) await Promise.all(toCreate.map((s) => saveSpace(s)));

        if (!cancelled && config && config.watched_folders.length > 0) {
          await startWatching(config.watched_folders);
        }
      } catch (err) {
        if (!cancelled) console.error("Bootstrap failed:", err);
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <ErrorBoundary>
            <Suspense fallback={Spinner}>
              <Routes>
                <Route path="/"           element={<DashboardView />} />
                <Route path="/board"      element={<KanbanBoard />} />
                <Route path="/matrix"     element={<EisenhowerMatrix />} />
                <Route path="/goals"      element={<GoalsView />} />
                <Route path="/archive"    element={<ArchiveView />} />
                <Route path="/stats"      element={<StatsView />} />
                <Route path="/chat"       element={<ChatView />} />
                <Route path="/documents"  element={<DocumentsView />} />
                <Route path="/settings"   element={<SettingsView />} />
                <Route path="/space/:spaceId"      element={<ProjectSpaceView />} />
                <Route path="/space/:spaceId/:tab" element={<ProjectSpaceView />} />
                <Route path="*"           element={<Navigate to="/" replace />} />
              </Routes>
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
