import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { filter, interval, map, merge, Observable, Subject } from 'rxjs';
import { prepareDatabaseUrl } from '../config/database-url';

@Injectable()
export class HrmsRealtimeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HrmsRealtimeService.name);
  private readonly orgEvents = new Subject<string>();
  private client: Client | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(private readonly config: ConfigService) {}

  onApplicationBootstrap(): void {
    void this.listen();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.orgEvents.complete();
    await this.client?.end().catch(() => undefined);
  }

  events(scope: string): Observable<{ data: { type: string } }> {
    return merge(
      this.orgEvents.pipe(
        filter((eventScope) => eventScope === scope),
        map(() => ({ data: { type: 'refresh' } })),
      ),
      interval(20_000).pipe(map(() => ({ data: { type: 'ping' } }))),
    );
  }

  private async listen(): Promise<void> {
    if (this.stopping) return;
    const client = new Client({
      connectionString: prepareDatabaseUrl(this.config.getOrThrow<string>('DATABASE_URL')),
    });
    client.on('notification', ({ channel, payload }) => {
      if (channel === 'hrms_realtime' && payload) this.orgEvents.next(payload);
    });
    client.on('error', (error: Error) => {
      this.logger.warn(`Realtime database connection lost: ${error.message}`);
      if (this.client === client) this.client = null;
      void client.end().catch(() => undefined);
      this.scheduleReconnect();
    });
    client.on('end', () => {
      if (this.client === client) this.client = null;
      this.scheduleReconnect();
    });

    try {
      await client.connect();
      await client.query('LISTEN hrms_realtime');
      this.client = client;
    } catch (error) {
      this.logger.warn(
        `Realtime database connection failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await client.end().catch(() => undefined);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.listen();
    }, 2_000);
    this.reconnectTimer.unref();
  }
}
