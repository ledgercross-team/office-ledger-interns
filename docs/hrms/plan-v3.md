# Office Ledger HRMS: Plan v3 (final draft)

This plan has every decision from mah1uz as of 14 Oct 2026. The earlier versions are [plan-v2.md](plan-v2.md) and [gap-review.md](gap-review.md). Leave and attendance are covered in §12 and performance scoring in §13. No decisions are left open.

---

## 1. Roles

| Role | Who | Counts toward seats? |
|---|---|---|
| **gameMaster** | The platform owner. Can create other gameMasters. Creating one needs MFA and a second gameMaster to confirm it, and the last gameMaster can't be deleted. Can **never** see an org's data. | No |
| **CEO** | Owns the org. Can create, edit and delete anything in it: roles, users, projects and tasks. Can add more CEOs and COOs. | No |
| **COO** | Second-in-command, who approves on the CEO's behalf. Can add and remove users. Can create tasks without approval. Needs the **CEO's** approval to create a project. | No |
| **Manager** | All managers have the same role. Can create, edit and delete tasks in projects they're assigned to, subject to their approval switch (see §3). Can make simple edits to the profiles of anyone on their projects. On a given project, the CEO or COO can tag one or more managers as **project lead** (see §2). | Yes |
| **Employee** | Sees their own projects and tasks. Can edit their own profile but can't delete it. | Yes |

- **Seats:** Standard allows **2000** and Premium allows **5000**. Only managers and employees count. A deactivated user frees their seat. A pending request to create a user holds a seat until it's decided.
- **Abuse guard:** The gameMaster can see how many CEOs and COOs each org has, and gets a warning once an org has more than **25** combined. The gameMaster can block that org.
- **Several orgs per person:** One login can belong to several orgs, with a switcher after logging in. The person uses **one seat in each org**. Their workload is counted **separately in each org**, and no org can see their work in another.

## 2. Reporting lines
- **No reporting manager:** employees aren't tied to one HR manager. They belong to projects, and the managers on those projects manage them.
- **Project managers:** all managers have the same role. A project gets one or more managers when it's created, and they all manage its employees.
- **Project lead:** the CEO or COO can tag one or more of a project's managers as **project lead**. A lead is still a normal manager on that project. The tag marks them as the person the CEO and COO contact for updates and who attends offline meetings about the project. The tag can be moved or removed at any time.
- **Minimum staffing:** every **project** and every **task** needs **at least one manager and at least one employee**. If either is missing, the project or task is flagged ("No manager" or "No employee"). There's no separate "task owner": every manager on the task is responsible for it.

## 3. Permissions and approvals

| Action | Who can do it | Approval needed |
|---|---|---|
| Create a user | CEO, COO | None |
| Create a user | Manager (by request) | **Always** CEO or COO. No exceptions. |
| Create a project | CEO | None |
| Create a project | COO | **CEO only** |
| Archive a project | **CEO only** | None. Its open tasks are cancelled automatically. |
| Add an existing employee to a project | CEO, COO | None |
| Add an existing employee to a project | Manager | Lead manager of that project, or CEO/COO |
| Create or assign a task | Manager | Depends on that manager's **approval switch**, which the CEO or COO sets for each manager. Off means no approval. On means a lead manager on that project, a CEO or a COO approves. |
| Assign a task to someone not on the project | Manager | One combined request to add them to the project and assign the task |
| Edit an employee's profile (simple fields) | A manager on that employee's projects | None |
| Grant a manager visibility of every project in the org | CEO, COO | n/a |
| Remove or demote a CEO | Another CEO | The last CEO can't be removed this way. That needs offline confirmation, after which the gameMaster does it. |

### Who approves
- Requests go to **every CEO and COO** in the org, and the first decision counts. A lead manager also approves requests from the other managers on their own project.
- **Nobody approves their own request, except a CEO.** If a lead manager makes a request, it goes to another lead manager on that project or to the CEO/COO.
- Approvers can approve or reject in bulk, filtered by project, manager or request type.

