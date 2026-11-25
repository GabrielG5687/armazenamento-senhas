import { Module } from '@nestjs/common';
import { CryptographyModule } from '../cryptography/cryptography.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [CryptographyModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}