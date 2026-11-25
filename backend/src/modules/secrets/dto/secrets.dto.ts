import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SecretEnvelopeDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @MaxLength(400_000)
  armoredMessage!: string;

  @IsString()
  @MaxLength(128)
  keyFingerprint!: string;

  @IsString()
  @MaxLength(128)
  checksum!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400_000)
  signature?: string;
}

export class CreateSecretVersionDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @MaxLength(20)
  formatVersion!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SecretEnvelopeDto)
  envelopes!: SecretEnvelopeDto[];
}