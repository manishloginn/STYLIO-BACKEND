import { MongoDoc } from '../common/interfaces/mongo-doc';
import { createHmac, randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { pageArgs, PageQueryDto } from '../common/dto/page-query.dto';
import { PaymentStatus, Role } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { toPublic } from '../common/utils/public';
import { ActivationService } from '../memberships/activation.service';
import { CreateOrderDto, DevConfirmDto, RazorpayConfirmDto } from './payments.dto';
import { callbackOrigin } from './callback-origin';
import { PaymentGateway, RazorpayPaymentGateway } from './payment.gateway';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel('Payment') private readonly payments: Model<MongoDoc>,
    @InjectModel('MembershipPlan') private readonly plans: Model<MongoDoc>,
    private readonly gateway: PaymentGateway,
    private readonly activation: ActivationService,
    private readonly config: ConfigService,
  ) {}

  async createOrder(user: AuthUser, dto: CreateOrderDto, requestOrigin?: string) {
    if (user.role !== Role.CUSTOMER && user.role !== Role.PLATFORM_ADMIN) {
      throw new ForbiddenException('Only a customer can purchase a membership');
    }
    const idempotencyKey = dto.idempotencyKey || randomUUID();
    const existing = await this.payments.findOne({ idempotencyKey, userId: user.sub }).lean();
    if (existing) return this.present(existing);
    const preview = await this.plans.findById(dto.planId).lean();
    if (!preview || preview.status !== 'PUBLISHED') {
      throw new BadRequestException('This plan is not available to purchase');
    }
    const order = await this.gateway.createOrder(preview.sellingPrice, idempotencyKey);
    const callbackUrl = order.gateway === 'razorpay' ? this.callbackUrl(requestOrigin) : undefined;
    const payment = await this.payments.create({
      userId: user.sub,
      salonId: preview.salonId,
      planId: preview._id,
      gateway: order.gateway,
      gatewayOrderId: order.gatewayOrderId,
      amount: preview.sellingPrice,
      currency: 'INR',
      status: PaymentStatus.PENDING,
      idempotencyKey,
    });
    return { ...this.present(payment.toObject()), keyId: order.keyId, callbackUrl };
  }

  async webhook(rawBody: Buffer, signature?: string) {
    const verified = this.gateway.verifyWebhook(rawBody, signature);
    if ('ignored' in verified) return { received: true };
    return this.activation.applyWebhook(verified);
  }

  callbackUrl(requestOrigin?: string) {
    const origin = callbackOrigin({
      apiOrigin: this.config.get<string>('API_ORIGIN'),
      renderExternalUrl: process.env.RENDER_EXTERNAL_URL,
      requestOrigin,
      port: this.config.get<number>('PORT') || 3000,
    });
    return `${origin}/api/v1/payments/razorpay/callback`;
  }

  async razorpayCallback(body: Record<string, unknown>, returnOrigin?: string) {
    const home = this.returnOrigin(returnOrigin);
    if (this.config.get('PAYMENT_PROVIDER') !== 'razorpay' || !(this.gateway instanceof RazorpayPaymentGateway)) {
      return home;
    }
    try {
      return await this.finishRazorpayCallback(body, home);
    } catch {
      return home;
    }
  }

  private async finishRazorpayCallback(body: Record<string, unknown>, home: string) {
    if (!(this.gateway instanceof RazorpayPaymentGateway)) return home;
    const orderId = stringField(body.razorpay_order_id);
    const razorpayPaymentId = stringField(body.razorpay_payment_id);
    const signature = stringField(body.razorpay_signature);
    if (orderId && razorpayPaymentId && signature) {
      this.gateway.verifyCheckout(orderId, razorpayPaymentId, signature);
      const payment = await this.payments.findOne({ gatewayOrderId: orderId });
      if (!payment) return home;
      await this.activation.applyWebhook({
        gatewayOrderId: orderId,
        gatewayPaymentId: razorpayPaymentId,
        amount: payment.amount,
        status: 'PAID',
      });
      return `${home}/payments/${payment._id}/result`;
    }
    const failedOrderId = failedOrder(body);
    if (failedOrderId) {
      const payment = await this.payments.findOne({ gatewayOrderId: failedOrderId });
      if (!payment) return home;
      const failedPaymentId = failedPayment(body) || `failed_${payment._id}`;
      await this.activation.applyWebhook({
        gatewayOrderId: failedOrderId,
        gatewayPaymentId: failedPaymentId,
        amount: payment.amount,
        status: 'FAILED',
      });
      return `${home}/payments/${payment._id}/result`;
    }
    return home;
  }

  private returnOrigin(value?: string) {
    return this.allowedOrigin(value) || this.config.get<string>('WEB_ORIGIN') || 'http://127.0.0.1:5173';
  }

  private allowedOrigin(value?: string) {
    if (!value) return undefined;
    let origin = value;
    try {
      origin = new URL(value).origin;
    } catch {
      return undefined;
    }
    const web = this.config.get<string>('WEB_ORIGIN');
    const allowed = new Set([
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'https://stylio-frontend.vercel.app',
    ]);
    if (web) allowed.add(web.replace(/\/$/, ''));
    return allowed.has(origin) ? origin : undefined;
  }

  async devConfirm(user: AuthUser, dto: DevConfirmDto) {
    if (this.config.get<string>('NODE_ENV') === 'production' || this.config.get('PAYMENT_PROVIDER') !== 'dev') {
      throw new NotFoundException('Not found');
    }
    const payment = await this.payments.findById(dto.paymentId);
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== user.sub && user.role !== Role.PLATFORM_ADMIN) {
      throw new ForbiddenException('You cannot confirm this payment');
    }
    const body = Buffer.from(
      JSON.stringify({
        gatewayOrderId: payment.gatewayOrderId,
        gatewayPaymentId: `dev_pay_${payment._id}`,
        amount: payment.amount,
        status: dto.status,
      }),
    );
    const signature = createHmac('sha256', this.config.getOrThrow<string>('DEV_WEBHOOK_SECRET'))
      .update(body)
      .digest('hex');
    return this.webhook(body, signature);
  }

  async confirmRazorpay(user: AuthUser, dto: RazorpayConfirmDto) {
    if (this.config.get('PAYMENT_PROVIDER') !== 'razorpay') {
      throw new NotFoundException('Not found');
    }
    const payment = await this.payments.findById(dto.paymentId);
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== user.sub && user.role !== Role.PLATFORM_ADMIN) {
      throw new ForbiddenException('You cannot confirm this payment');
    }
    if (payment.gateway !== 'razorpay' || payment.gatewayOrderId !== dto.razorpayOrderId) {
      throw new BadRequestException('Payment order does not match');
    }
    if (!(this.gateway instanceof RazorpayPaymentGateway)) {
      throw new BadRequestException('Razorpay is not the active payment provider');
    }
    this.gateway.verifyCheckout(dto.razorpayOrderId, dto.razorpayPaymentId, dto.razorpaySignature);
    return this.activation.applyWebhook({
      gatewayOrderId: dto.razorpayOrderId,
      gatewayPaymentId: dto.razorpayPaymentId,
      amount: payment.amount,
      status: 'PAID',
    });
  }

  async mine(user: AuthUser, query: PageQueryDto) {
    const { page, limit, skip } = pageArgs(query);
    const filter: Record<string, unknown> = { userId: user.sub };
    const [items, total] = await Promise.all([
      this.payments.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.payments.countDocuments(filter),
    ]);
    return { data: items.map((row) => this.present(row)), meta: { page, limit, total } };
  }

  async getOne(user: AuthUser, id: string) {
    const payment = await this.payments.findById(id).lean();
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== user.sub && user.role !== Role.PLATFORM_ADMIN) {
      throw new ForbiddenException('You cannot view this payment');
    }
    return this.present(payment);
  }

  async adminList(query: PageQueryDto) {
    const { page, limit, skip } = pageArgs(query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) (filter.createdAt as any).$gte = new Date(query.from);
      if (query.to) (filter.createdAt as any).$lte = new Date(query.to);
    }
    const [items, total] = await Promise.all([
      this.payments.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.payments.countDocuments(filter),
    ]);
    return { data: items.map((row) => this.present(row)), meta: { page, limit, total } };
  }

  private present(payment: any) {
    return toPublic(payment);
  }
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function failedOrder(body: Record<string, unknown>) {
  const error = body.error;
  if (!error || typeof error !== 'object') return '';
  const metadata = (error as { metadata?: unknown }).metadata;
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata) as { order_id?: string };
      return parsed.order_id || '';
    } catch {
      return '';
    }
  }
  if (metadata && typeof metadata === 'object' && 'order_id' in metadata) {
    return stringField((metadata as { order_id?: unknown }).order_id);
  }
  return '';
}

function failedPayment(body: Record<string, unknown>) {
  const error = body.error;
  if (!error || typeof error !== 'object') return '';
  const metadata = (error as { metadata?: unknown }).metadata;
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata) as { payment_id?: string };
      return parsed.payment_id || '';
    } catch {
      return '';
    }
  }
  if (metadata && typeof metadata === 'object' && 'payment_id' in metadata) {
    return stringField((metadata as { payment_id?: unknown }).payment_id);
  }
  return '';
}
