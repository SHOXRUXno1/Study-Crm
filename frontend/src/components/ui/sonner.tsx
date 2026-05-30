import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/hooks/use-theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      position="top-right"
      richColors
      closeButton
      duration={4000}
      expand={false}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:backdrop-blur-xl group-[.toaster]:bg-card/80 group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border/50 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl",
          title: "group-[.toast]:font-semibold group-[.toast]:text-sm",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:text-xs group-[.toast]:font-medium",
          cancelButton:
            "group-[.toast]:bg-muted/50 group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg group-[.toast]:text-xs",
          closeButton:
            "group-[.toast]:border-border/40 group-[.toast]:bg-card group-[.toast]:text-muted-foreground group-[.toast]:hover:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
