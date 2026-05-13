import { Users, Clock, DoorOpen } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

export interface FloorMapRoom {
  id: number;
  name: string;
  capacity: number;
  current_occupancy: number;
  status: "free" | "occupied";
  schedule: Record<string, Record<string, string>>;
}

interface FloorMapProps<R extends FloorMapRoom> {
  rooms: R[];
  onRoomClick: (room: R) => void;
}

function getCurrentGroups(room: FloorMapRoom): string[] {
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dayKey = days[new Date().getDay()];
  return Object.values(room.schedule[dayKey] || {});
}

export function FloorMap<R extends FloorMapRoom>({ rooms, onRoomClick }: FloorMapProps<R>) {
  const { t } = useLanguage();

  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-border/60 bg-card text-muted-foreground gap-3">
        <DoorOpen className="h-10 w-10 opacity-30" />
        <p className="text-sm">{t("rooms.notFound")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rooms.map((room, idx) => {
        const groups     = getCurrentGroups(room);
        const isOccupied = room.status === "occupied";
        const pct        = room.capacity > 0 ? (room.current_occupancy / room.capacity) * 100 : 0;
        const floorNum   = rooms.length - idx;

        return (
          <div
            key={room.id}
            onClick={() => onRoomClick(room)}
            className="group relative cursor-pointer rounded-xl border border-border/50 bg-card p-5 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
          >
            {/* Floor label */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                  {floorNum}
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {floorNum}-{t("rooms.floor")}
                  </p>
                  <h3 className="text-base font-semibold text-foreground">{room.name}</h3>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${
                isOccupied
                  ? "bg-destructive/10 text-destructive border-destructive/20"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}>
                <span className={`h-2 w-2 rounded-full ${isOccupied ? "bg-destructive" : "bg-emerald-500"}`} />
                {isOccupied ? t("rooms.occupied") : t("rooms.free")}
              </span>
            </div>

            {/* Room details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Capacity */}
              <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{t("rooms.capacityLabel")}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-semibold text-foreground">
                      {room.current_occupancy}/{room.capacity}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-yellow-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Current groups */}
              <div className="flex items-start gap-3 rounded-lg bg-muted/30 px-3 py-2.5">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("rooms.groupsToday")}</p>
                  {groups.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {groups.map((g, i) => (
                        <span key={i} className="inline-block rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                          {g}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">{t("rooms.noClasses")}</p>
                  )}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground/60 mt-3 text-center opacity-0 group-hover:opacity-100 transition-opacity">
              {t("rooms.clickHint")}
            </p>
          </div>
        );
      })}
    </div>
  );
}
