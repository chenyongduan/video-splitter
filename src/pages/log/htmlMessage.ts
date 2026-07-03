const ALLOWED_HTML_TAGS = new Set([
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "caption",
]);

const BLOCKED_CONTENT_TAGS = ["script", "style", "iframe", "object", "embed", "svg", "math"];

export function sanitizeAssistantHtml(html: string) {
  let sanitized = html;
  for (const tag of BLOCKED_CONTENT_TAGS) {
    sanitized = sanitized.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
  }

  return sanitized.replace(/<\/?([a-zA-Z][\w:-]*)(\s[^>]*)?>/g, (match, rawTagName: string) => {
    const tagName = rawTagName.toLowerCase();
    if (!ALLOWED_HTML_TAGS.has(tagName)) return "";
    if (tagName === "br") return "<br>";
    return match.startsWith("</") ? `</${tagName}>` : `<${tagName}>`;
  });
}
