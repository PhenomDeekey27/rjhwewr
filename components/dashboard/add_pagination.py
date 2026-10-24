#!/usr/bin/env python3
import sys

# Read the file
with open('components/dashboard/DataExplorerTable.tsx', 'r') as f:
    content = f.read()

# 1. Add pagination computation after sortedRows useMemo
old1 = """  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compare(a, b, sortKey, sortDirection)),
    [rows, sortKey, sortDirection],
  );

  const toggleSort = (key: SortKey) => {"""

new1 = """  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compare(a, b, sortKey, sortDirection)),
    [rows, sortKey, sortDirection],
  );

  // Pagination
  const page = pagination?.page ?? 1;
  const perPage = pagination?.perPage ?? 50;
  const totalRecords = pagination?.totalRecords ?? rows.length;
  const totalPages = pagination?.totalPages ?? Math.max(1, Math.ceil(totalRecords / perPage));
  const pageIndex = page - 1;
  const start = pageIndex * perPage;
  const end = start + perPage;
  const pagedRows = sortedRows.slice(start, end);

  const toggleSort = (key: SortKey) => {"""

if old1 in content:
    content = content.replace(old1, new1)
    print("Step 1: Added pagination computation")
else:
    print("Step 1: Could not find pattern 1")
    sys.exit(1)

# 2. Replace sortedRows.map with pagedRows.map in desktop tbody
old2 = "sortedRows.map((row, index) => ("
new2 = "pagedRows.map((row, index) => ("

content = content.replace(old2, new2)
print(f"Step 2: Replaced {old2.count('sortedRows.map') if old2 in content else 0} occurrences in desktop tbody")

# Actually, there are two occurrences - one in desktop and one in mobile
# Let me do them separately with context

# 3. Replace sortedRows.map with pagedRows.map in mobile section
# Find the mobile section sortedRows.map
old3_start = """      <ul className=\"divide-y divide-border-subtle\">"""
old3_mobile = "sortedRows.map((row, index) => ("
new3_mobile = "pagedRows.map((row, index) => ("

# Replace in mobile section (after the {state === "loading" ... ) block)
# Actually, let me just replace all sortedRows.map with pagedRows.map for simplicity
# But that might break things if there are other uses...

# Let me be more careful - find the specific occurrence in mobile
import re
# The mobile section has: {state === "loading" ? ... : ( sortedRows.map(...) }
# Let me replace only the one in the mobile ul

# Actually, let me just do a global replace but check first
count_sorted = content.count("sortedRows.map")
count_paged = content.count("pagedRows.map")
print(f"Current sortedRows.map count: {count_sorted}, pagedRows.map count: {count_paged}")

# For now, let me just note this and proceed with other changes
# The key changes are: pagination computation, and then the count/text at bottom

# 4. Update the "interval records" count to use pagedRows.length
old4 = "`${sortedRows.length.toLocaleString(\"en-GB\")} interval ${\n                sortedRows.length === 1 ? \"record\" : \"records\"\n              }`"
new4 = "`${pagedRows.length.toLocaleString(\"en-GB\")} interval ${\n                pagedRows.length === 1 ? \"record\" : \"records\"}`"

# This is tricky because of the template literal, let me just replace the variable name
# Actually the issue is the template literal with backticks and ${}
# Let me just replace sortedRows.length with pagedRows.length in the count span

# Replace sortedRows.length with pagedRows.length in the count line
content = content.replace("sortedRows.length", "pagedRows.length")

print("Step 4: Replaced sortedRows.length with pagedRows.length in count")

# 5. Add pagination controls at the bottom
# This is the complex part - adding Previous/Next, page info, per-page selector
# I'll add it after the existing bottom div and before the closing );

# Find the closing pattern: the last </div> before );
bottom_pattern = "      </div>\n    </div>\n  );"
new_bottom = """      {/* Pagination controls */}
      <div className=\"flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-3 py-2.5 text-[11px] leading-4 text-text-tertiary sm:px-4\">
        <span>
          Showing {(start + 1).toLocaleString(\"en-GB\")}–{(end > totalRecords ? totalRecords : end).toLocaleString(\"en-GB\")} of {totalRecords.toLocaleString(\"en-GB\")} interval {(totalRecords === 1 ? \"record\" : \"records\")}
        </span>
        <span className=\"flex flex-wrap items-center gap-x-3 gap-y-1\">
          <span>Delivery time in {timeZoneLabel}</span>
          <span aria-hidden=\"true\">·</span>
          <span>“—” means unavailable, never zero</span>
        </span>
        {/* Prev button */}
        <button
          disabled={page <= 1}
          onClick={() => onPageChange?.(page - 1)}
          className="rounded-sm border border-border-default bg-surface px-2.5 py-1.5 text-[10px] hover:bg-surface-subtle"
          aria-label="Previous page"
        >
          Previous
        </button>
        {/* Page numbers */}
        {[1, totalPages].map((p) => (
          <button
            key={p}
            disabled={p === page}
            onClick={() => onPageChange?.(p)}
            className={cn("rounded-sm border border-border-default bg-surface px-2.5 py-1.5 text-[10px] hover:bg-surface-subtle", p === page && "bg-primary-100 text-primary")}
          >
            {p}
          </button>
        ))}...
        {/* Next button */}
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange?.(page + 1)}
          className="rounded-sm border border-border-default bg-surface px-2.5 py-1.5 text-[10px] hover:bg-surface-subtle"
          aria-label="Next page"
        >
          Next
        </button>
        {/* Per-page selector */}
        <select
          value={perPage}
          onChange={(e) => onPerPageChange?.(Number(e.target.value))}
          className="rounded-sm border border-border-default bg-surface px-2 py-1 text-[10px]"
        >
          <option value={25}>25</option>
          <option value={50} selected>{50}</option>
          <option value={100}>100</option>
        </select>
        {totalPages} page{s}{(totalPages === 1 ? "" : "s")}
      </div>"""

if bottom_pattern in content:
    content = content.replace(bottom_pattern, new_bottom)
    print("Step 5: Added pagination controls")
else:
    print("Step 5: Could not find bottom pattern")
    # Try to find and print what's around line 450
    lines = content.split('\n')
    for i in range(440, 460):
        print(f"Line {i}: {lines[i][:80]}")

# Write the file
with open('components/dashboard/DataExplorerTable.tsx', 'w') as f:
    f.write(content)

print("Done!")