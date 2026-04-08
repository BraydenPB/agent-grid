use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant, UNIX_EPOCH};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub git_branch: Option<String>,
    pub git_dirty: bool,
    pub last_modified: u64,
}

fn read_git_branch(project_path: &Path) -> Option<String> {
    let head_path = project_path.join(".git").join("HEAD");
    let contents = fs::read_to_string(head_path).ok()?;
    let trimmed = contents.trim();
    if let Some(ref_path) = trimmed.strip_prefix("ref: refs/heads/") {
        Some(ref_path.to_string())
    } else if trimmed.len() >= 8 {
        // Detached HEAD — show short hash
        Some(trimmed[..8].to_string())
    } else {
        None
    }
}

fn check_git_dirty(project_path: &Path) -> bool {
    let git_dir = project_path.join(".git");
    if !git_dir.exists() {
        return false;
    }

    // Spawn with a hard timeout to avoid hanging on large/pathological repos
    let mut child = match std::process::Command::new("git")
        .args(["status", "--porcelain", "-unormal"])
        .current_dir(project_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    // Poll with a 2-second deadline instead of blocking indefinitely
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                return child
                    .stdout
                    .take()
                    .and_then(|mut out| {
                        use std::io::Read;
                        let mut buf = [0u8; 1];
                        out.read(&mut buf).ok().map(|n| n > 0)
                    })
                    .unwrap_or(false);
            }
            Ok(Some(_)) => return false, // Non-zero exit
            Ok(None) => {
                // Still running — check deadline
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return false;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(_) => return false,
        }
    }
}

#[tauri::command]
fn list_projects(dir: String) -> Result<Vec<ProjectInfo>, String> {
    let dir_path = Path::new(&dir);
    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {}", dir));
    }

    let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;
    let mut projects: Vec<ProjectInfo> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        // Skip hidden directories
        if entry
            .file_name()
            .to_str()
            .map(|n| n.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        let full_path = path.to_string_lossy().to_string();
        let git_branch = read_git_branch(&path);
        let git_dirty = if git_branch.is_some() {
            check_git_dirty(&path)
        } else {
            false
        };

        let last_modified = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        projects.push(ProjectInfo {
            name,
            path: full_path,
            git_branch,
            git_dirty,
            last_modified,
        });
    }

    // Sort by last modified (newest first)
    projects.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));

    Ok(projects)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_pty::init())
        .invoke_handler(tauri::generate_handler![list_projects])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("Failed to run Tauri application: {}", e));
}
