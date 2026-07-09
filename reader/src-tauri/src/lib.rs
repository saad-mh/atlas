use serde_json::Value;
use std::process::Command;

/// Runs `atlas <args>`, returning stdout on success or a plain-text error
/// (stderr, falling back to the exit status) on failure. All `.atsx`
/// parsing/validation/mutation logic lives in the Python CLI - this is
/// just a pipe, per the architecture decision to not reimplement any of
/// that in Rust.
fn run_atlas(args: &[&str]) -> Result<String, String> {
    let output = Command::new("atlas").args(args).output().map_err(|e| {
        format!("failed to run 'atlas' - is it installed and on PATH? ({e})")
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("'atlas {}' exited with {}", args.join(" "), output.status)
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn run_atlas_json(args: &[&str]) -> Result<Value, String> {
    let stdout = run_atlas(args)?;
    serde_json::from_str(&stdout)
        .map_err(|e| format!("could not parse 'atlas' output as JSON: {e}"))
}

#[tauri::command]
fn load_atsx(path: String) -> Result<Value, String> {
    run_atlas_json(&["status", "--json", &path])
}

#[tauri::command]
fn mark_step(path: String, step_id: String, status: String) -> Result<Value, String> {
    run_atlas(&["mark", &path, &step_id, &status])?;
    // Re-fetch rather than mutate optimistically - the CLI/state file stays
    // the single source of truth (README §6, matches how `atlas status`
    // already resolves progress+drift+visibility server-side).
    run_atlas_json(&["status", "--json", &path])
}

/// Writes the creator wizard's assembled `manifest.atsx.yaml` into a fresh
/// temp folder, then shells out to `atlas pack` on that folder - same as a
/// human packing a folder by hand. Keeps all schema/DAG validation and zip
/// logic in the one place it already lives (the Python CLI); this command
/// is just the "assemble a folder, then invoke pack" glue. The temp folder
/// is removed automatically when it goes out of scope, on every path.
#[tauri::command]
fn export_atsx(manifest_yaml: String, output_path: String) -> Result<String, String> {
    let temp_dir = tempfile::Builder::new()
        .prefix("atlas-export-")
        .tempdir()
        .map_err(|e| format!("failed to create a temp folder for export: {e}"))?;

    let manifest_path = temp_dir.path().join("manifest.atsx.yaml");
    std::fs::write(&manifest_path, manifest_yaml)
        .map_err(|e| format!("failed to write manifest.atsx.yaml: {e}"))?;

    let temp_dir_str = temp_dir
        .path()
        .to_str()
        .ok_or_else(|| "temp folder path is not valid UTF-8".to_string())?;

    run_atlas(&["pack", temp_dir_str, "-o", &output_path])?;
    Ok(output_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_atsx, mark_step, export_atsx])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
