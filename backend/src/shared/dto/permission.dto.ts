import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class PermissionRecipientDto {
  @IsEnum(['USER', 'GROUP'])
  type!: 'USER' | 'GROUP';

  @IsUUID()
  id!: string;

  @IsEnum(['READ', 'UPDATE', 'OWNER'])
  level!: 'READ' | 'UPDATE' | 'OWNER';
}

export class SetPermissionsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PermissionRecipientDto)
  recipients!: PermissionRecipientDto[];
}