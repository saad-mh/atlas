import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AtsxStatus, StepStatus } from "./types";

export async function pickAtsxFile(): Promise<string | null> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "ATLAS build", extensions: ["atsx"] }],
  });
  return typeof path === "string" ? path : null;
}

export function loadAtsx(path: string): Promise<AtsxStatus> {
  return invoke<AtsxStatus>("load_atsx", { path });
}

export function markStep(path: string, stepId: string, status: StepStatus): Promise<AtsxStatus> {
  return invoke<AtsxStatus>("mark_step", { path, stepId, status });
}
