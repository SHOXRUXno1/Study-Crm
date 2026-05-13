import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/use-language";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, BookOpen, CalendarDays, Plus, Activity,
  Pencil, Trash2, Loader2, Users, ExternalLink,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useCourse, useUpdateCourse, useDeleteCourse } from "@/hooks/use-courses";
import { useGroups, daysLabel } from "@/hooks/use-groups";

export default function CourseProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const { data: course, isLoading, isError } = useCourse(id!);
  const updateM = useUpdateCourse();
  const deleteM = useDeleteCourse();

  const { data: groupsData, isLoading: groupsLoading } = useGroups(
    course ? { course_id: course.id, limit: 100 } : {},
  );
  const courseGroups = groupsData?.items ?? [];

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [editName, setEditName]     = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  const openEditDialog = () => {
    if (!course) return;
    setEditName(course.name);
    setEditDescription(course.description ?? "");
    setEditIsActive(course.is_active);
    setEditOpen(true);
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!course) return;
    try {
      await updateM.mutateAsync({
        id: course.id,
        data: { name: editName.trim(), description: editDescription.trim() || null, is_active: editIsActive },
      });
      toast.success(t("courses.courseUpdated"));
      setEditOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  async function handleDelete() {
    if (!course) return;
    try {
      await deleteM.mutateAsync(course.id);
      toast.success(t("courses.courseDeleted"));
      setDeleteOpen(false);
      navigate("/courses");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !course) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">{t("courses.noCourses")}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/courses")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> {t("courses.title")}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const fillPercent = (s: number, m: number) => Math.round((s / m) * 100);

  const activeGroupsCount = courseGroups.filter((g) => g.status === "active").length;

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">
        <Breadcrumbs
          items={[
            { label: t("courses.title"), href: "/courses" },
            { label: course.name },
          ]}
        />

        {/* Back + Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 -mt-2">
          <div className="flex items-start gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 mt-0.5"
              onClick={() => navigate("/courses")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {course.name}
                </h1>
                <StatusBadge status={course.is_active ? "active" : "inactive"} />
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
                {course.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={openEditDialog}>
              <Pencil className="h-3.5 w-3.5" /> {t("courses.edit")}
            </Button>
            <Button variant="outline" size="sm" className="text-xs gap-1.5 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> {t("courses.delete")}
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t("courses.groupsLabel"),  value: courseGroups.length,   icon: BookOpen,     color: "text-primary"     },
            { label: t("groups.activeGroups"),   value: activeGroupsCount,     icon: CalendarDays, color: "text-emerald-600" },
            { label: t("courses.status"),        value: t(`courses.status${course.is_active ? "Active" : "Inactive"}`), icon: Activity, color: "text-amber-600" },
          ].map((kpi, i) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 shadow-sm animate-fade-in"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                <span className="text-[10px] sm:text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-lg sm:text-xl font-bold text-foreground">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Groups Table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">
              {t("courses.groupsLabel")}
              {!groupsLoading && (
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  ({courseGroups.length})
                </span>
              )}
            </h2>
            <Button size="sm" className="text-xs gap-1.5" onClick={() => navigate("/groups")}>
              <Plus className="h-3.5 w-3.5" /> {t("groups.addGroup")}
            </Button>
          </div>

          {groupsLoading ? (
            <div className="rounded-xl border border-border/60 bg-card p-10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : courseGroups.length > 0 ? (
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold">{t("groups.groupName")}</TableHead>
                    <TableHead className="text-xs font-semibold">{t("groups.teacher")}</TableHead>
                    <TableHead className="text-xs font-semibold">{t("groups.studentsCol")}</TableHead>
                    <TableHead className="text-xs font-semibold hidden sm:table-cell">{t("groups.days")}</TableHead>
                    <TableHead className="text-xs font-semibold hidden sm:table-cell">{t("groups.timeSlot")}</TableHead>
                    <TableHead className="text-xs font-semibold">{t("groups.status")}</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courseGroups.map((g) => {
                    const pct = fillPercent(g.student_count, g.max_students);
                    return (
                      <TableRow
                        key={g.id}
                        className="transition-colors hover:bg-muted/30 cursor-pointer group"
                        onClick={() => navigate(`/groups/${g.id}`)}
                      >
                        <TableCell>
                          <p className="text-sm font-medium text-foreground">{g.code}</p>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {g.teacher_name ?? <span className="italic text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-primary"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <Users className="h-3 w-3" />
                              {g.student_count}/{g.max_students}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-xs text-muted-foreground">{daysLabel(g.days, t)}</span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-xs text-muted-foreground">{g.time_slot}</span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={g.status} />
                        </TableCell>
                        <TableCell>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("courses.noGroups")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Course Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("courses.editCourse")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>{t("courses.courseName")}</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} required maxLength={120} />
              </div>
              <div className="grid gap-2">
                <Label>{t("courses.description")}</Label>
                <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                <div>
                  <p className="text-sm font-medium">{t("courses.activeCourseTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("courses.activeCourseHint")}</p>
                </div>
                <Switch checked={editIsActive} onCheckedChange={setEditIsActive} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={updateM.isPending || !editName.trim()}>
                {updateM.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("courses.deleteCourse")}</AlertDialogTitle>
            <AlertDialogDescription>{t("courses.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteM.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteM.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
