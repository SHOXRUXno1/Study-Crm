import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ExportCenterState, ExportColumn, ExportFilterSummaryItem, ExportFormat, ExportSortOption } from "@/lib/export";

interface ExportCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  formats: ExportFormat[];
  columns: ExportColumn[];
  sortOptions: ExportSortOption[];
  filterSummary: ExportFilterSummaryItem[];
  onSubmit: (state: ExportCenterState) => void;
  submitLabel: string;
}

export function ExportCenter(props: ExportCenterProps) {
  const [format, setFormat] = useState<ExportFormat>(props.formats[0] ?? "csv");
  const [sort, setSort] = useState<string>(props.sortOptions[0]?.value ?? "default");
  const [scope, setScope] = useState<"filtered" | "all">("filtered");
  const defaultColumns = useMemo(
    () => props.columns.filter((c) => c.enabledByDefault !== false).map((c) => c.key),
    [props.columns],
  );
  const [columns, setColumns] = useState<string[]>(defaultColumns);

  useEffect(() => {
    if (!props.open) return;
    setFormat(props.formats[0] ?? "csv");
    setSort(props.sortOptions[0]?.value ?? "default");
    setScope("filtered");
    setColumns(defaultColumns);
  }, [props.open, props.formats, props.sortOptions, defaultColumns]);

  const toggleColumn = (key: string) => {
    setColumns((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={format} onValueChange={(value) => setFormat(value as ExportFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {props.formats.map((item) => (
                    <SelectItem key={item} value={item}>{item.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sort</Label>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {props.sortOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as "filtered" | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="filtered">Current filters</SelectItem>
                <SelectItem value="all">All available rows</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Columns</Label>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border/60 p-3">
              {props.columns.map((column) => (
                <label key={column.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={columns.includes(column.key)}
                    onCheckedChange={() => toggleColumn(column.key)}
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Active filter summary</p>
            <div className="mt-1 space-y-1 text-sm">
              {props.filterSummary.length === 0 ? (
                <p className="text-muted-foreground">No active filters</p>
              ) : props.filterSummary.map((item) => (
                <p key={item.label}>
                  <span className="text-muted-foreground">{item.label}:</span> {item.value}
                </p>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => props.onSubmit({ format, sort, scope, columns })}>
            {props.submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
