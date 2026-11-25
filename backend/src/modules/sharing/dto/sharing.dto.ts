import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PermissionRecipientDto } from '../../../shared/dto/permission.dto';
import { SecretEnvelopeDto } from '../../secrets/dto/secrets.dto';

export class ShareDto {
  @IsUUID()
  resourceId!: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PermissionRecipientDto)
  recipients!: PermissionRecipientDto[];

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SecretEnvelopeDto)
  envelopes!: SecretEnvelopeDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

export class RevokeDto {
  @IsUUID()
  resourceId!: string;

  @IsEnum(['USER', 'GROUP'])
  type!: 'USER' | 'GROUP';

  @IsUUID()
  id!: string;
}

export class RekeyItemDto {
  @IsUUID()
  resourceId!: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SecretEnvelopeDto)
  envelopes!: SecretEnvelopeDto[];
}

export class CompleteRekeyDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RekeyItemDto)
  items!: RekeyItemDto[];
}
