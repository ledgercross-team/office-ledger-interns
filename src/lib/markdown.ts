import { marked } from "marked";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const purify = createDOMPurify(new JSDOM("").window as unknown as Window & typeof globalThis);
purify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer nofollow");
    node.setAttribute("target", "_blank");
  }
});

/** Markdown → sanitised HTML (server only). Never render user content with set:html without this. */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md ?? "", { async: false, gfm: true, breaks: true }) as string;
  return purify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "del", "code", "pre", "blockquote", "ul", "ol", "li", "a", "h3", "h4", "hr", "table", "thead", "tbody", "tr", "th", "td"],
    ALLOWED_ATTR: ["href", "title", "rel", "target"],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/)/i,
  });
}