### What happens to a request
```
Pending → Approved → Applied
        → Rejected   (a reason is required)
        → Cancelled  (the requester withdrew it, or lost the permission to make it)
        → Expired    (no decision within 3 working days → rejected automatically;
                      the CEOs, COOs and managers involved are notified)
```
- Approving a request checks the facts again first: is the seat still free, is the person still on the project, is the requester still a manager?
- Two identical requests are merged into one.
- The requester and the employee affected are notified every time a request changes state.

## 4. Inviting an employee to a project
- **Accept:** they join the project straight away. No admin step.
- **Decline:** they must give a reason. Whoever sent the invite reviews the decline and either accepts it or overrules it. Overruling adds the employee to the project, and they see the reason for the overrule.
- **No answer:** the invite expires after 3 working days, like any request. The CEO sets which days count as the weekend for the whole org.

## 5. Tasks

### Statuses
```
           ┌──────────── Blocked (reason required) ◄──┐
           ▼                                          │
To do ──► In progress ──► In review ──► Done          │
  │            └──────────────────────────────────────┘
  └──► Cancelled (manager only, reason required)
                  In review ──► In progress  (sent back, comment required)
```

| Change | Who can make it |
|---|---|
| To do → In progress → In review | An employee on the task, or a manager |
| In review → Done, or sent back to In progress | Any manager on the task |
| Any status → Blocked | An employee or a manager on the task, with a reason. The task's managers are notified. |
| → Cancelled | A manager on the task, a COO or a CEO |
| Reopen a Done task | A manager on the task, with a comment |

### Tasks with nobody assigned
- A manager can create a task in a project that has no employees yet. The task is saved and flagged **"No assignee"**.
- It **can't move past To do** until it has at least one employee and one manager. That keeps the rule "every task has one manager and one employee" true for all active work.
- If removing or deactivating someone leaves a task with no employee or no manager, the task gets the **"No assignee"** flag again and the remaining managers (or the CEO/COO) are notified.

### Urgency and due dates
- Every task has an **urgency** (High, Medium or Low) and a **due date**. Both are required.
- **High:** everyone on the task is notified when it's created. If it's still in To do after 24 hours, the lead manager gets a reminder.
- **Overdue:** a task past its due date is flagged red in lists and appears on the lead manager's dashboard.
- Lists are sorted by urgency first, then by due date.

### Project progress
- **Project statuses:** Active → Pending lead approval → Completed → (Archived, CEO only).
- Every project shows a **progress bar**: done tasks ÷ (all tasks − cancelled tasks), shown as a percentage, for example "18 of 24 tasks done · 75%".
- Cancelled tasks don't count either way. A project with no tasks shows "No tasks yet" instead of 0%.

### Completing a project
1. When every task is Done or Cancelled, every manager on the project is asked to **tick it as done**.
2. Once **all** the managers have ticked it, a **project lead approves** completion. If the project has no lead, the approval goes to the CEO and COO.
3. The project becomes **Completed**. The CEO and COO are notified and see it in their dashboard, and the rating window opens (§13).
- **New tasks:** a new task added before completion clears every manager's tick, and they all have to tick again.
- **Locked:** a Completed project can't get new tasks. The CEO or COO can reopen it.
- Urgency doesn't affect workload counts.

## 6. Calendar
- Everyone has a calendar showing **due dates of their tasks** and **meetings** they're invited to.
- **Who can create meetings:** CEOs, COOs and managers, with no approval step. A meeting **must** have a title, a date and time, at least one invitee from the same org, and either a **meeting link** (a valid URL) for online meetings or a **location** for in-person ones. Invitees are notified and see the meeting on their calendar.
- **Who sees what:** CEOs and COOs can see everyone's calendar. Managers can see the calendars of people on their projects. Employees see only their own.
- **Time zones:** dates are stored in UTC and shown in each user's own time zone. A user sets their time zone in their profile.
- Approved leave and org holidays also appear on the calendar (see §12).

