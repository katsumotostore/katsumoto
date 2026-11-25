import { supabase } from "@/lib/supabase";

const BUCKET = "product-images";

export const storageService = {
  async uploadImage(
    file: File | Blob,
    fileName: string,
  ): Promise<string> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");
    const userId = user.id;
    const ext = fileName.includes(".") ? fileName.split(".").pop() : "jpg";
    const uniqueName = `${userId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(uniqueName, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (error) throw error;

    return storageService.getPublicUrl(uniqueName);
  },

  getPublicUrl(path: string): string {
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return publicUrl;
  },

  extractPathFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const segments = urlObj.pathname.split("/");
      const bucketIdx = segments.indexOf(BUCKET);
      if (bucketIdx === -1) return null;
      return segments.slice(bucketIdx + 1).join("/");
    } catch {
      return null;
    }
  },

  async deleteImage(url: string): Promise<void> {
    const path = storageService.extractPathFromUrl(url);
    if (!path) return;

    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  },

  async processAndUpload(
    file: File,
    maxSizeKB: number = 800,
    quality: number = 0.75,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const img = new Image();
        img.onload = async () => {
          try {
            const canvas = document.createElement("canvas");
            let w = img.width;
            let h = img.height;
            if (w > h && w > maxSizeKB) {
              h *= maxSizeKB / w;
              w = maxSizeKB;
            } else if (h > maxSizeKB) {
              w *= maxSizeKB / h;
              h = maxSizeKB;
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("No se pudo crear el contexto canvas"));
              return;
            }
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);

            const blob = await new Promise<Blob>((res, rej) =>
              canvas.toBlob(
                (b) => {
                  if (!b) rej(new Error("No se pudo generar la imagen"));
                  else res(b);
                },
                "image/jpeg",
                quality,
              ),
            );

            const publicUrl = await storageService.uploadImage(
              blob,
              "image.jpg",
            );
            resolve(publicUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error("No se pudo abrir la imagen. Usa JPG, PNG o WebP."));
        img.src = result;
      };
      reader.onerror = () => reject(new Error("No se pudo leer el archivo. Inténtalo de nuevo."));
      reader.readAsDataURL(file);
    });
  },
};
