import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/hooks/use-language";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const { t } = useLanguage();

  return (
    <nav className="flex items-center gap-1.5 text-sm mb-4">
      <Link
        to="/"
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Home className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("breadcrumb.home")}</span>
      </Link>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
          {item.href ? (
            <Link
              to={item.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
