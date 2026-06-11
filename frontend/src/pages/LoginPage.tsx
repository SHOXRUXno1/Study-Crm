import { useState } from "react";
import { User, Lock, Eye, EyeOff, ArrowRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useBranding } from "@/hooks/use-branding";
import { toast } from "sonner";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const { brandName, brandLogo } = useBranding();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(phone, password);
    } catch (err) {
      const message = t("login.error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">

      {/* Right: Login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden animate-[slideDown_0.5s_ease-out]">
            {brandLogo
              ? <img src={brandLogo} alt={brandName} className="h-10 w-10 rounded-xl object-cover" />
              : <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Building2 className="h-5 w-5 text-primary" /></div>
            }
            <span className="text-xl font-bold text-foreground">{brandName}</span>
          </div>

          <div className="mb-8 animate-[fadeSlideUp_0.5s_ease-out_both]">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">{t("login.welcomeBack")}</h2>
            <p className="text-sm text-muted-foreground mt-2">{t("login.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5 animate-[fadeSlideUp_0.6s_ease-out_both]" style={{ animationDelay: "0.1s" }}>
              <label className="text-sm font-medium text-foreground">{t("login.phone")}</label>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  type="text"
                  placeholder="••••••••"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-10 h-11 bg-muted/30 border-border/60 focus:bg-background focus:border-primary/40 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.1)] transition-all duration-200"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5 animate-[fadeSlideUp_0.6s_ease-out_both]" style={{ animationDelay: "0.2s" }}>
              <label className="text-sm font-medium text-foreground">{t("login.password")}</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 bg-muted/30 border-border/60 focus:bg-background focus:border-primary/40 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.1)] transition-all duration-200"
                  required
                  minLength={4}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2.5 font-medium animate-[shake_0.4s_ease-in-out]">
                {error}
              </div>
            )}

            <div className="animate-[fadeSlideUp_0.6s_ease-out_both]" style={{ animationDelay: "0.3s" }}>
              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold gap-2 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
                disabled={loading}
              >
                {loading ? (
                  <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    {t("login.signIn")}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
            </div>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-8 animate-[fadeSlideUp_0.6s_ease-out_both]" style={{ animationDelay: "0.5s" }}>
            {t("login.footer")
              .replace("{{name}}", brandName)
              .replace("{{year}}", String(new Date().getFullYear()))}
          </p>
        </div>
      </div>
    </div>
  );
}
