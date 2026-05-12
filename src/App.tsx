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
import { useLlm } from "@/hooks/useLlm";

function App() {
  const { currentView, extractionPreview } = useAppStore();
  const { initVault, loadTasks, loadConfig, startWatching } = useVault();
  const { checkConnection } = useLlm();

  useEffect(() => {
    async function bootstrap() {
      try {
        await initVault();
        const config = await loadConfig();
        await loadTasks();
        await checkConnection();

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
