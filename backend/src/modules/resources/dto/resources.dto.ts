import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateResourceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^[a-zA-Z][a-zA-Z0-9+.-]*:(\/\/)?\S+$/, {
    message: 'uri must be a valid URI with a scheme',
  })
  uri?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsUUID()
  resourceTypeId!: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;
}

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^[a-zA-Z][a-zA-Z0-9+.-]*:(\/\/)?\S+$/, {
    message: 'uri must be a valid URI with a scheme',
  })
  uri?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsUUID()
  resourceTypeId?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;
}

export class ListResourcesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;
}

export class MoveResourceDto {
  @IsUUID()
  folderId!: string;
}