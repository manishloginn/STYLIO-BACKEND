import { IsString, Matches } from 'class-validator';

export class CreateChallengeDto {
  @IsString()
  membershipId!: string;

  @IsString()
  serviceId!: string;
}

export class VerifyRedemptionDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @IsString()
  branchId!: string;
}
