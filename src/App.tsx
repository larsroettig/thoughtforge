import { useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { StatusBar } from "@/components/layout/StatusBar";
import { DashboardView } from "@/components/board/DashboardView";
import { KanbanBoard } from "@/components/board/KanbanBoard";
import { ArchiveView } from "@/components/board/ArchiveView";
import { ProjectSpaceView } from "@/components/spaces/ProjectSpaceView";
import { ChatView } from "@/components/chat/ChatView";
import { DocumentsView } from "@/components/documents/DocumentsView";
import { SettingsView } from "@/components/settings/SettingsView";
import { ExtractionModal } from "@/components/documents/ExtractionModal";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import type { ProjectSpace } from "@/types";
import { useLlm } from "@/hooks/useLlm";

function App() {
  const { currentView, extractionPreview } = useAppStore();
  const { initVault, loadTasks, loadConfig, startWatching, loadSpaces, saveSpace } = useVault();
  const { checkConnection } = useLlm();

  useEffect(() => {
    async function bootstrap() {
      try {
        await initVault();
        const config = await loadConfig();
        await loadTasks();
        const spaces = await loadSpaces();
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
            notes: [],
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
          if (spaceIds.has(projId)) continue;
          const newSpace: ProjectSpace = {
            id: projId,
            name: projId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            description: "",
            color: "",
            created: new Date().toISOString().split("T")[0],
            archived: false,
            documents: [],
            notes: [],
            timeEntries: [],
          };
          useAppStore.getState().addProjectSpace(newSpace);
          await saveSpace(newSpace);
          spaceIds.add(projId);
        }

        if (config && config.watched_folders.length > 0) {
          await startWatching(config.watched_folders);
        }
      } catch (err) {
        console.error("Bootstrap failed:", err);
      }
    }

    bootstrap();
  }, []);

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return <DashboardView />;
      case "board":
        return <KanbanBoard />;
      case "archive":
        return <ArchiveView />;
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
        <div className="flex-1 overflow-auto">{renderView()}</div>
        <StatusBar />
      </div>
      {extractionPreview && <ExtractionModal />}
    </div>
  );
}

export default App;
