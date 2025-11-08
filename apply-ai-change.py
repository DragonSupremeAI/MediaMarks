#!/usr/bin/env python3
import json, os, re, difflib, shutil, sys, datetime, uuid
from difflib import SequenceMatcher

BACKUP_DIR = ".ai_backups"
HISTORY_DIR = ".ai_history"
HISTORY_FILE = os.path.join(HISTORY_DIR, "changes.json")

def timestamp():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def fuzzy_find_anchor(content, anchor, threshold=0.5):
    """Find approximate position of anchor text within file content."""
    if not anchor.strip():
        return None

    # Exact match first
    idx = content.find(anchor)
    if idx != -1:
        return idx + len(anchor)

    # Substring fuzzy search (sliding window)
    best_ratio = 0
    best_pos = None
    window_size = len(anchor)
    for i in range(0, len(content) - window_size):
        window = content[i:i+window_size]
        ratio = SequenceMatcher(None, anchor, window).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_pos = i
        if ratio >= threshold:
            return i + window_size

    # Log for debugging if nothing matched well
    if best_ratio > 0:
        print(f"⚠️ Closest match ({best_ratio:.2f}) near position {best_pos}")
    return None


def backup_file(path):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    bname = os.path.basename(path)
    bid = uuid.uuid4().hex[:8]
    dest = os.path.join(BACKUP_DIR, f"{bname}.{bid}.bak")
    shutil.copy2(path, dest)
    return dest

def log_change(entry, backup_path):
    os.makedirs(HISTORY_DIR, exist_ok=True)
    log_entry = {
        "id": uuid.uuid4().hex[:8],
        "timestamp": timestamp(),
        "file": entry["file"],
        "action": entry.get("action"),
        "anchor": entry.get("anchor"),
        "backup": backup_path,
        "summary": entry.get("content", "")[:80].replace("\n", " ") + "..."
    }
    history = []
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            history = json.load(f)
    history.append(log_entry)
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)

def apply_patch(entry):
    file_path = entry["file"]
    action = entry.get("action", "append")
    content = entry.get("content", "")
    anchor = entry.get("anchor")

    if not os.path.exists(file_path):
        print(f"⚠️  File not found: {file_path}")
        return

    backup_path = backup_file(file_path)
    with open(file_path, "r", encoding="utf-8") as f:
        original = f.read()

    new_content = original

    if action == "replace":
        pattern = re.compile(anchor, re.MULTILINE)
        new_content = pattern.sub(content, original)
        print(f"🔁 Replaced text in {file_path}")

    elif action == "insert_after" and anchor:
        pos = fuzzy_find_anchor(original, anchor)
        if pos is None:
            print(f"⚠️  Anchor not found: {anchor} in {file_path}")
            return
        new_content = original[:pos] + content + original[pos:]
        print(f"➕ Inserted content after '{anchor}' in {file_path}")

    elif action == "insert_before" and anchor:
        pos = fuzzy_find_anchor(original, anchor)
        if pos is None:
            print(f"⚠️  Anchor not found: {anchor} in {file_path}")
            return
        new_content = original[:pos - len(anchor)] + content + original[pos - len(anchor):]
        print(f"🔼 Inserted content before '{anchor}' in {file_path}")

    elif action == "append":
        new_content = original + "\n" + content
        print(f"📎 Appended content to {file_path}")

    elif action == "prepend":
        new_content = content + "\n" + original
        print(f"📋 Prepended content to {file_path}")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    log_change(entry, backup_path)

def main():
    if len(sys.argv) < 2:
        print("Usage: ./apply-ai-change.py <patch.json>")
        sys.exit(1)

    patch_file = sys.argv[1]
    with open(patch_file, "r", encoding="utf-8") as f:
        patches = json.load(f)

    for entry in patches:
        apply_patch(entry)

    print(f"✅ Applied {len(patches)} change(s).")
    print(f"🗃️  Backups in '{BACKUP_DIR}/' | History logged at '{HISTORY_FILE}'")

if __name__ == "__main__":
    main()
