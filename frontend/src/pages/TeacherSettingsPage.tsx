import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User, Camera, Trash2, Monitor, Loader2, Lock, Info, Bell,
} from "lucide-react";
import { DevicesTab } from "@/components/settings/DevicesTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { toast } from "sonner";

interface TeacherProfileApi {
  id: number;
  login: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  is_active: boolean;
  avatar_base64: string | null;
}

const PROFILE_QK = ["auth", "profile", "teacher"];

export default function TeacherSettingsPage() {
  const { t } = useLanguage();
  const { refreshProfile } = useAuth();
  const qc = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useQuery<TeacherProfileApi>({
    queryKey: PROFILE_QK,
    queryFn: () => apiClient.get<TeacherProfileApi>("/auth/profile"),
    staleTime: 0,
  });

  const [avatarBase64,  setAvatarBase64]  = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [saving,        setSaving]        = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setAvatarBase64(profile.avatar_base64 ?? null);
    setAvatarChanged(false);
  }, [profile]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_500_000) {
      toast.error(t("teacherSettings.avatarTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setAvatarBase64(result);
      setAvatarChanged(true);
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveAvatar() {
    setAvatarBase64(null);
    setAvatarChanged(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSaveAvatar() {
    setSaving(true);
    try {
      await apiClient.patch<TeacherProfileApi>("/auth/profile", {
        avatar_base64: avatarBase64,
      });
      setAvatarChanged(false);
      qc.invalidateQueries({ queryKey: PROFILE_QK });
      await refreshProfile();
      toast.success(t("teacherSettings.avatarUpdated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherSettings.avatarSaveError"));
    } finally {
      setSaving(false);
    }
  }

  const initials =
    [profile?.first_name?.[0], profile?.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "TC";

  const displayName =
    [profile?.last_name, profile?.first_name].filter(Boolean).join(" ") ||
    profile?.login ||
    "Teacher";

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <Breadcrumbs items={[{ label: t("sidebar.settings") }]} />

        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {t("sidebar.settings")}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t("settings.subtitle")}
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-4 sm:space-y-6">
          <TabsList className="bg-muted/50 p-1 w-full sm:w-auto overflow-x-auto flex">
            <TabsTrigger value="profile" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <User className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("settings.profile")}</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <Bell className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("settings.notifications")}</span>
            </TabsTrigger>
            <TabsTrigger value="devices" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <Monitor className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("settings.devices")}</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Profile Tab ──────────────────────────────────────────────── */}
          <TabsContent value="profile" className="space-y-6 animate-fade-in">
            <div className="stat-card space-y-6">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {t("settings.personalInfo")}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("teacherSettings.profileLimitedHint")}
                </p>
              </div>
              <Separator />

              {profileLoading || !profile ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Avatar */}
                  <div className="flex flex-col items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="relative group w-[100px] h-[100px] rounded-full overflow-hidden ring-2 ring-primary/20 transition-all hover:ring-primary/50"
                    >
                      {avatarBase64 ? (
                        <img
                          src={avatarBase64}
                          alt={displayName}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center">
                          <span className="text-2xl font-bold text-primary-foreground">{initials}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Camera className="h-6 w-6 text-white" />
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t("teacherSettings.uploadPhoto")}
                    </button>
                    {avatarBase64 && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="text-xs text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" /> {t("teacherSettings.removePhoto")}
                      </button>
                    )}
                  </div>

                  {/* Read-only fields */}
                  <div className="rounded-lg bg-muted/30 border border-border/40 p-3 flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {t("teacherSettings.contactAdminHint")}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label className="flex items-center gap-1.5 text-muted-foreground">
                        <Lock className="h-3 w-3" /> {t("teachers.lastName")}
                      </Label>
                      <Input value={profile.last_name} disabled />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="flex items-center gap-1.5 text-muted-foreground">
                        <Lock className="h-3 w-3" /> {t("teachers.firstName")}
                      </Label>
                      <Input value={profile.first_name} disabled />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="flex items-center gap-1.5 text-muted-foreground">
                        <Lock className="h-3 w-3" /> {t("teachers.middleName")}
                      </Label>
                      <Input value={profile.middle_name ?? ""} placeholder="—" disabled />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="flex items-center gap-1.5 text-muted-foreground">
                        <Lock className="h-3 w-3" /> {t("students.phone")}
                      </Label>
                      <Input value={profile.phone ?? ""} placeholder="—" disabled />
                    </div>
                    <div className="grid gap-1.5 sm:col-span-2">
                      <Label className="flex items-center gap-1.5 text-muted-foreground">
                        <Lock className="h-3 w-3" /> {t("teachers.login")}
                      </Label>
                      <Input value={profile.login} disabled className="font-mono" />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button onClick={handleSaveAvatar} disabled={saving || !avatarChanged}>
                      {saving ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> {t("common.saving")}
                        </>
                      ) : (
                        t("common.save")
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* ── Notifications preferences ─────────────────────────────── */}
          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>

          {/* ── Devices / Active sessions ──────────────────────────────── */}
          <TabsContent value="devices">
            <DevicesTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
