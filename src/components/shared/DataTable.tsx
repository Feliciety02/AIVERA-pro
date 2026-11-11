import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type Row,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataStore } from "@/stores/dataStore";
import { cn } from "@/lib/utils";
import { EmptyState, TableSkeleton } from "./states";

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  initialSorting?: SortingState;
  loading?: boolean;
  empty?: React.ReactNode;
  pageSize?: number;
  className?: string;
  dense?: boolean;
  caption?: string;
}

export function DataTable<T>({ data, columns, getRowId, onRowClick, selectable, bulkActions, initialSorting = [], loading, empty, pageSize, className, dense, caption }: DataTableProps<T>) {
  const defaultPageSize = useDataStore((s) => s.settings.table.pageSize);
  const density = useDataStore((s) => s.settings.appearance.density);
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: pageSize ?? defaultPageSize });

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [data.length]);

  const selectColumn: ColumnDef<T, unknown> = React.useMemo(
    () => ({
      id: "__select",
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all rows on this page"
          checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => <Checkbox aria-label="Select row" checked={row.getIsSelected()} onClick={(e) => e.stopPropagation()} onCheckedChange={(v) => row.toggleSelected(!!v)} />,
    }),
    [],
  );

  const table = useReactTable({
    data,
    columns: selectable ? [selectColumn, ...columns] : columns,
    state: { sorting, rowSelection, pagination },
    getRowId: (row) => getRowId(row),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selected = table.getSelectedRowModel().rows.map((r: Row<T>) => r.original);
  const total = data.length;
  const { pageIndex, pageSize: size } = table.getState().pagination;
  const from = total === 0 ? 0 : pageIndex * size + 1;
  const to = Math.min(total, (pageIndex + 1) * size);
  const compact = dense || density === "compact";

  if (loading) return <TableSkeleton cols={Math.min(columns.length, 6)} />;

  return (
    <div className={cn("flex flex-col", className)}>
      {selectable && selected.length > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-3 py-2 text-xs animate-in fade-in-0">
          <span className="font-medium text-primary">{selected.length} selected</span>
          {bulkActions(selected, () => setRowSelection({}))}
        </div>
      )}
      {total === 0 ? (
        <div className="p-4">{empty ?? <EmptyState title="No records" description="Nothing matches the current filters." compact />}</div>
      ) : (
        <Table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button type="button" onClick={header.column.getToggleSortingHandler()} className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {dir === "asc" ? <ArrowUp className="size-3" /> : dir === "desc" ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === "Enter" ? onRowClick(row.original) : undefined) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(onRowClick && "cursor-pointer focus-visible:bg-accent/50 focus-visible:outline-none")}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cn(compact && "py-1.5")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {total > 0 && (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing <span className="font-medium text-foreground">{from}, {to}</span> of <span className="font-medium text-foreground">{total}</span>
          </span>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows</span>
            <Select value={String(size)} onValueChange={(v) => table.setPageSize(Number(v))}>
              <SelectTrigger className="h-7 w-16 text-xs" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 20, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              Page {pageIndex + 1} of {Math.max(1, table.getPageCount())}
            </span>
            <Button variant="outline" size="icon-sm" className="size-7" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" className="size-7" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
