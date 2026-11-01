import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { collectFiles } from './utils.js';

function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export class DuplicateFinder extends EventEmitter {
  async find(directory) {
    this.emit('search-start', { directory });

    const files = await collectFiles(directory, (error, filePath) => {
      this.emit('file-error', { path: filePath, error });
    });

    const byHash = new Map();

    for (const [index, file] of files.entries()) {
      try {
        const hash = await calculateHash(file.fullPath);
        const group = byHash.get(hash) ?? [];
        group.push({
          path: file.fullPath,
          relativePath: file.relativePath,
          size: file.size,
        });
        byHash.set(hash, group);
        this.emit('file-processed', {
          path: file.fullPath,
          hash,
          current: index + 1,
          total: files.length,
        });
      } catch (error) {
        this.emit('file-error', { path: file.fullPath, error });
        this.emit('file-processed', {
          path: file.fullPath,
          current: index + 1,
          total: files.length,
        });
      }
    }

    const groups = [...byHash.entries()]
      .filter(([, copies]) => copies.length > 1)
      .map(([hash, copies], index) => {
        const size = copies[0].size;
        const wasted = size * (copies.length - 1);
        return {
          index: index + 1,
          hash,
          copies,
          size,
          wasted,
        };
      })
      .sort((a, b) => b.wasted - a.wasted)
      .map((group, index) => ({ ...group, index: index + 1 }));

    const totalWasted = groups.reduce((sum, group) => sum + group.wasted, 0);
    const result = { directory, groups, totalWasted };

    this.emit('duplicates-found', result);
    return result;
  }
}
