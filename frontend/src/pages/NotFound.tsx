import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";

// ── 3-D Sphere SVG ────────────────────────────────────────────────────────────
function Icon3D() {
  return (
    <svg
      width="108"
      height="108"
      viewBox="0 0 108 108"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="nf-s" cx="34%" cy="28%" r="70%">
          <stop offset="0%"   stopColor="hsl(234 85% 90%)" />
          <stop offset="40%"  stopColor="hsl(234 70% 65%)" />
          <stop offset="100%" stopColor="hsl(238 75% 38%)" />
        </radialGradient>

        <radialGradient id="nf-spec" cx="28%" cy="22%" r="30%">
          <stop offset="0%"   stopColor="white" stopOpacity="0.7" />
          <stop offset="100%" stopColor="white" stopOpacity="0"   />
        </radialGradient>

        <radialGradient id="nf-rim" cx="75%" cy="78%" r="38%">
          <stop offset="0%"   stopColor="hsl(200 85% 70%)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="hsl(200 85% 70%)" stopOpacity="0"   />
        </radialGradient>

        <filter id="nf-drop" x="-25%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="0" dy="7" stdDeviation="11"
            floodColor="hsl(234 85% 45%)" floodOpacity="0.28" />
        </filter>

        <filter id="nf-qg" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="54" cy="103" rx="30" ry="5"
        fill="hsl(234 85% 45%)" fillOpacity="0.1" />

      {/* Sphere */}
      <circle cx="54" cy="50" r="44"
        fill="url(#nf-s)" filter="url(#nf-drop)" />

      {/* Inner glass ring */}
      <circle cx="54" cy="50" r="30"
        fill="white" fillOpacity="0.06"
        stroke="white" strokeOpacity="0.12" strokeWidth="0.75" />

      {/* ? */}
      <text x="54" y="64" textAnchor="middle"
        fontSize="34" fontWeight="800"
        fontFamily="'Inter', system-ui, sans-serif"
        fill="white" fillOpacity="0.9"
        filter="url(#nf-qg)">
        ?
      </text>

      {/* Rim light + specular */}
      <circle cx="54" cy="50" r="44" fill="url(#nf-rim)" />
      <circle cx="54" cy="50" r="44" fill="url(#nf-spec)" />

      {/* Reflection dot */}
      <circle cx="35" cy="30" r="4" fill="white" fillOpacity="0.38" />
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NotFound() {
  const { t }    = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 — route not found:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6">

      {/* Subtle top-center glow — one element, no animation */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px]"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% -5%, hsl(234 85% 55% / 0.07) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 text-center">

        {/* Large muted "404" — typography anchor */}
        <div
          className="select-none font-black leading-none tracking-tighter text-muted-foreground/10"
          style={{ fontSize: "clamp(7rem, 22vw, 14rem)" }}
          aria-hidden
        >
          404
        </div>

        {/* Icon overlapping the number — negative margin to pull it up */}
        <div className="-mt-[clamp(5rem,15vw,10rem)] drop-shadow-sm">
          <Icon3D />
        </div>

        {/* Thin accent rule */}
        <div className="h-px w-12 rounded-full bg-primary/40" />

        {/* Text */}
        <div className="space-y-2">
          <h1 className="text-[1.35rem] font-semibold tracking-tight text-foreground sm:text-2xl">
            {t("notFound.title")}
          </h1>
          <p className="max-w-[280px] text-sm leading-relaxed text-muted-foreground">
            {t("notFound.subtitle")}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            size="default"
            className="gap-2 rounded-full px-6"
            onClick={() => navigate("/")}
          >
            <Home className="h-3.5 w-3.5" />
            {t("notFound.home")}
          </Button>
          <Button
            size="default"
            variant="outline"
            className="gap-2 rounded-full px-6"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("notFound.back")}
          </Button>
        </div>

        {/* Path pill */}
        <code className="rounded-full border border-border/50 bg-muted/40 px-3.5 py-1 font-mono text-[10px] text-muted-foreground/60">
          {location.pathname}
        </code>
      </div>
    </div>
  );
}
