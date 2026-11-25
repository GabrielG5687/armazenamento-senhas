import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ResourceTypesService } from './resource-types.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@ApiTags('resource-types')
@ApiBearerAuth()
@Controller('resource-types')
@UseGuards(JwtAuthGuard)
export class ResourceTypesController {
  constructor(private readonly resourceTypes: ResourceTypesService) {}

  @Get()
  list() {
    return this.resourceTypes.list();
  }
}