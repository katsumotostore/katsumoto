import { useState, useRef } from "react";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  value: string | null;
  onChange: (value: string | null) => void;
  maxSizeMB?: number;
  className?: string;
  previewClassName?: string;
  compact?: boolean;
  onUploadingChange?: (busy: boolean) => void;
  uploadFn?: (file: File) => Promise<string>;
}

export function ImageUpload({
  value,
  onChange,
  maxSizeMB = 2,
  className,
  previewClassName = "w-28 h-28",
  compact = false,
  uploadFn,
  onUploadingChange,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const processFile = async (file: File) => {
    setError("");

    if (!file.type.startsWith("image/")) {
      setError("Solo se permiten imágenes");
      return;
    }

    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`Máximo ${maxSizeMB}MB`);
      return;
    }

    if (uploadFn) {
      setUploading(true);
      onUploadingChange?.(true);
      try {
        const url = await uploadFn(file);
        onChange(url);
      } catch {
        setError("Error al subir imagen");
      } finally {
        setUploading(false);
        onUploadingChange?.(false);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        let w = img.width;
        let h = img.height;
        if (w > h && w > MAX) {
          h *= MAX / w;
          w = MAX;
        } else if (h > MAX) {
          w *= MAX / h;
          h = MAX;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        onChange(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (uploading) {
    return (
      <div className={className}>
        <div
          className={cn(
            "border-2 border-dashed rounded-xl text-center p-5 border-orange-300 bg-orange-50/50 dark:bg-orange-900/10",
            previewClassName && `flex items-center justify-center ${previewClassName}`,
          )}
        >
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-orange-500" />
          <p className="text-xs text-muted-foreground mt-2">Subiendo...</p>
        </div>
      </div>
    );
  }

  if (value) {
    return (
      <div className={cn("relative inline-block group", className)}>
        <div className={cn("rounded-xl overflow-hidden border border-border/60", previewClassName)}>
          <img src={value} alt="Preview" className="w-full h-full object-cover" />
        </div>
        <button
          type="button"
          aria-label="Quitar imagen"
          onClick={handleRemove}
          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md opacity-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl text-center cursor-pointer transition-all",
          compact ? "p-3" : "p-5",
          dragOver
            ? "border-orange-400 bg-orange-50 dark:bg-orange-900/20"
            : "border-slate-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-700"
        )}
      >
        {compact ? (
          <ImageIcon className="w-6 h-6 mx-auto text-muted-foreground/40" />
        ) : (
          <>
            <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-xs font-medium text-muted-foreground">
              Arrastra o haz clic para subir
            </p>
            <p className="text-[10px] text-muted-foreground/50 mt-1">
              Máximo {maxSizeMB}MB · JPG, PNG, WebP
            </p>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}