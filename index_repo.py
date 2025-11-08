#!/usr/bin/env python3
"""
Repo Indexer for AI Code Review
===============================
This script indexes a local Git repository into a text file for AI analysis.
It lists all tracked files, reads their contents, and concatenates them with metadata.

Usage:
    python index_repo.py [output_file]
    If no output_file is provided, defaults to 'repo_index.txt'.

Requirements:
    - Python 3.x
    - Run from the root of a Git repository.
"""

import subprocess
import sys
import os
from pathlib import Path
import argparse

def run_git_command(cmd):
    """Run a Git command and return stdout as a list of lines."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, check=True)
        return result.stdout.strip().split('\n')
    except subprocess.CalledProcessError as e:
        print(f"Error running Git command '{cmd}': {e}")
        sys.exit(1)

def is_text_file(file_path):
    """Check if a file is text-based (not binary)."""
    try:
        with open(file_path, 'rb') as f:
            sample = f.read(1024)
            return b'\0' not in sample  # Null bytes indicate binary
    except:
        return False

def should_include_file(file_path):
    """Filter files: include common code/docs, exclude binaries/large files."""
    path = Path(file_path)
    if path.is_dir():
        return False
    # Skip common ignores (even if not in .gitignore)
    if any(skip in file_path for skip in ['.git/', '__pycache__', '*.pyc', '*.pyo', '*.pyd']):
        return False
    # Include common code and doc files
    if path.suffix in {'.py', '.js', '.ts', '.java', '.cpp', '.c', '.h', '.md', '.txt', '.json', '.yaml', '.yml', '.html', '.css', '.sh', '.sql'}:
        return True
    # For other files, check if text and <1MB
    if is_text_file(file_path):
        stat = path.stat()
        return stat.st_size < 1_000_000  # 1MB limit
    return False

def read_file_content(file_path):
    """Read file content, handling encoding errors gracefully."""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
    except Exception as e:
        print(f"Warning: Could not read {file_path}: {e}")
        return f"# [ERROR: Could not read file]"

def index_repo(output_file):
    """Main indexing function."""
    # Get list of tracked files
    files = run_git_command('git ls-files')

    # Helper to run git log for date (handles quoting safely)
    def get_commit_date(file_path=''):
        cmd = f'git log -1 --format="%cI" -- {file_path}' if file_path else 'git log -1 --format="%cI"'
        return os.popen(cmd).read().strip() or 'Unknown'

    with open(output_file, 'w', encoding='utf-8') as out:
        out.write("# Git Repository Index for AI Review\n")
        out.write(f"# Generated on: {get_commit_date()}\n")
        out.write(f"# Repo: {os.getcwd()}\n")
        out.write(f"# Total files indexed: {len(files)}\n\n")

        for file_path in files:
            if not should_include_file(file_path):
                continue

            content = read_file_content(file_path)
            out.write(f"## FILE: {file_path}\n")
            out.write("### Metadata\n")
            out.write(f"- Size: {Path(file_path).stat().st_size} bytes\n")
            out.write(f"- Last commit: {get_commit_date(file_path)}\n\n")
            out.write("### Content\n")
            out.write(content)
            out.write("\n" + "="*80 + "\n\n")  # Separator for easy chunking

    print(f"Indexing complete! Output saved to '{output_file}'.")
    print(f"Indexed {len([f for f in files if should_include_file(f)])} files.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Index a local Git repo for AI code review.")
    parser.add_argument("output", nargs="?", default="repo_index.txt", help="Output file path (default: repo_index.txt)")
    args = parser.parse_args()

    # Check if in a Git repo
    if not os.popen('git rev-parse --git-dir').read().strip():
        print("Error: Not in a Git repository. Run from the repo root.")
        sys.exit(1)

    index_repo(args.output)
