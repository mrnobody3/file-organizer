import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import { collectFiles, daysOld } from './utils.js';

export class Cleanup extends EventEmitter {
  async cleanup(directory, { olderThan, confirm = false } = {}) {
    this.emit('cleanup-start', { directory, olderThan, confirm });

    const files = await collectFiles(directory, (error, filePath) => {
      this.emit('file-error', { path: filePath, error });
    });

    const now = Date.now();
    const candidates = [];

    for (const file of files) {
      const age = daysOld(file.mtime, now);
      if (age > olderThan) {
        const fileData = {
          path: file.fullPath,
          relativePath: file.relativePath,
          size: file.size,
          mtime: file.mtime,
          daysOld: age,
        };
        candidates.push(fileData);
        this.emit('file-found', fileData);
      }
    }

    const totalSize = candidates.reduce((sum, file) => sum + file.size, 0);
    this.emit('preview', { directory, olderThan, confirm, candidates, totalSize });

    let deleted = 0;
    let freed = 0;

    if (confirm) {
      for (const [index, file] of candidates.entries()) {
        try {
          await fs.unlink(file.path);
          deleted += 1;
          freed += file.size;
          this.emit('file-deleted', {
            ...file,
            current: index + 1,
            total: candidates.length,
          });
        } catch (error) {
          this.emit('file-error', { path: file.path, error });
        }
      }
    }

    const result = {
      directory,
      olderThan,
      confirm,
      candidates,
      deleted,
      freed: confirm ? freed : 0,
      totalSize,
    };

    this.emit('cleanup-complete', result);
    return result;
  }
}
