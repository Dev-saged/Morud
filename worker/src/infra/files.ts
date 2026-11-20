// تخزين الملفات (R2 في الإنتاج، ذاكرة في الاختبار)
export interface StoredFile {
  body: ArrayBuffer;
  contentType: string;
}

export interface FileStore {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export class R2Files implements FileStore {
  constructor(private readonly bucket: R2Bucket) {}
  async put(key: string, body: ArrayBuffer, contentType: string) {
    await this.bucket.put(key, body, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } });
  }
  async get(key: string) {
    const o = await this.bucket.get(key);
    return o ? { body: await o.arrayBuffer(), contentType: o.httpMetadata?.contentType ?? 'application/octet-stream' } : null;
  }
  async exists(key: string) {
    return (await this.bucket.head(key)) !== null;
  }
  async delete(key: string) {
    await this.bucket.delete(key);
  }
}

export class MemoryFiles implements FileStore {
  readonly m = new Map<string, StoredFile>();
  async put(key: string, body: ArrayBuffer, contentType: string) {
    this.m.set(key, { body, contentType });
  }
  async get(key: string) {
    return this.m.get(key) ?? null;
  }
  async exists(key: string) {
    return this.m.has(key);
  }
  async delete(key: string) {
    this.m.delete(key);
  }
}

/** فحص صورة المنتج بالبايتات: PNG أو WebP فقط، وبقناة شفافية (صور مفرّغة إلزامياً). */
export function inspectImage(buf: ArrayBuffer): { type: 'png' | 'webp'; alpha: boolean; width: number; height: number } | null {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (b.length > 33 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const width = dv.getUint32(16);
    const height = dv.getUint32(20);
    const colorType = b[25]!;
    let alpha = colorType === 4 || colorType === 6;
    if (!alpha) {
      // قناة tRNS في الصور المفهرسة
      for (let i = 33; i + 8 < b.length && i < 4096; ) {
        const len = dv.getUint32(i);
        const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
        if (type === 'tRNS') alpha = true;
        if (type === 'IDAT' || alpha) break;
        i += 12 + len;
      }
    }
    return { type: 'png', alpha, width, height };
  }
  const tag = (o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
  if (b.length > 30 && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    const chunk = tag(12);
    if (chunk === 'VP8X') {
      const width = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
      const height = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
      return { type: 'webp', alpha: (b[20]! & 0x10) !== 0, width, height };
    }
    if (chunk === 'VP8L') {
      const bits = dv.getUint32(21, true);
      return { type: 'webp', alpha: ((bits >> 28) & 1) === 1, width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ') return { type: 'webp', alpha: false, width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
  }
  return null;
}
