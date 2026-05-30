import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useLanguage } from "@/hooks/use-language";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  User, Camera, Trash2, Monitor, Loader2, Lock, Info, Bell,
  Palette, Globe, Shield, Save,
} from "lucide-react";
import { DevicesTab } from "@/components/settings/DevicesTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { toast } from "sonner";

interface ManagerProfileApi {
  id: number;
  login: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  is_active: boolean;
  avatar_base64: string | null;
}

const PROFILE_QK = ["auth", "profile", "manager"];

export default function ManagerSettingsPage() {
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { refreshProfile } = useAuth();
  const qc = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useQuery<ManagerProfileApi>({
    queryKey: PROFILE_QK,
    queryFn: () => apiClient.get<ManagerProfileApi>("/auth/profile"),
    staleTime: 0,
  });

  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePassword = useMutation({
    mutationFn: (data: { old_password: string; new_password: string }) =>
      apiClient.post<{ message: string }>("/auth/change-password", data),
  });

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
    setSavingAvatar(true);
    try {
      await apiClient.patch<ManagerProfileApi>("/auth/profile", {
        avatar_base64: avatarBase64,
      });
      setAvatarChanged(false);
      qc.invalidateQueries({ queryKey: PROFILE_QK });
      await refreshProfile();
      toast.success(t("teacherSettings.avatarUpdated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherSettings.avatarSaveError"));
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handleUpdatePassword() {
    if (newPassword !== confirmPassword) {
      toast.error(t("settingsPage.passwordMismatch"));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t("settingsPage.passwordTooShort"));
      return;
    }
    try {
      const res = await changePassword.mutateAsync({
        old_password: oldPassword,
        new_password: newPassword,
      });
      toast.success(res.message);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settingsPage.passwordChangeError"));
    }
  }

  const initials =
    [profile?.first_name?.[0], profile?.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "M";

  const displayName =
    [profile?.last_name, profile?.first_name].filter(Boolean).join(" ") ||
    profile?.login ||
    "Manager";

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
          <TabsList className="bg-muted/50 p-1 w-full sm:w-auto overflow-x-auto flex flex-wrap gap-1">
            <TabsTrigger value="profile" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <User className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("settings.profile")}</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <Palette className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("settings.appearance")}</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <Bell className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("settings.notifications")}</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <Shield className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("settings.security")}</span>
            </TabsTrigger>
            <TabsTrigger value="devices" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <Monitor className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("settings.devices")}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6 animate-fade-in">
            <div className="stat-card space-y-6">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {t("settings.personalInfo")}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("managerSettings.profileLimitedHint")}
                </p>
              </div>
              <Separator />

              {profileLoading || !profile ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
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

                  <div className="rounded-lg bg-muted/30 border border-border/40 p-3 flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {t("managerSettings.contactAdminHint")}
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
                    <Button onClick={handleSaveAvatar} disabled={savingAvatar || !avatarChanged}>
                      {savingAvatar ? (
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

          <TabsContent value="appearance" className="space-y-6 animate-fade-in">
            <div className="stat-card space-y-6">
              <div>
                <h3 className="text-base font-semibold text-foreground">{t("settings.appearance")}</h3>
                <p className="text-xs text-muted-foreground mt-1">{t("settings.appearanceDesc")}</p>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("settings.darkMode")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.darkModeDesc")}</p>
                </div>
                <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("settings.language")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.languageDesc")}</p>
                </div>
                <LanguageSwitcher size="md" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>

          <TabsContent value="security" className="space-y-6 animate-fade-in">
            <div className="stat-card space-y-6">
              <div>
                <h3 className="text-base font-semibold text-foreground">{t("settings.security")}</h3>
                <p className="text-xs text-muted-foreground mt-1">{t("settings.securityDesc")}</p>
              </div>
              <Separator />
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>{t("settings.currentPassword")}</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("settings.newPassword")}</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("settings.confirmPassword")}</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  className="gap-2"
                  onClick={handleUpdatePassword}
                  disabled={
                    changePassword.isPending || !oldPassword || !newPassword || !confirmPassword
                  }
                >
                  {changePassword.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> {t("common.saving")}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> {t("settings.updatePassword")}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="devices">
            <DevicesTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
