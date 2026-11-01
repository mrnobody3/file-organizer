import { EventEmitter } from 'node:events';
import path from 'node:path';
import { collectFiles } from './utils.js';

export class Scanner extends EventEmitter {
  async scan(directory) {
    this.emit('scan-start', { directory });

    const files = await collectFiles(directory, (error, filePath) => {
      this.emit('file-error', { path: filePath, error });
    });

    const now = Date.now();
    const byType = new Map();
    const fileDetails = [];
    let totalSize = 0;
    let last7Days = 0;
    let last30Days = 0;
    let olderThan90 = 0;

    for (const [index, file] of files.entries()) {
      const extension = path.extname(file.fullPath).toLowerCase() || '(no ext)';
      const age = (now - file.mtime.getTime()) / (1000 * 60 * 60 * 24);

      const typeStats = byType.get(extension) ?? { count: 0, totalSize: 0 };
      typeStats.count += 1;
      typeStats.totalSize += file.size;
      byType.set(extension, typeStats);

      totalSize += file.size;
      if (age <= 7) last7Days += 1;
      if (age <= 30) last30Days += 1;
      if (age > 90) olderThan90 += 1;

      const fileData = {
        path: file.fullPath,
        relativePath: file.relativePath,
        size: file.size,
        mtime: file.mtime,
        extension,
        daysOld: age,
      };
      fileDetails.push(fileData);
      this.emit('file-found', { ...fileData, current: index + 1, total: files.length });
    }

    const largestFiles = [...fileDetails]
      .sort((a, b) => b.size - a.size)
      .slice(0, 3);

    const oldestFile = fileDetails.reduce((oldest, file) => {
      if (!oldest) return file;
      return file.mtime < oldest.mtime ? file : oldest;
    }, null);

    const types = [...byType.entries()]
      .map(([extension, stats]) => ({ extension, ...stats }))
      .sort((a, b) => b.totalSize - a.totalSize || b.count - a.count || a.extension.localeCompare(b.extension));

    const statistics = {
      directory,
      totalFiles: files.length,
      totalSize,
      byType: types,
      last7Days,
      last30Days,
      olderThan90,
      largestFiles,
      oldestFile,
    };

    this.emit('scan-complete', statistics);
    return statistics;
  }
}
