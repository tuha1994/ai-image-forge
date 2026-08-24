import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ReferenceImage } from "@/lib/studio/types";

type Props = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  references: ReferenceImage[];
  placeholder?: string;
  className?: string;
};

/**
 * Rich prompt input: tags typed with "@" become inline chips showing a
 * thumbnail of the referenced image (CapCut-style), while the serialized
 * value stays plain text with the original @tags.
 */
export const MentionTextarea = forwardRef<HTMLDivElement, Props>(function MentionTextarea(
  { id, value, onChange, references, placeholder, className },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => editorRef.current as HTMLDivElement);
  const refsRef = useRef(references);
  refsRef.current = references;
  const lastValue = useRef<string>("");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [empty, setEmpty] = useState(!value);

  const matches = open
    ? references.filter((r) =>
        `${r.tag} ${r.name}`.toLowerCase().includes(query.toLowerCase().replace(/^@/, "")),
      )
    : [];

  /* ---------- DOM <-> string ---------- */

  const makeChip = useCallback((r: ReferenceImage) => {
    const chip = document.createElement("span");
    chip.contentEditable = "false";
    chip.dataset["tag"] = r.tag;
    chip.title = r.name;
    chip.className =
      "mx-0.5 inline-flex max-w-52 select-none items-center gap-1.5 rounded-md border border-border bg-muted/70 py-0.5 pl-0.5 pr-1.5 align-middle text-xs font-medium";
    const img = document.createElement("img");
    img.src = r.previewUrl;
    img.alt = r.name;
    img.className = "size-5 shrink-0 rounded object-cover";
    const label = document.createElement("span");
    label.className = "truncate";
    label.textContent = r.tag.replace(/^@/, "");
    chip.append(img, label);
    return chip;
  }, []);

  const serialize = useCallback((root: HTMLElement) => {
    let out = "";
    root.childNodes.forEach(function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) out += node.nodeValue ?? "";
      else if (node instanceof HTMLElement) {
        if (node.dataset["tag"]) out += node.dataset["tag"];
        else if (node.tagName === "BR") out += "\n";
        else {
          if (node.tagName === "DIV" && out !== "") out += "\n";
          node.childNodes.forEach(walk);
        }
      }
    });
    return out;
  }, []);

  const render = useCallback(
    (text: string) => {
      const root = editorRef.current;
      if (!root) return;
      root.textContent = "";
      const tags = refsRef.current.map((r) => r.tag).sort((a, b) => b.length - a.length);
      const escaped = tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const re = escaped.length ? new RegExp(`(${escaped.join("|")})`, "g") : null;
      const parts = re ? text.split(re) : [text];
      for (const part of parts) {
        if (!part) continue;
        const found = refsRef.current.find((r) => r.tag === part);
        if (found) root.appendChild(makeChip(found));
        else
          part.split("\n").forEach((line, i) => {
            if (i > 0) root.appendChild(document.createElement("br"));
            if (line) root.appendChild(document.createTextNode(line));
          });
      }
    },
    [makeChip],
  );

  // sync when the value changes from outside (or references arrive later)
  useEffect(() => {
    if (value === lastValue.current && editorRef.current?.childNodes.length) return;
    lastValue.current = value;
    render(value);
    setEmpty(!value);
  }, [value, references, render]);

  /* ---------- editing ---------- */

  function emit() {
    const root = editorRef.current;
    if (!root) return "";
    const text = serialize(root);
    lastValue.current = text;
    setEmpty(text.trim() === "");
    onChange(text);
    return text;
  }

  function syncMention() {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !node || node.nodeType !== Node.TEXT_NODE) return setOpen(false);
    const before = (node.nodeValue ?? "").slice(0, sel.anchorOffset);
    const at = before.lastIndexOf("@");
    if (at === -1) return setOpen(false);
    const between = before.slice(at + 1);
    const prev = at > 0 ? before[at - 1] : " ";
    if (/\s/.test(between) || !/[\s(]|^$/.test(prev ?? " ")) return setOpen(false);
    setQuery(between);
    setActive(0);
    setOpen(true);
  }

  function pick(r: ReferenceImage) {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel || !node || node.nodeType !== Node.TEXT_NODE) return;
    const offset = sel.anchorOffset;
    const text = node.nodeValue ?? "";
    const at = text.slice(0, offset).lastIndexOf("@");
    if (at === -1) return;

    const textNode = node as Text;
    const after = text.slice(offset);
    textNode.nodeValue = text.slice(0, at);
    const chip = makeChip(r);
    const space = document.createTextNode(`\u00a0${after}`);
    textNode.parentNode?.insertBefore(chip, textNode.nextSibling);
    chip.parentNode?.insertBefore(space, chip.nextSibling);

    const range = document.createRange();
    range.setStart(space, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    editorRef.current?.focus();
    setOpen(false);
    emit();
  }

  return (
    <div className="relative">
      <div
        id={id}
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className={cn(
          "w-full whitespace-pre-wrap break-words rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          empty &&
            "before:pointer-events-none before:text-muted-foreground before:content-[attr(data-placeholder)]",
          className,
        )}
        onInput={() => {
          emit();
          syncMention();
        }}
        onClick={syncMention}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) syncMention();
        }}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(matches[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />

      {open && (
        <div className="absolute left-3 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
          {references.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Chưa có ảnh tham chiếu — hãy tải ảnh lên ở mục “Ảnh tham chiếu”.
            </p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Không có tag nào khớp.</p>
          ) : (
            matches.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <img
                  src={r.previewUrl}
                  alt={r.name}
                  className="size-9 shrink-0 rounded-md object-cover"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.tag}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.name}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});
