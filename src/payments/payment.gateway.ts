import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GatewayOrder {
  gateway: string;
  gatewayOrderId: string;
  amount: number;
  currency: 'INR';
  keyId?: string;
}

export interface VerifiedWebhook {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  amount: number;
  status: 'PAID' | 'FAILED';
}

export type WebhookResult = VerifiedWebhook | { ignored: true };

export abstract class PaymentGateway {
  abstract createOrder(amount: number, receipt: string): Promise<GatewayOrder>;
  abstract verifyWebhook(rawBody: Buffer, signature: string | undefined): WebhookResult;
}

@Injectable()
export class DevPaymentGateway extends PaymentGateway {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async createOrder(amount: number): Promise<GatewayOrder> {
    return {
      gateway: 'dev',
      gatewayOrderId: `dev_${randomUUID()}`,
      amount,
      currency: 'INR',
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): VerifiedWebhook {
    const secret = this.config.getOrThrow<string>('DEV_WEBHOOK_SECRET');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!signature || signature.length !== expected.length) {
      throw new BadRequestException('Invalid payment signature');
    }
    const valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) throw new BadRequestException('Invalid payment signature');
    const payload = JSON.parse(rawBody.toString('utf8')) as VerifiedWebhook;
    if (!payload.gatewayOrderId || !payload.gatewayPaymentId || !Number.isInteger(payload.amount)) {
      throw new BadRequestException('Payment webhook is incomplete');
    }
    if (payload.status !== 'PAID' && payload.status !== 'FAILED') {
      throw new BadRequestException('Payment status is not supported');
    }
    return payload;
  }
}

@Injectable()
export class RazorpayPaymentGateway extends PaymentGateway {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async createOrder(amount: number, receipt: string): Promise<GatewayOrder> {
    const keyId = this.config.getOrThrow<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount, currency: 'INR', receipt }),
    });
    if (!response.ok) {
      throw new BadRequestException('Payment provider could not create the order');
    }
    const body = (await response.json()) as { id: string; amount: number };
    return {
      gateway: 'razorpay',
      gatewayOrderId: body.id,
      amount: body.amount,
      currency: 'INR',
      keyId,
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): WebhookResult {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET') || this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!signature || signature.length !== expected.length) {
      throw new BadRequestException('Invalid payment signature');
    }
    const valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) throw new BadRequestException('Invalid payment signature');
    const payload = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      payload?: { payment?: { entity?: { order_id?: string; id?: string; amount?: number; status?: string } } };
    };
    const event = payload.event || '';
    if (!['payment.captured', 'payment.failed', 'order.paid'].includes(event)) {
      return { ignored: true };
    }
    const entity = payload.payload?.payment?.entity;
    const amount = entity?.amount;
    if (!entity?.order_id || !entity.id || typeof amount !== 'number' || !Number.isInteger(amount)) {
      throw new BadRequestException('Payment webhook is incomplete');
    }
    const paid = event === 'payment.captured' || event === 'order.paid' || entity.status === 'captured';
    return {
      gatewayOrderId: entity.order_id,
      gatewayPaymentId: entity.id,
      amount,
      status: paid && event !== 'payment.failed' ? 'PAID' : 'FAILED',
    };
  }

  verifyCheckout(orderId: string, paymentId: string, signature: string) {
    const secret = this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET');
    const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    if (!signature || signature.length !== expected.length) {
      throw new BadRequestException('Invalid payment signature');
    }
    const valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) throw new BadRequestException('Invalid payment signature');
  }
}
