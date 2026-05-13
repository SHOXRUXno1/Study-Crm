import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Bell, Palette, Shield, Globe, Save, Camera, Trash2, Monitor, Loader2 } from "lucide-react";
import { DevicesTab } from "@/components/settings/DevicesTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { languageNames, type Language } from "@/hooks/use-language";
import { toast } from "sonner";
import { useAdminProfile, useUpdateProfile, useChangePassword } from "@/hooks/use-admin-profile";
import { useAuth } from "@/hooks/use-auth";

export default function SettingsPage() {
  const { t, language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  // ── Profile data from API ─────────────────────────────────────────────────
  const { refreshProfile } = useAuth();
  const { data: profile, isLoading: profileLoading } = useAdminProfile();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  // ── Profile form state ────────────────────────────────────────────────────
  const [firstName,  setFirstName]  = useState("");
  const [lastName,   setLastName]   = useState("");
  const [middleName, setMiddleName] = useState("");
  const [phone,      setPhone]      = useState("");

  // avatar: either the loaded base64 from API or a newly picked file as base64
  const [avatarBase64,    setAvatarBase64]    = useState<string | null>(null);
  const [avatarChanged,   setAvatarChanged]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fill form once profile is loaded
  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name  ?? "");
    setLastName(profile.last_name    ?? "");
    setMiddleName(profile.middle_name ?? "");
    setPhone(profile.phone           ?? "");
    setAvatarBase64(profile.avatar_base64 ?? null);
  }, [profile]);

  // ── Avatar helpers ────────────────────────────────────────────────────────
  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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

  // ── Save profile ──────────────────────────────────────────────────────────
  async function handleSaveProfile() {
    const payload: Parameters<typeof updateProfile.mutateAsync>[0] = {
      first_name:  firstName.trim()  || null,
      last_name:   lastName.trim()   || null,
      middle_name: middleName.trim() || null,
      phone:       phone.trim()      || null,
    };
    if (avatarChanged) {
      payload.avatar_base64 = avatarBase64;
    }
    try {
      await updateProfile.mutateAsync(payload);
      setAvatarChanged(false);
      await refreshProfile();
      toast.success(t("settings.saved"), { description: t("settings.savedDesc") });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settingsPage.profileSaveError"));
    }
  }

  // ── Initials for avatar placeholder ──────────────────────────────────────
  const initials = [
    (firstName || profile?.first_name || "")[0],
    (lastName  || profile?.last_name  || "")[0],
  ].filter(Boolean).join("").toUpperCase() || "AD";

  // ── Password form state ───────────────────────────────────────────────────
  const [oldPassword,     setOldPassword]     = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settingsPage.passwordChangeError"));
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 max-w-4xl">
        <Breadcrumbs items={[{ label: t("sidebar.settings") }]} />

        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{t("sidebar.settings")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("settings.subtitle")}</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-4 sm:space-y-6">
          <TabsList className="bg-muted/50 p-1 w-full sm:w-auto overflow-x-auto flex">
            <TabsTrigger value="profile" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <User className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("settings.profile")}</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <Bell className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("settings.notifications")}</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <Palette className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("settings.appearance")}</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <Shield className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("settings.security")}</span>
            </TabsTrigger>
            <TabsTrigger value="devices" className="gap-1.5 sm:gap-2 text-xs flex-1 sm:flex-none">
              <Monitor className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("settings.devices")}</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Profile Tab ── */}
          <TabsContent value="profile" className="space-y-6 animate-fade-in">
            <div className="stat-card space-y-6">
              <div>
                <h3 className="text-base font-semibold text-foreground">{t("settings.personalInfo")}</h3>
                <p className="text-xs text-muted-foreground mt-1">{t("settings.personalInfoDesc")}</p>
              </div>
              <Separator />

              {profileLoading ? (
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
                          alt="Avatar"
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
                      {t("settings.uploadPhoto")}
                    </button>
                    {avatarBase64 && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="text-xs text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" /> {t("settings.removePhoto")}
                      </button>
                    )}
                  </div>

                  {/* Fields */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="firstName">{t("settings.firstName")}</Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder={t("settings.firstName")}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lastName">{t("settings.lastName")}</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder={t("settings.lastName")}
                      />
                    </div>
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="middleName">{t("settings.middleName")}</Label>
                      <Input
                        id="middleName"
                        value={middleName}
                        onChange={(e) => setMiddleName(e.target.value)}
                        placeholder={t("settings.middleName")}
                      />
                    </div>
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="phone">{t("settings.phone")}</Label>
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+998 90 123 45 67"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      className="gap-2"
                      onClick={handleSaveProfile}
                      disabled={updateProfile.isPending}
                    >
                      {updateProfile.isPending
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("common.saving")}</>
                        : <><Save className="h-4 w-4" /> {t("settings.saveChanges")}</>
                      }
                    </Button>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* ── Notifications Tab ── */}
          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>

          {/* ── Appearance Tab ── */}
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("settings.language")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.languageDesc")}</p>
                </div>
                <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
                  <SelectTrigger className="w-40 gap-2">
                    <Globe className="h-3.5 w-3.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["en", "ru", "uz"] as Language[]).map((lang) => (
                      <SelectItem key={lang} value={lang}>{languageNames[lang]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* ── Security Tab ── */}
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
                  disabled={changePassword.isPending || !oldPassword || !newPassword || !confirmPassword}
                >
                  {changePassword.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("common.saving")}</>
                    : <><Save className="h-4 w-4" /> {t("settings.updatePassword")}</>
                  }
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── Devices Tab ── */}
          <TabsContent value="devices">
            <DevicesTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
