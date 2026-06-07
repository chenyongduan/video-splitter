mod json_editor;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(json_editor::JsonEditorState::default()))
        .invoke_handler(tauri::generate_handler![
            json_editor::json_open_file,
            json_editor::json_toggle_collapse,
            json_editor::json_update_node,
            json_editor::json_format,
            json_editor::json_minify,
            json_editor::json_validate,
            json_editor::json_save,
            json_editor::json_get_formatted_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
