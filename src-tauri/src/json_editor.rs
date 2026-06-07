use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::State;
use std::fs;

// ---------------------------------------------------------------------------
// Value type constants (compact u8, replaces heap-allocated String)
// ---------------------------------------------------------------------------

const VT_OBJECT: u8 = 0;
const VT_ARRAY: u8 = 1;
const VT_STRING: u8 = 2;
const VT_NUMBER: u8 = 3;
const VT_BOOLEAN: u8 = 4;
const VT_NULL: u8 = 5;

// Flag bits for FlatNode.flags
const FLAG_HAS_EMBEDDED_JSON: u8 = 0x01;

// ---------------------------------------------------------------------------
// Data Structures
// ---------------------------------------------------------------------------

/// A single node in the flat index. Fixed 28 bytes (vs ~200+ for old JsonNode).
/// Children of each container are contiguous in the nodes[] array.
#[derive(Clone, Debug)]
pub struct FlatNode {
    pub parent: u32,             // index in nodes[] (root points to self)
    pub key_index: u32,          // index into key_table, or array index, or u32::MAX for root
    pub first_child: u32,        // index of first child, u32::MAX = no children
    pub child_count: u32,        // number of children (0 for leaves)
    pub depth: u16,              // nesting depth (0 = root)
    pub value_type: u8,          // VT_OBJECT, VT_ARRAY, etc.
    pub flags: u8,               // FLAG_HAS_EMBEDDED_JSON, etc.
    pub expanded_line_count: u32, // lines when fully expanded
}

/// Deduplicated string storage for object keys.
pub struct StringTable {
    pub strings: Vec<String>,
    map: HashMap<String, u32>,
}

impl StringTable {
    pub fn new() -> Self {
        Self {
            strings: Vec::new(),
            map: HashMap::new(),
        }
    }

    /// Insert a string, returning its index. Deduplicates.
    pub fn intern(&mut self, s: &str) -> u32 {
        if let Some(&idx) = self.map.get(s) {
            return idx;
        }
        let idx = self.strings.len() as u32;
        self.strings.push(s.to_string());
        self.map.insert(s.to_string(), idx);
        idx
    }

    pub fn get(&self, idx: u32) -> &str {
        &self.strings[idx as usize]
    }
}

/// Acceleration structure for fast line seeking.
const SKIP_BLOCK_SIZE: u32 = 256;

pub struct SkipIndex {
    /// (node_index, cumulative_visible_lines_at_that_node)
    pub checkpoints: Vec<(u32, u32)>,
}

impl SkipIndex {
    pub fn new() -> Self {
        Self { checkpoints: Vec::new() }
    }

    /// Build checkpoints via DFS walk, recording every SKIP_BLOCK_SIZE nodes.
    pub fn build(nodes: &[FlatNode], root_idx: u32, collapsed: &HashSet<u32>) -> Self {
        let mut checkpoints = Vec::new();
        let mut node_count: u32 = 0;
        let mut line_count: u32 = 0;
        let mut next_checkpoint: u32 = 0;

        let mut stack: Vec<(u32, u8)> = vec![(root_idx, 0)];

        while let Some((idx, phase)) = stack.pop() {
            let node = &nodes[idx as usize];
            let is_container = node.value_type == VT_OBJECT || node.value_type == VT_ARRAY;
            let is_collapsed = collapsed.contains(&idx);

            if phase == 0 {
                if node_count == next_checkpoint {
                    checkpoints.push((idx, line_count));
                    next_checkpoint += SKIP_BLOCK_SIZE;
                }
                node_count += 1;
                if !is_container {
                    line_count += node.expanded_line_count;
                } else {
                    line_count += 1;
                }

                if is_collapsed || !is_container {
                    continue;
                }

                stack.push((idx, 1));
                if node.child_count > 0 {
                    for i in (0..node.child_count).rev() {
                        stack.push((node.first_child + i, 0));
                    }
                }
            } else {
                line_count += 1;
            }
        }

        checkpoints.push((u32::MAX, line_count));
        Self { checkpoints }
    }

    /// Find the nearest checkpoint at or before the target line.
    pub fn seek(&self, target_line: u32) -> (u32, u32) {
        let idx = self.checkpoints.partition_point(|&(_, lines)| lines <= target_line);
        if idx == 0 {
            (0, 0)
        } else {
            self.checkpoints[idx - 1]
        }
    }
}

/// Single line data sent to frontend for rendering.
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

/// Validation result.
#[derive(Debug, Clone, Serialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub error_message: Option<String>,
    pub error_line: Option<u32>,
    pub error_column: Option<u32>,
}

/// The editor state.
pub struct JsonEditorState {
    pub value: Option<serde_json::Value>,
    pub nodes: Vec<FlatNode>,
    pub key_table: StringTable,
    pub collapsed_nodes: HashSet<u32>,
    pub skip_index: SkipIndex,
    pub total_visible_lines: u32,
    pub expand_json_strings: bool,
    pub file_path: Option<String>,
}

