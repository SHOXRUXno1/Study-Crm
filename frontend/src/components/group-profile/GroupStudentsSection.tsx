import { useMemo, useState } from "react";
import { ArrowRightLeft, MoreHorizontal, Phone, PhoneCall, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLanguage } from "@/hooks/use-language";

export interface GroupProfileStudent {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  paymentStatus: "paid" | "debt";
  enrollDate: string;
}

interface GroupStudentsSectionProps {
  students: GroupProfileStudent[];
  isAdmin: boolean;
  onOpenEnroll: () => void;
  onViewStudent: (studentId: string) => void;
  onCallStudent: (student: GroupProfileStudent) => void;
  onRemoveStudent: (student: GroupProfileStudent) => void;
  onTransferStudent: (student: GroupProfileStudent) => void;
}

function formatPhoneLink(phone: string) {
  return phone.replace(/\s/g, "");
}

function formatDateDMY(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function GroupStudentsSection({
  students,
  isAdmin,
  onOpenEnroll,
  onViewStudent,
  onCallStudent,
  onRemoveStudent,
  onTransferStudent,
}: GroupStudentsSectionProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "paid" | "debt">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (status !== "all" && s.paymentStatus !== status) return false;
      if (!q) return true;
      return `${s.lastName} ${s.firstName}`.toLowerCase().includes(q) || s.phone.toLowerCase().includes(q);
    });
  }, [search, status, students]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-base sm:text-lg font-semibold text-foreground">
          {t("groups.studentsCol")} ({filtered.length}{filtered.length !== students.length ? ` / ${students.length}` : ""})
        </h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("groups.searchStudents")}
            className="h-8 text-xs w-full sm:w-52"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as "all" | "paid" | "debt")}>
            <SelectTrigger className="h-8 w-auto min-w-[135px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("groups.filterAll")}</SelectItem>
              <SelectItem value="paid">{t("payments.paid")}</SelectItem>
              <SelectItem value="debt">{t("payments.debt")}</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button size="sm" className="text-xs gap-1.5" onClick={onOpenEnroll}>
              <Plus className="h-3.5 w-3.5" /> {t("groups.enrollStudent")}
            </Button>
          )}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold">#</TableHead>
                <TableHead className="text-xs font-semibold">{t("students.name")}</TableHead>
                <TableHead className="text-xs font-semibold hidden sm:table-cell">{t("students.phone")}</TableHead>
                <TableHead className="text-xs font-semibold">{t("students.payment")}</TableHead>
                <TableHead className="text-xs font-semibold hidden md:table-cell">{t("students.enrollDate")}</TableHead>
                <TableHead className="text-xs font-semibold text-right">{t("groups.actionMore")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s, i) => (
                <TableRow
                  key={s.id}
                  className="transition-colors hover:bg-muted/30 cursor-pointer"
                  onClick={() => onViewStudent(s.id)}
                >
                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium text-foreground">
                      {s.lastName} {s.firstName}
                    </p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <a
                      href={`tel:${formatPhoneLink(s.phone)}`}
                      className="text-xs font-mono text-muted-foreground hover:text-primary flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="h-3 w-3" />
                      {s.phone}
                    </a>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={s.paymentStatus} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                    {formatDateDMY(s.enrollDate)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title={t("groups.actionMore")}>
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onCallStudent(s)}>
                          <PhoneCall className="h-3.5 w-3.5 mr-2" />
                          {t("groups.actionCall")}
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuItem onClick={() => onTransferStudent(s)}>
                              <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />
                              {t("groups.actionTransfer")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onRemoveStudent(s)}
                            >
                              <X className="h-3.5 w-3.5 mr-2" />
                              {t("groups.actionRemove")}
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
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("groups.noStudents")}</p>
        </div>
      )}
    </div>
  );
}
