import { useState } from "react";
import { differenceInYears, format as dateFmt, parseISO } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";
import { DashboardLayout }   from "@/components/DashboardLayout";
import { Breadcrumbs }       from "@/components/Breadcrumbs";
import { StatusBadge }       from "@/components/StatusBadge";
import { Button }            from "@/components/ui/button";
import { Input }             from "@/components/ui/input";
import { PasswordInput }    from "@/components/PasswordInput";
import { Label }             from "@/components/ui/label";
import { Switch }            from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress }          from "@/components/ui/progress";
import { useLanguage }       from "@/hooks/use-language";
import { useAuth }           from "@/hooks/use-auth";
import { apiClient }         from "@/lib/api";
import { useParams, useNavigate } from "react-router-dom";
import { toast }             from "sonner";
import { cn }               from "@/lib/utils";
import {
  ArrowLeft, Phone, Calendar, Users, Clock,
  Pencil, Save, X, BookOpen, Loader2, Trash2, KeyRound, CheckCircle2,
  User, Briefcase, Coins,
} from "lucide-react";
import { SalaryBreakdownCard } from "@/components/salary/SalaryBreakdownCard";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useTeacher, useUpdateTeacher, useDeleteTeacher, fullName,
} from "@/hooks/use-teachers";
import {
  useGroups, expandDays, daysLabel, type DaysType,
} from "@/hooks/use-groups";

const DAY_KEY: Record<string, string> = {
  Mon: "weekday.short.mon",
  Tue: "weekday.short.tue",
  Wed: "weekday.short.wed",
  Thu: "weekday.short.thu",
  Fri: "weekday.short.fri",
  Sat: "weekday.short.sat",
  Sun: "weekday.short.sun",
};

