import { Header, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { HrmsRoles } from '../auth/hrms-auth.decorators';
import type { HrmsAuthedRequest } from '../auth/hrms-auth.guard';
import { HrmsController } from '../hrms-controller.decorator';
import { ExportService } from './export.service';

// Allowed while the org is suspended (accessDenial lets /api/org through for CEO and COO,
// and this route is CEO only), for the 15 days the data is kept.
@HrmsController('org')
export class ExportController {
  constructor(private readonly exporter: ExportService) {}

  @HrmsRoles('ceo')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Disposition', 'attachment; filename="organisation-export.json"')
  @Post('export')
  export(@Req() req: HrmsAuthedRequest) {
    if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
    return this.exporter.export(req.hrmsAuth);
  }
}
