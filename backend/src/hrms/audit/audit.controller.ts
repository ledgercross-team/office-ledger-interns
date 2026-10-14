import { Body, Get, Param, Post, Query, Req } from '@nestjs/common';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import type { HrmsPrincipal } from '../auth/hrms-auth.types';
import { HrmsController } from '../hrms-controller.decorator';
import { AuditService } from './audit.service';
import { AddNoteDto, ListAuditQueryDto } from './dto/audit.dto';

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

// Read-only history. There is no route that edits or deletes an entry; the app role has no
// UPDATE or DELETE on audit_log in the database either.
@HrmsController('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @HrmsRoles('ceo', 'coo')
  @Get()
  list(@Query() q: ListAuditQueryDto) {
    return this.audit.list(q);
  }

  @HrmsRoles('ceo')
  @Post(':id/notes')
  addNote(@Req() req: HrmsAuthedRequest, @Param('id') id: string, @Body() dto: AddNoteDto) {
    return this.audit.addNote(principalOf(req), id, dto.note);
  }
}
