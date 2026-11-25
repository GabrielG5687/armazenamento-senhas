import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}

export class MfaVerifyDto {
  @IsString()
  @MinLength(10)
  challengeToken!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(10)
  code!: string;
}

export class TotpVerifyDto {
  @IsString()
  @MinLength(6)
  @MaxLength(10)
  code!: string;
}