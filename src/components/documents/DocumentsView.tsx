import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  Folder,
  Sparkles,
  Loader2,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import { useLlm } from "@/hooks/useLlm";
import type { Task } from "@/types";

export function DocumentsView() {
  const { config, isProcessing, setExtractionPreview } = useAppStore();
  const { readFileContent } = useVault();
  const { extractTasksFromText } = useLlm();

  const [watchedFiles, setWatchedFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [recentUploads, setRecentUploads] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setRecentUploads((prev) => [...prev, ...files.map((f) => f.name)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSelectFile = useCallback(
    async (path: string) => {
      setSelectedFile(path);
      try {
        const content = await readFileContent(path);
        setFileContent(content);
      } catch (err) {
        setFileContent(`Error reading file: ${err}`);
      }
    },
    [readFileContent]
  );

  const handleExtract = useCallback(
    async (path: string) => {
      try {
        const content = await readFileContent(path);
        const filename = path.split("/").pop() || path;
        const tasks = await extractTasksFromText(content, filename);

        setExtractionPreview({
          source: filename,
          tasks,
          duplicates: [], // TODO: implement dedup against existing tasks
        });
      } catch (err) {
        console.error("Extraction failed:", err);
      }
    },
    [readFileContent, extractTasksFromText, setExtractionPreview]
  );

  const allFiles = [...recentUploads];

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-vault-border flex items-center justify-between">
        <h2 className="text-xl font-bold text-vault-text-bright">Documents</h2>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf"
            multiple
            className="hidden"
            onChange={handleFilesChange}
          />
          <button onClick={handleUpload} className="btn-primary flex items-center gap-1.5 text-xs">
            <Upload className="w-3.5 h-3.5" />
            Upload
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* File List */}
        <div className="w-80 border-r border-vault-border overflow-y-auto p-4">
          {/* Watched Folders */}
          {config.watched_folders.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" />
                Watched Folders
              </h3>
              {config.watched_folders.map((folder, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-sm text-vault-text-muted py-1.5 px-2 rounded hover:bg-vault-card"
                >
                  <Folder className="w-4 h-4 text-vault-warning" />
                  <span className="truncate">{folder.split("/").pop()}</span>
                </div>
              ))}
            </div>
          )}

          {/* Uploaded Files */}
          <div>
            <h3 className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-2">
              Files
            </h3>
            {allFiles.length === 0 ? (
              <div className="text-center py-8 text-vault-text-muted text-xs">
                <Upload className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No files uploaded yet.</p>
                <p>Upload transcripts or drag files here.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {allFiles.map((path, i) => {
                  const name = path.split("/").pop() || path;
                  const isSelected = selectedFile === path;
                  return (
                    <div
                      key={`${path}-${i}`}
                      className={`flex items-center gap-2 text-sm py-2 px-2 rounded cursor-pointer group ${
                        isSelected
                          ? "bg-vault-accent/10 text-vault-accent"
                          : "text-vault-text hover:bg-vault-card"
                      }`}
                      onClick={() => handleSelectFile(path)}
                    >
                      <FileText className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate flex-1">{name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExtract(path);
                        }}
                        disabled={isProcessing}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-vault-accent/20 rounded"
                        title="Extract action items with AI"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-vault-accent" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-vault-accent" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* File Preview */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedFile ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-vault-text-bright">
                  {selectedFile.split("/").pop()}
                </h3>
                <button
                  onClick={() => handleExtract(selectedFile)}
                  disabled={isProcessing}
                  className="btn-primary flex items-center gap-1.5 text-xs"
                >
                  {isProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Extract Action Items
                </button>
              </div>
              <pre className="bg-vault-bg rounded-lg p-4 text-sm text-vault-text font-mono whitespace-pre-wrap leading-relaxed max-h-[70vh] overflow-y-auto border border-vault-border">
                {fileContent}
              </pre>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-vault-text-muted">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Select a file to preview</p>
                <p className="text-xs mt-1">or upload new documents</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
