import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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

/** Textarea with an "@" mention popup listing uploaded reference images. */
export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function MentionTextarea(
  { id, value, onChange, references, placeholder, className },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState(0); // index of the "@"
  const [active, setActive] = useState(0);

  const matches = open
    ? references.filter((r) =>
        `${r.tag} ${r.name}`.toLowerCase().includes(query.toLowerCase().replace(/^@/, "")),
      )
    : [];

  function syncMention(text: string, caret: number) {
    const before = text.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at === -1) return setOpen(false);
    const between = before.slice(at + 1);
    // stop when the token contains whitespace, or "@" isn't at a word start
    const prevChar = at > 0 ? before[at - 1] : " ";
    if (/\s/.test(between) || !/[\s(]|^$/.test(prevChar ?? " ")) return setOpen(false);
    setAnchor(at);
    setQuery(between);
    setActive(0);
    setOpen(true);
  }

  function pick(tag: string) {
    const el = innerRef.current;
    const caret = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, anchor)}${tag} ${value.slice(caret)}`;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      const pos = anchor + tag.length + 1;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  // ảnh đang được nhắc tới trong prompt (theo thứ tự xuất hiện)
  const tagged = references
    .map((r) => ({ ref: r, at: value.indexOf(r.tag) }))
    .filter((x) => x.at !== -1)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.ref);

  function removeTag(tag: string) {
    onChange(
      value
        .replace(new RegExp(`\\s?${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), "")
        .replace(/[ \t]{2,}/g, " ")
        .trimStart(),
    );
    innerRef.current?.focus();
  }

  return (
    <div className="relative">
      <Textarea
        id={id}
        ref={innerRef}
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onClick={(e) => syncMention(value, e.currentTarget.selectionStart ?? 0)}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            syncMention(value, e.currentTarget.selectionStart ?? 0);
          }
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
            pick(matches[active]!.tag);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
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
                onClick={() => pick(r.tag)}
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

      {tagged.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Đang tham chiếu:</span>
          {tagged.map((r) => (
            <span
              key={r.id}
              className="group flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-1 pr-2"
              title={r.name}
            >
              <img
                src={r.previewUrl}
                alt={r.name}
                className="size-6 shrink-0 rounded-full object-cover"
              />
              <span className="max-w-32 truncate text-xs font-medium">{r.tag}</span>
              <button
                type="button"
                onClick={() => removeTag(r.tag)}
                aria-label={`Bỏ ${r.tag} khỏi prompt`}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
