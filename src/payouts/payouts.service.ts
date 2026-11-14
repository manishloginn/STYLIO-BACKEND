import { MongoDoc } from '../common/interfaces/mongo-doc';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { PayoutStatus } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { withTransaction } from '../common/transaction';
import { subtractPaise } from '../common/utils/money';
import { toPublic } from '../common/utils/public';
import { SalonAccessService } from '../salons/salon-access.service';
import { CreatePayoutDto } from './payouts.dto';

@Injectable()
export class PayoutsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel('Commission') private readonly commissions: Model<MongoDoc>,
    @InjectModel('Payment') private readonly payments: Model<MongoDoc>,
    @InjectModel('SalonPayout') private readonly payouts: Model<MongoDoc>,
    @InjectModel('ReserveLedger') private readonly reserves: Model<MongoDoc>,
    @InjectModel('AuditLog') private readonly audits: Model<MongoDoc>,
    private readonly access: SalonAccessService,
  ) {}

  async forSalon(user: AuthUser, salonId: string) {
    await this.access.assert(user, salonId, 'reports:read');
    const [payouts, reserves] = await Promise.all([
      this.payouts.find({ salonId }).sort({ createdAt: -1 }).lean(),
      this.reserves.find({ salonId }).sort({ createdAt: -1 }).lean(),
    ]);
    return {
      payouts: payouts.map((row) => toPublic(row)),
      reserves: reserves.map((row) => toPublic(row)),
    };
  }

  async listReserves() {
    const rows = await this.reserves.find().sort({ createdAt: -1 }).limit(200).lean();
    return rows.map((row) => toPublic(row));
  }

  async listAll() {
    const rows = await this.payouts.find().sort({ createdAt: -1 }).limit(100).lean();
    return rows.map((row) => toPublic(row));
  }

  async create(actor: AuthUser, dto: CreatePayoutDto) {
    return withTransaction(this.connection, async (session) => {
      const rows = await this.commissions
        .find({
          salonId: dto.salonId,
          payoutId: null,
          createdAt: { $gte: new Date(dto.periodStart), $lte: new Date(dto.periodEnd) },
        })
        .session(session);
      if (rows.length === 0) throw new BadRequestException('No unsettled commission in that period');
      const paymentIds = rows.map((row) => row.paymentId);
      const payments = await this.payments.find({ _id: { $in: paymentIds } }).session(session).lean();
      const grossPaise = payments.reduce((sum, payment) => sum + payment.amount, 0);
      const commissionPaise = rows.reduce((sum, row) => sum + row.commissionPaise - row.reversedPaise, 0);
      const salonPayable = grossPaise - commissionPaise;
      if (dto.reservePaise > salonPayable) {
        throw new BadRequestException('Reserve cannot exceed the salon payable');
      }
      const netPaise = subtractPaise(salonPayable, dto.reservePaise);
      const [payout] = await this.payouts.create(
        [
          {
            salonId: dto.salonId,
            periodStart: new Date(dto.periodStart),
            periodEnd: new Date(dto.periodEnd),
            grossPaise,
            commissionPaise,
            reservePaise: dto.reservePaise,
            netPaise,
            status: PayoutStatus.RECORDED,
            note: dto.note ?? 'Recorded for review. No bank transfer was sent.',
          },
        ],
        { session },
      );
      await this.commissions.updateMany(
        { _id: { $in: rows.map((row) => row._id) } },
        { $set: { payoutId: payout._id } },
        { session },
      );
      if (dto.reservePaise > 0) {
        await this.reserves.create(
          [
            {
              salonId: dto.salonId,
              payoutId: payout._id,
              deltaPaise: dto.reservePaise,
              reason: 'Held from a recorded settlement. This is a salon payable, not Stylio revenue.',
            },
          ],
          { session },
        );
      }
      await this.audits.create(
        [
          {
            actorId: actor.sub,
            action: 'PAYOUT_RECORDED',
            entityType: 'salon_payout',
            entityId: payout._id,
            metadata: { salonId: dto.salonId, netPaise },
          },
        ],
        { session },
      );
      return toPublic(payout);
    });
  }
}
