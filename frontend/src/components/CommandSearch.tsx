import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";

import searchDuck from "@/assets/search-duck.png";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useRecentSearches, type RecentEntry, type RecentKind } from "@/hooks/use-recent-searches";
import { useStudents, fullName as studentFullName } from "@/hooks/use-students";
import { useTeachers, fullName as teacherFullName } from "@/hooks/use-teachers";
import { useGroups } from "@/hooks/use-groups";
import { useCourses } from "@/hooks/use-courses";
import { useRooms } from "@/hooks/use-rooms";
import type { UserRole } from "@/types/auth";
import { studentPrimaryTabs, studentSidebarSystemItems } from "@/config/student-nav";

import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardList,
  CreditCard,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  MapPin,
  Settings,
  Trash2,
  UserCheck,
  UserCircle,
  Users,
  UsersRound,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Icon = ComponentType<{ className?: string }>;

interface NavEntry {
  labelKey: string;
  path: string;
  icon: Icon;
  roles?: UserRole[];
}

const ALL_NAV: NavEntry[] = [
  { labelKey: "sidebar.dashboard",     path: "/",              icon: LayoutDashboard },
  { labelKey: "sidebar.students",      path: "/students",      icon: Users,         roles: ["admin", "teacher", "manager"] },
  { labelKey: "sidebar.teachers",      path: "/teachers",      icon: UserCheck,     roles: ["admin", "manager"] },
  { labelKey: "sidebar.groups",        path: "/groups",        icon: UsersRound,    roles: ["admin", "teacher", "manager"] },
  { labelKey: "sidebar.courses",       path: "/courses",       icon: BookOpen,      roles: ["admin", "manager"] },
  { labelKey: "sidebar.schedule",      path: "/schedule",      icon: CalendarDays,  roles: ["admin", "teacher", "manager"] },
  { labelKey: "sidebar.attendance",    path: "/journal",       icon: ClipboardList, roles: ["admin", "teacher", "manager"] },
  { labelKey: "settings.notifications", path: "/notifications", icon: Bell,        roles: ["admin", "teacher", "manager"] },
  { labelKey: "sidebar.rooms",         path: "/rooms",         icon: DoorOpen,      roles: ["admin", "manager"] },
  { labelKey: "sidebar.managers",      path: "/managers",       icon: Briefcase,      roles: ["admin"] },
  { labelKey: "sidebar.payments",      path: "/payments",      icon: CreditCard,    roles: ["admin"] },
  { labelKey: "sidebar.debtors",       path: "/debtors",       icon: AlertTriangle, roles: ["admin", "manager"] },
  { labelKey: "sidebar.analytics",     path: "/analytics",     icon: BarChart3,     roles: ["admin", "manager"] },
  { labelKey: "sidebar.profile",       path: "/profile",       icon: UserCircle,    roles: ["teacher"] },
  { labelKey: "sidebar.settings",      path: "/settings",      icon: Settings,      roles: ["admin", "teacher", "manager"] },
  ...studentPrimaryTabs.map((item) => ({
    labelKey: item.titleKey,
    path: item.path,
    icon: item.icon as Icon,
    roles: ["student"] as UserRole[],
  })),
  ...studentSidebarSystemItems.map((item) => ({
    labelKey: item.titleKey,
    path: item.path,
    icon: item.icon as Icon,
    roles: ["student"] as UserRole[],
  })),
];

const ICON_BY_KIND: Record<RecentKind, Icon> = {
  page:    LayoutDashboard,
  student: UserCircle,
  teacher: GraduationCap,
  group:   UsersRound,
  course:  BookOpen,
  room:    MapPin,
};

