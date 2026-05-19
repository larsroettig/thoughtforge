import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface SystemInfo {
  total_ram_gb: number;
  cpu_arch: string; // "aarch64" | "x86_64"
}

export function useSystemInfo() {
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    api<SystemInfo>("get_system_info")
      .then(setInfo)
      .catch(() => {});
  }, []);

  return info;
}