impl Default for JsonEditorState {
    fn default() -> Self {
        Self {
            value: None,
            nodes: Vec::new(),
            key_table: StringTable::new(),
            collapsed_nodes: HashSet::new(),
            skip_index: SkipIndex::new(),
            total_visible_lines: 0,
            expand_json_strings: true,
            file_path: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

fn indent_str(depth: u16) -> String {
    "  ".repeat(depth as usize)
}

/// Format a leaf serde_json::Value as a display string.
fn format_value(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => format!("\"{}\"", s),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Null => "null".to_string(),
        _ => unreachable!(),
    }
}

/// Format the key prefix for a node: `"key":` or empty string (for array elements/root).
fn format_key_prefix(node: &FlatNode, nodes: &[FlatNode], key_table: &StringTable) -> String {
    if node.depth == 0 || node.key_index == u32::MAX {
        return String::new();
    }
    let parent = &nodes[node.parent as usize];
    if parent.value_type == VT_OBJECT {
        let key = key_table.get(node.key_index);
        format!("\"{}\": ", key)
    } else {
        String::new()
    }
}

// ---------------------------------------------------------------------------
// Flat Index Construction
// ---------------------------------------------------------------------------

/// Get the value type constant for a serde_json::Value.
fn value_type_of(v: &serde_json::Value) -> u8 {
    match v {
        serde_json::Value::Object(_) => VT_OBJECT,
        serde_json::Value::Array(_) => VT_ARRAY,
        serde_json::Value::String(_) => VT_STRING,
        serde_json::Value::Number(_) => VT_NUMBER,
        serde_json::Value::Bool(_) => VT_BOOLEAN,
        serde_json::Value::Null => VT_NULL,
    }
}

/// Compute flags for a value (checks for embedded JSON strings).
fn compute_flags(v: &serde_json::Value, vt: u8) -> u8 {
    let mut flags: u8 = 0;
    if vt == VT_STRING {
        if let Some(s) = v.as_str() {
            if (s.starts_with('{') || s.starts_with('[')) && s.len() >= 2 {
                if serde_json::from_str::<serde_json::Value>(s).is_ok() {
                    flags |= FLAG_HAS_EMBEDDED_JSON;
                }
            }
        }
    }
    flags
}

/// Build the flat node index from a serde_json::Value.
/// Uses a two-phase approach to ensure direct children of each container
/// are contiguous in the nodes[] array (required for `first_child + rank` access).
pub fn build_flat_index(value: &serde_json::Value, key_table: &mut StringTable) -> Vec<FlatNode> {
    let mut nodes = Vec::new();
    // Phase 1: Create root node header
    create_node_header(value, u32::MAX, 0, 0, &mut nodes, key_table);
    if !nodes.is_empty() {
        nodes[0].parent = 0;
    }
    // Phase 2: Recursively create children and descendants
    expand_children(value, 0, &mut nodes, key_table);
    compute_line_counts(&mut nodes);
    nodes
}

/// Create a single FlatNode header (no children yet).
fn create_node_header(
    value: &serde_json::Value,
    key_index: u32,
    depth: u16,
    parent_idx: u32,
    nodes: &mut Vec<FlatNode>,
    _key_table: &mut StringTable,
) -> u32 {
    let my_index = nodes.len() as u32;
    let vt = value_type_of(value);
    let flags = compute_flags(value, vt);

    nodes.push(FlatNode {
        parent: parent_idx,
        key_index,
        first_child: u32::MAX,
        child_count: 0,
        depth,
        value_type: vt,
        flags,
        expanded_line_count: 0,
    });

    my_index
}

/// Expand the children of a node: first create ALL direct child headers
/// (ensuring contiguity), then recurse into each child to expand its descendants.
fn expand_children(
    value: &serde_json::Value,
    node_idx: u32,
    nodes: &mut Vec<FlatNode>,
    key_table: &mut StringTable,
) {
    let depth = nodes[node_idx as usize].depth;

    match value {
        serde_json::Value::Object(map) => {
            if map.is_empty() {
                return;
            }
            let first_child = nodes.len() as u32;
            let child_count = map.len() as u32;
            nodes[node_idx as usize].first_child = first_child;
            nodes[node_idx as usize].child_count = child_count;

            // Phase A: Create ALL direct child headers first (contiguous!)
            for (k, v) in map.iter() {
                let ki = key_table.intern(k);
                create_node_header(v, ki, depth + 1, node_idx, nodes, key_table);
            }

            // Phase B: Recurse into each child to fill in its descendants
            for (i, (_, v)) in map.iter().enumerate() {
                expand_children(v, first_child + i as u32, nodes, key_table);
            }
        }
        serde_json::Value::Array(arr) => {
            if arr.is_empty() {
                return;
            }
            let first_child = nodes.len() as u32;
            let child_count = arr.len() as u32;
            nodes[node_idx as usize].first_child = first_child;
            nodes[node_idx as usize].child_count = child_count;

            // Phase A: Create ALL direct child headers first (contiguous!)
            for (i, v) in arr.iter().enumerate() {
                create_node_header(v, i as u32, depth + 1, node_idx, nodes, key_table);
            }

            // Phase B: Recurse into each child to fill in its descendants
            for (i, v) in arr.iter().enumerate() {
                expand_children(v, first_child + i as u32, nodes, key_table);
            }
        }
        _ => {}
    }
}

/// Compute expanded_line_count bottom-up (children before parents).
fn compute_line_counts(nodes: &mut [FlatNode]) {
    for i in (0..nodes.len()).rev() {
        let node = &nodes[i];
        if node.first_child == u32::MAX {
            nodes[i].expanded_line_count = 1;
        } else {
            let mut total: u32 = 2; // open + close
            for j in 0..node.child_count {
                total += nodes[(node.first_child + j) as usize].expanded_line_count;
            }
            nodes[i].expanded_line_count = total;
        }
    }
}

/// Recompute line counts accounting for embedded JSON string expansion.
fn recompute_line_counts(nodes: &mut [FlatNode], value: &serde_json::Value, expand: bool) {
    compute_line_counts(nodes);

    if !expand {
        return;
    }

    // For string nodes with embedded JSON, count their expanded lines
    for i in 0..nodes.len() {
        if nodes[i].flags & FLAG_HAS_EMBEDDED_JSON != 0 {
            if let Some(v) = navigate_to_value(nodes, i as u32, value) {
                if let Some(s) = v.as_str() {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(s) {
                        nodes[i].expanded_line_count = count_value_lines(&parsed);
                    }
                }
            }
        }
    }

    // Recompute parent line counts bottom-up
    for i in (0..nodes.len()).rev() {
        let fc = nodes[i].first_child;
        if fc != u32::MAX {
            let mut total: u32 = 2;
            for j in 0..nodes[i].child_count {
                total += nodes[(fc + j) as usize].expanded_line_count;
            }
            nodes[i].expanded_line_count = total;
        }
    }
}

/// Count lines needed to display a serde_json::Value (pretty-print style).
fn count_value_lines(value: &serde_json::Value) -> u32 {
    match value {
        serde_json::Value::Object(map) => {
            let mut total: u32 = 2;
            for v in map.values() {
                total += count_value_lines(v);
            }
            total
        }
        serde_json::Value::Array(arr) => {
            let mut total: u32 = 2;
            for v in arr {
                total += count_value_lines(v);
            }
            total
        }
        _ => 1,
    }
}

// ---------------------------------------------------------------------------
// Navigation: FlatNode ↔ serde_json::Value
// ---------------------------------------------------------------------------

/// Navigate from a FlatNode index to the corresponding &serde_json::Value.
pub fn navigate_to_value<'a>(
    nodes: &[FlatNode],
    node_idx: u32,
    root_value: &'a serde_json::Value,
) -> Option<&'a serde_json::Value> {
    let mut ranks = Vec::new();
    let mut idx = node_idx;
    loop {
        let node = &nodes[idx as usize];
        if node.parent == idx { break; }
        let parent = &nodes[node.parent as usize];
        let rank = idx - parent.first_child;
        ranks.push((parent.value_type, rank));
        idx = node.parent;
    }
    ranks.reverse();

    let mut current = root_value;
    for (parent_vt, rank) in &ranks {
        match *parent_vt {
            VT_OBJECT => {
                let map = current.as_object()?;
                current = map.iter().nth(*rank as usize)?.1;
            }
            VT_ARRAY => {
                let arr = current.as_array()?;
                current = arr.get(*rank as usize)?;
            }
            _ => return None,
        }
    }
    Some(current)
}

