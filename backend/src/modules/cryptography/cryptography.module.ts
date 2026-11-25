import { Module } from '@nestjs/common';
import { CryptographyController } from './cryptography.controller';
import { CryptographyService } from './cryptography.service';

@Module({
  providers: [CryptographyService],
  controllers: [CryptographyController],
  exports: [CryptographyService],
})
export class CryptographyModule {}