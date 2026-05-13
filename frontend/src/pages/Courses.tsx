import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, CheckCircle, ChevronLeft, ChevronRight,
  MoreHorizontal, Pencil, Plus, Search, Trash2, Eye,
} from "lucide-react";
import { toast } from "sonner";

import { Button }        from "@/components/ui/button";
import { Input }         from "@/components/ui/input";
import { Label }         from "@/components/ui/label";
import { Switch }        from "@/components/ui/switch";
import { Textarea }      from "@/components/ui/textarea";
import { Breadcrumbs }   from "@/components/Breadcrumbs";
import { StatusBadge }   from "@/components/StatusBadge";
import { useLanguage }   from "@/hooks/use-language";
import { useAuth }       from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  useCourses, useCreateCourse, useUpdateCourse, useDeleteCourse,
  type CourseRead,
} from "@/hooks/use-courses";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 8;

export default function Courses() {
  const { t }    = useLanguage();
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const navigate = useNavigate();

  // ── filters ───────────────────────────────────────────────────────────────
  const [search, setSearch]             = useState("");
  const [status, setStatus]             = useState<"all" | "active" | "inactive">("all");
  const [page, setPage]                 = useState(1);
  const q = useDebouncedValue(search.trim(), 300);

  // ── create ────────────────────────────────────────────────────────────────
  const [addOpen, setAddOpen]   = useState(false);
  const [addName, setAddName]   = useState("");
  const [addDesc, setAddDesc]   = useState("");

  // ── edit ──────────────────────────────────────────────────────────────────
  const [editing, setEditing]         = useState<CourseRead | null>(null);
  const [eName, setEName]             = useState("");
  const [eDesc, setEDesc]             = useState("");
  const [eActive, setEActive]         = useState(true);

  // ── delete ────────────────────────────────────────────────────────────────
  const [deleting, setDeleting] = useState<CourseRead | null>(null);

  // ── API queries ───────────────────────────────────────────────────────────
  const allQ = useCourses({ limit: 1000 });

  const listP: Parameters<typeof useCourses>[0] = { limit: 1000 };
  if (q)                listP.search    = q;
  if (status === "active")   listP.is_active = true;
  if (status === "inactive") listP.is_active = false;
  const listQ = useCourses(listP);

  const rows       = listQ.data?.items ?? [];
  const totalRows  = listQ.data?.total  ?? 0;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const paged      = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── mutations ─────────────────────────────────────────────────────────────
  const createM = useCreateCourse();
  const updateM = useUpdateCourse();
  const deleteM = useDeleteCourse();

  // ── handlers ──────────────────────────────────────────────────────────────
  async function submitCreate() {
    if (!addName.trim()) return;
    try {
      await createM.mutateAsync({ name: addName.trim(), description: addDesc.trim() || null });
      toast.success(t("courses.toastCreated"));
      setAddOpen(false); setAddName(""); setAddDesc("");
    } catch (e) { toast.error(e instanceof Error ? e.message : t("common.error")); }
  }

  function openEdit(c: CourseRead) {
    setEditing(c); setEName(c.name); setEDesc(c.description ?? ""); setEActive(c.is_active);
  }

  async function submitEdit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editing) return;
    try {
      await updateM.mutateAsync({
        id: editing.id,
        data: { name: eName.trim(), description: eDesc.trim() || null, is_active: eActive },
      });
      toast.success(t("courses.courseUpdated"));
      setEditing(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("common.error")); }
  }

  async function submitDelete() {
    if (!deleting) return;
    try {
      await deleteM.mutateAsync(deleting.id);
      toast.success(t("courses.courseDeleted"));
      setDeleting(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("common.error")); }
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      <Breadcrumbs items={[{ label: t("courses.title") }]} />

      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("courses.title")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("courses.subtitle")}</p>
        </div>

        {/* create dialog */}
        <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setAddName(""); setAddDesc(""); } }}>
          {!isManager && (
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 self-start sm:self-auto">
                <Plus className="h-4 w-4" /> {t("courses.addCourse")}
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{t("courses.addCourse")}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>{t("courses.courseName")} *</Label>
                <Input
                  value={addName} onChange={e => setAddName(e.target.value)}
                  placeholder={t("courses.coursePlaceholder")} maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("courses.description")}</Label>
                <Textarea
                  value={addDesc} onChange={e => setAddDesc(e.target.value)}
                  placeholder={t("courses.descPlaceholder")} rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={submitCreate} disabled={createM.isPending || !addName.trim()}>
                {createM.isPending ? t("courses.creating") : t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {[
          { label: t("courses.totalCourses"),     value: allQ.data?.total ?? 0, icon: BookOpen,    color: "text-primary"     },
          { label: t("courses.activeKpiLabel"),   value: (allQ.data?.items ?? []).filter(c => c.is_active).length, icon: CheckCircle, color: "text-emerald-600" },
        ].map((k, i) => (
          <div key={k.label} className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <k.icon className={`h-4 w-4 ${k.color}`} />
              <span className="text-[10px] sm:text-xs text-muted-foreground">{k.label}</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold">{k.value}</p>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="stat-card">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9" placeholder={t("courses.searchPlaceholder")}
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={status} onValueChange={v => { setStatus(v as typeof status); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("courses.allStatuses")}</SelectItem>
              <SelectItem value="active">{t("courses.statusActive")}</SelectItem>
              <SelectItem value="inactive">{t("courses.statusInactive")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* table */}
      <div className="stat-card p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold">{t("courses.courseName")}</TableHead>
              <TableHead className="font-semibold hidden sm:table-cell">{t("courses.description")}</TableHead>
              <TableHead className="font-semibold">{t("courses.status")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <span className="animate-pulse text-muted-foreground text-sm">{t("common.loading")}</span>
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">{t("courses.noCourses")}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : paged.map((c, i) => (
              <TableRow
                key={c.id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => navigate(`/courses/${c.id}`)}
              >
                <TableCell>
                  <span className="text-sm font-medium">{c.name}</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell max-w-xs">
                  {c.description
                    ? <span className="text-sm text-muted-foreground line-clamp-1">{c.description}</span>
                    : <span className="text-sm text-muted-foreground italic">—</span>
                  }
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.is_active ? "active" : "inactive"} />
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/courses/${c.id}`)}>
                        <Eye className="mr-2 h-3.5 w-3.5" /> {t("courses.view")}
                      </DropdownMenuItem>
                      {!isManager && (
                        <>
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> {t("common.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(c)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("common.delete")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {totalRows > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)} {t("common.of")} {totalRows}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => (
                <Button key={i} variant={page === i + 1 ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs p-0" onClick={() => setPage(i + 1)}>
                  {i + 1}
                </Button>
              ))}
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* edit dialog */}
      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("courses.editCourse")}</DialogTitle></DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="en">{t("courses.courseName")} *</Label>
              <Input id="en" value={eName} onChange={e => setEName(e.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed">{t("courses.description")}</Label>
              <Textarea id="ed" value={eDesc} onChange={e => setEDesc(e.target.value)} rows={3} placeholder={t("courses.descPlaceholder")} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
              <div>
                <p className="text-sm font-medium">{t("courses.activeCourseTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("courses.activeCourseHint")}</p>
              </div>
              <Switch checked={eActive} onCheckedChange={setEActive} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={updateM.isPending || !eName.trim()}>
                {updateM.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={open => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("courses.deleteTitleHard")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("courses.deleteDescription").replace("{{name}}", deleting?.name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={submitDelete}
              disabled={deleteM.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteM.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