## 7. Workload
- **Workload = open tasks + active projects.** Archived projects and their cancelled tasks don't count.
- The colors are **amber** at 6+ open tasks or 3+ projects, and **red** at 10+ tasks or 5+ projects. The CEO can change these thresholds, and they apply to the whole org.
- Someone on approved leave shows **"On leave until <date>"** next to their workload color. They can still be assigned work, but the assigner sees a warning first.
- Managers see the color and a summary such as "4 active tasks across 3 projects", plus the names of the projects they share with that employee. CEOs and COOs see everything.

## 8. When people join, change role or leave
- **Nothing is ever deleted; accounts are deactivated instead.** A deactivated user's tasks go to the project's managers for reassignment. Their seat is freed and their history is kept.
- **Deactivating a manager:** this happens straight away. Any project or task left without a manager is flagged **"No manager"**, and the CEO and COO see the flag until someone is assigned.
- **Demoting a manager:** they keep their tasks. Their pending requests are cancelled, and they lose any project lead tags.
- **Removing a manager from a project:** the tasks they created stay. Their pending requests are cancelled. If they were the project's only manager, the project falls back to the CEO and COO.
- **Removing an employee from a project:** their open tasks become unassigned, and the project's managers are notified.
- **Recovering a CEO account:** a COO asks the gameMaster, who checks the request offline. The gameMaster then sends a **reset link to a newly verified email address**. Passwords are never shared.

## 9. Subscription
- The CEO and COO get seat warnings at **80%, 95% and 100%**.
- Once the org is at the limit, any request to create a user is refused right away with a clear message.
- **Payment fails or the subscription expires:** a **7-day** grace period, then **10 days read-only**, then the org is suspended. Data is kept for **15 days** after suspension. During those 15 days the CEO can download a full export of the org's data.
- **Downgrading while above the new limit:** before the downgrade goes through, the CEO chooses which accounts to suspend. The list is sorted by **longest time since last login first**, and the CEO can suspend in bulk. Suspended users' open tasks are handled like deactivated users' tasks, and their seats are freed. Upgrading again lets the CEO reactivate them.
- **While the org is suspended,** only CEOs and COOs can log in, and only to renew.

## 10. Security and history
- MFA is required for gameMasters, CEOs and COOs.
- Every database query is restricted to the user's own org.
- **History:** every create, approval, rejection, role change, assignment, task status change and deactivation is recorded with who did it, when, and from where. A CEO can **add notes or corrections** to an entry, but nobody can change or delete the original.

## 11. Notifications
- Every notification appears in the app. Requests that need a decision, approvals, rejections, expiries, High-urgency tasks and seat warnings are **also emailed**.
- Each user can mute email for anything that isn't a request needing their decision.

---

## 12. Leave and attendance

### Leave requests
- An employee or manager sends a leave request with a **type**, a **date range** (full or half days) and a **reason**.
- **Who approves:** a **lead manager** on any of the requester's active projects, or a **COO**. The first decision counts. If the requester is a lead manager themselves, or isn't on any active project, the request goes to the COO. A CEO can also approve.
- Leave requests follow the same lifecycle as other requests (§3): approve, reject with a reason, cancel, or expire after 3 working days.
- **Approved leave** appears on the person's calendar and on the calendars of everyone on their projects, and shows next to their workload color.
- **Cancelling approved leave** before it starts is allowed. Once it has started, a lead manager or COO must approve the change.
- **Leave types and yearly allowances:** Annual 15 days, Sick 7, Casual 7 and Unpaid 7. The CEO can change these and add new types.
- **Leave balance:** each leave type has a yearly allowance. A request that goes over the balance is shown with a warning, but it can still be approved (it counts as unpaid).

