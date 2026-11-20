export function png(colorType: number, w = 256, h = 256, trns = false): ArrayBuffer {
  const b = new Uint8Array(80);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  b[24] = 8;
  b[25] = colorType;
  if (trns) { dv.setUint32(33, 1); b.set([0x74, 0x52, 0x4e, 0x53], 37); }
  else { dv.setUint32(33, 0); b.set([0x49, 0x44, 0x41, 0x54], 37); }
  return b.buffer;
}
export function webpX(alpha: boolean, w = 300, h = 200): ArrayBuffer {
  const b = new Uint8Array(40);
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  b.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
  b[20] = alpha ? 0x10 : 0;
  b[24] = (w - 1) & 0xff; b[25] = (w - 1) >> 8;
  b[27] = (h - 1) & 0xff; b[28] = (h - 1) >> 8;
  return b.buffer;
}

