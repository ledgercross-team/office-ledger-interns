import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Clock3,
  FileText,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  MessageSquareWarning,
  Plane,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NavIcon } from "@/lib/nav";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  employees: Users,
  attendance: Clock3,
  leave: Plane,
  tasks: KanbanSquare,
  calendar: CalendarDays,
  performance: BarChart3,
  report: FileText,
  complaints: MessageSquareWarning,
  settings: Settings,
  profile: UserRound,
};
export { ClipboardList };
