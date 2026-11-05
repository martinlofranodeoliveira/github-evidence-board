import { open } from 'node:fs/promises';

export async function readLimitedFile(filename, maxBytes) {
  const handle = await open(filename, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw Object.assign(new Error('Expected a regular file.'), { code: 'NOT_REGULAR' });
    if (stat.size > maxBytes) throw Object.assign(new Error('File exceeds the byte limit.'), { code: 'FILE_TOO_LARGE' });
    const buffer = Buffer.alloc(maxBytes + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, null);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > maxBytes) throw Object.assign(new Error('File exceeds the byte limit.'), { code: 'FILE_TOO_LARGE' });
    return buffer.subarray(0, used);
  } finally { await handle.close(); }
}
