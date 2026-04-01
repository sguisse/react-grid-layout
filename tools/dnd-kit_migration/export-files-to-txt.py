#!/usr/bin/env python3
import os
import re
from datetime import datetime, timezone

# ─── Configuration ────────────────────────────────────────────────────────────

ROOT_DIR = os.path.abspath(os.getcwd())
OUTPUT_FILE = os.path.join(ROOT_DIR, "export-files.txt")
STEPS_LOG = os.path.join(ROOT_DIR, "export-files.steps.log")

# Included path patterns (applied to the relative file path starting with './')
INCLUDE_PATHS = [
    # r".*/apps/.*",
    # r".*/packages/.*",
    # r".*/scripts/.*",
    r".github/.*"
    #r"\./.*"
]

# Excluded path patterns
EXCLUDE_PATHS = [
    r".*/node_modules/.*",
    r".*/\.git/.*",
    r".*/dist/.*",
    r".*/build/.*",
    r".*/\.turbo/.*",
    r".*/\.next/.*",
    r".*/coverage/.*",
    r".*/\.cache/.*",
    r".*\.history/.*",
    r".*/excalidraw-skill/.*",
]

FILE_EXTENSIONS_MODE = "exclude"  # "include" or "exclude"

INCLUDE_FILE_EXTENSIONS = [
    r".*\.(ts|tsx)$",
    r".*\.(js|jsx)$",
    r".*\.json$",
    r".*\.md$",
    r".*\.css$",
    r".*\.sh$"
]

EXCLUDE_FILE_EXTENSIONS = [
    r".*\.(log|tmp)$",
    r".*\.lock$",
    r".*\.zip$",
    r".*\.tar$",
    r".*\.(png|jpg|jpeg|gif|bmp|svg|webp|ico)$",
    r".*\.DS_Store$",
    r".*\.pyc$",
]

# ─── Script Logic ─────────────────────────────────────────────────────────────

def log_step(emoji, msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    log_line = f"{ts} {emoji} {msg}"
    print(log_line)
    with open(STEPS_LOG, "a", encoding="utf-8") as f:
        f.write(log_line + "\n")

def compile_regexes(name, patterns):
    try:
        return [re.compile(p) for p in patterns]
    except re.error as e:
        log_step("❗", f"Invalid regex in {name}: {e}")
        exit(1)

def matches_any(text, compiled_regexes):
    return any(r.search(text) for r in compiled_regexes)

def main():
    # Clear output files
    open(OUTPUT_FILE, 'w', encoding='utf-8').close()
    open(STEPS_LOG, 'w', encoding='utf-8').close()

    # Compile all regexes up front for maximum performance
    re_include_paths = compile_regexes("INCLUDE_PATHS", INCLUDE_PATHS)
    re_exclude_paths = compile_regexes("EXCLUDE_PATHS", EXCLUDE_PATHS)
    re_include_ext = compile_regexes("INCLUDE_FILE_EXTENSIONS", INCLUDE_FILE_EXTENSIONS)
    re_exclude_ext = compile_regexes("EXCLUDE_FILE_EXTENSIONS", EXCLUDE_FILE_EXTENSIONS)

    log_step("🚀", f"Starting export. Root={ROOT_DIR}, Output={OUTPUT_FILE}, FileExtensionsMode={FILE_EXTENSIONS_MODE}")

    found_count = 0
    skipped_count = 0
    written_count = 0

    # Open the output file once to prevent repetitive I/O overhead
    with open(OUTPUT_FILE, "a", encoding="utf-8") as out_file:
        for root, dirs, files in os.walk(ROOT_DIR):
            # Normalize path to match Bash behavior (e.g., './apps/folder')
            rel_root = "./" + os.path.relpath(root, ROOT_DIR).replace("\\", "/")
            if rel_root == "./.":
                rel_root = "."

            # PERFORMANCE WIN: Prune excluded directories immediately.
            # os.walk allows modifying the 'dirs' list in-place. If a directory is removed,
            # os.walk will not traverse into it, instantly skipping massive folders like node_modules.
            original_dir_count = len(dirs)
            dirs[:] = [
                d for d in dirs
                if not matches_any(f"{rel_root}/{d}", re_exclude_paths)
            ]

            for d in set(range(original_dir_count)) - set(range(len(dirs))): # Track pruned count roughly
                pass # Can add debug logging here if needed, but omitted for speed

            for file in files:
                filepath = os.path.join(root, file)
                rel_filepath = f"{rel_root}/{file}"

                found_count += 1

                # 1. Primary Filter: Must match INCLUDE_PATHS
                if re_include_paths and not matches_any(rel_filepath, re_include_paths):
                    skipped_count += 1
                    continue

                # 2. Secondary Filter: Must NOT match EXCLUDE_PATHS
                # (Catches specific files since directories are already pruned above)
                if matches_any(rel_filepath, re_exclude_paths):
                    skipped_count += 1
                    continue

                # 3. Tertiary Filter: File Extensions
                if FILE_EXTENSIONS_MODE == "include":
                    if re_include_ext and not matches_any(file, re_include_ext):
                        skipped_count += 1
                        continue
                elif FILE_EXTENSIONS_MODE == "exclude":
                    if re_exclude_ext and matches_any(file, re_exclude_ext):
                        skipped_count += 1
                        continue

                log_step("📝", f"Exporting: {rel_filepath}")

                # Read and append file contents
                try:
                    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()

                    out_file.write("==================================================================================================================================================================\n")
                    out_file.write(f"{rel_filepath}\n")
                    out_file.write("--->\n\n")
                    out_file.write(content)
                    out_file.write("\n<---\n\n")

                    written_count += 1
                except Exception as e:
                    log_step("⚠️", f"Failed to read {rel_filepath}: {e}")
                    skipped_count += 1

    log_step("🏁", f"Export complete. Files scanned={found_count}, written={written_count}, skipped={skipped_count}")
    print(f"✅ Export complete: {OUTPUT_FILE} (file_extensions_mode={FILE_EXTENSIONS_MODE})")

if __name__ == "__main__":
    main()
