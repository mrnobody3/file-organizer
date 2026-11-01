import path from "node:path";
import { Cleanup } from "./lib/cleanup.js";
import { DuplicateFinder } from "./lib/duplicates.js";
import { Organizer } from "./lib/organizer.js";
import { Scanner } from "./lib/scanner.js";
import {
  displayPath,
  drawProgressBar,
  formatDate,
  formatSize,
  printFsError,
} from "./lib/utils.js";

const USAGE = `Usage:
  node file-organizer.js scan <directory>
  node file-organizer.js duplicates <directory>
  node file-organizer.js organize <source> --output <target>
  node file-organizer.js cleanup <directory> --older-than <days> [--confirm]`;

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const positional = [];
  const flags = {};

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}
console.log(parseArgs(process.argv));

function writeProgress(label, current, total, suffix = "") {
  const extra = suffix ? ` ${suffix}` : "";
  process.stdout.write(`\r${label} ${drawProgressBar(current, total)}${extra}`);
  if (current >= total) {
    process.stdout.write("\n");
  }
}

function printTypeRow(label, count, size) {
  const paddedLabel = label.padEnd(8);
  const paddedCount = `${count} files`.padStart(10);
  const paddedSize = formatSize(size).padStart(8);
  console.log(`  ${paddedLabel}${paddedCount}  ${paddedSize}`);
}

async function runScan(directory) {
  const scanner = new Scanner();

  scanner.on("scan-start", (data) => {
    console.log(`📂 Scanning: ${data.directory}`);
  });

  scanner.on("file-found", (data) => {
    writeProgress("Processing...", data.current, data.total, "files");
  });

  scanner.on("file-error", (data) => {
    printFsError(data.error, data.path);
  });

  const stats = await scanner.scan(directory);

  if (stats.totalFiles === 0) {
    console.log("Processing... no files found");
  }

  console.log("");
  console.log("📊 Scan Results:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Total files: ${stats.totalFiles}`);
  console.log(`Total size: ${formatSize(stats.totalSize)}`);
  console.log("");
  console.log("By File Type:");

  if (stats.byType.length === 0) {
    console.log("  (none)");
  } else {
    for (const type of stats.byType) {
      printTypeRow(type.extension, type.count, type.totalSize);
    }
  }

  console.log("");
  console.log("File Age:");
  console.log(`  Last 7 days:    ${stats.last7Days} files`);
  console.log(`  Last 30 days:   ${stats.last30Days} files`);
  console.log(`  Older than 90:  ${stats.olderThan90} files`);
  console.log("");
  console.log("Largest files:");

  if (stats.largestFiles.length === 0) {
    console.log("  (none)");
  } else {
    stats.largestFiles.forEach((file, index) => {
      const name = path.basename(file.path).padEnd(22);
      console.log(`  ${index + 1}. ${name}${formatSize(file.size)}`);
    });
  }

  console.log("");
  if (stats.oldestFile) {
    const name = path.basename(stats.oldestFile.path);
    const age = Math.round(stats.oldestFile.daysOld);
    console.log(`Oldest file: ${name} (modified ${age} days ago)`);
  } else {
    console.log("Oldest file: (none)");
  }
}

async function runDuplicates(directory) {
  const finder = new DuplicateFinder();

  finder.on("search-start", (data) => {
    console.log(`🔍 Searching for duplicates in: ${data.directory}`);
  });

  finder.on("file-processed", (data) => {
    writeProgress("Calculating hashes...", data.current, data.total, "files");
  });

  finder.on("file-error", (data) => {
    printFsError(data.error, data.path);
  });

  const result = await finder.find(directory);

  if (result.groups.length === 0) {
    console.log("");
    console.log("No duplicates found.");
    return;
  }

  console.log("");
  console.log(
    `Found ${result.groups.length} duplicate group${result.groups.length === 1 ? "" : "s"} (${formatSize(result.totalWasted)} wasted):`,
  );

  for (const group of result.groups) {
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(
      `Group ${group.index} (${group.copies.length} copies, ${formatSize(group.size)} each):`,
    );
    console.log(`  SHA-256: ${group.hash.slice(0, 12)}...`);
    console.log("");
    for (const copy of group.copies) {
      console.log(`  📄 ${displayPath(directory, copy.relativePath)}`);
    }
    console.log("");
    console.log(`  Wasted space: ${formatSize(group.wasted)}`);
  }

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`💾 Total wasted space: ${formatSize(result.totalWasted)}`);
}

