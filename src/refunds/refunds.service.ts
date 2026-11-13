import { MongoDoc } from '../common/interfaces/mongo-doc';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { MembershipStatus, PaymentStatus, RefundStatus } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { withTransaction } from '../common/transaction';
import { percentPaise } from '../common/utils/money';
import { toPublic } from '../common/utils/public';
import { MiddlemenService } from '../middlemen/middlemen.service';
import { CreateRefundDto } from '../payments/payments.dto';

@Injectable()
export class RefundsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel('Refund') private readonly refunds: Model<MongoDoc>,
    @InjectModel('Payment') private readonly payments: Model<MongoDoc>,
    @InjectModel('Commission') private readonly commissions: Model<MongoDoc>,
    @InjectModel('Membership') private readonly memberships: Model<MongoDoc>,
    @InjectModel('Redemption') private readonly redemptions: Model<MongoDoc>,
    @InjectModel('AuditLog') private readonly audits: Model<MongoDoc>,
    private readonly middlemen: MiddlemenService,
  ) {}

  async list() {
    const rows = await this.refunds.find().sort({ createdAt: -1 }).limit(200).lean();
    return rows.map((row) => toPublic(row));
  }

  async create(actor: AuthUser, dto: CreateRefundDto) {
    return withTransaction(this.connection, async (session) => {
      const payment = await this.payments.findById(dto.paymentId).session(session);
      if (!payment || payment.status !== PaymentStatus.PAID) {
        throw new NotFoundException('Paid payment not found');
      }
      const previous = await this.refunds.find({ paymentId: payment._id }).session(session).lean();
      const already = previous.reduce((sum, row) => sum + row.amount, 0);
      if (dto.amount + already > payment.amount) {
        throw new BadRequestException('Refund exceeds the amount paid');
      }
      const commission = await this.commissions.findOne({ paymentId: payment._id }).session(session);
      let reversal = 0;
      let rateBpsSnapshot: number | null = null;
      if (commission) {
        rateBpsSnapshot = commission.rateBps;
        const remaining = commission.commissionPaise - commission.reversedPaise;
        reversal = Math.min(percentPaise(dto.amount, commission.rateBps), remaining);
        commission.reversedPaise += reversal;
        await commission.save({ session });
      }
      const [refund] = await this.refunds.create(
        [
          {
            paymentId: payment._id,
            membershipId: payment.membershipId,
            amount: dto.amount,
            commissionReversalPaise: reversal,
            rateBpsSnapshot,
            status: RefundStatus.COMPLETED,
            reason: dto.reason,
            createdBy: actor.sub,
          },
        ],
        { session },
      );
      await this.middlemen.adjustForRefund(session, {
        paymentId: payment._id,
        refundId: refund._id,
        refundPaise: dto.amount,
        salonReversalPaise: reversal,
      });
      if (dto.amount + already === payment.amount && payment.membershipId) {
        const used = await this.redemptions.countDocuments({ membershipId: payment.membershipId }).session(session);
        if (used === 0) {
          await this.memberships.findByIdAndUpdate(
            payment.membershipId,
            { status: MembershipStatus.CANCELLED },
            { session },
          );
        }
      }
      await this.audits.create(
        [
          {
            actorId: actor.sub,
            action: 'REFUND_RECORDED',
            entityType: 'refund',
            entityId: refund._id,
            metadata: { paymentId: payment._id, amount: dto.amount, reversal },
          },
        ],
        { session },
      );
      return toPublic(refund);
    });
  }
}
