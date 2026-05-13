import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:backdrop-blur-xl group-[.toaster]:bg-card/70 group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-white/20 group-[.toaster]:shadow-[0_8px_32px_rgba(0,0,0,0.12)] group-[.toaster]:rounded-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg",
          cancelButton: "group-[.toast]:bg-muted/50 group-[.toast]:backdrop-blur-sm group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg",
          success: "group-[.toaster]:!bg-success/10 group-[.toaster]:!backdrop-blur-xl group-[.toaster]:!border-success/30 group-[.toaster]:!text-success",
          error: "group-[.toaster]:!bg-destructive/10 group-[.toaster]:!backdrop-blur-xl group-[.toaster]:!border-destructive/30 group-[.toaster]:!text-destructive",
          info: "group-[.toaster]:!bg-primary/10 group-[.toaster]:!backdrop-blur-xl group-[.toaster]:!border-primary/30 group-[.toaster]:!text-primary",
          warning: "group-[.toaster]:!bg-warning/10 group-[.toaster]:!backdrop-blur-xl group-[.toaster]:!border-warning/30 group-[.toaster]:!text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
