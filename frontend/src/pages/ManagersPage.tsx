import { DashboardLayout } from "@/components/DashboardLayout";
import { useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useManagers, useCreateManager, useUpdateManager, useDeleteManager } from "@/hooks/use-managers";
import type { ManagerRead } from "@/hooks/use-managers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function ManagersContent() {
  const { t } = useLanguage();
  const { data, isLoading } = useManagers();
  const createM = useCreateManager();
  const updateM = useUpdateManager();
  const deleteM = useDeleteManager();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagerRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagerRead | null>(null);

  const [fFirst, setFFirst] = useState("");
  const [fLast, setFLast] = useState("");
  const [fMiddle, setFMiddle] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fUsername, setFUsername] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fActive, setFActive] = useState(true);

  function openCreate() {
    setEditTarget(null);
    setFFirst(""); setFLast(""); setFMiddle(""); setFPhone("");
    setFUsername(""); setFPassword(""); setFActive(true);
    setDialogOpen(true);
  }

  function openEdit(m: ManagerRead) {
    setEditTarget(m);
    setFFirst(m.first_name);
    setFLast(m.last_name);
    setFMiddle(m.middle_name ?? "");
    setFPhone(m.phone ?? "");
    setFUsername(m.username);
    setFPassword("");
    setFActive(m.is_active);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!fFirst.trim() || !fLast.trim() || !fUsername.trim()) {
      toast.error("Заполните обязательные поля");
      return;
    }
    if (!editTarget && !fPassword.trim()) {
      toast.error("Введите пароль");
      return;
    }
    try {
      if (editTarget) {
        const payload: Record<string, unknown> = {
          first_name: fFirst.trim(),
          last_name: fLast.trim(),
          middle_name: fMiddle.trim() || null,
          phone: fPhone.trim() || null,
          username: fUsername.trim(),
          is_active: fActive,
        };
        if (fPassword.trim()) payload.password = fPassword.trim();
        await updateM.mutateAsync({ id: editTarget.id, data: payload });
        toast.success(t("managers.toastUpdated"));
      } else {
        await createM.mutateAsync({
          first_name: fFirst.trim(),
          last_name: fLast.trim(),
          middle_name: fMiddle.trim() || null,
          phone: fPhone.trim() || null,
          username: fUsername.trim(),
          password: fPassword.trim(),
          is_active: fActive,
        });
        toast.success(t("managers.toastCreated"));
      }
      setDialogOpen(false);
    } catch (e: unknown) {
      const detail = (e as { detail?: string })?.detail;
      if (detail === "username_taken") {
        toast.error("Этот логин уже занят");
      } else {
        toast.error("Ошибка сохранения");
      }
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteM.mutateAsync(deleteTarget.id);
      toast.success(t("managers.toastDeleted"));
      setDeleteTarget(null);
    } catch {
      toast.error("Ошибка удаления");
    }
  }

  const managers = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t("managers.title")}</h1>
            <p className="text-sm text-muted-foreground">{managers.length} менеджеров</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("managers.addNew")}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : managers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Briefcase className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">Менеджеров пока нет</p>
          <Button variant="outline" onClick={openCreate} className="mt-4 gap-2">
            <Plus className="h-4 w-4" /> {t("managers.addNew")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {managers.map((m) => (
            <div
              key={m.id}
              className="relative rounded-xl border bg-card p-4 shadow-sm flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-bold text-sm shadow-sm">
                  {(m.first_name[0] ?? "") + (m.last_name[0] ?? "")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {m.last_name} {m.first_name} {m.middle_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">@{m.username}</p>
                  {m.phone && <p className="text-xs text-muted-foreground truncate">{m.phone}</p>}
                </div>
                <Badge variant={m.is_active ? "default" : "secondary"} className="shrink-0 text-[10px]">
                  {m.is_active ? "Активен" : "Неактивен"}
                </Badge>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => openEdit(m)}>
                  <Pencil className="h-3 w-3" /> Изменить
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(m)}>
                  <Trash2 className="h-3 w-3" /> Удалить
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? t("managers.editManager") : t("managers.addNew")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Фамилия *</Label>
                <Input value={fLast} onChange={(e) => setFLast(e.target.value)} placeholder="Иванов" />
              </div>
              <div className="space-y-1">
                <Label>Имя *</Label>
                <Input value={fFirst} onChange={(e) => setFFirst(e.target.value)} placeholder="Иван" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Отчество</Label>
              <Input value={fMiddle} onChange={(e) => setFMiddle(e.target.value)} placeholder="Иванович" />
            </div>
            <div className="space-y-1">
              <Label>{t("managers.phone")}</Label>
              <Input value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="+998 99 123 45 67" />
            </div>
            <div className="space-y-1">
              <Label>{t("managers.username")} *</Label>
              <Input value={fUsername} onChange={(e) => setFUsername(e.target.value)} placeholder="manager1" />
            </div>
            <div className="space-y-1">
              <Label>{t("managers.password")}{!editTarget && " *"}</Label>
              <PasswordInput
                value={fPassword}
                onChange={(e) => setFPassword(e.target.value)}
                placeholder={editTarget ? "Оставьте пустым, чтобы не менять" : "Минимум 6 символов"}
              />
            </div>
            <div className="flex items-center gap-3">
              <Label>{t("managers.active")}</Label>
              <div className="flex gap-2">
                {([true, false] as const).map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setFActive(v)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                      fActive === v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    {v ? "Да" : "Нет"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={createM.isPending || updateM.isPending}>
              {(createM.isPending || updateM.isPending) ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("managers.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.last_name} {deleteTarget?.first_name} (@{deleteTarget?.username}) будет удалён без возможности восстановления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function ManagersPage() {
  return (
    <DashboardLayout>
      <ManagersContent />
    </DashboardLayout>
  );
}
