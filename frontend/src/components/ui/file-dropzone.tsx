import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, FileText, Image as ImageIcon, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  value: File[];
  onChange: (files: File[]) => void;
  accept: string[];
  maxFiles: number;
  maxSizeMB: number;
  dropLabel: string;
  unsupportedTypeMessage: string;
  tooLargeMessage: string;
  duplicateMessage: string;
  tooManyMessage: string;
  disabled?: boolean;
  hintId?: string;
}

const fmtSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

function fileIcon(file: File) {
  if (isImage(file)) return <ImageIcon className="h-4 w-4 text-emerald-500" />;
  if (file.type.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  return <FileSpreadsheet className="h-4 w-4 text-amber-500" />;
}

export function FileDropzone({
  value,
  onChange,
  accept,
  maxFiles,
  maxSizeMB,
  dropLabel,
  unsupportedTypeMessage,
  tooLargeMessage,
  duplicateMessage,
  tooManyMessage,
  disabled = false,
  hintId,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const maxBytes = maxSizeMB * 1024 * 1024;

  const previews = useMemo(
    () =>
      value.map((file) => ({
        key: `${file.name}-${file.size}`,
        file,
        url: isImage(file) ? URL.createObjectURL(file) : null,
      })),
    [value],
  );

  useEffect(() => () => {
    previews.forEach((p) => {
      if (p.url) URL.revokeObjectURL(p.url);
    });
  }, [previews]);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming || disabled) return;
    const merged = [...value];
    for (const file of Array.from(incoming)) {
      if (!accept.includes(file.type)) {
        toast.error(unsupportedTypeMessage);
        continue;
      }
      if (file.size > maxBytes) {
        toast.error(tooLargeMessage);
        continue;
      }
      if (merged.some((f) => f.name === file.name && f.size === file.size)) {
        toast.info(duplicateMessage.replace("{name}", file.name));
        continue;
      }
      if (merged.length >= maxFiles) {
        toast.error(tooManyMessage);
        break;
      }
      merged.push(file);
    }
    onChange(merged);
  };

  const removeFile = (file: File) => {
    onChange(value.filter((f) => !(f.name === file.name && f.size === file.size)));
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-describedby={hintId}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (disabled) return;
          setDragDepth((d) => d + 1);
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (disabled) return;
          setDragDepth((d) => Math.max(0, d - 1));
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (disabled) return;
          setDragDepth(0);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border border-dashed p-4 transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          dragDepth > 0 ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept.join(",")}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.currentTarget.value = "";
          }}
          disabled={disabled}
        />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Upload className="h-4 w-4" />
          <span>{dropLabel}</span>
        </div>
      </div>

      {previews.length > 0 && (
        <div className="space-y-2 rounded-md border border-border/70 p-2">
          {previews.map((item) => (
            <div key={item.key} className="flex items-center gap-2 rounded-md bg-muted/30 p-2">
              {item.url ? (
                <img src={item.url} alt={item.file.name} className="h-10 w-10 rounded object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-background">
                  {fileIcon(item.file)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{item.file.name}</p>
                <p className="text-[11px] text-muted-foreground">{fmtSize(item.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(item.file)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                aria-label={`Remove ${item.file.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
