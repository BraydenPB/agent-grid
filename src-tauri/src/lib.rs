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

    // Canonicalize to resolve symlinks and ".." traversal before reading
    let dir_path = dir_path
        .canonicalize()
        .map_err(|e| format!("Invalid path '{}': {}", dir, e))?;

    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {}", dir_path.display()));
    }

    let entries = fs::read_dir(&dir_path).map_err(|e| e.to_string())?;
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
        // Strip \\?\ extended-length prefix that canonicalize() adds on Windows.
        // Many programs (PowerShell, conpty) don't handle it as a CWD.
        let full_path = path.to_string_lossy().to_string();
        let full_path = full_path
            .strip_prefix("\\\\?\\")
            .unwrap_or(&full_path)
            .to_string();
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

/* ── Worktree commands ── */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub is_main: bool,
}

#[tauri::command]
fn list_worktrees(cwd: String) -> Result<Vec<WorktreeInfo>, String> {
    // Canonicalize cwd to resolve ".." traversals (consistent with list_projects)
    let cwd_path = Path::new(&cwd)
        .canonicalize()
        .map_err(|e| format!("Invalid path '{}': {}", cwd, e))?;

    let mut child = std::process::Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&cwd_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    // 5-second deadline to avoid hanging on pathological repos
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    let stderr = child.stderr.take().map(|mut e| {
                        use std::io::Read;
                        let mut buf = String::new();
                        let _ = e.read_to_string(&mut buf);
                        buf
                    }).unwrap_or_default();
                    return Err(format!("git worktree list failed: {}", stderr));
                }
                break;
            }
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("git worktree list timed out".to_string());
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(format!("git worktree list failed: {}", e)),
        }
    }

    let stdout = child.stdout.take().map(|mut o| {
        use std::io::Read;
        let mut buf = String::new();
        let _ = o.read_to_string(&mut buf);
        buf
    }).unwrap_or_default();
    let mut worktrees = Vec::new();
    let mut current_path = String::new();
    let mut current_branch = String::new();
    let mut is_bare = false;

    for line in stdout.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            if !current_path.is_empty() && !is_bare {
                worktrees.push(WorktreeInfo {
                    path: current_path
                        .strip_prefix("\\\\?\\")
                        .unwrap_or(&current_path)
                        .to_string(),
                    branch: current_branch.clone(),
                    is_main: worktrees.is_empty(),
                });
            }
            current_path = path.to_string();
            current_branch = String::new();
            is_bare = false;
        } else if let Some(branch) = line.strip_prefix("branch refs/heads/") {
            current_branch = branch.to_string();
        } else if line == "bare" {
            is_bare = true;
        } else if line == "detached" {
            current_branch = "(detached)".to_string();
        }
    }

    if !current_path.is_empty() && !is_bare {
        worktrees.push(WorktreeInfo {
            path: current_path
                .strip_prefix("\\\\?\\")
                .unwrap_or(&current_path)
                .to_string(),
            branch: current_branch,
            is_main: worktrees.is_empty(),
        });
    }

    Ok(worktrees)
}

/// Canonicalize a worktree result path and strip the \\?\ prefix
fn canonicalize_worktree_result(cwd: &Path, path: &str) -> String {
    let wt_path = Path::new(path);
    let abs_path = if wt_path.is_absolute() {
        wt_path.to_path_buf()
    } else {
        cwd.join(wt_path)
    };
    let result = abs_path
        .canonicalize()
        .unwrap_or(abs_path)
        .to_string_lossy()
        .to_string();
    result
        .strip_prefix("\\\\?\\")
        .unwrap_or(&result)
        .to_string()
}

#[tauri::command]
fn create_worktree(cwd: String, branch: String, path: String) -> Result<String, String> {
    // Canonicalize cwd and validate the target path stays within it
    let cwd_path = Path::new(&cwd)
        .canonicalize()
        .map_err(|e| format!("Invalid cwd '{}': {}", cwd, e))?;

    // Resolve the target path relative to cwd
    let target = if Path::new(&path).is_absolute() {
        Path::new(&path).to_path_buf()
    } else {
        cwd_path.join(&path)
    };

    // Containment check: target must be under cwd (prevent path traversal)
    // Use lexical check on the joined path — canonicalize isn't possible yet
    // since the directory doesn't exist. Normalize ".." components instead.
    let mut normalized = Vec::new();
    for component in target.components() {
        match component {
            std::path::Component::ParentDir => { normalized.pop(); }
            std::path::Component::CurDir => {}
            c => normalized.push(c),
        }
    }
    let normalized_path: std::path::PathBuf = normalized.iter().collect();
    if !normalized_path.starts_with(&cwd_path) {
        return Err("Worktree path must be within the project directory".to_string());
    }

    let output = std::process::Command::new("git")
        .args(["worktree", "add", &path, "-b", &branch])
        .current_dir(&cwd_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if output.status.success() {
        return Ok(canonicalize_worktree_result(&cwd_path, &path));
    }

    // Branch exists — try without -b
    let output2 = std::process::Command::new("git")
        .args(["worktree", "add", &path, &branch])
        .current_dir(&cwd_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if output2.status.success() {
        return Ok(canonicalize_worktree_result(&cwd_path, &path));
    }

    let stderr = String::from_utf8_lossy(&output2.stderr);
    Err(format!("git worktree add failed: {}", stderr))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_pty::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_projects,
            list_worktrees,
            create_worktree,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("Failed to run Tauri application: {}", e));
}