const METRICS_ENABLED = import.meta.env.VITE_TEACHER_METRICS_ENABLED === "true";
const mockMetricKeys = [
  { labelKey: "teacherProfile.metricAttendance", value: 96 },
  { labelKey: "teacherProfile.metricCompletion", value: 89 },
  { labelKey: "teacherProfile.metricAvgScore",   value: 78 },
  { labelKey: "teacherProfile.metricRetention",  value: 92 },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function TeacherProfile() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const { t }      = useLanguage();
  const { user }   = useAuth();

  const { data: teacher, isLoading, isError } = useTeacher(id!);
  const updateM = useUpdateTeacher();
  const deleteM = useDeleteTeacher();

  // Whose profile this is: another teacher viewed by admin / teacher viewing self / etc.
  const isAdmin    = user?.role === "admin";
  const isManager  = user?.role === "manager";
  const isSelf     = user?.role === "teacher" && user.teacherId === Number(id);
  const canManage  = isAdmin;            // edit/delete buttons
  const showSalaryTab = !isManager && (isAdmin || isSelf);
  const canChangeOwnPwd = isSelf;

  // Real groups taught by this teacher.
  // Drive query off the URL `id` directly so admins don't briefly see ALL
  // groups while the teacher object is still loading.
  const teacherIdNum = Number(id);
  const teacherGroupsQ = useGroups(
    { teacher_id: teacherIdNum, limit: 500 },
    { enabled: Number.isFinite(teacherIdNum) },
  );
  const teacherGroups = teacherGroupsQ.data?.items ?? [];

  // Adapter for "Groups" tab — keep field names existing JSX uses
  const realGroups = teacherGroups.map((g) => {
    const start = new Date(g.start_date).getTime();
    const end   = new Date(g.end_date).getTime();
    const now   = Date.now();
    const progress = !start || !end || end <= start
      ? 0
      : Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
    return {
      id: g.id,
      name: g.code,
      course: g.course_name ?? "—",
      students: g.student_count,
      maxStudents: g.max_students,
      level: g.course_name ?? "—",
      schedule: `${daysLabel(g.days as DaysType, t)} — ${g.time_slot}`,
      progress,
    };
  });

  // Adapter for "Schedule" tab — one row per day × group
  const realSchedule = teacherGroups.flatMap((g) =>
    expandDays(g.days as DaysType).map((d) => ({
      groupId:  g.id,
      day:      DAY_KEY[d] ? t(DAY_KEY[d]) : d,
      time:     g.time_slot,
      course:   g.course_name ?? "—",
      group:    g.code,
      students: g.student_count,
    })),
  );

  const totalStudents = teacherGroups.reduce((s, g) => s + g.student_count, 0);

  // ── edit form ──────────────────────────────────────────────────────────
  const [editOpen,    setEditOpen]    = useState(false);
  const [deleteOpen,  setDeleteOpen]  = useState(false);
  const [fLastName,   setFLastName]   = useState("");
  const [fFirstName,  setFFirstName]  = useState("");
  const [fMiddle,     setFMiddle]     = useState("");
  const [fPhone,      setFPhone]      = useState("");
  const [fActive,     setFActive]     = useState(true);
  const [fUsername,   setFUsername]   = useState("");
  const [fPassword,   setFPassword]   = useState("");
  const [fBirthDate,     setFBirthDate]     = useState("");
  const [fHireDate,      setFHireDate]      = useState("");
  const [fGender,        setFGender]        = useState<"male" | "female" | "">("");
  const [fSalMonthly,    setFSalMonthly]    = useState("0");
  const [fSalPercent,    setFSalPercent]    = useState("0");
  const [fSalPerLesson,  setFSalPerLesson]  = useState("0");
  const [fSalPerStudent, setFSalPerStudent] = useState("0");

  // ── change-password (self) ─────────────────────────────────────────────
  const [pwdOpen,     setPwdOpen]     = useState(false);
  const [pwdOld,      setPwdOld]      = useState("");
  const [pwdNew,      setPwdNew]      = useState("");
  const [pwdNew2,     setPwdNew2]     = useState("");
  const [pwdLoading,  setPwdLoading]  = useState(false);

  function openEdit() {
    if (!teacher) return;
    setFLastName(teacher.last_name);
    setFFirstName(teacher.first_name);
    setFMiddle(teacher.middle_name ?? "");
    setFPhone(teacher.phone ?? "");
    setFActive(teacher.is_active);
    setFUsername(teacher.username ?? "");
    setFPassword("");
    setFBirthDate(teacher.birth_date ?? "");
    setFHireDate(teacher.hire_date  ?? "");
    setFGender((teacher.gender as "male" | "female") ?? "");
    setFSalMonthly(String(teacher.salary_monthly ?? 0));
    setFSalPercent(String(teacher.salary_percent ?? 0));
    setFSalPerLesson(String(teacher.salary_per_lesson ?? 0));
    setFSalPerStudent(String(teacher.salary_per_student ?? 0));
    setEditOpen(true);
  }

  async function handleSave() {
    if (!teacher) return;
    const newUsername = fUsername.trim().toLowerCase();
    const newPassword = fPassword.trim();

    const parseInt0 = (v: string) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const parsePct = (v: string) => {
      const n = parseFloat(v.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) return 0;
      if (n > 100) return 100;
      return Math.round(n * 100) / 100;
    };

    const data: Record<string, unknown> = {
      last_name:   fLastName.trim(),
      first_name:  fFirstName.trim(),
      middle_name: fMiddle.trim() || null,
      phone:       fPhone.trim() || null,
      birth_date:  fBirthDate || null,
      hire_date:   fHireDate  || null,
      gender:      (fGender   || null) as "male" | "female" | null,
      salary_monthly:     parseInt0(fSalMonthly),
      salary_percent:     parsePct(fSalPercent),
      salary_per_lesson:  parseInt0(fSalPerLesson),
      salary_per_student: parseInt0(fSalPerStudent),
    };
    if (newUsername !== (teacher.username ?? "")) {
      data.username = newUsername || null;
    }
    if (newPassword) {
      data.password = newPassword;
    }

    try {
      await updateM.mutateAsync({ id: teacher.id, data });
      toast.success(t("teacherProfile.toastUpdated"));
      setEditOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function handleChangePassword() {
    if (pwdNew.length < 6) {
      toast.error(t("teacherProfile.toastPwdMinLen"));
      return;
    }
    if (pwdNew !== pwdNew2) {
      toast.error(t("teacherProfile.toastPwdMismatch"));
      return;
    }
    setPwdLoading(true);
    try {
      await apiClient.post<{ message: string }>("/auth/change-password", {
        old_password: pwdOld,
        new_password: pwdNew,
      });
      toast.success(t("teacherProfile.toastPwdChanged"));
      setPwdOpen(false);
      setPwdOld(""); setPwdNew(""); setPwdNew2("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setPwdLoading(false);
    }
  }

  async function handleDelete() {
    if (!teacher) return;
    try {
      await deleteM.mutateAsync(teacher.id);
      toast.success(t("teacherProfile.toastDeleted").replace("{{name}}", fullName(teacher)));
      navigate("/teachers");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  // ── loading / error ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !teacher) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p className="text-muted-foreground">{t("teacherProfile.notFound")}</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/teachers")}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> {t("teacherProfile.backToList")}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const initials = `${teacher.first_name[0]}${teacher.last_name[0]}`;
  const name     = fullName(teacher);
  const since    = new Date(teacher.created_at);

  function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    try { return dateFmt(parseISO(iso), "d MMM yyyy", { locale: ruLocale }); }
    catch { return "—"; }
  }

  function calcAge(iso: string | null): string {
    if (!iso) return "";
    try {
      const age = differenceInYears(new Date(), parseISO(iso));
      return ` (${age}${t("teacherProfile.ageYearsSuffix")})`;
    } catch { return ""; }
  }

  const genderLabel = teacher.gender === "male"
    ? t("teachers.genderMale")
    : teacher.gender === "female"
      ? t("teachers.genderFemale")
      : null;
  const GenderIcon  = User;

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <Breadcrumbs items={
          isAdmin
            ? [{ label: t("teachers.title"), href: "/teachers" }, { label: name }]
            : [{ label: name }]
        } />

        {isAdmin && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground -mt-2"
            onClick={() => navigate("/teachers")}>
            <ArrowLeft className="h-3.5 w-3.5" /> {t("teacherProfile.backToTeachers")}
          </Button>
        )}

        {/* ── Profile header ─────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border/60 bg-card shadow-sm animate-fade-in overflow-hidden">
          {/* Top bar: avatar + name + actions */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 p-4 sm:p-6 border-b border-border/40">
            {/* Avatar */}
            <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary text-xl sm:text-2xl font-bold shrink-0 select-none overflow-hidden">
              {teacher.avatar_base64 ? (
                <img src={teacher.avatar_base64} alt={name} className="h-full w-full object-cover" />
              ) : initials}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold text-foreground">{name}</h1>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StatusBadge status={teacher.is_active ? "active" : "inactive"} />
                    {teacher.phone && (
                      <a href={`tel:${teacher.phone.replace(/\s/g, "")}`}
                        className="flex items-center gap-1.5 text-sm font-mono text-primary hover:underline transition-colors">
                        <Phone className="h-3.5 w-3.5" /> {teacher.phone}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canChangeOwnPwd && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setPwdOpen(true)}>
                      <KeyRound className="h-3 w-3" /> {t("teacherProfile.changePassword")}
                    </Button>
                  )}
                  {canManage && (
                    <>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={openEdit}>
                        <Pencil className="h-3 w-3" /> {t("common.edit")}
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteOpen(true)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-border/40 border-b border-border/40">
            {[
              {
                icon: Calendar,
                label: t("teachers.birthDate"),
                value: teacher.birth_date
                  ? `${fmtDate(teacher.birth_date)}${calcAge(teacher.birth_date)}`
                  : "—",
              },
              {
                icon: Briefcase,
                label: t("teacherProfile.fieldHired"),
                value: fmtDate(teacher.hire_date),
              },
              {
                icon: GenderIcon,
                label: t("teachers.genderLabel"),
                value: genderLabel ?? "—",
              },
              {
                icon: Clock,
                label: t("teacherProfile.memberSince"),
                value: dateFmt(since, "d MMM yyyy", { locale: ruLocale }),
              },
            ].map(({ icon: Icon, label, value }, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground leading-none mb-1">{label}</p>
                  <p className="text-sm font-medium text-foreground truncate">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 divide-x divide-border/40">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <Users className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-none mb-1">{t("teacherProfile.statsGroups")}</p>
                <p className="text-sm font-bold text-foreground">{realGroups.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 shrink-0">
                <User className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-none mb-1">{t("teacherProfile.statsStudents")}</p>
                <p className="text-sm font-bold text-foreground">{totalStudents}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <Tabs defaultValue="schedule" className="space-y-3 sm:space-y-4">
          <TabsList className="bg-muted/50 w-full sm:w-auto flex">
            <TabsTrigger value="schedule" className="text-xs gap-1.5 data-[state=active]:bg-card flex-1 sm:flex-none">
              <Clock className="h-3.5 w-3.5" /> {t("teacherProfile.tabSchedule")}
            </TabsTrigger>
            <TabsTrigger value="groups" className="text-xs gap-1.5 data-[state=active]:bg-card flex-1 sm:flex-none">
              <Users className="h-3.5 w-3.5" /> {t("teacherProfile.tabGroups")}
            </TabsTrigger>
            {showSalaryTab && (
              <TabsTrigger value="salary" className="text-xs gap-1.5 data-[state=active]:bg-card flex-1 sm:flex-none">
                <Coins className="h-3.5 w-3.5" /> {t("salary.calculation")}
              </TabsTrigger>
            )}
            {METRICS_ENABLED && (
              <TabsTrigger value="performance" className="text-xs gap-1.5 data-[state=active]:bg-card flex-1 sm:flex-none">
                <BookOpen className="h-3.5 w-3.5" /> {t("teacherProfile.tabPerformance")}
              </TabsTrigger>
            )}
          </TabsList>

          {/* Schedule */}
          <TabsContent value="schedule">
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">{t("teacherProfile.colDay")}</TableHead>
                    <TableHead className="font-semibold">{t("teacherProfile.colTime")}</TableHead>
                    <TableHead className="font-semibold">{t("teacherProfile.colCourse")}</TableHead>
                    <TableHead className="font-semibold hidden sm:table-cell">{t("teacherProfile.colGroup")}</TableHead>
                    <TableHead className="font-semibold hidden md:table-cell">{t("teacherProfile.colStudents")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {realSchedule.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                        {t("teacherProfile.noGroupsYet")}
                      </TableCell>
                    </TableRow>
                  )}
                  {realSchedule.map((s, i) => (
                    <TableRow
                      key={i}
                      className="animate-fade-in cursor-pointer hover:bg-muted/30"
                      style={{ animationDelay: `${i * 30}ms` }}
                      onClick={() => navigate(`/groups/${s.groupId}`)}
                    >
                      <TableCell className="text-sm font-semibold text-foreground">{s.day}</TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground whitespace-nowrap">{s.time}</TableCell>
                      <TableCell className="text-sm text-foreground">{s.course}</TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{s.group}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-xs bg-muted rounded-full px-2 py-0.5">{s.students} {t("teacherProfile.studentsAbbr")}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Groups */}
          <TabsContent value="groups">
            <div className="grid gap-3">
              {realGroups.length === 0 && (
                <div className="rounded-xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
                  {t("teacherProfile.noGroupsYet")}
                </div>
              )}
              {realGroups.map((group, i) => (
                <div
                  key={group.id}
                  className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm animate-fade-in cursor-pointer hover:bg-muted/30 transition-colors"
                  style={{ animationDelay: `${i * 60}ms` }}
                  onClick={() => navigate(`/groups/${group.id}`)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{group.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <Clock className="h-3 w-3" /> {group.schedule}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                        {group.level}
                      </span>
                      <span className="text-xs text-muted-foreground">{group.students}/{group.maxStudents} {t("teacherProfile.studentsLong")}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t("teacherProfile.courseProgress")}</span>
                      <span className="font-semibold text-foreground">{group.progress}%</span>
                    </div>
                    <Progress value={group.progress} className="h-2" />
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Salary — admin (any teacher) or teacher viewing self — not managers */}
          {showSalaryTab && (
            <TabsContent value="salary">
              <SalaryBreakdownCard teacherId={teacher.id} />
            </TabsContent>
          )}

          {/* Performance — gated by VITE_TEACHER_METRICS_ENABLED until a real API ships */}
          {METRICS_ENABLED && (
            <TabsContent value="performance">
              <div className="grid gap-3 sm:grid-cols-2">
                {mockMetricKeys.map((m, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm animate-fade-in"
                    style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-foreground">{t(m.labelKey)}</p>
                      <span className={`text-lg font-bold ${m.value >= 90 ? "text-success" : m.value >= 75 ? "text-warning" : "text-destructive"}`}>
                        {m.value}%
                      </span>
                    </div>
                    <Progress value={m.value} className="h-2" />
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* ── Edit dialog ────────────────────────────────────────────────── */}
        <Dialog open={editOpen} onOpenChange={(open) => !open && setEditOpen(false)}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("teacherProfile.dialogEditTitle")}</DialogTitle>
              <DialogDescription className="sr-only">{t("teacherProfile.dialogEditDescription")}</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ep-last">{t("teachers.lastName")} *</Label>
                <Input id="ep-last" value={fLastName} onChange={(e) => setFLastName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ep-first">{t("teachers.firstName")} *</Label>
                <Input id="ep-first" value={fFirstName} onChange={(e) => setFFirstName(e.target.value)} />
              </div>
              <div className="grid gap-1.5 col-span-2">
                <Label htmlFor="ep-mid">{t("teachers.middleName")}</Label>
                <Input id="ep-mid" value={fMiddle} onChange={(e) => setFMiddle(e.target.value)} />
              </div>
              <div className="grid gap-1.5 col-span-2">
                <Label htmlFor="ep-phone">{t("students.phone")}</Label>
                <Input id="ep-phone" placeholder="+998 90 123 4567" value={fPhone} onChange={(e) => setFPhone(e.target.value)} />
              </div>

              {/* Birth date / Hire date */}
              <div className="grid gap-1.5">
                <Label htmlFor="ep-birth">{t("teachers.birthDate")}</Label>
                <Input id="ep-birth" type="date" value={fBirthDate} onChange={(e) => setFBirthDate(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ep-hire">{t("teachers.hireDate")}</Label>
                <Input id="ep-hire" type="date" value={fHireDate} onChange={(e) => setFHireDate(e.target.value)} />
              </div>

              {/* Gender */}
              <div className="col-span-2 grid gap-1.5">
                <Label>{t("teachers.genderLabel")}</Label>
                <div className="flex gap-2">
                  {(["male", "female"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFGender(fGender === g ? "" : g)}
                      className={cn(
                        "flex-1 rounded-lg border py-2 text-sm font-medium transition-all",
                        fGender === g
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground hover:border-primary/40"
                      )}
                    >
                      {g === "male" ? t("teachers.genderMale") : t("teachers.genderFemale")}
                    </button>
                  ))}
                </div>
              </div>
              {/* Active toggle removed — handled via employee list */}

              {/* Salary rates ─────────────────────────────────────────── */}
              <div className="col-span-2 mt-1 rounded-lg border border-border/60 p-3 space-y-3">
                <div>
                  <p className="text-sm font-semibold">{t("salary.section")}</p>
                  <p className="text-xs text-muted-foreground">{t("salary.sectionHelp")}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="ep-sal-monthly">{t("salary.monthly")}</Label>
                    <Input
                      id="ep-sal-monthly" type="number" inputMode="numeric"
                      min={0} step={1}
                      value={fSalMonthly}
                      onChange={(e) => setFSalMonthly(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ep-sal-percent">{t("salary.percent")}</Label>
                    <Input
                      id="ep-sal-percent" type="number" inputMode="decimal"
                      min={0} max={100} step={0.5}
                      value={fSalPercent}
                      onChange={(e) => setFSalPercent(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ep-sal-lesson">{t("salary.perLesson")}</Label>
                    <Input
                      id="ep-sal-lesson" type="number" inputMode="numeric"
                      min={0} step={1}
                      value={fSalPerLesson}
                      onChange={(e) => setFSalPerLesson(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ep-sal-student">{t("salary.perStudent")}</Label>
                    <Input
                      id="ep-sal-student" type="number" inputMode="numeric"
                      min={0} step={1}
                      value={fSalPerStudent}
                      onChange={(e) => setFSalPerStudent(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="col-span-2 mt-1 rounded-lg border border-border/60 p-3 space-y-3">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" /> {t("teacherProfile.credentialsSection")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("teacherProfile.credentialsHelp")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="ep-username">{t("teachers.login")}</Label>
                    <Input
                      id="ep-username"
                      placeholder={t("teacherProfile.usernamePlaceholder")}
                      autoComplete="off"
                      value={fUsername}
                      onChange={(e) => setFUsername(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ep-password">{t("teacherProfile.newPasswordLabel")}</Label>
                    <PasswordInput
                      id="ep-password"
                      placeholder="••••••"
                      autoComplete="new-password"
                      value={fPassword}
                      onChange={(e) => setFPassword(e.target.value)}
                    />
                  </div>
                </div>
                {teacher.has_account && (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {t("teacherProfile.accountExistsNote")}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={updateM.isPending}>
                <X className="h-3.5 w-3.5 mr-1.5" /> {t("common.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={updateM.isPending || !fFirstName.trim() || !fLastName.trim()}>
                {updateM.isPending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />{t("common.saving")}</>
                  : <><Save className="h-3.5 w-3.5 mr-1.5" />{t("common.save")}</>
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Change own password (teacher self-service) ─────────────────── */}
        <Dialog open={pwdOpen} onOpenChange={(o) => { if (!o) setPwdOpen(false); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> {t("teacherProfile.changePassword")}
              </DialogTitle>
              <DialogDescription className="sr-only">{t("teacherProfile.dialogChangePwdDescription")}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pwd-old">{t("teacherProfile.currentPasswordLabel")}</Label>
                <Input
                  id="pwd-old"
                  type="password"
                  autoComplete="current-password"
                  value={pwdOld}
                  onChange={(e) => setPwdOld(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pwd-new">{t("teacherProfile.newPasswordLabel")}</Label>
                <Input
                  id="pwd-new"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("teacherProfile.passwordPlaceholderMin")}
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pwd-new2">{t("teacherProfile.confirmNewPasswordLabel")}</Label>
                <Input
                  id="pwd-new2"
                  type="password"
                  autoComplete="new-password"
                  value={pwdNew2}
                  onChange={(e) => setPwdNew2(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPwdOpen(false)} disabled={pwdLoading}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleChangePassword} disabled={pwdLoading || !pwdOld || !pwdNew}>
                {pwdLoading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />{t("common.saving")}</>
                  : t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete confirm ─────────────────────────────────────────────── */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("teacherProfile.deleteConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("teacherProfile.deleteConfirmDescription").replace("{{name}}", name)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteM.isPending}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteM.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteM.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("common.deleting")}</>
                  : t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
