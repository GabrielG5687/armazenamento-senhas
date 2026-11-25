import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SharingService } from './sharing.service';
import {
  CompleteRekeyDto,
  RevokeDto,
  ShareDto,
} from './dto/sharing.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../shared/types';

@ApiTags('sharing')
@ApiBearerAuth()
@Controller('sharing')
@UseGuards(JwtAuthGuard)
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  @Post()
  share(@Body() body: ShareDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sharing.share(user.id, body);
  }

  @Post('revoke')
  revoke(@Body() body: RevokeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sharing.revoke(user.id, body);
  }

  @Post('rekey/:id/complete')
  completeRekey(
    @Param('id') id: string,
    @Body() body: CompleteRekeyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sharing.completeRekey(user.id, id, body);
  }

  @Get('pending')
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.sharing.listPending(user.id);
  }

  @Get('operations/:id')
  operation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sharing.getOperation(user.id, id);
  }
}