import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

export async function pickSavePath(defaultName: string): Promise<string | null> {
  const path = await save({
    defaultPath: `${defaultName || "build"}.atsx`,
    filters: [{ name: "ATLAS build", extensions: ["atsx"] }],
  });
  return path ?? null;
}

/** Hands the assembled manifest YAML to the Rust side, which writes it into
 * a temp folder and shells out to `atlas pack` (see src-tauri/src/lib.rs) -
 * same as a human packing a folder by hand. Rejects with the CLI's raw
 * validation output on failure. */
export function exportAtsx(manifestYaml: string, outputPath: string): Promise<string> {
  return invoke<string>("export_atsx", { manifestYaml, outputPath });
}
