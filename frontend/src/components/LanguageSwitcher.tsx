import { type Language, useLanguage, languageNames } from "@/hooks/use-language";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import GB from "country-flag-icons/react/3x2/GB";
import RU from "country-flag-icons/react/3x2/RU";
import UZ from "country-flag-icons/react/3x2/UZ";

const LANGUAGES: Language[] = ["en", "ru", "uz"];

const FlagComponents: Record<Language, React.ComponentType<{ className?: string }>> = {
  en: GB,
  ru: RU,
  uz: UZ,
};

function Flag({ lang, sizePx = 22 }: { lang: Language; sizePx?: number }) {
  const Comp = FlagComponents[lang];
  // Flag SVG is 3:2 ratio — render at height=sizePx, width auto (≈1.5×),
  // centered in a square container clipped to a circle via overflow:hidden.
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: sizePx,
        height: sizePx,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        position: "relative",
      }}
    >
      <Comp
        style={{
          position: "absolute",
          height: "100%",
          width: "auto",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />
    </span>
  );
}

interface Props {
  size?: "sm" | "md";
  className?: string;
}

export function LanguageSwitcher({ size = "md", className }: Props) {
  const { language, setLanguage } = useLanguage();
  const flagSizePx = size === "sm" ? 18 : 22;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "text-muted-foreground hover:text-foreground rounded-xl",
            size === "sm" ? "h-8 w-8" : "h-9 w-9",
            className
          )}
        >
          <Flag lang={language} sizePx={flagSizePx} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px] rounded-xl p-1">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => setLanguage(lang)}
            className={cn(
              "rounded-lg gap-3 cursor-pointer py-2",
              language === lang && "bg-accent font-medium"
            )}
          >
            <Flag lang={lang} sizePx={22} />
            <span className="text-sm">{languageNames[lang]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
