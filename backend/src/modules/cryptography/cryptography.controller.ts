import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CryptographyService } from './cryptography.service';
import { Public } from '../../shared/decorators/public.decorator';
import { NotFoundException } from '@nestjs/common';

@ApiTags('cryptography')
@Controller('cryptography')
export class CryptographyController {
  constructor(private readonly cryptography: CryptographyService) {}

  @Public()
  @Get('server-key')
  async serverKey() {
    const key = await this.cryptography.getServerKey();
    if (!key) {
      throw new NotFoundException('Server public key is not configured');
    }
    return key;
  }
}