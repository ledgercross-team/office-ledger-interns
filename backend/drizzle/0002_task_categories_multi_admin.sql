CREATE TYPE "public"."task_category" AS ENUM('general', 'onboarding', 'recruitment', 'payroll', 'leave_attendance', 'training', 'performance_review', 'compliance', 'it_support');--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_manager_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_created_by_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "users_one_admin_per_company";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "category" "task_category" DEFAULT 'general' NOT NULL;--> statement-breakpoint
-- Backfill only unassigned employees created by a manager; preserve explicit assignments.
UPDATE "users" AS e SET "manager_id" = e."created_by_id"
FROM "users" AS m
WHERE e."manager_id" IS NULL
  AND e."role" = 'employee'
  AND m."id" = e."created_by_id"
  AND m."role" = 'manager'
  AND m."company_id" = e."company_id";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_manager_same_company_fk" FOREIGN KEY ("manager_id","company_id") REFERENCES "public"."users"("id","company_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_company_category_idx" ON "tasks" USING btree ("company_id","category");
