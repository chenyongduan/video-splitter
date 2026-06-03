use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

use super::ffprobe::get_ffmpeg_path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Segment {
    pub id: String,
    pub start: f64,
    pub end: f64,
    pub filename: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SplitProgress {
    pub current: usize,
    pub total: usize,
    pub percent: usize,
}

#[tauri::command]
pub async fn split_video(
    app: AppHandle,
    input_path: String,
    segments: Vec<Segment>,
) -> Result<String, String> {
    let ffmpeg_path = get_ffmpeg_path()?;

    // Create output directory: input_dir/filename_segments/
    let input = PathBuf::from(&input_path);
    let input_dir = input
        .parent()
        .ok_or("Cannot determine input directory")?;
    let stem = input
        .file_stem()
        .ok_or("Cannot determine input filename")?
        .to_string_lossy()
        .to_string();

    let output_dir = input_dir.join(format!("{}_segments", stem));
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    let total = segments.len();

    for (i, seg) in segments.iter().enumerate() {
        let output_file = output_dir.join(&seg.filename);

        let status = std::process::Command::new(&ffmpeg_path)
            .args([
                "-y",
                "-ss",
                &seg.start.to_string(),
                "-to",
                &seg.end.to_string(),
                "-i",
                &input_path,
                "-c",
                "copy",
                &output_file.to_string_lossy(),
            ])
            .status()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

        if !status.success() {
            return Err(format!(
                "ffmpeg failed for segment {} ({}s-{}s)",
                i + 1, seg.start, seg.end
            ));
        }

        // Emit progress event
        let progress = SplitProgress {
            current: i + 1,
            total,
            percent: ((i + 1) as f64 / total as f64 * 100.0) as usize,
        };

        app.emit("split-progress", &progress)
            .map_err(|e| format!("Failed to emit progress: {}", e))?;
    }

    Ok(output_dir.to_string_lossy().to_string())
}
