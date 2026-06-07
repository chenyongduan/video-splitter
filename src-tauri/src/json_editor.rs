use serde::{Deserialize, Serialize};
use std::collections::HashSet;

// ---------------------------------------------------------------------------
// Data Structures
// ---------------------------------------------------------------------------

/// JSON tree node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonNode {
    pub key: Option<String>,
    pub value_type: String,
    pub value: Option<String>,
    pub children: Vec<JsonNode>,
    pub depth: u32,
    pub path: String,
}

/// Single line data sent to frontend for rendering
#[derive(Debug, Clone, Serialize)]
pub struct VisibleLine {
    pub line_number: u32,
    pub content: String,
    pub node_path: String,
    pub is_collapsible: bool,
    pub collapsed: bool,
    pub depth: u32,
    pub is_editable: bool,
}

/// Validation result
#[derive(Debug, Clone, Serialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub error_message: Option<String>,
    pub error_line: Option<u32>,
    pub error_column: Option<u32>,
}

/// Rust-side global state
pub struct JsonEditorState {
    pub root: Option<JsonNode>,
    pub file_path: Option<String>,
    pub collapsed_nodes: HashSet<String>,
}

impl Default for JsonEditorState {
    fn default() -> Self {
        Self {
            root: None,
            file_path: None,
            collapsed_nodes: HashSet::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/// Generate indent string ("  " * depth)
fn indent(depth: u32) -> String {
    "  ".repeat(depth as usize)
}

/// Format the key part of a line.
///
/// - If key is `Some`, produces `indent + "key": ` (with surrounding quotes).
/// - If key is `None` (array element), produces just the indent.
#[allow(dead_code)]
fn format_key_line(key: &Option<String>, depth: u32) -> String {
    match key {
        Some(k) => format!("{}\"{}\": ", indent(depth), k),
        None => indent(depth),
    }
}

// ---------------------------------------------------------------------------
// Tree Construction: serde_json::Value -> JsonNode
// ---------------------------------------------------------------------------

/// Recursively convert a `serde_json::Value` into a `JsonNode` tree.
pub fn value_to_node(
    value: &serde_json::Value,
    key: Option<String>,
    depth: u32,
    path: &str,
) -> JsonNode {
    match value {
        serde_json::Value::Object(map) => {
            let mut children = Vec::new();
            for (k, v) in map {
                let child_path = if path.is_empty() {
                    k.clone()
                } else {
                    format!("{}.{}", path, k)
                };
                children.push(value_to_node(v, Some(k.clone()), depth + 1, &child_path));
            }
            JsonNode {
                key,
                value_type: "object".to_string(),
                value: None,
                children,
                depth,
                path: path.to_string(),
            }
        }
        serde_json::Value::Array(arr) => {
            let mut children = Vec::new();
            for (i, v) in arr.iter().enumerate() {
                let child_path = format!("{}.{}", path, i);
                children.push(value_to_node(v, None, depth + 1, &child_path));
            }
            JsonNode {
                key,
                value_type: "array".to_string(),
                value: None,
                children,
                depth,
                path: path.to_string(),
            }
        }
        serde_json::Value::String(s) => JsonNode {
            key,
            value_type: "string".to_string(),
            value: Some(format!("\"{}\"", s)),
            children: Vec::new(),
            depth,
            path: path.to_string(),
        },
        serde_json::Value::Number(n) => JsonNode {
            key,
            value_type: "number".to_string(),
            value: Some(n.to_string()),
            children: Vec::new(),
            depth,
            path: path.to_string(),
        },
        serde_json::Value::Bool(b) => JsonNode {
            key,
            value_type: "boolean".to_string(),
            value: Some(b.to_string()),
            children: Vec::new(),
            depth,
            path: path.to_string(),
        },
        serde_json::Value::Null => JsonNode {
            key,
            value_type: "null".to_string(),
            value: Some("null".to_string()),
            children: Vec::new(),
            depth,
            path: path.to_string(),
        },
    }
}

// ---------------------------------------------------------------------------
// Visible Line Generation
// ---------------------------------------------------------------------------

/// Recursive helper that appends `VisibleLine` entries to `lines` for a given node.
///
/// * `line_num` is the next available 1-based line number (passed by mutable reference).
/// * `collapsed` is the set of node paths that are currently collapsed.
fn generate_visible_lines(
    node: &JsonNode,
    collapsed: &HashSet<String>,
    lines: &mut Vec<VisibleLine>,
    line_num: &mut u32,
) {
    let is_collapsed = collapsed.contains(&node.path);

    match node.value_type.as_str() {
        "object" => {
            let count = node.children.len();
            if is_collapsed {
                // Collapsed object: single line like `"key": { ... } // N items`
                let content = match &node.key {
                    Some(k) => format!("{}\"{}\": {{ ... }} // {} item", indent(node.depth), k, count),
                    None => format!("{}{{ ... }} // {} item", indent(node.depth), count),
                };
                lines.push(VisibleLine {
                    line_number: *line_num,
                    content,
                    node_path: node.path.clone(),
                    is_collapsible: true,
                    collapsed: true,
                    depth: node.depth,
                    is_editable: false,
                });
                *line_num += 1;
            } else {
                // Opening line: `"key": {` or just `{`
                let open_content = match &node.key {
                    Some(k) => format!("{}\"{}\": {{", indent(node.depth), k),
                    None => format!("{}{{", indent(node.depth)),
                };
                lines.push(VisibleLine {
                    line_number: *line_num,
                    content: open_content,
                    node_path: node.path.clone(),
                    is_collapsible: true,
                    collapsed: false,
                    depth: node.depth,
                    is_editable: false,
                });
                *line_num += 1;

                // Children
                for child in &node.children {
                    generate_visible_lines(child, collapsed, lines, line_num);
                }

                // Closing line: `}`
                lines.push(VisibleLine {
                    line_number: *line_num,
                    content: format!("{}}}", indent(node.depth)),
                    node_path: node.path.clone(),
                    is_collapsible: false,
                    collapsed: false,
                    depth: node.depth,
                    is_editable: false,
                });
                *line_num += 1;
            }
        }
        "array" => {
            let count = node.children.len();
            if is_collapsed {
                let content = match &node.key {
                    Some(k) => format!("{}\"{}\": [ ... ] // {} item", indent(node.depth), k, count),
                    None => format!("{}[ ... ] // {} item", indent(node.depth), count),
                };
                lines.push(VisibleLine {
                    line_number: *line_num,
                    content,
                    node_path: node.path.clone(),
                    is_collapsible: true,
                    collapsed: true,
                    depth: node.depth,
                    is_editable: false,
                });
                *line_num += 1;
            } else {
                let open_content = match &node.key {
                    Some(k) => format!("{}\"{}\": [", indent(node.depth), k),
                    None => format!("{}[", indent(node.depth)),
                };
                lines.push(VisibleLine {
                    line_number: *line_num,
                    content: open_content,
                    node_path: node.path.clone(),
                    is_collapsible: true,
                    collapsed: false,
                    depth: node.depth,
                    is_editable: false,
                });
                *line_num += 1;

                for child in &node.children {
                    generate_visible_lines(child, collapsed, lines, line_num);
                }

                lines.push(VisibleLine {
                    line_number: *line_num,
                    content: format!("{}]", indent(node.depth)),
                    node_path: node.path.clone(),
                    is_collapsible: false,
                    collapsed: false,
                    depth: node.depth,
                    is_editable: false,
                });
                *line_num += 1;
            }
        }
        // Leaf nodes
        _ => {
            let value_str = node.value.as_deref().unwrap_or("null");
            let content = match &node.key {
                Some(k) => format!("{}\"{}\": {}", indent(node.depth), k, value_str),
                None => format!("{}{}", indent(node.depth), value_str),
            };
            lines.push(VisibleLine {
                line_number: *line_num,
                content,
                node_path: node.path.clone(),
                is_collapsible: false,
                collapsed: false,
                depth: node.depth,
                is_editable: true,
            });
            *line_num += 1;
        }
    }
}

/// Public wrapper: build the full list of visible lines from the root node,
/// honouring the current collapse state.
pub fn build_visible_lines(root: &JsonNode, collapsed: &HashSet<String>) -> Vec<VisibleLine> {
    let mut lines = Vec::new();
    let mut line_num: u32 = 1;
    generate_visible_lines(root, collapsed, &mut lines, &mut line_num);
    lines
}

// ---------------------------------------------------------------------------
// Parse & Serialize
// ---------------------------------------------------------------------------

/// Parse a JSON string and return the root `JsonNode`.
pub fn parse_json(content: &str) -> Result<JsonNode, String> {
    let value: serde_json::Value =
        serde_json::from_str(content).map_err(|e| format!("JSON parse error: {}", e))?;
    Ok(value_to_node(&value, None, 0, "root"))
}

/// Convert a `JsonNode` tree back into a `serde_json::Value`.
pub fn node_to_value(node: &JsonNode) -> serde_json::Value {
    match node.value_type.as_str() {
        "object" => {
            let mut map = serde_json::Map::new();
            for child in &node.children {
                let key = child.key.clone().unwrap_or_default();
                map.insert(key, node_to_value(child));
            }
            serde_json::Value::Object(map)
        }
        "array" => {
            let arr: Vec<serde_json::Value> =
                node.children.iter().map(node_to_value).collect();
            serde_json::Value::Array(arr)
        }
        "string" => {
            // value is stored with surrounding quotes, e.g. `"hello"`
            let raw = node.value.as_deref().unwrap_or("\"\"");
            serde_json::from_str(raw).unwrap_or(serde_json::Value::Null)
        }
        "number" => {
            let raw = node.value.as_deref().unwrap_or("0");
            serde_json::from_str(raw).unwrap_or(serde_json::Value::Null)
        }
        "boolean" => {
            let raw = node.value.as_deref().unwrap_or("false");
            serde_json::from_str(raw).unwrap_or(serde_json::Value::Bool(false))
        }
        "null" => serde_json::Value::Null,
        _ => serde_json::Value::Null,
    }
}

// ---------------------------------------------------------------------------
// Update Node by Path
// ---------------------------------------------------------------------------

/// Update a node's value by its path string.
///
/// The path is dot-separated, e.g. `"root.dependencies.0"`.
/// `new_value` is a JSON value string such as `"hello"`, `42`, `true`, `null`, `{"a":1}`.
pub fn update_node_by_path(
    node: &mut JsonNode,
    path: &str,
    new_value: &str,
) -> Result<(), String> {
    // Strip the "root" prefix if present
    let path = path.strip_prefix("root.").unwrap_or(path);
    let path = if path == "root" { "" } else { path };

    if path.is_empty() {
        // Replace the entire root with the new value
        let parsed: serde_json::Value =
            serde_json::from_str(new_value).map_err(|e| format!("Invalid JSON value: {}", e))?;
        *node = value_to_node(&parsed, None, 0, "root");
        return Ok(());
    }

    update_node_by_path_inner(node, path, new_value)
}

/// Inner recursive helper that walks dot-separated path segments.
fn update_node_by_path_inner(
    node: &mut JsonNode,
    remaining_path: &str,
    new_value: &str,
) -> Result<(), String> {
    // Split off the first segment
    let (segment, rest) = match remaining_path.find('.') {
        Some(idx) => (&remaining_path[..idx], &remaining_path[idx + 1..]),
        None => (remaining_path, ""),
    };

    if rest.is_empty() {
        // This is the final segment — update the matching child
        let is_index = segment.chars().all(|c| c.is_ascii_digit());

        for child in &mut node.children {
            if is_index {
                // Array element: match by key being None and path ending with the index
                if child.path.ends_with(&format!(".{}", segment)) {
                    return apply_value_update(child, new_value);
                }
            } else if child.key.as_deref() == Some(segment) {
                return apply_value_update(child, new_value);
            }
        }

        Err(format!("Node not found for path segment '{}'", segment))
    } else {
        // Recurse into the matching child
        let is_index = segment.chars().all(|c| c.is_ascii_digit());

        for child in &mut node.children {
            let matches = if is_index {
                child.path.ends_with(&format!(".{}", segment))
            } else {
                child.key.as_deref() == Some(segment)
            };

            if matches {
                return update_node_by_path_inner(child, rest, new_value);
            }
        }

        Err(format!("Node not found for path segment '{}'", segment))
    }
}

/// Apply a value update to a leaf or container node.
fn apply_value_update(node: &mut JsonNode, new_value: &str) -> Result<(), String> {
    let parsed: serde_json::Value =
        serde_json::from_str(new_value).map_err(|e| format!("Invalid JSON value: {}", e))?;

    // Preserve the existing key and path
    let key = node.key.clone();
    let path = node.path.clone();
    let depth = node.depth;

    *node = value_to_node(&parsed, key, depth, &path);
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_object() {
        let json = r#"{"name": "test", "version": "1.0.0"}"#;
        let root = parse_json(json).unwrap();
        assert_eq!(root.value_type, "object");
        assert_eq!(root.children.len(), 2);
        assert_eq!(root.children[0].key.as_deref(), Some("name"));
        assert_eq!(root.children[0].value, Some("\"test\"".to_string()));
    }

    #[test]
    fn test_parse_nested() {
        let json = r#"{"a": {"b": 1}}"#;
        let root = parse_json(json).unwrap();
        assert_eq!(root.children[0].value_type, "object");
        assert_eq!(root.children[0].children[0].value, Some("1".to_string()));
    }

    #[test]
    fn test_parse_array() {
        let json = r#"{"items": [1, 2, 3]}"#;
        let root = parse_json(json).unwrap();
        let items = &root.children[0];
        assert_eq!(items.value_type, "array");
        assert_eq!(items.children.len(), 3);
    }

    #[test]
    fn test_build_visible_lines_expanded() {
        let json = r#"{"name": "test"}"#;
        let root = parse_json(json).unwrap();
        let lines = build_visible_lines(&root, &HashSet::new());
        // Should produce: {  "name": test  }
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0].content, "{");
        assert!(lines[1].content.contains("name"));
        assert!(lines[1].is_editable);
        assert_eq!(lines[2].content, "}");
    }

    #[test]
    fn test_build_visible_lines_collapsed() {
        let json = r#"{"obj": {"a": 1}}"#;
        let root = parse_json(json).unwrap();
        let mut collapsed = HashSet::new();
        collapsed.insert("root.obj".to_string());
        let lines = build_visible_lines(&root, &collapsed);
        // Should produce: {  "obj": { ... } // 1 item  }
        assert_eq!(lines.len(), 3); // outer {, collapsed obj line, outer }
        assert!(lines[1].collapsed);
        assert!(lines[1].content.contains("{ ... }"));
    }

    #[test]
    fn test_node_to_value_roundtrip() {
        let json = r#"{"name": "test", "count": 42, "active": true, "nothing": null}"#;
        let root = parse_json(json).unwrap();
        let value = node_to_value(&root);
        let output = serde_json::to_string(&value).unwrap();
        let original: serde_json::Value = serde_json::from_str(json).unwrap();
        let roundtripped: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert_eq!(original, roundtripped);
    }

    #[test]
    fn test_update_leaf_value() {
        let json = r#"{"name": "old"}"#;
        let mut root = parse_json(json).unwrap();
        update_node_by_path(&mut root, "root.name", "\"new\"").unwrap();
        let value = node_to_value(&root);
        assert_eq!(value["name"], serde_json::Value::String("new".to_string()));
    }

    #[test]
    fn test_update_number_value() {
        let json = r#"{"count": 1}"#;
        let mut root = parse_json(json).unwrap();
        update_node_by_path(&mut root, "root.count", "99").unwrap();
        let value = node_to_value(&root);
        assert_eq!(value["count"], serde_json::Value::Number(99.into()));
    }

    #[test]
    fn test_update_array_element() {
        let json = r#"{"items": [10, 20, 30]}"#;
        let mut root = parse_json(json).unwrap();
        update_node_by_path(&mut root, "root.items.1", "99").unwrap();
        let value = node_to_value(&root);
        assert_eq!(value["items"][1], serde_json::Value::Number(99.into()));
    }

    #[test]
    fn test_validate_valid_json() {
        let json = r#"{"valid": true}"#;
        let result = validate_json(json);
        assert!(result.valid);
    }

    #[test]
    fn test_validate_invalid_json() {
        let json = r#"{"broken": }"#;
        let result = validate_json(json);
        assert!(!result.valid);
        assert!(result.error_message.is_some());
    }
}

/// Validate a JSON string and return a structured result.
pub fn validate_json(content: &str) -> ValidationResult {
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(_) => ValidationResult {
            valid: true,
            error_message: None,
            error_line: None,
            error_column: None,
        },
        Err(e) => {
            let msg = e.to_string();
            // Try to extract line/column from serde_json error
            // serde_json errors have format like "key must be a string at line 1 column 5"
            let (line, column) = parse_error_position(&msg);
            ValidationResult {
                valid: false,
                error_message: Some(msg),
                error_line: line,
                error_column: column,
            }
        }
    }
}

/// Attempt to extract line and column numbers from a serde_json error message.
fn parse_error_position(msg: &str) -> (Option<u32>, Option<u32>) {
    // Typical format: "... at line X column Y"
    let mut line = None;
    let mut column = None;

    let parts: Vec<&str> = msg.split_whitespace().collect();
    for i in 0..parts.len() {
        if parts[i] == "line" && i + 1 < parts.len() {
            line = parts[i + 1].parse::<u32>().ok();
        }
        if parts[i] == "column" && i + 1 < parts.len() {
            column = parts[i + 1].parse::<u32>().ok();
        }
    }

    (line, column)
}