/// Navigate mutably.
pub fn navigate_to_value_mut<'a>(
    nodes: &[FlatNode],
    node_idx: u32,
    root_value: &'a mut serde_json::Value,
) -> Option<&'a mut serde_json::Value> {
    let mut ranks = Vec::new();
    let mut idx = node_idx;
    loop {
        let node = &nodes[idx as usize];
        if node.parent == idx { break; }
        let parent = &nodes[node.parent as usize];
        let rank = idx - parent.first_child;
        ranks.push((parent.value_type, rank));
        idx = node.parent;
    }
    ranks.reverse();

    let mut current: &mut serde_json::Value = root_value;
    for (parent_vt, rank) in &ranks {
        match *parent_vt {
            VT_OBJECT => {
                let map = current.as_object_mut()?;
                current = map.iter_mut().nth(*rank as usize)?.1;
            }
            VT_ARRAY => {
                let arr = current.as_array_mut()?;
                current = arr.get_mut(*rank as usize)?;
            }
            _ => return None,
        }
    }
    Some(current)
}

/// Find a FlatNode index by parsing a path string like "$0.name.items.2"
pub fn find_node_by_path(nodes: &[FlatNode], path: &str, key_table: &StringTable) -> Result<u32, String> {
    let path = path.strip_prefix('$').ok_or("Invalid path format")?;

    if path.is_empty() || path == "0" {
        return Ok(0);
    }

    let segments: Vec<&str> = path.split('.').collect();
    if segments.is_empty() {
        return Ok(0);
    }

    let mut current_idx: u32 = 0;

    for seg in segments.iter().skip(1) {
        let node = &nodes[current_idx as usize];
        if node.first_child == u32::MAX {
            return Err(format!("节点 {} 没有子节点", current_idx));
        }

        let is_index = seg.chars().all(|c| c.is_ascii_digit());

        let found = if is_index {
            let target: u32 = seg.parse().map_err(|_| "Invalid index")?;
            let mut result = None;
            for j in 0..node.child_count {
                let child_idx = node.first_child + j;
                if nodes[child_idx as usize].key_index == target {
                    result = Some(child_idx);
                    break;
                }
            }
            result
        } else {
            let mut result = None;
            for j in 0..node.child_count {
                let child_idx = node.first_child + j;
                let child_key = key_table.get(nodes[child_idx as usize].key_index);
                if child_key == *seg {
                    result = Some(child_idx);
                    break;
                }
            }
            result
        };

        match found {
            Some(idx) => current_idx = idx,
            None => return Err(format!("未找到路径段 '{}' 在节点 {}", seg, current_idx)),
        }
    }

    Ok(current_idx)
}

/// Build a path string for a FlatNode index, e.g. "$0.items.1"
pub fn build_path_string(node_idx: u32, nodes: &[FlatNode], key_table: &StringTable) -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut idx = node_idx;
    loop {
        let node = &nodes[idx as usize];
        if node.parent == idx { break; }
        let parent = &nodes[node.parent as usize];
        if parent.value_type == VT_OBJECT {
            parts.push(key_table.get(node.key_index).to_string());
        } else {
            parts.push(node.key_index.to_string());
        }
        idx = node.parent;
    }
    parts.reverse();
    // Prepend root "0"
    format!("$0.{}", parts.join("."))
}

// ---------------------------------------------------------------------------
// Total Visible Lines
// ---------------------------------------------------------------------------

pub fn compute_visible_total(nodes: &[FlatNode], root_idx: u32, collapsed: &HashSet<u32>) -> u32 {
    let mut total: u32 = 0;
    let mut stack: Vec<(u32, u8)> = vec![(root_idx, 0)];

    while let Some((idx, phase)) = stack.pop() {
        let node = &nodes[idx as usize];
        let is_container = node.value_type == VT_OBJECT || node.value_type == VT_ARRAY;
        let is_collapsed = collapsed.contains(&idx);

        if phase == 0 {
            if !is_container {
                total += node.expanded_line_count;
            } else {
                total += 1;
            }
            if is_collapsed || !is_container { continue; }
            stack.push((idx, 1));
            if node.child_count > 0 {
                for i in (0..node.child_count).rev() {
                    stack.push((node.first_child + i, 0));
                }
            }
        } else {
            total += 1;
        }
    }

    total
}

/// Debug version that logs iteration count
fn compute_visible_total_with_debug(nodes: &[FlatNode], root_idx: u32, collapsed: &HashSet<u32>) -> u32 {
    let mut total: u32 = 0;
    let mut visited: u32 = 0;
    let mut stack: Vec<(u32, u8)> = vec![(root_idx, 0)];

    while let Some((idx, phase)) = stack.pop() {
        visited += 1;
        let node = &nodes[idx as usize];
        let is_container = node.value_type == VT_OBJECT || node.value_type == VT_ARRAY;
        let is_collapsed = collapsed.contains(&idx);

        if phase == 0 {
            if !is_container {
                total += node.expanded_line_count;
            } else {
                total += 1;
            }
            if is_collapsed || !is_container { continue; }
            stack.push((idx, 1));
            if node.child_count > 0 {
                for i in (0..node.child_count).rev() {
                    stack.push((node.first_child + i, 0));
                }
            }
        } else {
            total += 1;
        }
    }

    eprintln!("[JSON] compute_visible_total: visited={} nodes, total={}, stack_remaining={}", visited, total, 0);
    total
}

// ---------------------------------------------------------------------------
// On-Demand Line Generation
// ---------------------------------------------------------------------------

/// Build the DFS stack context starting from a seek node, including
/// ancestor close braces and later siblings for complete traversal.
fn build_seek_stack(nodes: &[FlatNode], seek_node: u32) -> Vec<(u32, u8)> {
    if seek_node == 0 {
        return vec![(0u32, 0u8)];
    }

    // Collect DFS continuation entries per ancestor level.
    // Each level contains: parent's close brace + later siblings of the child we came from.
    let mut levels: Vec<Vec<(u32, u8)>> = Vec::new();
    let mut current = seek_node;

    loop {
        let node = &nodes[current as usize];
        if node.parent == current {
            break; // root
        }

        let parent = &nodes[node.parent as usize];
        let rank = current - parent.first_child;

        let mut level = Vec::new();
        // Parent's close brace (phase 1)
        level.push((node.parent, 1u8));
        // Later siblings in reverse order so the first sibling is popped first
        for i in (rank + 1..parent.child_count).rev() {
            level.push((parent.first_child + i, 0u8));
        }

        levels.push(level);
        current = node.parent;
    }

    // Reverse levels: outermost ancestor first (bottom of stack), innermost last (top)
    levels.reverse();

    let mut stack = Vec::new();
    for level in levels {
        stack.extend(level);
    }
    // Seek node itself on the very top
    stack.push((seek_node, 0u8));

    stack
}

