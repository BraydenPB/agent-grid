#!/bin/bash
# PostToolUse hook — validate dockview safety patterns after Edit/Write
# Checks files with addPanel calls for unguarded usage and missing reference validation.

TOOL_NAME="$1"
FILE_PATH="$2"

# Only run for Edit/Write
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
    exit 0
fi

if [[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]]; then
    exit 0
fi

# Only validate files that use dockview addPanel
if ! grep -q "\.addPanel(" "$FILE_PATH" 2>/dev/null; then
    exit 0
fi

ERRORS=""

# Check 1: Every addPanel call should be inside a try block
TOTAL_ADD=$(grep -c "\.addPanel(" "$FILE_PATH" 2>/dev/null)
TOTAL_ADD=${TOTAL_ADD:-0}
TRY_COUNT=$(grep -c "try {" "$FILE_PATH" 2>/dev/null)
TRY_COUNT=${TRY_COUNT:-0}

if [ "$TOTAL_ADD" -gt "$TRY_COUNT" ]; then
    ERRORS+="DOCKVIEW SAFETY: Found $TOTAL_ADD addPanel() calls but only $TRY_COUNT try blocks. All addPanel() calls must have try-catch with a position-less fallback.\n"
fi

# Check 2: referencePanel should be validated before use
REF_USES=$(grep -c "referencePanel:" "$FILE_PATH" 2>/dev/null)
REF_USES=${REF_USES:-0}
HAS_GUARDS=$(grep -cE "addedIds\.|reAddedIds\.|panelExists|\.getPanel\(" "$FILE_PATH" 2>/dev/null)
HAS_GUARDS=${HAS_GUARDS:-0}

if [ "$REF_USES" -gt 0 ] && [ "$HAS_GUARDS" -eq 0 ]; then
    ERRORS+="DOCKVIEW SAFETY: Found $REF_USES referencePanel assignments but no validation guards (addedIds.has/panelExists/getPanel). Stale referencePanel IDs crash the app.\n"
fi

if [ -n "$ERRORS" ]; then
    echo -e "$ERRORS" >&2
    exit 2  # Block — tell Claude to fix
fi

exit 0
