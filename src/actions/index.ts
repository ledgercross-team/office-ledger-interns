import { workspace } from "./workspace";
import { attendanceActions } from "./attendance";
import { employees } from "./employees";
import { announcementsActions, notificationsActions, shell } from "./shell";

export const server = {
  workspace,
  shell,
  notifications: notificationsActions,
  announcements: announcementsActions,
  attendance: attendanceActions,
  employees,
};