const RESULT_LIMIT = 5;
const DEBOUNCE_MS = 250;

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Highlights every case-insensitive match of `query` inside `text`. */
function Mark({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const safe = escapeRegExp(query.trim());
  if (!safe) return <>{text}</>;
  const parts = text.split(new RegExp(`(${safe})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.trim().toLowerCase() ? (
          <mark
            key={i}
            className="rounded-sm bg-primary/15 px-0.5 text-foreground"
          >
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function rolePages(role: UserRole | undefined): NavEntry[] {
  if (!role) return [];
  return ALL_NAV.filter((n) => !n.roles || n.roles.includes(role));
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const role = user?.role;
  const isStudent = role === "student";
  const isStaffSearch = role === "admin" || role === "manager";
  const { recent, addRecent, clearRecent } = useRecentSearches();

  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const hasQuery = debounced.length > 0;

  // Toggle on Cmd/Ctrl+K and reset query when closed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Server queries — only fired with a debounced query, role-gated.
  // Students don't have access to global directories; the cabinet only shows
  // their own data, so skip these fetches entirely.
  const studentsQ = useStudents(
    { search: debounced, limit: RESULT_LIMIT },
    { enabled: open && hasQuery && !isStudent },
  );
  const groupsQ = useGroups(
    { search: debounced, limit: RESULT_LIMIT },
    { enabled: open && hasQuery && !isStudent },
  );
  const teachersQ = useTeachers(
    { search: debounced, limit: RESULT_LIMIT },
    { enabled: open && hasQuery && isStaffSearch },
  );
  const coursesQ = useCourses(
    { search: debounced, limit: RESULT_LIMIT },
    { enabled: open && hasQuery && isStaffSearch },
  );
  const roomsQ = useRooms(
    { search: debounced, limit: RESULT_LIMIT },
    { enabled: open && hasQuery && isStaffSearch },
  );

  const pages = useMemo(() => rolePages(role), [role]);
  const filteredPages = useMemo(() => {
    if (!hasQuery) return pages;
    const q = debounced.toLowerCase();
    return pages.filter((p) => t(p.labelKey).toLowerCase().includes(q));
  }, [pages, hasQuery, debounced, t]);

  const isLoading =
    hasQuery &&
    (studentsQ.isFetching ||
      groupsQ.isFetching ||
      teachersQ.isFetching ||
      coursesQ.isFetching ||
      roomsQ.isFetching);

  const totalServerHits =
    (studentsQ.data?.items.length ?? 0) +
    (groupsQ.data?.items.length ?? 0) +
    (teachersQ.data?.items.length ?? 0) +
    (coursesQ.data?.items.length ?? 0) +
    (roomsQ.data?.items.length ?? 0);

  const showEmptyState =
    hasQuery && !isLoading && filteredPages.length === 0 && totalServerHits === 0;

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const go = (entry: Omit<RecentEntry, "ts">) => {
    addRecent(entry);
    setOpen(false);
    navigate(entry.path);
  };

  const goToListing = (path: string) => {
    setOpen(false);
    // Listing pages keep search in local state, so we don't append ?search=… here
    // to avoid implying a pre-filled filter that won't actually populate.
    navigate(path);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg sm:max-w-xl">
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:justify-between [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("command.searchPlaceholder")}
          />

          {isLoading && (
            <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{t("command.loading")}</span>
            </div>
          )}

          <CommandList>
            {/* Recents (only when there is no query) */}
            {!hasQuery && recent.length > 0 && (
              <>
                <CommandGroup
                  heading={
                    <span className="flex w-full items-center justify-between">
                      <span>{t("command.recent")}</span>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          // prevent cmdk losing input focus before click
                          e.preventDefault();
                          clearRecent();
                        }}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Trash2 className="h-3 w-3" />
                        {t("command.clearRecent")}
                      </button>
                    </span>
                  }
                >
                  {recent.map((r) => {
                    const Icon = ICON_BY_KIND[r.kind] ?? UserCircle;
                    return (
                      <CommandItem
                        key={`recent-${r.path}`}
                        value={`recent-${r.path}`}
                        onSelect={() =>
                          go({ kind: r.kind, id: r.id, label: r.label, path: r.path })
                        }
                        className="gap-2"
                      >
                        <Icon className="text-muted-foreground" />
                        <span className="truncate">{r.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Pages */}
            {filteredPages.length > 0 && (
              <CommandGroup heading={t("command.pages")}>
                {filteredPages.map((item) => {
                  const label = t(item.labelKey);
                  return (
                    <CommandItem
                      key={`page-${item.path}`}
                      value={`page-${item.path}`}
                      onSelect={() =>
                        go({ kind: "page", id: item.path, label, path: item.path })
                      }
                      className="gap-2"
                    >
                      <item.icon className="text-muted-foreground" />
                      <span className="truncate">
                        <Mark text={label} query={debounced} />
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* Students */}
            {hasQuery && !isStudent && (studentsQ.data?.items.length ?? 0) > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t("command.students")}>
                  {studentsQ.data!.items.map((s) => {
                    const label = studentFullName(s);
                    return (
                      <CommandItem
                        key={`student-${s.id}`}
                        value={`student-${s.id}`}
                        onSelect={() =>
                          go({
                            kind: "student",
                            id: String(s.id),
                            label,
                            path: `/students/${s.id}`,
                          })
                        }
                        className="gap-2"
                      >
                        <UserCircle className="text-muted-foreground" />
                        <span className="flex flex-1 items-center justify-between gap-2 truncate">
                          <span className="truncate">
                            <Mark text={label} query={debounced} />
                          </span>
                          {s.group_code && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {s.group_code}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    );
                  })}
                  {(studentsQ.data!.total ?? 0) > RESULT_LIMIT && (
                    <CommandItem
                      key="students-more"
                      value="students-more"
                      onSelect={() => goToListing("/students")}
                      className="gap-2 text-xs text-muted-foreground"
                    >
                      <span className="ml-6">
                        {t("command.openAll")} ({studentsQ.data!.total})
                      </span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}

            {/* Teachers (admin + manager) */}
            {hasQuery && isStaffSearch && (teachersQ.data?.items.length ?? 0) > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t("command.teachers")}>
                  {teachersQ.data!.items.map((tc) => {
                    const label = teacherFullName(tc);
                    return (
                      <CommandItem
                        key={`teacher-${tc.id}`}
                        value={`teacher-${tc.id}`}
                        onSelect={() =>
                          go({
                            kind: "teacher",
                            id: String(tc.id),
                            label,
                            path: `/teachers/${tc.id}`,
                          })
                        }
                        className="gap-2"
                      >
                        <GraduationCap className="text-muted-foreground" />
                        <span className="truncate">
                          <Mark text={label} query={debounced} />
                        </span>
                      </CommandItem>
                    );
                  })}
                  {(teachersQ.data!.total ?? 0) > RESULT_LIMIT && (
                    <CommandItem
                      key="teachers-more"
                      value="teachers-more"
                      onSelect={() => goToListing("/teachers")}
                      className="gap-2 text-xs text-muted-foreground"
                    >
                      <span className="ml-6">
                        {t("command.openAll")} ({teachersQ.data!.total})
                      </span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}

            {/* Groups */}
            {hasQuery && !isStudent && (groupsQ.data?.items.length ?? 0) > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t("command.groups")}>
                  {groupsQ.data!.items.map((g) => (
                    <CommandItem
                      key={`group-${g.id}`}
                      value={`group-${g.id}`}
                      onSelect={() =>
                        go({
                          kind: "group",
                          id: String(g.id),
                          label: g.code,
                          path: `/groups/${g.id}`,
                        })
                      }
                      className="gap-2"
                    >
                      <UsersRound className="text-muted-foreground" />
                      <span className="flex flex-1 items-center justify-between gap-2 truncate">
                        <span className="truncate">
                          <Mark text={g.code} query={debounced} />
                        </span>
                        {g.course_name && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {g.course_name}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                  {(groupsQ.data!.total ?? 0) > RESULT_LIMIT && (
                    <CommandItem
                      key="groups-more"
                      value="groups-more"
                      onSelect={() => goToListing("/groups")}
                      className="gap-2 text-xs text-muted-foreground"
                    >
                      <span className="ml-6">
                        {t("command.openAll")} ({groupsQ.data!.total})
                      </span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}

            {/* Courses (admin + manager) */}
            {hasQuery && isStaffSearch && (coursesQ.data?.items.length ?? 0) > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t("command.courses")}>
                  {coursesQ.data!.items.map((c) => (
                    <CommandItem
                      key={`course-${c.id}`}
                      value={`course-${c.id}`}
                      onSelect={() =>
                        go({
                          kind: "course",
                          id: String(c.id),
                          label: c.name,
                          path: `/courses/${c.id}`,
                        })
                      }
                      className="gap-2"
                    >
                      <BookOpen className="text-muted-foreground" />
                      <span className="truncate">
                        <Mark text={c.name} query={debounced} />
                      </span>
                    </CommandItem>
                  ))}
                  {(coursesQ.data!.total ?? 0) > RESULT_LIMIT && (
                    <CommandItem
                      key="courses-more"
                      value="courses-more"
                      onSelect={() => goToListing("/courses")}
                      className="gap-2 text-xs text-muted-foreground"
                    >
                      <span className="ml-6">
                        {t("command.openAll")} ({coursesQ.data!.total})
                      </span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}

            {/* Rooms (admin + manager) — listing has no detail page; clicking opens /rooms */}
            {hasQuery && isStaffSearch && (roomsQ.data?.items.length ?? 0) > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t("command.rooms")}>
                  {roomsQ.data!.items.map((r) => (
                    <CommandItem
                      key={`room-${r.id}`}
                      value={`room-${r.id}`}
                      onSelect={() =>
                        go({
                          kind: "room",
                          id: String(r.id),
                          label: r.name,
                          path: `/rooms?room=${r.id}`,
                        })
                      }
                      className="gap-2"
                    >
                      <MapPin className="text-muted-foreground" />
                      <span className="truncate">
                        <Mark text={r.name} query={debounced} />
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Empty state */}
            {showEmptyState && (
              <CommandEmpty>
                <div className="flex flex-col items-center justify-center px-4 py-6">
                  <img
                    src={searchDuck}
                    alt="Search duck"
                    width={120}
                    height={120}
                    className="mb-3 drop-shadow-md"
                  />
                  <p className="text-sm font-bold text-foreground">
                    {t("command.emptyTagline")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("command.noResults")}
                  </p>
                </div>
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
