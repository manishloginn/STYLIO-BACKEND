import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Role } from '../common/enums';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(8)
  @Matches(/[A-Za-z]/, { message: 'Password must include a letter' })
  @Matches(/\d/, { message: 'Password must include a number' })
  password!: string;

  @IsEnum([Role.CUSTOMER, Role.SALON_OWNER])
  role!: Role.CUSTOMER | Role.SALON_OWNER;
}

export class LoginDto {
  @IsString()
  phone!: string;

  @IsString()
  password!: string;
}

export class OtpRequestDto {
  @IsString()
  phone!: string;
}

export class OtpVerifyDto {
  @IsString()
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
