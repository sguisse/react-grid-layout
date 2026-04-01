#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

# Get the directory where this shell script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define the path to the Python script
PYTHON_SCRIPT="$SCRIPT_DIR/export-files-to-txt.py"

# Verify the Python script exists
if [ ! -f "$PYTHON_SCRIPT" ]; then
    echo "❌ Error: Could not find $PYTHON_SCRIPT"
    echo "Make sure the Python script is in the same directory as this bash script."
    exit 1
fi

# Verify Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: 'python3' is not installed or not in your PATH."
    exit 1
fi

echo "🚀 Launching Python exporter..."

# Execute the Python script, passing along any arguments you might add later
python3 "$PYTHON_SCRIPT" "$@"
