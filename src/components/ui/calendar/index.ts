import { CalendarRoot } from "./calendar-root";
import { CalendarHeader } from "./calendar-header";
import { CalendarGrid } from "./calendar-grid";
import { CalendarEventCard } from "./calendar-event-card";
import { CalendarEventSidebar } from "./calendar-event-sidebar";
import { CalendarSlotDialog } from "./calendar-slot-dialog";

export const Calendar = Object.assign(CalendarRoot, {
  Header: CalendarHeader,
  Grid: CalendarGrid,
  EventCard: CalendarEventCard,
  Sidebar: CalendarEventSidebar,
  SlotDialog: CalendarSlotDialog,
});

export * from "./calendar-root";
export * from "./calendar-header";
export * from "./calendar-grid";
export * from "./calendar-event-card";
export * from "./calendar-event-sidebar";
export * from "./calendar-slot-dialog";