async function runOrganize(source, output) {
  const organizer = new Organizer();

  organizer.on("organize-start", (data) => {
    console.log(`📦 Organizing: ${data.source}`);
    console.log(`Target: ${data.output}`);
    console.log("");
    console.log("Creating folders...");
  });

  organizer.on("folder-created", (data) => {
    console.log(`  ✓ ${data.category}/`);
  });

  organizer.on("copy-start", (data) => {
    if (data.current === 1) {
      console.log("");
      writeProgress("Copying files...", 0, data.total);
    }
  });

  organizer.on("copy-complete", (data) => {
    writeProgress("Copying files...", data.current, data.total);
  });

  organizer.on("copy-error", (data) => {
    writeProgress("Copying files...", data.current, data.total);
    printFsError(data.error, data.source);
  });

  const result = await organizer.organize(source, output);

  if (result.copied === 0) {
    writeProgress("Copying files...", 0, 0);
  }

  console.log("");
  console.log("✅ Organization complete!");
  console.log("");
  console.log("Summary:");

  const outputName = path.basename(output);
  const counts = Object.values(result.summary).map(
    (item) => String(item.count).length,
  );
  const countWidth = Math.max(1, ...counts);

  for (const [category, info] of Object.entries(result.summary)) {
    const label = `${category}:`.padEnd(11);
    const count = String(info.count).padStart(countWidth);
    console.log(`  ${label}${count} files → ${outputName}/${category}/`);
  }

  console.log("");
  console.log(
    `Total copied: ${result.copied} files (${formatSize(result.totalSize)})`,
  );
}

function printCleanupPreview(candidates, totalSize) {
  console.log(`Found ${candidates.length} files to delete:`);
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const previewLimit = 3;
  const preview = candidates.slice(0, previewLimit);
  for (const file of preview) {
    console.log(path.basename(file.path));
    console.log(`  Size: ${formatSize(file.size)}`);
    console.log(
      `  Modified: ${Math.round(file.daysOld)} days ago (${formatDate(file.mtime)})`,
    );
    console.log("");
  }

  const remaining = candidates.length - preview.length;
  if (remaining > 0) {
    console.log(`... (${remaining} more files)`);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log(`Total: ${candidates.length} files (${formatSize(totalSize)})`);
}

async function runCleanup(directory, olderThan, confirm) {
  const cleanup = new Cleanup();

  cleanup.on("cleanup-start", (data) => {
    console.log(`🧹 Cleanup: ${data.directory}`);
    console.log(`Looking for files older than ${data.olderThan} days...`);
    console.log("");
  });

  cleanup.on("preview", (data) => {
    if (data.candidates.length === 0) {
      console.log("Found 0 files to delete.");
      return;
    }

    printCleanupPreview(data.candidates, data.totalSize);
    console.log("");

    if (!data.confirm) {
      console.log("⚠️  DRY RUN MODE: No files were deleted.");
      console.log("To actually delete these files, run with --confirm flag.");
      return;
    }

    console.log(
      `⚠️  DELETING ${data.candidates.length} files (${formatSize(data.totalSize)}). This action cannot be undone!`,
    );
    console.log("");
  });

  cleanup.on("file-error", (data) => {
    printFsError(data.error, data.path);
  });

  cleanup.on("file-deleted", (data) => {
    writeProgress("Deleting...", data.current, data.total);
  });

  const result = await cleanup.cleanup(directory, { olderThan, confirm });

  if (confirm && result.candidates.length > 0) {
    console.log("");
    console.log("✅ Cleanup complete!");
    console.log(
      `Deleted: ${result.deleted} files (${formatSize(result.freed)} freed)`,
    );
  }
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv);

  if (!command || command === "--help" || command === "-h" || flags.help) {
    console.log(USAGE);
    process.exit(command ? 0 : 1);
  }

  try {
    if (command === "scan") {
      const directory = positional[0];
      if (!directory) {
        console.error("❌ Error: Please provide a directory to scan.");
        console.error(USAGE);
        process.exit(1);
      }
      await runScan(path.resolve(directory));
      return;
    }

    if (command === "duplicates") {
      const directory = positional[0];
      if (!directory) {
        console.error("❌ Error: Please provide a directory to search.");
        console.error(USAGE);
        process.exit(1);
      }
      await runDuplicates(path.resolve(directory));
      return;
    }

    if (command === "organize") {
      const source = positional[0];
      const output = flags.output;
      if (!source || !output || output === true) {
        console.error(
          "❌ Error: Please provide a source directory and --output <target>.",
        );
        console.error(USAGE);
        process.exit(1);
      }
      await runOrganize(path.resolve(source), path.resolve(output));
      return;
    }

    if (command === "cleanup") {
      const directory = positional[0];
      const olderThanRaw = flags["older-than"];
      const olderThan = Number(olderThanRaw);
      if (
        !directory ||
        olderThanRaw === undefined ||
        Number.isNaN(olderThan) ||
        olderThan < 0
      ) {
        console.error(
          "❌ Error: Please provide a directory and --older-than <days>.",
        );
        console.error(USAGE);
        process.exit(1);
      }
      await runCleanup(
        path.resolve(directory),
        olderThan,
        flags.confirm === true,
      );
      return;
    }

    console.error(`❌ Error: Unknown command "${command}".`);
    console.error(USAGE);
    process.exit(1);
  } catch (error) {
    const target = positional[0] ?? flags.output ?? "";
    printFsError(error, path.resolve(target || "."));
    process.exit(1);
  }
}

await main();