pub fn get_visible_lines(
    nodes: &[FlatNode],
    key_table: &StringTable,
    collapsed: &HashSet<u32>,
    skip_index: &SkipIndex,
    total: u32,
    value: &serde_json::Value,
    expand_strings: bool,
    start_line: u32,
    count: u32,
) -> (u32, Vec<VisibleLine>) {
    let end_line = (start_line + count).min(total);

    if start_line >= total || count == 0 {
        return (total, Vec::new());
    }

    // Seek to nearest checkpoint
    let (seek_node, seek_line) = skip_index.seek(start_line);

    let mut lines = Vec::with_capacity((end_line - start_line) as usize);
    let mut line_cursor = seek_line;
    let mut stack = build_seek_stack(nodes, seek_node);

    while let Some((idx, phase)) = stack.pop() {
        if line_cursor >= end_line { break; }

        let node = &nodes[idx as usize];
        let is_container = node.value_type == VT_OBJECT || node.value_type == VT_ARRAY;
        let is_collapsed = collapsed.contains(&idx);

        if phase == 1 {
            // Close brace
            if line_cursor >= start_line && line_cursor < end_line {
                let indent = indent_str(node.depth);
                let bracket = if node.value_type == VT_OBJECT { "}" } else { "]" };
                lines.push(VisibleLine {
                    line_number: line_cursor + 1,
                    content: format!("{}{}", indent, bracket),
                    node_path: build_path_string(idx, nodes, key_table),
                    is_collapsible: false,
                    collapsed: false,
                    depth: node.depth as u32,
                    is_editable: false,
                });
            }
            line_cursor += 1;
            continue;
        }

        // Phase 0: Opening/leaf line
        let indent = indent_str(node.depth);
        let key_prefix = format_key_prefix(node, nodes, key_table);

        if is_container {
            if is_collapsed {
                let bracket = if node.value_type == VT_OBJECT { "{ ... }" } else { "[ ... ]" };
                let content = if key_prefix.is_empty() {
                    format!("{}{} // {} items", indent, bracket, node.child_count)
                } else {
                    format!("{}{}{} // {} items", indent, key_prefix, bracket, node.child_count)
                };

                if line_cursor >= start_line && line_cursor < end_line {
                    lines.push(VisibleLine {
                        line_number: line_cursor + 1,
                        content,
                        node_path: build_path_string(idx, nodes, key_table),
                        is_collapsible: true,
                        collapsed: true,
                        depth: node.depth as u32,
                        is_editable: false,
                    });
                }
                line_cursor += 1;
            } else {
                let bracket = if node.value_type == VT_OBJECT { "{" } else { "[" };
                let content = if key_prefix.is_empty() {
                    format!("{}{}", indent, bracket)
                } else {
                    format!("{}{}{}", indent, key_prefix, bracket)
                };

                if line_cursor >= start_line && line_cursor < end_line {
                    lines.push(VisibleLine {
                        line_number: line_cursor + 1,
                        content,
                        node_path: build_path_string(idx, nodes, key_table),
                        is_collapsible: true,
                        collapsed: false,
                        depth: node.depth as u32,
                        is_editable: false,
                    });
                }
                line_cursor += 1;

                stack.push((idx, 1));
                if node.child_count > 0 {
                    for i in (0..node.child_count).rev() {
                        stack.push((node.first_child + i, 0));
                    }
                }
            }
        } else {
            // Leaf node
            let expanded = if expand_strings && (node.flags & FLAG_HAS_EMBEDDED_JSON) != 0 {
                if let Some(v) = navigate_to_value(nodes, idx, value) {
                    if let Some(s) = v.as_str() {
                        serde_json::from_str::<serde_json::Value>(s).ok()
                    } else { None }
                } else { None }
            } else { None };

            if let Some(ref parsed) = expanded {
                line_cursor = render_embedded_json(
                    idx, line_cursor, start_line, end_line,
                    node, nodes, key_table, parsed, &mut lines,
                );
            } else {
                let value_ref = navigate_to_value(nodes, idx, value);
                let value_str = match value_ref {
                    Some(v) => format_value(v),
                    None => "null".to_string(),
                };
                let content = if key_prefix.is_empty() {
                    format!("{}{}", indent, value_str)
                } else {
                    format!("{}{}{}", indent, key_prefix, value_str)
                };

                if line_cursor >= start_line && line_cursor < end_line {
                    lines.push(VisibleLine {
                        line_number: line_cursor + 1,
                        content,
                        node_path: build_path_string(idx, nodes, key_table),
                        is_collapsible: false,
                        collapsed: false,
                        depth: node.depth as u32,
                        is_editable: true,
                    });
                }
                line_cursor += 1;
            }
        }
    }

    (total, lines)
}

/// Render embedded JSON string as expanded sub-tree lines.
fn render_embedded_json(
    node_idx: u32,
    mut line_cursor: u32,
    start_line: u32,
    end_line: u32,
    node: &FlatNode,
    nodes: &[FlatNode],
    key_table: &StringTable,
    parsed: &serde_json::Value,
    lines: &mut Vec<VisibleLine>,
) -> u32 {
    let path = build_path_string(node_idx, nodes, key_table);
    let key_prefix = format_key_prefix(node, nodes, key_table);

    render_embedded_recursive(
        parsed, node.depth, &key_prefix, &path,
        &mut line_cursor, start_line, end_line, lines,
    );
    line_cursor
}

