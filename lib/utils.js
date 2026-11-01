import fs from 'fs/promises';
import path from 'node:path';

const DAY_MS = 1000 * 60 * 60 * 24;

export function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function drawProgressBar(current, total, width = 20) {
  if (total <= 0) {
    return `${'░'.repeat(width)} 0/0`;
  }

  const percentage = Math.min(current / total, 1);
  const filled = Math.round(percentage * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `${bar} ${current}/${total}`;
}

export function daysOld(mtime, now = Date.now()) {
  return (now - mtime.getTime()) / DAY_MS;
}

export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatFsError(error, targetPath) {
  if (error.code === 'ENOENT') {
    return `❌ Error: Directory not found: ${targetPath}`;
  }
  if (error.code === 'EACCES') {
    return `❌ Error: Permission denied: ${targetPath}`;
  }
  if (error.code === 'ENOTDIR') {
    return `❌ Error: Not a directory: ${targetPath}`;
  }
  if (error.code === 'EISDIR') {
    return `❌ Error: Expected a file, but found a directory: ${targetPath}`;
  }
  if (error.code === 'EEXIST') {
    return `❌ Error: File already exists: ${targetPath}`;
  }
  if (error.code === 'EBUSY') {
    return `❌ Error: Resource is busy: ${targetPath}`;
  }
  if (error.code === 'EMFILE' || error.code === 'ENFILE') {
    return '❌ Error: Too many open files';
  }
  return `❌ Unexpected error: ${error.message}`;
}

export function printFsError(error, targetPath) {
  console.error(formatFsError(error, targetPath));
}

export function displayPath(directory, relativePath) {
  return path.join(path.basename(directory), relativePath);
}

export async function collectFiles(directory, onError) {
  const entries = await fs.readdir(directory, { recursive: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry);

    try {
      const stats = await fs.stat(fullPath);
      if (stats.isFile()) {
        files.push({
          fullPath,
          relativePath: entry,
          size: stats.size,
          mtime: stats.mtime,
        });
      }
    } catch (error) {
      onError?.(error, fullPath);
    }
  }

  return files;
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function uniqueDestination(destPath) {
  if (!(await pathExists(destPath))) {
    return destPath;
  }

  const dir = path.dirname(destPath);
  const ext = path.extname(destPath);
  const base = path.basename(destPath, ext);
  let index = 1;
  let candidate = path.join(dir, `${base}(${index})${ext}`);

  while (await pathExists(candidate)) {
    index += 1;
    candidate = path.join(dir, `${base}(${index})${ext}`);
  }

  return candidate;
}
