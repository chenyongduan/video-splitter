mod json_editor;

use std::sync::Mutex;

/// Ctrl+Shift+F12 触发，打开/关闭 WebView 控制台（devtools feature 保证正式包可用）
#[tauri::command]
fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Mutex::new(json_editor::JsonEditorState::default()))
        .invoke_handler(tauri::generate_handler![
            toggle_devtools,
            json_editor::json_open_file,
            json_editor::json_toggle_collapse,
            json_editor::json_update_node,
            json_editor::json_format,
            json_editor::json_minify,
            json_editor::json_validate,
            json_editor::json_save,
            json_editor::json_get_formatted_text,
            json_editor::json_toggle_expand_strings,
            json_editor::json_get_lines,
            json_editor::json_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
