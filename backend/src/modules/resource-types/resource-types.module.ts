import { Module } from '@nestjs/common';
import { ResourceTypesController } from './resource-types.controller';
import { ResourceTypesService } from './resource-types.service';

@Module({
  providers: [ResourceTypesService],
  controllers: [ResourceTypesController],
  exports: [ResourceTypesService],
})
export class ResourceTypesModule {}