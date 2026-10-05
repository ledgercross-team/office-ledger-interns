import { workspace } from "./workspace";
import { attendanceActions } from "./attendance";
import { announcementsActions, notificationsActions, shell } from "./shell";

export const server = {
  workspace,
  shell,
  notifications: notificationsActions,
  announcements: announcementsActions,
  attendance: attendanceActions,
};
