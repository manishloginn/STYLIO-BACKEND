import 'dotenv/config';
import { hash } from 'bcryptjs';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { MongoDoc } from '../common/interfaces/mongo-doc';

/**
 * Development sample data only. It is not real customer, salon, or payment data.
 * Refuses to run in production or without SEED=true.
 */
async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }
  if (process.env.SEED !== 'true') {
    throw new Error('Set SEED=true to load development sample data. This is not real customer data.');
  }
  const app = await NestFactory.createApplicationContext(AppModule);
  const users = app.get<Model<MongoDoc>>(getModelToken('User'));
  const salons = app.get<Model<MongoDoc>>(getModelToken('Salon'));
  const salonUsers = app.get<Model<MongoDoc>>(getModelToken('SalonUser'));
  const branches = app.get<Model<MongoDoc>>(getModelToken('Branch'));
  const services = app.get<Model<MongoDoc>>(getModelToken('SalonService'));
  const plans = app.get<Model<MongoDoc>>(getModelToken('MembershipPlan'));
  const items = app.get<Model<MongoDoc>>(getModelToken('MembershipPlanItem'));
  const planBranches = app.get<Model<MongoDoc>>(getModelToken('MembershipPlanBranch'));
  const rules = app.get<Model<MongoDoc>>(getModelToken('CommissionRule'));

  const admin = await upsertUser(users, {
    name: 'Sample Admin',
    phone: '9999999999',
    password: 'Admin12345',
    role: 'PLATFORM_ADMIN',
  });
  const owner = await upsertUser(users, {
    name: 'Sample Owner',
    phone: '8888888888',
    password: 'Owner12345',
    role: 'SALON_OWNER',
  });
  await upsertUser(users, {
    name: 'Sample Customer',
    phone: '7777777777',
    password: 'Member12345',
    role: 'CUSTOMER',
  });

  let salon = await salons.findOne({ name: 'Sample Atelier' });
  if (!salon) {
    salon = await salons.create({
      ownerId: owner._id,
      name: 'Sample Atelier',
      description: 'Development sample salon. Not a real business. Prices here are fictional.',
      salonType: 'UNISEX',
      city: 'Pune',
      phone: '8888888888',
      status: 'APPROVED',
      gallery: [],
    });
  }
  await salonUsers.updateOne(
    { userId: owner._id, salonId: salon._id },
    { role: 'OWNER', permissions: [] },
    { upsert: true },
  );
  let branch = await branches.findOne({ salonId: salon._id, name: 'Sample Branch' });
  if (!branch) {
    branch = await branches.create({
      salonId: salon._id,
      name: 'Sample Branch',
      address: '12 Sample Lane',
      city: 'Pune',
      status: 'VERIFIED',
    });
  }
  const beard = await upsertService(services, salon._id, 'Beard trim', 'Beard', 30000);
  const cut = await upsertService(services, salon._id, 'Haircut', 'Hair', 50000);
  await upsertPlan(plans, items, planBranches, {
    salonId: salon._id,
    createdBy: owner._id,
    branchId: branch._id,
    name: 'Sample beard membership',
    planSource: 'STYLIO_CREATED',
    sellingPrice: 150000,
    items: [
      { serviceId: beard._id, quantityLimit: 4 },
      { serviceId: cut._id, quantityLimit: 1 },
    ],
  });
  await upsertPlan(plans, items, planBranches, {
    salonId: salon._id,
    createdBy: owner._id,
    branchId: branch._id,
    name: 'Sample existing subscription',
    planSource: 'EXISTING',
    externalPlanId: 'sample-legacy-1',
    sellingPrice: 120000,
    items: [{ serviceId: cut._id, quantityLimit: 3 }],
  });
  const rule = await rules.findOne({ salonId: null, status: 'ACTIVE' });
  if (!rule) {
    await rules.create({
      salonId: null,
      baseRateBps: 800,
      middlemanRateBps: 0,
      rateBps: 800,
      effectiveFrom: new Date('2020-01-01'),
      status: 'ACTIVE',
      createdBy: admin._id,
    });
  }
  await app.close();
  console.log('Development sample data is ready. Accounts use the phones in README. No reviews were invented.');
}

async function upsertUser(
  users: Model<MongoDoc>,
  input: { name: string; phone: string; password: string; role: string },
) {
  const existing = await users.findOne({ phone: input.phone });
  if (existing) return existing;
  return users.create({
    name: input.name,
    phone: input.phone,
    passwordHash: await hash(input.password, 10),
    role: input.role,
    status: 'ACTIVE',
  });
}

async function upsertService(services: Model<MongoDoc>, salonId: string, name: string, category: string, retailPrice: number) {
  const existing = await services.findOne({ salonId, name });
  if (existing) return existing;
  return services.create({ salonId, name, category, retailPrice, active: true, description: 'Development sample service' });
}

async function upsertPlan(
  plans: Model<MongoDoc>,
  items: Model<MongoDoc>,
  planBranches: Model<MongoDoc>,
  input: {
    salonId: string;
    createdBy: string;
    branchId: string;
    name: string;
    planSource: string;
    sellingPrice: number;
    externalPlanId?: string;
    items: Array<{ serviceId: string; quantityLimit: number }>;
  },
) {
  let plan = await plans.findOne({ salonId: input.salonId, name: input.name });
  if (!plan) {
    plan = await plans.create({
      salonId: input.salonId,
      name: input.name,
      description: 'Development sample plan. Not a live offer.',
      planType: 'SERVICE',
      planSource: input.planSource,
      externalPlanId: input.externalPlanId,
      sellingPrice: input.sellingPrice,
      validityDays: 180,
      stackingAllowed: false,
      terms: 'Sample terms. Unused visits expire. This is not cash.',
      restrictions: 'One fresh OTP is required before every service.',
      status: 'PUBLISHED',
      createdBy: input.createdBy,
    });
    await items.insertMany(input.items.map((item) => ({ planId: plan!._id, ...item, excluded: false })));
    await planBranches.create({ planId: plan._id, branchId: input.branchId });
  }
  return plan;
}

void seed();
