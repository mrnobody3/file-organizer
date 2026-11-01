import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { collectFiles, uniqueDestination } from "./utils.js";

const LARGE_FILE_BYTES = 10 * 1024 * 1024;

export const CATEGORIES = {
  Documents: [".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".pptx"],
  Images: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"],
  Archives: [".zip", ".rar", ".tar", ".gz", ".7z"],
  Code: [".js", ".py", ".java", ".cpp", ".html", ".css", ".json"],
  Videos: [".mp4", ".avi", ".mkv", ".mov", ".webm"],
  Other: [],
};

export function getCategory(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  for (const [category, extensions] of Object.entries(CATEGORIES)) {
    if (extensions.includes(extension)) {
      return category;
    }
  }

  return "Other";
}

export class Organizer extends EventEmitter {
  async organize(source, output) {
    this.emit("organize-start", { source, output });

    const files = await collectFiles(source, (error, filePath) => {
      this.emit("file-error", { path: filePath, error });
    });

    const categoryNames = Object.keys(CATEGORIES);
    for (const category of categoryNames) {
      const folder = path.join(output, category);
      await fsPromises.mkdir(folder, { recursive: true });
      this.emit("folder-created", { category, path: folder });
    }

    const summary = Object.fromEntries(
      categoryNames.map((category) => [category, { count: 0, totalSize: 0 }]),
    );
    let copied = 0;
    let totalSize = 0;

    for (const [index, file] of files.entries()) {
      const category = getCategory(file.fullPath);
      const destDir = path.join(output, category);
      const destPath = await uniqueDestination(
        path.join(destDir, path.basename(file.fullPath)),
      );

      this.emit("copy-start", {
        source: file.fullPath,
        target: destPath,
        category,
        current: index + 1,
        total: files.length,
      });

      try {
        await this.#copyFile(file.fullPath, destPath, file.size);
        summary[category].count += 1;
        summary[category].totalSize += file.size;
        copied += 1;
        totalSize += file.size;
        this.emit("copy-complete", {
          source: file.fullPath,
          target: destPath,
          category,
          current: index + 1,
          total: files.length,
        });
      } catch (error) {
        this.emit("copy-error", {
          source: file.fullPath,
          target: destPath,
          error,
          current: index + 1,
          total: files.length,
        });
      }
    }

    const result = { source, output, copied, totalSize, summary };
    this.emit("organize-complete", result);
    return result;
  }

  async #copyFile(sourcePath, targetPath, size) {
    if (size >= LARGE_FILE_BYTES) {
      await pipeline(
        fs.createReadStream(sourcePath),
        fs.createWriteStream(targetPath),
      );
      return;
    }

    await fsPromises.copyFile(sourcePath, targetPath);
  }
}
