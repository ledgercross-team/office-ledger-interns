CREATE TYPE "public"."task_assignment_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "task_assignment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"manager_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"category" "task_category" DEFAULT 'general' NOT NULL,
	"priority" "task_priority" NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"status" "task_assignment_request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_assignment_requests" ADD CONSTRAINT "task_assignment_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignment_requests" ADD CONSTRAINT "task_assignment_requests_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignment_requests" ADD CONSTRAINT "task_assignment_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignment_requests" ADD CONSTRAINT "task_assignment_requests_manager_same_company_fk" FOREIGN KEY ("manager_id","company_id") REFERENCES "public"."users"("id","company_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignment_requests" ADD CONSTRAINT "task_assignment_requests_employee_same_company_fk" FOREIGN KEY ("employee_id","company_id") REFERENCES "public"."users"("id","company_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_assignment_requests_company_status_idx" ON "task_assignment_requests" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "task_assignment_requests_manager_idx" ON "task_assignment_requests" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "task_assignment_requests_employee_idx" ON "task_assignment_requests" USING btree ("employee_id");