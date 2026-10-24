import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DataExplorerTable, type DataExplorerRow } from "./DataExplorerTable";

const createMockRows = (count: number): DataExplorerRow[] =>
  Array.from({ length: count }, (_, i) => ({
    deliveryTime: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    forecastPublished: `2025-12-31T20:00:00Z`,
    publicationLead: "120 min",
    forecastMw: 1000 + i * 10,
    actualMw: 950 + i * 10,
    errorMw: 50,
    matchStatus: "Source data only" as const,
    settlement: `2026-01-${String(i + 1).padStart(2, "0")} · P1`,
  }));

// Helper to get the desktop table rows (not mobile view)
const getTableRows = () => {
  const table = screen.getByRole("table");
  return Array.from(table.querySelectorAll("tbody tr"));
};

// Helper to get cell text by column index
const getCellText = (row: Element, index: number) => {
  const cells = row.querySelectorAll("td");
  return cells[index]?.textContent || "";
};

describe("DataExplorerTable pagination", () => {
  it("shows only first page by default", () => {
    const rows = createMockRows(100);
    render(<DataExplorerTable rows={rows} state="ready" />);

    // Should show first 50 rows in the desktop table
    const tableRows = getTableRows();
    expect(tableRows).toHaveLength(50);
  });

  it("shows correct page info in footer", () => {
    const rows = createMockRows(100);
    render(<DataExplorerTable rows={rows} state="ready" />);

    expect(screen.getByText(/Showing 1–50/)).toBeInTheDocument();
    expect(screen.getByText(/100 interval records/)).toBeInTheDocument();
  });

  it("navigates to next page", () => {
    const rows = createMockRows(100);
    render(<DataExplorerTable rows={rows} state="ready" />);

    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton);

    expect(screen.getByText(/Showing 51–100/)).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
  });

  it("navigates to previous page", () => {
    const rows = createMockRows(100);
    render(<DataExplorerTable rows={rows} state="ready" />);

    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton);

    const prevButton = screen.getByRole("button", { name: /previous/i });
    fireEvent.click(prevButton);

    expect(screen.getByText(/Showing 1–50/)).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
  });

  it("disables previous button on first page", () => {
    const rows = createMockRows(100);
    render(<DataExplorerTable rows={rows} state="ready" />);

    const prevButton = screen.getByRole("button", { name: /previous/i });
    expect(prevButton).toBeDisabled();
  });

  it("disables next button on last page", () => {
    const rows = createMockRows(100);
    render(<DataExplorerTable rows={rows} state="ready" />);

    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton);

    expect(nextButton).toBeDisabled();
  });

  it("changes page size and resets to page 1", () => {
    const rows = createMockRows(100);
    render(<DataExplorerTable rows={rows} state="ready" />);

    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton);
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();

    // Change page size to 25
    const pageSizeSelect = screen.getByRole("combobox", { name: /rows per page/i });
    fireEvent.change(pageSizeSelect, { target: { value: "25" } });

    expect(screen.getByText(/Showing 1–25/)).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 4/)).toBeInTheDocument();
  });

  it("shows correct total pages for 25 page size", () => {
    const rows = createMockRows(100);
    render(<DataExplorerTable rows={rows} state="ready" />);

    const pageSizeSelect = screen.getByRole("combobox", { name: /rows per page/i });
    fireEvent.change(pageSizeSelect, { target: { value: "25" } });

    expect(screen.getByText(/Page 1 of 4/)).toBeInTheDocument();
  });

  it("shows correct total pages for 100 page size", () => {
    const rows = createMockRows(100);
    render(<DataExplorerTable rows={rows} state="ready" />);

    const pageSizeSelect = screen.getByRole("combobox", { name: /rows per page/i });
    fireEvent.change(pageSizeSelect, { target: { value: "100" } });

    // The pagination controls should not show when there's only 1 page
    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1–100/)).toBeInTheDocument();
  });

  it("shows all rows when total rows less than page size", () => {
    const rows = createMockRows(25);
    render(<DataExplorerTable rows={rows} state="ready" />);

    expect(screen.getByText(/Showing 1–25/)).toBeInTheDocument();
    // No pagination controls when only 1 page
    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
  });

  it("shows empty state when no rows", () => {
    render(<DataExplorerTable rows={[]} state="ready" />);

    expect(screen.getByText(/No interval records loaded/)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<DataExplorerTable rows={[]} state="loading" />);

    expect(screen.getByText(/Loading interval records/)).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<DataExplorerTable rows={[]} state="error" />);

    expect(screen.getByText(/Records unavailable/)).toBeInTheDocument();
  });

  it("preserves all records in data when paginating", () => {
    const rows = createMockRows(100);
    render(<DataExplorerTable rows={rows} state="ready" />);

    // Total should be 100
    expect(screen.getByText(/100 interval records/)).toBeInTheDocument();

    // Go to page 2
    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton);

    // Total should still be 100
    expect(screen.getByText(/100 interval records/)).toBeInTheDocument();
  });

  it("handles empty results with filters active", () => {
    render(<DataExplorerTable rows={[]} state="ready" filtersActive={true} onClearFilters={vi.fn()} />);

    expect(screen.getByText(/No records match these filters/)).toBeInTheDocument();
  });

  it("calls onRowClick when row is clicked", () => {
    const rows = createMockRows(2);
    const onRowClick = vi.fn();
    render(<DataExplorerTable rows={rows} state="ready" onRowClick={onRowClick} />);

    const tableRows = getTableRows();
    fireEvent.click(tableRows[0]);

    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
});

