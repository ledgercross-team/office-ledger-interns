import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { GameMasterController } from './game-master.controller';
import { GameMasterService } from './game-master.service';

@Module({
  imports: [AuthModule],
  controllers: [GameMasterController],
  providers: [GameMasterService],
})
export class GameMasterModule {}