fn render_embedded_recursive(
    value: &serde_json::Value,
    depth: u16,
    key_prefix: &str,
    path: &str,
    line_cursor: &mut u32,
    start_line: u32,
    end_line: u32,
    lines: &mut Vec<VisibleLine>,
) {
    let indent = indent_str(depth);

    match value {
        serde_json::Value::Object(map) => {
            let content = if key_prefix.is_empty() {
                format!("{}{{", indent)
            } else {
                format!("{}{} {{", indent, key_prefix)
            };
            if *line_cursor >= start_line && *line_cursor < end_line {
                lines.push(VisibleLine {
                    line_number: *line_cursor + 1,
                    content,
                    node_path: path.to_string(),
                    is_collapsible: false,
                    collapsed: false,
                    depth: depth as u32,
                    is_editable: false,
                });
            }
            *line_cursor += 1;

            for (k, v) in map.iter() {
                let kp = format!("\"{}\": ", k);
                render_embedded_recursive(v, depth + 1, &kp, path, line_cursor, start_line, end_line, lines);
            }

            if *line_cursor >= start_line && *line_cursor < end_line {
                lines.push(VisibleLine {
                    line_number: *line_cursor + 1,
                    content: format!("{}}}", indent),
                    node_path: path.to_string(),
                    is_collapsible: false,
                    collapsed: false,
                    depth: depth as u32,
                    is_editable: false,
                });
            }
            *line_cursor += 1;
        }
        serde_json::Value::Array(arr) => {
            let content = if key_prefix.is_empty() {
                format!("{}[", indent)
            } else {
                format!("{}{} [", indent, key_prefix)
            };
            if *line_cursor >= start_line && *line_cursor < end_line {
                lines.push(VisibleLine {
                    line_number: *line_cursor + 1,
                    content,
                    node_path: path.to_string(),
                    is_collapsible: false,
                    collapsed: false,
                    depth: depth as u32,
                    is_editable: false,
                });
            }
            *line_cursor += 1;

            for v in arr {
                render_embedded_recursive(v, depth + 1, "", path, line_cursor, start_line, end_line, lines);
            }

            if *line_cursor >= start_line && *line_cursor < end_line {
                lines.push(VisibleLine {
                    line_number: *line_cursor + 1,
                    content: format!("{}]", indent),
                    node_path: path.to_string(),
                    is_collapsible: false,
                    collapsed: false,
                    depth: depth as u32,
                    is_editable: false,
                });
            }
            *line_cursor += 1;
        }
        _ => {
            let value_str = format_value(value);
            let content = if key_prefix.is_empty() {
                format!("{}{}", indent, value_str)
            } else {
                format!("{}{}{}", indent, key_prefix, value_str)
            };
            if *line_cursor >= start_line && *line_cursor < end_line {
                lines.push(VisibleLine {
                    line_number: *line_cursor + 1,
                    content,
                    node_path: path.to_string(),
                    is_collapsible: false,
                    collapsed: false,
                    depth: depth as u32,
                    is_editable: false,
                });
            }
            *line_cursor += 1;
        }
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

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

fn parse_error_position(msg: &str) -> (Option<u32>, Option<u32>) {
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

// ---------------------------------------------------------------------------
// Helper: rebuild index after mutation
// ---------------------------------------------------------------------------

/// Rebuild the entire flat index from the current value.
fn rebuild_index(s: &mut JsonEditorState) {
    let value = s.value.as_ref().unwrap().clone();
    let mut key_table = StringTable::new();
    let mut nodes = build_flat_index(&value, &mut key_table);
    recompute_line_counts(&mut nodes, &value, s.expand_json_strings);
    s.nodes = nodes;
    s.key_table = key_table;
    s.collapsed_nodes.clear();
    s.total_visible_lines = compute_visible_total(&s.nodes, 0, &s.collapsed_nodes);
    s.skip_index = SkipIndex::build(&s.nodes, 0, &s.collapsed_nodes);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_flat_index_simple() {
        let json = r#"{"name": "test", "version": "1.0.0"}"#;
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);

        assert_eq!(nodes.len(), 3);
        assert_eq!(nodes[0].value_type, VT_OBJECT);
        assert_eq!(nodes[0].child_count, 2);
        assert_eq!(nodes[0].depth, 0);
    }

    #[test]
    fn test_build_flat_index_nested() {
        let json = r#"{"a": {"b": 1}}"#;
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);

        assert_eq!(nodes.len(), 3);
        assert_eq!(nodes[1].value_type, VT_OBJECT);
        assert_eq!(nodes[2].value_type, VT_NUMBER);
    }

    #[test]
    fn test_build_flat_index_array() {
        let json = r#"{"items": [1, 2, 3]}"#;
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);

        assert_eq!(nodes.len(), 5);
        assert_eq!(nodes[1].value_type, VT_ARRAY);
        assert_eq!(nodes[1].child_count, 3);
    }

    #[test]
    fn test_line_counts() {
        let json = r#"{"name": "test"}"#;
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);

        assert_eq!(nodes[0].expanded_line_count, 3);
        assert_eq!(nodes[1].expanded_line_count, 1);
    }

    #[test]
    fn test_line_counts_nested() {
        let json = r#"{"a": {"b": 1}}"#;
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);

        assert_eq!(nodes[0].expanded_line_count, 5);
    }

    #[test]
    fn test_navigate_to_value() {
        let json = r#"{"items": [10, 20, 30]}"#;
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);

        let v = navigate_to_value(&nodes, 3, &value).unwrap();
        assert_eq!(*v, serde_json::Value::Number(20.into()));
    }

    #[test]
    fn test_build_path_string() {
        let json = r#"{"items": [10, 20]}"#;
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);

        // Node layout: 0=root, 1=items(arr), 2=10, 3=20
        let path = build_path_string(3, &nodes, &key_table);
        // items is a key in root object, 1 is array index
        assert!(path.contains("items"), "path = {}", path);
    }

    #[test]
    fn test_find_node_by_path() {
        let json = r#"{"items": [10, 20]}"#;
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);

        // Node layout: 0=root, 1=items(arr), 2=10, 3=20
        let path = build_path_string(3, &nodes, &key_table);
        let found = find_node_by_path(&nodes, &path, &key_table).unwrap();
        assert_eq!(found, 3, "path = {}", path);
    }

    #[test]
    fn test_get_visible_lines_basic() {
        let json = r#"{"name": "test", "count": 42}"#;
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);
        let collapsed = HashSet::new();
        let skip = SkipIndex::build(&nodes, 0, &collapsed);
        let total = compute_visible_total(&nodes, 0, &collapsed);

        let (t, lines) = get_visible_lines(
            &nodes, &key_table, &collapsed, &skip, total, &value, false, 0, 10,
        );
        assert_eq!(t, 4);
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0].content, "{");
        assert_eq!(lines[3].content, "}");
    }

    #[test]
    fn test_collapse_reduces_lines() {
        let json = r#"{"obj": {"a": 1}}"#;
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);

        assert_eq!(nodes[0].expanded_line_count, 5);

        let mut collapsed = HashSet::new();
        collapsed.insert(1u32);
        let total = compute_visible_total(&nodes, 0, &collapsed);
        assert_eq!(total, 3);
    }

    #[test]
    fn test_skip_index_seek() {
        let json = r#"{"items": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}"#;
        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);
        let collapsed = HashSet::new();
        let skip = SkipIndex::build(&nodes, 0, &collapsed);

        let (node_idx, line_offset) = skip.seek(5);
        assert!(line_offset <= 5);
        assert!(node_idx < nodes.len() as u32);
    }

    #[test]
    fn test_validate_valid_json() {
        let result = validate_json(r#"{"valid": true}"#);
        assert!(result.valid);
    }

    #[test]
    fn test_validate_invalid_json() {
        let result = validate_json(r#"{"broken": }"#);
        assert!(!result.valid);
    }

    #[test]
    fn test_string_table_dedup() {
        let mut table = StringTable::new();
        let a = table.intern("name");
        let b = table.intern("value");
        let c = table.intern("name");
        assert_eq!(a, c);
        assert_ne!(a, b);
        assert_eq!(table.get(a), "name");
    }

    /// Verify that fetching lines with a non-zero start produces the same
    /// content as the matching slice of a full (start=0) fetch.
    #[test]
    fn test_seek_walk_consistency() {
        // Build a JSON with enough nodes to populate multiple checkpoints
        let mut json_str = String::from("{");
        for i in 0..50 {
            if i > 0 { json_str.push(','); }
            json_str.push_str(&format!(r#""key_{:02}": "value_{:02}""#, i, i));
        }
        json_str.push('}');

        let value: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);
        let collapsed = HashSet::new();
        let skip = SkipIndex::build(&nodes, 0, &collapsed);
        let total = compute_visible_total(&nodes, 0, &collapsed);

        // Full fetch from line 0
        let (_, all_lines) = get_visible_lines(
            &nodes, &key_table, &collapsed, &skip, total, &value, false, 0, total,
        );

        // Fetch from various non-zero offsets
        for start in [1, 5, 20, 30] {
            let (_, partial) = get_visible_lines(
                &nodes, &key_table, &collapsed, &skip, total, &value, false, start, 10,
            );
            for (i, line) in partial.iter().enumerate() {
                let expected = &all_lines[(start as usize) + i];
                assert_eq!(
                    line.content, expected.content,
                    "Mismatch at start={}, i={}: got {:?}, expected {:?}",
                    start, i, line.content, expected.content
                );
            }
        }
    }

    /// Naive reference implementation: always walk from root, no seek optimization.
    /// Used to verify the seek-based implementation produces identical results.
    fn get_visible_lines_naive(
        nodes: &[FlatNode],
        key_table: &StringTable,
        collapsed: &HashSet<u32>,
        total: u32,
        value: &serde_json::Value,
        expand_strings: bool,
        start_line: u32,
        count: u32,
    ) -> (u32, Vec<VisibleLine>) {
        let end_line = (start_line + count).min(total);
        if start_line >= total || count == 0 {
            return (total, Vec::new());
        }

        let mut lines = Vec::new();
        let mut line_cursor: u32 = 0;
        let mut stack: Vec<(u32, u8)> = vec![(0u32, 0u8)];

        while let Some((idx, phase)) = stack.pop() {
            if line_cursor >= end_line { break; }

            let node = &nodes[idx as usize];
            let is_container = node.value_type == VT_OBJECT || node.value_type == VT_ARRAY;
            let is_collapsed = collapsed.contains(&idx);

            if phase == 1 {
                if line_cursor >= start_line && line_cursor < end_line {
                    let indent = indent_str(node.depth);
                    let bracket = if node.value_type == VT_OBJECT { "}" } else { "]" };
                    lines.push(VisibleLine {
                        line_number: line_cursor + 1,
                        content: format!("{}{}", indent, bracket),
                        node_path: build_path_string(idx, nodes, key_table),
                        is_collapsible: false,
                        collapsed: false,
                        depth: node.depth as u32,
                        is_editable: false,
                    });
                }
                line_cursor += 1;
                continue;
            }

            let indent = indent_str(node.depth);
            let key_prefix = format_key_prefix(node, nodes, key_table);

            if is_container {
                if is_collapsed {
                    let bracket = if node.value_type == VT_OBJECT { "{ ... }" } else { "[ ... ]" };
                    let content = if key_prefix.is_empty() {
                        format!("{}{} // {} items", indent, bracket, node.child_count)
                    } else {
                        format!("{}{}{} // {} items", indent, key_prefix, bracket, node.child_count)
                    };
                    if line_cursor >= start_line && line_cursor < end_line {
                        lines.push(VisibleLine {
                            line_number: line_cursor + 1,
                            content,
                            node_path: build_path_string(idx, nodes, key_table),
                            is_collapsible: true,
                            collapsed: true,
                            depth: node.depth as u32,
                            is_editable: false,
                        });
                    }
                    line_cursor += 1;
                } else {
                    let bracket = if node.value_type == VT_OBJECT { "{" } else { "[" };
                    let content = if key_prefix.is_empty() {
                        format!("{}{}", indent, bracket)
                    } else {
                        format!("{}{}{}", indent, key_prefix, bracket)
                    };
                    if line_cursor >= start_line && line_cursor < end_line {
                        lines.push(VisibleLine {
                            line_number: line_cursor + 1,
                            content,
                            node_path: build_path_string(idx, nodes, key_table),
                            is_collapsible: true,
                            collapsed: false,
                            depth: node.depth as u32,
                            is_editable: false,
                        });
                    }
                    line_cursor += 1;

                    stack.push((idx, 1));
                    if node.child_count > 0 {
                        for i in (0..node.child_count).rev() {
                            stack.push((node.first_child + i, 0));
                        }
                    }
                }
            } else {
                let expanded = if expand_strings && (node.flags & FLAG_HAS_EMBEDDED_JSON) != 0 {
                    if let Some(v) = navigate_to_value(nodes, idx, value) {
                        if let Some(s) = v.as_str() {
                            serde_json::from_str::<serde_json::Value>(s).ok()
                        } else { None }
                    } else { None }
                } else { None };

                if let Some(ref parsed) = expanded {
                    line_cursor = render_embedded_json(
                        idx, line_cursor, start_line, end_line,
                        node, nodes, key_table, parsed, &mut lines,
                    );
                } else {
                    let value_ref = navigate_to_value(nodes, idx, value);
                    let value_str = match value_ref {
                        Some(v) => format_value(v),
                        None => "null".to_string(),
                    };
                    let content = if key_prefix.is_empty() {
                        format!("{}{}", indent, value_str)
                    } else {
                        format!("{}{}{}", indent, key_prefix, value_str)
                    };
                    if line_cursor >= start_line && line_cursor < end_line {
                        lines.push(VisibleLine {
                            line_number: line_cursor + 1,
                            content,
                            node_path: build_path_string(idx, nodes, key_table),
                            is_collapsible: false,
                            collapsed: false,
                            depth: node.depth as u32,
                            is_editable: true,
                        });
                    }
                    line_cursor += 1;
                }
            }
        }

        (total, lines)
    }

    /// Test with realistic nested data (similar to user's actual JSON)
    #[test]
    fn test_realistic_nested_json() {
        let json = r#"{
            "roomData": {
                "appId": 28,
                "assistantTeachers": {},
                "beginAt": 1780482600,
                "businessEntityId": 53,
                "courseId": 608,
                "endAt": 1780491600,
                "files": {},
                "id": 60007108,
                "klassId": 100010016,
                "lessonId": 17122,
                "originEndAt": 1780489800,
                "qkidsFiles": [
                    {
                        "fileId": "ibDO7PfHlh2e",
                        "fileType": 2,
                        "filename": "KB4_Unit 1-1 Back to school.pdf",
                        "id": 4845,
                        "stage": 0,
                        "url": "/course/courseware/dc/46/test.pdf"
                    },
                    {
                        "fileId": "def456",
                        "fileType": 3,
                        "filename": "test2.pdf",
                        "id": 4846,
                        "stage": 1,
                        "url": "/test2.pdf"
                    }
                ]
            }
        }"#;

        let value: serde_json::Value = serde_json::from_str(json).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);
        let collapsed = HashSet::new();
        let skip = SkipIndex::build(&nodes, 0, &collapsed);
        let total = compute_visible_total(&nodes, 0, &collapsed);

        // Get all lines from naive implementation
        let (_, naive_all) = get_visible_lines_naive(
            &nodes, &key_table, &collapsed, total, &value, false, 0, total,
        );

        // Get all lines from seek-based implementation
        let (_, seek_all) = get_visible_lines(
            &nodes, &key_table, &collapsed, &skip, total, &value, false, 0, total,
        );

        // First verify naive produces correct structure
        assert!(naive_all[0].content.starts_with('{'), "First line should be {{, got: {:?}", naive_all[0].content);
        assert!(naive_all.last().unwrap().content.starts_with('}'), "Last line should be }}, got: {:?}", naive_all.last().unwrap().content);

        // Check no duplicate line numbers in naive output
        let mut seen_line_numbers = std::collections::HashSet::new();
        for line in &naive_all {
            assert!(seen_line_numbers.insert(line.line_number),
                "Duplicate line_number {} in naive output", line.line_number);
        }

        // Verify seek-based matches naive for ALL lines from start=0
        assert_eq!(naive_all.len(), seek_all.len(),
            "Line count mismatch: naive={}, seek={}", naive_all.len(), seek_all.len());
        for (i, (n, s)) in naive_all.iter().zip(seek_all.iter()).enumerate() {
            assert_eq!(n.content, s.content,
                "Content mismatch at line {}: naive={:?}, seek={:?}", i, n.content, s.content);
            assert_eq!(n.line_number, s.line_number,
                "Line number mismatch at index {}: naive={}, seek={}", i, n.line_number, s.line_number);
        }

        // Now test fetching from non-zero offsets with seek
        for start in [1, 5, 10, 15, 20, 25] {
            if start >= total { continue; }
            let count = 10u32.min(total - start);
            let (_, partial) = get_visible_lines(
                &nodes, &key_table, &collapsed, &skip, total, &value, false, start, count,
            );
            for (i, line) in partial.iter().enumerate() {
                let expected = &naive_all[(start as usize) + i];
                assert_eq!(line.content, expected.content,
                    "Seek mismatch at start={}, i={}: got {:?}, expected {:?}",
                    start, i, line.content, expected.content);
            }
        }

        // Print all lines for debugging
        eprintln!("\n=== Naive output ({} lines) ===", naive_all.len());
        for line in &naive_all {
            eprintln!("{:3} | {}", line.line_number, line.content);
        }
    }

    /// Test with a larger JSON to exercise skip index checkpoints
    #[test]
    fn test_large_json_seek_consistency() {
        let mut json_str = String::from(r#"{"roomData": {"items": ["#);
        for i in 0..300 {
            if i > 0 { json_str.push(','); }
            json_str.push_str(&format!(
                r#"{{"id": {}, "name": "item_{}", "tags": ["a", "b", "c"]}}"#,
                i, i
            ));
        }
        json_str.push_str(r#"], "status": "ok"}}"#);

        let value: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        let mut key_table = StringTable::new();
        let nodes = build_flat_index(&value, &mut key_table);
        let collapsed = HashSet::new();
        let skip = SkipIndex::build(&nodes, 0, &collapsed);
        let total = compute_visible_total(&nodes, 0, &collapsed);

        eprintln!("[test_large_json] total_nodes={}, total_lines={}", nodes.len(), total);

        // Full naive output
        let (_, naive_all) = get_visible_lines_naive(
            &nodes, &key_table, &collapsed, total, &value, false, 0, total,
        );

        // Check no duplicate line_numbers
        let mut seen = std::collections::HashSet::new();
        for line in &naive_all {
            assert!(seen.insert(line.line_number),
                "Duplicate line_number {} in naive output, content={:?}", line.line_number, line.content);
        }

        // Test seek-based fetches at various offsets
        for start in [0, 50, 100, 200, 500, 1000, 1500] {
            if start >= total { continue; }
            let count = 50u32.min(total - start);
            let (_, partial) = get_visible_lines(
                &nodes, &key_table, &collapsed, &skip, total, &value, false, start, count,
            );

            for (i, line) in partial.iter().enumerate() {
                let global_idx = (start as usize) + i;
                if global_idx >= naive_all.len() { break; }
                let expected = &naive_all[global_idx];
                assert_eq!(line.content, expected.content,
                    "Large JSON mismatch at start={}, i={}: got {:?}, expected {:?}",
                    start, i, line.content, expected.content);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn json_open_file(path: String, state: State<'_, Mutex<JsonEditorState>>) -> Result<(u32, Vec<VisibleLine>), String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    eprintln!("[JSON] file_size={} bytes", content.len());

    let value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("JSON 解析失败: {}", e))?;

    let mut key_table = StringTable::new();
    let mut nodes = build_flat_index(&value, &mut key_table);
    eprintln!("[JSON] node_count={}", nodes.len());

    // 诊断: 打印根节点信息
    let root = &nodes[0];
    eprintln!("[JSON] root: vt={}, first_child={}, child_count={}, expanded_lc={}",
        root.value_type, root.first_child, root.child_count, root.expanded_line_count);

    // 关键诊断: 检查孤儿节点（parent 不认 child）
    let mut orphan_count: usize = 0;
    let mut orphan_sample: Vec<String> = Vec::new();
    for i in 1..nodes.len() {
        let node = &nodes[i];
        let parent = &nodes[node.parent as usize];
        let in_range = (i as u32) >= parent.first_child
            && (i as u32) < parent.first_child + parent.child_count;
        if !in_range {
            orphan_count += 1;
            if orphan_sample.len() < 5 {
                orphan_sample.push(format!(
                    "  node[{}]: parent={}, parent.fc={}, parent.cc={}, node.vt={}",
                    i, node.parent, parent.first_child, parent.child_count, node.value_type
                ));
            }
        }
    }
    eprintln!("[JSON] ORPHAN_CHECK: {}/{} nodes are orphans", orphan_count, nodes.len());
    for s in &orphan_sample { eprintln!("{}", s); }

    // 关键诊断: 用 u64 重新计算 root 的 expanded_line_count 来检查 u32 溢出
    {
        let mut u64_counts: Vec<u64> = vec![0u64; nodes.len()];
        for i in (0..nodes.len()).rev() {
            let node = &nodes[i];
            if node.first_child == u32::MAX {
                u64_counts[i] = node.expanded_line_count as u64;
            } else {
                let mut total: u64 = 2;
                for j in 0..node.child_count {
                    total += u64_counts[(node.first_child + j) as usize];
                }
                u64_counts[i] = total;
            }
        }
        eprintln!("[JSON] U64_CHECK: root expanded_lc as u64 = {}, as u32 = {}",
            u64_counts[0], nodes[0].expanded_line_count);
    }

    let expand = true;
    recompute_line_counts(&mut nodes, &value, expand);

    // 诊断: 打印全部子节点
    let root = &nodes[0];
    eprintln!("[JSON] after recompute: root expanded_lc={}", root.expanded_line_count);
    for i in 0..root.child_count as usize {
        let c = &nodes[(root.first_child + i as u32) as usize];
        let key_name = if c.key_index != u32::MAX { key_table.get(c.key_index) } else { "-" };
        eprintln!("[JSON]   child[{}]: key=\"{}\", vt={}, first_child={}, child_count={}, expanded_lc={}",
            i, key_name, c.value_type, c.first_child, c.child_count, c.expanded_line_count);
    }

    // 统计含嵌入式JSON的叶子节点数
    let embedded_count = nodes.iter().filter(|n| n.flags & FLAG_HAS_EMBEDDED_JSON != 0).count();
    eprintln!("[JSON] embedded_json_nodes={}", embedded_count);

    let collapsed = HashSet::new();
    let total = compute_visible_total_with_debug(&nodes, 0, &collapsed);

    let skip = SkipIndex::build(&nodes, 0, &collapsed);

    // Generate first page on-demand
    let (total, first_page) = get_visible_lines(
        &nodes, &key_table, &collapsed, &skip, total, &value, expand, 0, 100,
    );

    let mut s = state.lock().map_err(|e| format!("状态锁错误: {}", e))?;
    s.value = Some(value);
    s.nodes = nodes;
    s.key_table = key_table;
    s.collapsed_nodes = collapsed;
    s.skip_index = skip;
    s.total_visible_lines = total;
    s.expand_json_strings = expand;
    s.file_path = Some(path);

    Ok((total, first_page))
}

#[tauri::command]
pub fn json_get_lines(start: u32, count: u32, state: State<'_, Mutex<JsonEditorState>>) -> Result<Vec<VisibleLine>, String> {
    let s = state.lock().map_err(|e| format!("状态锁错误: {}", e))?;
    let value = s.value.as_ref().ok_or("未加载 JSON 文件")?;
    let (_, lines) = get_visible_lines(
        &s.nodes, &s.key_table, &s.collapsed_nodes, &s.skip_index,
        s.total_visible_lines, value, s.expand_json_strings, start, count,
    );
    Ok(lines)
}

#[tauri::command]
pub fn json_toggle_collapse(node_path: String, state: State<'_, Mutex<JsonEditorState>>) -> Result<(u32, Vec<VisibleLine>), String> {
    let mut s = state.lock().map_err(|e| format!("状态锁错误: {}", e))?;

    let node_idx = find_node_by_path(&s.nodes, &node_path, &s.key_table)?;

    if s.collapsed_nodes.contains(&node_idx) {
        s.collapsed_nodes.remove(&node_idx);
    } else {
        s.collapsed_nodes.insert(node_idx);
    }

    s.total_visible_lines = compute_visible_total(&s.nodes, 0, &s.collapsed_nodes);
    s.skip_index = SkipIndex::build(&s.nodes, 0, &s.collapsed_nodes);

    let value = s.value.as_ref().ok_or("未加载 JSON 文件")?;
    let (total, first_page) = get_visible_lines(
        &s.nodes, &s.key_table, &s.collapsed_nodes, &s.skip_index,
        s.total_visible_lines, value, s.expand_json_strings, 0, 100,
    );
    Ok((total, first_page))
}

#[tauri::command]
pub fn json_update_node(node_path: String, new_value: String, state: State<'_, Mutex<JsonEditorState>>) -> Result<(u32, Vec<VisibleLine>), String> {
    let mut s = state.lock().map_err(|e| format!("状态锁错误: {}", e))?;

    let node_idx = find_node_by_path(&s.nodes, &node_path, &s.key_table)?;

    let parsed: serde_json::Value = serde_json::from_str(&new_value)
        .map_err(|e| format!("无效的 JSON 值: {}", e))?;

    // Mutate the value tree (clone nodes to avoid borrow conflict)
    let nodes_snapshot = s.nodes.clone();
    {
        let value = s.value.as_mut().ok_or("未加载 JSON 文件")?;
        let target = navigate_to_value_mut(&nodes_snapshot, node_idx, value)
            .ok_or("无法定位节点")?;
        *target = parsed;
    }

    // Rebuild index (simple but correct; optimize later if needed)
    rebuild_index(&mut s);

    let value = s.value.as_ref().ok_or("未加载 JSON 文件")?;
    let (total, first_page) = get_visible_lines(
        &s.nodes, &s.key_table, &s.collapsed_nodes, &s.skip_index,
        s.total_visible_lines, value, s.expand_json_strings, 0, 100,
    );
    Ok((total, first_page))
}

#[tauri::command]
pub fn json_toggle_expand_strings(state: State<'_, Mutex<JsonEditorState>>) -> Result<(u32, Vec<VisibleLine>), String> {
    let mut s = state.lock().map_err(|e| format!("状态锁错误: {}", e))?;
    s.expand_json_strings = !s.expand_json_strings;

    let expand = s.expand_json_strings;
    let value = s.value.clone().ok_or("未加载 JSON 文件")?;
    recompute_line_counts(&mut s.nodes, &value, expand);

    s.total_visible_lines = compute_visible_total(&s.nodes, 0, &s.collapsed_nodes);
    s.skip_index = SkipIndex::build(&s.nodes, 0, &s.collapsed_nodes);

    let (total, first_page) = get_visible_lines(
        &s.nodes, &s.key_table, &s.collapsed_nodes, &s.skip_index,
        s.total_visible_lines, &value, s.expand_json_strings, 0, 100,
    );
    Ok((total, first_page))
}

#[tauri::command]
pub fn json_format(content: String) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("JSON 解析失败: {}", e))?;
    serde_json::to_string_pretty(&value)
        .map_err(|e| format!("格式化失败: {}", e))
}

#[tauri::command]
pub fn json_minify(content: String) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("JSON 解析失败: {}", e))?;
    serde_json::to_string(&value)
        .map_err(|e| format!("压缩失败: {}", e))
}

#[tauri::command]
pub fn json_validate(content: String) -> Result<ValidationResult, String> {
    Ok(validate_json(&content))
}

#[tauri::command]
pub fn json_save(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content)
        .map_err(|e| format!("保存文件失败: {}", e))
}

#[tauri::command]
pub fn json_get_formatted_text(state: State<'_, Mutex<JsonEditorState>>) -> Result<String, String> {
    let s = state.lock().map_err(|e| format!("状态锁错误: {}", e))?;
    let value = s.value.as_ref().ok_or("未加载 JSON 文件")?;
    serde_json::to_string_pretty(value)
        .map_err(|e| format!("序列化失败: {}", e))
}
