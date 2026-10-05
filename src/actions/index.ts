import { workspace } from "./workspace";
import { attendanceActions } from "./attendance";
import { employees } from "./employees";
import { leave } from "./leave";
import { inbox } from "./inbox";
import { tasksActions } from "./tasks";
import { calendar } from "./calendar";
import { announcementsActions, notificationsActions, shell } from "./shell";

export const server = {
  workspace,
  shell,
  notifications: notificationsActions,
  announcements: announcementsActions,
  attendance: attendanceActions,
  employees,
  leave,
  inbox,
  tasks: tasksActions,
  calendar,
};
