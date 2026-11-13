import { MongoDoc } from '../common/interfaces/mongo-doc';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PaymentStatus, SalonStatus } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { SalonAccessService } from '../salons/salon-access.service';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel('Salon') private readonly salons: Model<MongoDoc>,
    @InjectModel('Membership') private readonly memberships: Model<MongoDoc>,
    @InjectModel('Payment') private readonly payments: Model<MongoDoc>,
    @InjectModel('Redemption') private readonly redemptions: Model<MongoDoc>,
    @InjectModel('Commission') private readonly commissions: Model<MongoDoc>,
    @InjectModel('SalonPayout') private readonly payouts: Model<MongoDoc>,
    private readonly access: SalonAccessService,
  ) {}

  async admin() {
    const [pendingSalons, activeMemberships, paid, redemptions, commission] = await Promise.all([
      this.salons.countDocuments({ status: SalonStatus.PENDING }),
      this.memberships.countDocuments({ status: 'ACTIVE' }),
      this.payments.aggregate([
        { $match: { status: PaymentStatus.PAID, gateway: { $ne: 'DIRECT' } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      this.redemptions.countDocuments({ status: 'COMPLETED' }),
      this.commissions.aggregate([
        { $group: { _id: null, total: { $sum: { $subtract: ['$commissionPaise', '$reversedPaise'] } } } },
      ]),
    ]);
    return {
      pendingSalons,
      activeMemberships,
      stylioSalesPaise: paid[0]?.total ?? 0,
      stylioSalesCount: paid[0]?.count ?? 0,
      redemptions,
      commissionPaise: commission[0]?.total ?? 0,
    };
  }

  async salon(user: AuthUser, salonId: string, from?: string, to?: string) {
    await this.access.assert(user, salonId, 'reports:read');
    const bounds = this.bounds(from, to);
    const [sales, activeMemberships, redemptions, commission, payouts] = await Promise.all([
      this.payments.aggregate([
        { $match: { salonId, status: PaymentStatus.PAID, ...(bounds ? { paidAt: bounds } : {}) } },
        { $group: { _id: '$gateway', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      this.memberships.countDocuments({ salonId, status: 'ACTIVE', ...(bounds ? { createdAt: bounds } : {}) }),
      this.redemptions.countDocuments({ salonId, status: 'COMPLETED', ...(bounds ? { redeemedAt: bounds } : {}) }),
      this.commissions.aggregate([
        { $match: { salonId, ...(bounds ? { createdAt: bounds } : {}) } },
        {
          $group: {
            _id: null,
            commission: { $sum: { $subtract: ['$commissionPaise', '$reversedPaise'] } },
            payable: { $sum: '$salonPayablePaise' },
          },
        },
      ]),
      this.payouts.find({ salonId, status: 'RECORDED', ...(bounds ? { createdAt: bounds } : {}) }).lean(),
    ]);
    const stylioRows = sales.filter((row) => row._id !== 'DIRECT');
    const direct = sales.find((row) => row._id === 'DIRECT');
    const pendingSettlement = payouts.reduce((sum, row) => sum + row.netPaise, 0);
    return {
      stylioSalesPaise: stylioRows.reduce((sum, row) => sum + row.total, 0),
      stylioSalesCount: stylioRows.reduce((sum, row) => sum + row.count, 0),
      directSalesPaise: direct?.total ?? 0,
      activeMemberships,
      redemptions,
      commissionPaise: commission[0]?.commission ?? 0,
      salonPayablePaise: commission[0]?.payable ?? 0,
      recordedSettlementsPaise: pendingSettlement,
    };
  }

  private bounds(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const range: { $gte?: Date; $lt?: Date } = {};
    if (from) range.$gte = this.parseDate(from, 'from');
    if (to) range.$lt = this.parseDate(to, 'to');
    if (range.$gte && range.$lt && range.$gte.getTime() >= range.$lt.getTime()) {
      throw new BadRequestException('from must be before to');
    }
    return range;
  }

  private parseDate(value: string, name: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${name} is not a valid date`);
    return date;
  }
}
