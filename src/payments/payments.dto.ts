import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  planId!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class DevConfirmDto {
  @IsString()
  paymentId!: string;

  @IsIn(['PAID', 'FAILED'])
  status!: 'PAID' | 'FAILED';
}

export class RazorpayConfirmDto {
  @IsString()
  paymentId!: string;

  @IsString()
  razorpayOrderId!: string;

  @IsString()
  razorpayPaymentId!: string;

  @IsString()
  razorpaySignature!: string;
}

export class DirectSaleDto {
  @IsString()
  planId!: string;

  @IsString()
  customerPhone!: string;

  @IsString()
  idempotencyKey!: string;
}

export class CreateRefundDto {
  @IsString()
  paymentId!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  reason!: string;
}
