use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoInfo {
    pub duration: f64,
    pub width: i32,
    pub height: i32,
    pub fps: f64,
}

/// Get the path to the bundled ffmpeg binary
pub fn get_ffmpeg_path() -> Result<PathBuf, String> {
    let bin_name = if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };

    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?
        .parent()
        .ok_or("No parent dir")?
        .to_path_buf();

    let candidates = vec![
        exe_dir.join("binaries").join(bin_name),
        exe_dir.join("..").join("binaries").join(bin_name),
        exe_dir.join("..").join("..").join("binaries").join(bin_name),
        exe_dir.join("..")
            .join("..")
            .join("src-tauri")
            .join("binaries")
            .join(bin_name),
    ];

    for path in candidates {
        if path.exists() {
            return Ok(path);
        }
    }

    // Fallback: check common paths directly (GUI apps don't inherit shell PATH)
    let system_candidates = if cfg!(target_os = "macos") {
        vec![
            PathBuf::from("/opt/homebrew/bin/ffmpeg"),
            PathBuf::from("/usr/local/bin/ffmpeg"),
            PathBuf::from("/opt/local/bin/ffmpeg"),
        ]
    } else if cfg!(target_os = "windows") {
        vec![
            PathBuf::from("C:\\ffmpeg\\bin\\ffmpeg.exe"),
        ]
    } else {
        vec![
            PathBuf::from("/usr/bin/ffmpeg"),
            PathBuf::from("/usr/local/bin/ffmpeg"),
        ]
    };

    for path in system_candidates {
        if path.exists() {
            return Ok(path);
        }
    }

    // Last resort: try PATH via login shell
    if let Ok(output) = std::process::Command::new("/bin/bash")
        .args(["-l", "-c", "which ffmpeg"])
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                let p = PathBuf::from(&path);
                if p.exists() {
                    return Ok(p);
                }
            }
        }
    }

    Err("ffmpeg not found.\n请安装 FFmpeg:\n  macOS: brew install ffmpeg\n  Windows: 下载 ffmpeg.exe 放到应用目录".to_string())
}

#[tauri::command]
pub async fn get_video_info(path: String) -> Result<VideoInfo, String> {
    let ffmpeg_path = get_ffmpeg_path()?;

    // ffmpeg -i without output file prints info to stderr and exits with code 1
    let output = std::process::Command::new(ffmpeg_path)
        .args(["-i", &path])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    // ffmpeg exits with code 1 when no output file is specified — that's expected
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Parse duration, e.g. "  Duration: 00:05:39.27, start: 0.000000, bitrate: ..."
    let duration = regex_parse_duration(&stderr)?;

    // Parse video stream, e.g. "Stream #0:0(und): Video: h264 ... 1920x1080 ... 30 fps"
    let (width, height, fps) = regex_parse_video_stream(&stderr)?;

    Ok(VideoInfo {
        duration,
        width,
        height,
        fps,
    })
}

/// Parse "Duration: HH:MM:SS.ms" from ffmpeg stderr
fn regex_parse_duration(stderr: &str) -> Result<f64, String> {
    for line in stderr.lines() {
        if let Some(idx) = line.find("Duration:") {
            let rest = &line[idx + "Duration:".len()..];
            let time_str = rest.split(',').next().unwrap_or("").trim();
            return parse_hms(time_str);
        }
    }
    Err("Failed to parse video duration from ffmpeg output".to_string())
}

/// Parse "1920x1080" and "30 fps" from video stream line
fn regex_parse_video_stream(stderr: &str) -> Result<(i32, i32, f64), String> {
    for line in stderr.lines() {
        if line.contains("Video:") {
            // Parse resolution: find NNNxNNN pattern
            let mut width: i32 = 0;
            let mut height: i32 = 0;
            let mut fps: f64 = 30.0;

            // Find resolution pattern (e.g., "1920x1080")
            for part in line.split([' ', ',']) {
                if let Some(pos) = part.find('x') {
                    if let (Ok(w), Ok(h)) = (
                        part[..pos].parse::<i32>(),
                        part[pos + 1..].parse::<i32>(),
                    ) {
                        if w > 0 && h > 0 {
                            width = w;
                            height = h;
                        }
                    }
                }
            }

            // Parse fps from "30 fps" or "29.97 fps" or "24000/1001 fps"
            if let Some(fps_str) = line.split("fps").next() {
                // Get the last number-like token before "fps"
                let tokens: Vec<&str> = fps_str.split([' ', ',']).filter(|t| !t.is_empty()).collect();
                if let Some(last) = tokens.last() {
                    if last.contains('/') {
                        // Fraction format like "24000/1001"
                        let parts: Vec<&str> = last.split('/').collect();
                        if parts.len() == 2 {
                            if let (Ok(num), Ok(den)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                                if den > 0.0 {
                                    fps = num / den;
                                }
                            }
                        }
                    } else if let Ok(v) = last.parse::<f64>() {
                        fps = v;
                    }
                }
            }

            if width > 0 && height > 0 {
                return Ok((width, height, fps));
            }
        }
    }
    Err("Failed to parse video stream info from ffmpeg output".to_string())
}

/// Parse "HH:MM:SS.ms" to seconds
fn parse_hms(time_str: &str) -> Result<f64, String> {
    let parts: Vec<&str> = time_str.trim().split(':').collect();
    if parts.len() >= 3 {
        let h: f64 = parts[0].parse().map_err(|_| "Invalid hours")?;
        let m: f64 = parts[1].parse().map_err(|_| "Invalid minutes")?;
        let s: f64 = parts[2].parse().map_err(|_| "Invalid seconds")?;
        Ok(h * 3600.0 + m * 60.0 + s)
    } else {
        Err(format!("Invalid time format: {}", time_str))
    }
}
