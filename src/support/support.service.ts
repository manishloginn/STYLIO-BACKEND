import { MongoDoc } from '../common/interfaces/mongo-doc';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TicketStatus } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { toPublic } from '../common/utils/public';
import { CreateTicketDto, UpdateTicketDto } from './support.dto';

@Injectable()
export class SupportService {
  constructor(@InjectModel('SupportTicket') private readonly tickets: Model<MongoDoc>) {}

  async create(user: AuthUser, dto: CreateTicketDto) {
    const ticket = await this.tickets.create({
      userId: user.sub,
      salonId: dto.salonId,
      subject: dto.subject,
      message: dto.message,
      status: TicketStatus.OPEN,
      updates: [],
    });
    return toPublic(ticket);
  }

  async mine(user: AuthUser) {
    const rows = await this.tickets.find({ userId: user.sub }).sort({ createdAt: -1 }).lean();
    return rows.map((row) => toPublic(row));
  }

  async all() {
    const rows = await this.tickets.find().sort({ createdAt: -1 }).limit(200).lean();
    return rows.map((row) => toPublic(row));
  }

  async update(actor: AuthUser, id: string, dto: UpdateTicketDto) {
    const ticket = await this.tickets.findById(id);
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (dto.status) ticket.status = dto.status;
    if (dto.message) {
      ticket.updates.push({ actorId: actor.sub, message: dto.message, at: new Date() });
    }
    await ticket.save();
    return toPublic(ticket);
  }
}