describe("DataExplorerTable controlled (server) pagination", () => {
  const pageRows = createMockRows(100).slice(25, 50);
  const pagination = {
    page: 2,
    perPage: 25,
    totalRecords: 100,
    totalPages: 4,
  };

  it("renders exactly the supplied page without slicing it again", () => {
    render(
      <DataExplorerTable
        rows={pageRows}
        state="ready"
        pagination={pagination}
        onPageChange={vi.fn()}
        onPerPageChange={vi.fn()}
      />,
    );

    expect(getTableRows()).toHaveLength(25);
    expect(screen.getByText(/Showing 26–50 of 100/)).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 4/)).toBeInTheDocument();
    expect(getCellText(getTableRows()[0], 0)).toContain("2026-01-26");
  });

  it("requests the previous and next page through callbacks", () => {
    const onPageChange = vi.fn();
    render(
      <DataExplorerTable
        rows={pageRows}
        state="ready"
        pagination={pagination}
        onPageChange={onPageChange}
        onPerPageChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it("disables next on the last page and previous on the first", () => {
    const { rerender } = render(
      <DataExplorerTable
        rows={createMockRows(25)}
        state="ready"
        pagination={{ page: 4, perPage: 25, totalRecords: 100, totalPages: 4 }}
        onPageChange={vi.fn()}
        onPerPageChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /previous/i })).not.toBeDisabled();

    rerender(
      <DataExplorerTable
        rows={pageRows}
        state="ready"
        pagination={{ page: 1, perPage: 25, totalRecords: 100, totalPages: 4 }}
        onPageChange={vi.fn()}
        onPerPageChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  });

  it("reports page-size changes instead of slicing locally", () => {
    const onPerPageChange = vi.fn();
    render(
      <DataExplorerTable
        rows={pageRows}
        state="ready"
        pagination={pagination}
        onPageChange={vi.fn()}
        onPerPageChange={onPerPageChange}
      />,
    );

    fireEvent.change(
      screen.getByRole("combobox", { name: /rows per page/i }),
      { target: { value: "100" } },
    );

    expect(onPerPageChange).toHaveBeenCalledWith(100);
    expect(getTableRows()).toHaveLength(25);
  });

  it("delegates sorting and renders rows in server order", () => {
    const onSortChange = vi.fn();
    const unsorted = [
      { ...createMockRows(1)[0], deliveryTime: "2026-01-03T00:00:00Z" },
      { ...createMockRows(1)[0], deliveryTime: "2026-01-01T00:00:00Z" },
    ];
    render(
      <DataExplorerTable
        rows={unsorted}
        state="ready"
        pagination={{ page: 1, perPage: 25, totalRecords: 2, totalPages: 1 }}
        onPageChange={vi.fn()}
        onPerPageChange={vi.fn()}
        sort="deliveryTime"
        direction="asc"
        onSortChange={onSortChange}
      />,
    );

    // The server's order is kept until the server answers with a new sort.
    expect(getCellText(getTableRows()[0], 0)).toContain("2026-01-03");

    fireEvent.click(screen.getByRole("button", { name: /^Forecast MW$/i }));
    expect(onSortChange).toHaveBeenCalledWith("forecastMw", "asc");
    expect(getTableRows()).toHaveLength(2);
  });
});

describe("DataExplorerTable sorting", () => {
  it("sorts by delivery time ascending by default", () => {
    const rows = [
      { ...createMockRows(1)[0], deliveryTime: "2026-01-03T00:00:00Z" },
      { ...createMockRows(1)[0], deliveryTime: "2026-01-01T00:00:00Z" },
      { ...createMockRows(1)[0], deliveryTime: "2026-01-02T00:00:00Z" },
    ];
    render(<DataExplorerTable rows={rows} state="ready" />);

    const tableRows = getTableRows();
    expect(getCellText(tableRows[0], 0)).toContain("2026-01-01");
    expect(getCellText(tableRows[1], 0)).toContain("2026-01-02");
    expect(getCellText(tableRows[2], 0)).toContain("2026-01-03");
  });
});