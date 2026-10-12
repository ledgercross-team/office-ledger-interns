CREATE TYPE "public"."task_category" AS ENUM('general', 'onboarding', 'recruitment', 'payroll', 'leave_attendance', 'training', 'performance_review', 'compliance', 'it_support');--> statement-breakpoint
DROP INDEX "users_one_admin_per_company";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "manager_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "category" "task_category" DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_manager_same_company_fk" FOREIGN KEY ("manager_id","company_id") REFERENCES "public"."users"("id","company_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_manager_idx" ON "users" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "tasks_company_category_idx" ON "tasks" USING btree ("company_id","category");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_not_own_manager" CHECK (manager_id IS NULL OR manager_id <> id);--> statement-breakpoint
-- Backfill: an employee created by a manager reports to that manager.
UPDATE "users" AS e SET "manager_id" = e."created_by_id"
FROM "users" AS m
WHERE e."role" = 'employee' AND m."id" = e."created_by_id" AND m."role" = 'manager' AND m."company_id" = e."company_id";