### Attendance
- **Who checks in:** everyone in the org, including CEOs and COOs.
- **Office only:** check-in only works from the org's **office IP addresses**, which the CEO sets in org settings. Every check-in records the IP address. Someone working off-site (a client visit or travel) sends a correction request afterwards.
- **Check in and check out** happen in the app, one tap each. The check-in time, check-out time and the hours between them are recorded.
- **Status each working day:** Present, Late (checked in after the org's start time plus a grace period), On leave, Holiday, Weekend, or Absent (no check-in and no approved leave).
- **Forgot to check out:** at the end of the day the system checks the person out automatically and flags the day **"Missing check-out"**.
- **Correction request:** an employee can ask to fix a wrong or missing entry, giving a reason. It's approved by a lead manager or COO, like leave, and both the original entry and the correction are kept in the history.
- **Who sees what:** employees see their own attendance. Managers see attendance for people on their projects. CEOs and COOs see everyone. A monthly attendance report can be exported.
- **Org settings (CEO):** office IP addresses, work start time, late grace period, weekend days, the holiday list, leave types and yearly allowances.

---

## 13. Performance score (managers and employees only)

CEOs and COOs aren't scored. Each score runs from 0 to 100 and appears next to the user in the CEO and COO's user management dashboard.

### Inputs
**A. Attendance (rolling last 30 days, recalculated every night)**
- **Working days (W):** days in the window, minus weekends, org holidays and **approved paid leave** (Annual, Sick, Casual). Paid leave within the allowance is neutral and doesn't lower the score.
- Each working day earns points:

| Day | Points |
|---|---|
| On time | 1.0 |
| Late | 0.5 |
| Missing check-out (not corrected) | 0.75 |
| Unpaid leave, or leave over the allowance | 0.5 |
| Absent (no check-in, no approved leave) | 0 |

- **Attendance score** = 100 × total points ÷ W.

**B. Ratings (collected after each project is completed)**
- When a project becomes **Completed** (§5), everyone on it gets a rating request that stays open for **7 days**:
  - Each employee rates each manager they worked with on that project, 1 to 5 stars.
  - Each manager rates each employee on that project, 1 to 5 stars.
  - Ratings of 1 or 2 stars need a short comment.
- **Ratings are anonymous both ways.** Nobody sees who rated whom. A person's ratings only count toward their score once they have **3 or more**, so no single rating can be traced back to whoever gave it. CEOs and COOs see only the averages.
- **Rating score** uses ratings from the **last 12 months**, smoothed so a single rating can't swing it:

  `smoothed = (3 × org_average + sum_of_ratings) ÷ (3 + number_of_ratings)`

  `rating score = (smoothed − 1) ÷ 4 × 100`

  With only one or two ratings, the score stays close to the org average. With many ratings, it reflects the person's own ratings.

**C. On-time tasks (rolling last 30 days)**
- Counts tasks the person was on that reached **Done** in the window, plus tasks of theirs that are **still open past their due date**.
- **On-time score** = 100 × tasks finished on or before the due date ÷ that total.
- With no tasks in the window, this input is left out and its weight is shared out to the others.

### Final score
```
Performance = 30% × Attendance + 50% × Rating + 20% × On-time
```
- **Fewer than 3 ratings:** the rating input is left out and its weight is shared out to the others. The score is labelled "No ratings yet".
- **Only CEOs and COOs see scores.** Managers and employees can't see their own score or anyone else's. They can still see their own attendance records (§12).
- **Under 30 days in the org:** the score is labelled "New" and not judged.
- **Display:** the score is always shown as a number out of 100, for example **81 / 100**, colored by band.
- **Bands:** 85+ Excellent (green), 70–84 Good, 50–69 Needs attention (amber), under 50 Poor (red).
- A **trend arrow** compares the score with the previous 30 days.
- Clicking the score shows the breakdown: days on time, late and absent, leave taken, and the rating average with its count.
- The CEO can change the 30/50/20 weights and the late, missing and unpaid points in org settings.

### Worked example
22 working days: 18 on time, 3 late, 1 absent → (18 + 1.5 + 0) ÷ 22 = **88.6** attendance.
Five ratings averaging 4.2, with an org average of 3.8 → smoothed (11.4 + 21) ÷ 8 = 4.05 → **76.3** rating.
8 tasks done in the window, 7 by the due date, and none open past due → **87.5** on-time.
Performance = 0.3 × 88.6 + 0.5 × 76.3 + 0.2 × 87.5 = **82 / 100 (Good)**.
