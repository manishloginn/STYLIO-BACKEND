import { createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { hash } from 'bcryptjs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import request from 'supertest';
import { MongoDoc } from '../src/common/interfaces/mongo-doc';

describe('critical flows', () => {
  let app: INestApplication;
  let replSet: MongoMemoryReplSet;
  let server: any;
  let seq = 100;
  let adminToken = '';
  let owner: { token: string; phone: string };
  let otherOwner: { token: string };
  let customer: { token: string; phone: string; id: string };
  let salonId = '';
  let branchId = '';
  let otherBranchId = '';
  let beardId = '';
  let cutId = '';
  let facialId = '';

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      binary: { systemBinary: '/usr/bin/mongod' },
    });
    process.env.MONGODB_URI = replSet.getUri('stylio-test');
    const { createApp } = await import('../src/main');
    app = await createApp();
    await app.init();
    server = app.getHttpServer();
    const users = app.get<Model<MongoDoc>>(getModelToken('User'));
    await users.create({
      name: 'Platform Admin',
      phone: '9000000001',
      passwordHash: await hash('Admin1234', 10),
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    });
    const login = await request(server).post('/api/v1/auth/login').send({ phone: '9000000001', password: 'Admin1234' });
    adminToken = login.body.data.accessToken;
    owner = await register('SALON_OWNER', 'Owner One');
    otherOwner = await register('SALON_OWNER', 'Owner Two');
    customer = await register('CUSTOMER', 'Asha Member');
    const salon = await request(server)
      .post('/api/v1/salons')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'North Studio',
        description: 'A development salon profile',
        salonType: 'UNISEX',
        city: 'Pune',
        phone: '9000001111',
      });
    salonId = salon.body.data.id;
    const branch = await request(server)
      .post(`/api/v1/salons/${salonId}/branches`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Koregaon', address: 'Lane 1', city: 'Pune' });
    branchId = branch.body.data.id;
    const other = await request(server)
      .post(`/api/v1/salons/${salonId}/branches`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Baner', address: 'Lane 2', city: 'Pune' });
    otherBranchId = other.body.data.id;
    await request(server)
      .post(`/api/v1/admin/branches/${branchId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'VERIFIED' });
    await request(server)
      .post(`/api/v1/admin/branches/${otherBranchId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'VERIFIED' });
    await request(server)
      .post(`/api/v1/admin/salons/${salonId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });
    beardId = await addService('Beard trim', 'Beard', 30000);
    cutId = await addService('Haircut', 'Hair', 50000);
    facialId = await addService('Facial', 'Skin', 200000);
    await request(server)
      .post('/api/v1/admin/commission-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rateBps: 800, effectiveFrom: new Date('2020-01-01').toISOString() })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
    await replSet?.stop();
  });

  it('registers, logs in, and rejects the wrong role', async () => {
    const fresh = await register('CUSTOMER', 'Login User');
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ phone: fresh.phone, password: 'Secret123' });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();
    const otp = await request(server).post('/api/v1/auth/otp/request').send({ phone: fresh.phone });
    expect(otp.body.data.devCode).toBe('482913');
    const verified = await request(server)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: fresh.phone, code: '482913' });
    expect(verified.status).toBe(200);
    const denied = await request(server)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${fresh.token}`);
    expect(denied.status).toBe(403);
  });

  it('keeps salon data inside the owning salon and hides unapproved salons', async () => {
    const hidden = await request(server)
      .post('/api/v1/salons')
      .set('Authorization', `Bearer ${otherOwner.token}`)
      .send({
        name: 'Hidden Atelier',
        description: 'Not approved',
        salonType: 'SPA',
        city: 'Pune',
        phone: '9000002222',
      });
    const hiddenId = hidden.body.data.id;
    const discovery = await request(server).get('/api/v1/salons?q=Hidden');
    expect(discovery.body.data.find((row: { name: string }) => row.name === 'Hidden Atelier')).toBeUndefined();
    const missing = await request(server).get(`/api/v1/salons/${hiddenId}`);
    expect(missing.status).toBe(404);
    const scoped = await request(server)
      .get(`/api/v1/salons/${salonId}/staff`)
      .set('Authorization', `Bearer ${otherOwner.token}`);
    expect(scoped.status).toBe(403);
  });

  it('stores both plan sources and rejects an incomplete service plan', async () => {
    const existing = await publishPlan({
      name: 'Existing beard pack',
      planType: 'SERVICE',
      planSource: 'EXISTING',
      externalPlanId: 'legacy-44',
      sellingPrice: 150000,
      items: [
        { serviceId: beardId, quantityLimit: 4 },
        { serviceId: cutId, quantityLimit: 1 },
      ],
    });
    expect(existing.planSource).toBe('EXISTING');
    const created = await publishPlan({
      name: 'Stylio cut plan',
      planType: 'SERVICE',
      planSource: 'STYLIO_CREATED',
      sellingPrice: 90000,
      items: [{ serviceId: cutId, quantityLimit: 3 }],
    });
    expect(created.planSource).toBe('STYLIO_CREATED');
    const invalid = await request(server)
      .post(`/api/v1/salons/${salonId}/membership-plans`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(planBody({ planType: 'SERVICE', items: [{ serviceId: cutId }] }));
    expect(invalid.status).toBe(400);
    const rejected = await request(server)
      .post(`/api/v1/salons/${salonId}/membership-plans`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(planBody({ name: 'Rejected plan', planType: 'SERVICE', items: [{ serviceId: cutId, quantityLimit: 1 }] }));
    await request(server)
      .post(`/api/v1/membership-plans/${rejected.body.data.id}/submit`)
      .set('Authorization', `Bearer ${owner.token}`);
    await request(server)
      .post(`/api/v1/admin/plans/${rejected.body.data.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', note: 'Incomplete terms' });
    const hidden = await request(server).get(`/api/v1/membership-plans/${rejected.body.data.id}`);
    expect(hidden.status).toBe(404);
  });

  it('ignores duplicate and failed payments and keeps the purchase snapshot', async () => {
    const plan = await publishPlan({
      name: 'Snapshot plan',
      planType: 'SERVICE',
      sellingPrice: 150000,
      items: [{ serviceId: beardId, quantityLimit: 4 }],
    });
    const order = await request(server)
      .post('/api/v1/payments/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ planId: plan.id });
    expect(order.status).toBe(201);
    const paymentId = order.body.data.id;
    const mismatch = signed({
      gatewayOrderId: order.body.data.gatewayOrderId,
      gatewayPaymentId: 'pay_mismatch',
      amount: 100,
      status: 'PAID',
    });
    const mismatched = await request(server)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-stylio-signature', mismatch.signature)
      .send(mismatch.raw);
    expect(mismatched.status).toBe(400);
    const failedOrder = await request(server)
      .post('/api/v1/payments/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ planId: plan.id });
    const failed = await request(server)
      .post('/api/v1/payments/dev/confirm')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ paymentId: failedOrder.body.data.id, status: 'FAILED' });
    expect(failed.body.data.membership).toBeNull();
    const paid = await request(server)
      .post('/api/v1/payments/dev/confirm')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ paymentId, status: 'PAID' });
    expect(paid.status).toBe(200);
    const again = await request(server)
      .post('/api/v1/payments/dev/confirm')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ paymentId, status: 'PAID' });
    expect(again.body.data.duplicate).toBe(true);
    expect(again.body.data.membership.id).toBe(paid.body.data.membership.id);
    await request(server)
      .patch(`/api/v1/membership-plans/${plan.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(planBody({ name: 'Snapshot plan', sellingPrice: 999, items: [{ serviceId: beardId, quantityLimit: 4 }] }));
    const pass = await request(server)
      .get(`/api/v1/memberships/${paid.body.data.membership.id}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(pass.body.data.planSnapshot.sellingPrice).toBe(150000);
    expect(pass.body.data.purchasePrice).toBe(150000);
    const memberships = app.get<Model<MongoDoc>>(getModelToken('Membership'));
    const count = await memberships.countDocuments({ userId: customer.id, planId: plan.id });
    expect(count).toBe(1);
  });

  it('checks off one service unit per OTP and blocks replay, expiry, and the wrong branch', async () => {
    const plan = await publishPlan({
      name: 'Beard and cut',
      planType: 'SERVICE',
      sellingPrice: 150000,
      items: [
        { serviceId: beardId, quantityLimit: 4 },
        { serviceId: cutId, quantityLimit: 1 },
      ],
    });
    const membershipId = await buy(plan.id);
    const first = await otp(membershipId, beardId);
    const wrongBranch = await request(server)
      .post('/api/v1/redemptions/verify')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: first.code, branchId: otherBranchId });
    expect(wrongBranch.status).toBe(400);
    const verified = await request(server)
      .post('/api/v1/redemptions/verify')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: first.code, branchId });
    expect(verified.status).toBe(200);
    const replay = await request(server)
      .post('/api/v1/redemptions/verify')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: first.code, branchId });
    expect(replay.status).toBe(400);
    const pass = await request(server)
      .get(`/api/v1/memberships/${membershipId}`)
      .set('Authorization', `Bearer ${customer.token}`);
    const beard = pass.body.data.entitlements.find((row: { serviceId: string }) => row.serviceId === beardId);
    const cut = pass.body.data.entitlements.find((row: { serviceId: string }) => row.serviceId === cutId);
    expect(beard.consumedQuantity).toBe(1);
    expect(cut.consumedQuantity).toBe(0);
    await request(server)
      .post(`/api/v1/redemptions/${verified.body.data.id}/reverse`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const restored = await request(server)
      .get(`/api/v1/memberships/${membershipId}`)
      .set('Authorization', `Bearer ${customer.token}`);
    const beardAgain = restored.body.data.entitlements.find((row: { serviceId: string }) => row.serviceId === beardId);
    expect(beardAgain.consumedQuantity).toBe(0);
    const ledger = app.get<Model<MongoDoc>>(getModelToken('EntitlementLedger'));
    const rows = await ledger.find({ membershipId }).lean();
    expect(rows.some((row) => row.entryType === 'CONSUME')).toBe(true);
    expect(rows.some((row) => row.entryType === 'REVERSE')).toBe(true);
    const memberships = app.get<Model<MongoDoc>>(getModelToken('Membership'));
    await memberships.updateOne({ _id: membershipId }, { expiresAt: new Date(Date.now() - 1000) });
    const expired = await request(server)
      .post('/api/v1/redemptions/challenges')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ membershipId, serviceId: cutId });
    expect(expired.status).toBe(400);
  });

  it('enforces value and combined limits', async () => {
    const valuePlan = await publishPlan({
      name: 'Value plan',
      planType: 'VALUE',
      sellingPrice: 1500000,
      serviceValueLimit: 2000000,
      items: [
        { serviceId: cutId, valueDeduction: 50000 },
        { serviceId: facialId, valueDeduction: 200000 },
      ],
    });
    const valueMembership = await buy(valuePlan.id);
    const valueOtp = await otp(valueMembership, cutId);
    await request(server)
      .post('/api/v1/redemptions/verify')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: valueOtp.code, branchId })
      .expect(200);
    const valuePass = await request(server)
      .get(`/api/v1/memberships/${valueMembership}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(valuePass.body.data.entitlements[0].consumedValue).toBe(50000);

    const bothPlan = await publishPlan({
      name: 'Both plan',
      planType: 'BOTH',
      sellingPrice: 200000,
      serviceValueLimit: 100000,
      items: [{ serviceId: cutId, quantityLimit: 4, valueDeduction: 80000 }],
    });
    const bothMembership = await buy(bothPlan.id);
    const bothOtp = await otp(bothMembership, cutId);
    await request(server)
      .post('/api/v1/redemptions/verify')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: bothOtp.code, branchId })
      .expect(200);
    const blocked = await request(server)
      .post('/api/v1/redemptions/challenges')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ membershipId: bothMembership, serviceId: cutId });
    expect(blocked.status).toBe(400);

    const qtyPlan = await publishPlan({
      name: 'Both quantity',
      planType: 'BOTH',
      sellingPrice: 100000,
      serviceValueLimit: 500000,
      items: [{ serviceId: beardId, quantityLimit: 1, valueDeduction: 10000 }],
    });
    const qtyMembership = await buy(qtyPlan.id);
    const qtyOtp = await otp(qtyMembership, beardId);
    await request(server)
      .post('/api/v1/redemptions/verify')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: qtyOtp.code, branchId })
      .expect(200);
    const qtyBlocked = await request(server)
      .post('/api/v1/redemptions/challenges')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ membershipId: qtyMembership, serviceId: beardId });
    expect(qtyBlocked.status).toBe(400);
  });

  it('records a salon-funded discount and snapshots commission only for Stylio sales', async () => {
    const plan = await publishPlan({
      name: 'Member rate',
      planType: 'DISCOUNT',
      sellingPrice: 50000,
      discountPercentage: 10,
      items: [{ serviceId: cutId }],
    });
    const membershipId = await buy(plan.id);
    const code = await otp(membershipId, cutId);
    const redeemed = await request(server)
      .post('/api/v1/redemptions/verify')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: code.code, branchId });
    expect(redeemed.body.data.discountAmount).toBe(5000);
    expect(redeemed.body.data.customerPayable).toBe(45000);
    const commissions = app.get<Model<MongoDoc>>(getModelToken('Commission'));
    const stylioCommission = await commissions.findOne({ membershipId }).lean();
    expect(stylioCommission?.rateBps).toBe(800);
    expect(stylioCommission?.commissionPaise).toBe(4000);
    const direct = await request(server)
      .post('/api/v1/memberships/direct')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ planId: plan.id, customerPhone: customer.phone, idempotencyKey: `direct-${Date.now()}` });
    expect(direct.status).toBe(201);
    const directCommission = await commissions.findOne({ membershipId: direct.body.data.membership.id }).lean();
    expect(directCommission).toBeNull();
    await request(server)
      .post('/api/v1/admin/commission-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rateBps: 2000, effectiveFrom: new Date().toISOString() });
    const payment = await app.get<Model<MongoDoc>>(getModelToken('Payment')).findOne({ membershipId, gateway: { $ne: 'DIRECT' } });
    const refund = await request(server)
      .post('/api/v1/admin/refunds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentId: payment?._id, amount: 50000, reason: 'Test refund' });
    expect(refund.status).toBe(201);
    expect(refund.body.data.commissionReversalPaise).toBe(4000);
    expect(refund.body.data.rateBpsSnapshot).toBe(800);
  });

  it('pays a middleman from the salon commission and keeps direct sales unchanged', async () => {
    await request(server)
      .post('/api/v1/admin/commission-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salonId, rateBps: 600, effectiveFrom: new Date('2020-01-01').toISOString() })
      .expect(201);
    const denied = await request(server)
      .post('/api/v1/admin/middlemen')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ name: 'Referral Partner', phone: '9000002222', defaultRateBps: 300 });
    expect(denied.status).toBe(403);
    const created = await request(server)
      .post('/api/v1/admin/middlemen')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Referral Partner', phone: '9000002222', defaultRateBps: 300 });
    expect(created.status).toBe(201);
    const middlemanId = created.body.data.id as string;
    const tooHigh = await request(server)
      .post(`/api/v1/admin/middlemen/${middlemanId}/mappings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salonId, agreedRateBps: 9_500 });
    expect(tooHigh.status).toBe(400);
    const mapped = await request(server)
      .post(`/api/v1/admin/middlemen/${middlemanId}/mappings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salonId, agreedRateBps: 300 });
    expect(mapped.status).toBe(201);

    const plan = await publishPlan({
      name: 'Middleman plan',
      sellingPrice: 1_000_000,
      items: [{ serviceId: cutId, quantityLimit: 1 }],
    });
    const failedOrder = await request(server)
      .post('/api/v1/payments/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ planId: plan.id });
    expect(failedOrder.status).toBe(201);
    await request(server)
      .post('/api/v1/payments/dev/confirm')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ paymentId: failedOrder.body.data.id, status: 'FAILED' })
      .expect(200);
    const paidOrder = await request(server)
      .post('/api/v1/payments/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ planId: plan.id });
    await request(server)
      .post('/api/v1/payments/dev/confirm')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ paymentId: paidOrder.body.data.id, status: 'PAID' })
      .expect(200);
    await request(server)
      .post('/api/v1/payments/dev/confirm')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ paymentId: paidOrder.body.data.id, status: 'PAID' })
      .expect(200);

    const ledger = app.get<Model<MongoDoc>>(getModelToken('CommissionTransaction'));
    expect(await ledger.find({ paymentId: failedOrder.body.data.id }).lean()).toHaveLength(0);
    const earn = await ledger.findOne({ paymentId: paidOrder.body.data.id, entryType: 'EARN' }).lean();
    expect(await ledger.countDocuments({ paymentId: paidOrder.body.data.id })).toBe(1);
    expect(earn?.salonRateBps).toBe(900);
    expect(earn?.middlemanRateBps).toBe(300);
    expect(earn?.salonCommissionPaise).toBe(90_000);
    expect(earn?.middlemanCommissionPaise).toBe(30_000);
    expect(earn?.stylioCommissionPaise).toBe(60_000);
    const commission = await app
      .get<Model<MongoDoc>>(getModelToken('Commission'))
      .findOne({ paymentId: paidOrder.body.data.id })
      .lean();
    expect(commission?.baseRateBps).toBe(600);
    expect(commission?.middlemanRateBps).toBe(300);
    expect(commission?.commissionPaise).toBe(90_000);
    expect(commission?.salonPayablePaise).toBe(910_000);

    const direct = await request(server)
      .post('/api/v1/memberships/direct')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ planId: plan.id, customerPhone: customer.phone, idempotencyKey: `direct-mm-${Date.now()}` });
    expect(direct.status).toBe(201);
    expect(await ledger.countDocuments({ membershipId: direct.body.data.membership.id })).toBe(0);

    const partial = await request(server)
      .post('/api/v1/admin/refunds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentId: paidOrder.body.data.id, amount: 500_000, reason: 'Partial refund' });
    expect(partial.status).toBe(201);
    expect(partial.body.data.commissionReversalPaise).toBe(45_000);
    const afterPartial = await ledger.findOne({ paymentId: paidOrder.body.data.id, entryType: 'EARN' }).lean();
    expect(afterPartial?.middlemanReversedPaise).toBe(15_000);
    expect(afterPartial?.stylioReversedPaise).toBe(30_000);
    const rest = await request(server)
      .post('/api/v1/admin/refunds')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentId: paidOrder.body.data.id, amount: 500_000, reason: 'Remaining refund' });
    expect(rest.status).toBe(201);
    const afterFull = await ledger.findOne({ paymentId: paidOrder.body.data.id, entryType: 'EARN' }).lean();
    expect(afterFull?.middlemanReversedPaise).toBe(30_000);
    expect(afterFull?.stylioReversedPaise).toBe(60_000);

    const second = await request(server)
      .post('/api/v1/admin/middlemen')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Second Partner', phone: '9000003333', defaultRateBps: 100 });
    expect(second.status).toBe(201);
    const reassigned = await request(server)
      .post(`/api/v1/admin/middlemen/${second.body.data.id}/mappings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salonId, agreedRateBps: 100 });
    expect(reassigned.status).toBe(400);
    expect(reassigned.body.error.message).toMatch(/already has/);
    const unchanged = await ledger.findOne({ paymentId: paidOrder.body.data.id, entryType: 'EARN' }).lean();
    expect(unchanged?.middlemanId).toBe(middlemanId);

    await request(server)
      .post('/api/v1/admin/commission-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salonId, rateBps: 50, effectiveFrom: new Date().toISOString() })
      .expect(201);
    const skippedPlan = await publishPlan({
      name: 'Rate dropped',
      sellingPrice: 100_000,
      items: [{ serviceId: cutId, quantityLimit: 1 }],
    });
    const skippedMembership = await buy(skippedPlan.id);
    const skippedPayment = await app
      .get<Model<MongoDoc>>(getModelToken('Payment'))
      .findOne({ membershipId: skippedMembership, gateway: { $ne: 'DIRECT' } });
    expect(await ledger.countDocuments({ paymentId: skippedPayment?._id })).toBe(0);
    const skippedCommission = await app
      .get<Model<MongoDoc>>(getModelToken('Commission'))
      .findOne({ paymentId: skippedPayment?._id })
      .lean();
    expect(skippedCommission?.rateBps).toBe(50);
  });

  async function register(role: string, name: string) {
    seq += 1;
    const phone = `8${String(seq).padStart(9, '0')}`;
    const res = await request(server).post('/api/v1/auth/register').send({
      name,
      phone,
      password: 'Secret123',
      role,
    });
    expect(res.status).toBe(201);
    return { token: res.body.data.accessToken as string, phone, id: res.body.data.user.id as string };
  }

  async function addService(name: string, category: string, retailPrice: number) {
    const res = await request(server)
      .post(`/api/v1/salons/${salonId}/services`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name, category, retailPrice });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  function planBody(overrides: Record<string, unknown>) {
    return {
      name: 'Plan',
      description: 'Membership terms',
      planType: 'SERVICE',
      planSource: 'STYLIO_CREATED',
      sellingPrice: 100000,
      validityDays: 180,
      stackingAllowed: false,
      terms: 'Valid at listed branches. Unused units expire.',
      restrictions: 'One service visit at a time. No cash withdrawal.',
      branchIds: [branchId],
      items: [{ serviceId: cutId, quantityLimit: 1 }],
      ...overrides,
    };
  }

  async function publishPlan(overrides: Record<string, unknown>) {
    const created = await request(server)
      .post(`/api/v1/salons/${salonId}/membership-plans`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(planBody(overrides));
    expect(created.status).toBe(201);
    await request(server)
      .post(`/api/v1/membership-plans/${created.body.data.id}/submit`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);
    const decision = await request(server)
      .post(`/api/v1/admin/plans/${created.body.data.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PUBLISHED' });
    expect(decision.status).toBe(201);
    return decision.body.data;
  }

  async function buy(planId: string) {
    const order = await request(server)
      .post('/api/v1/payments/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ planId });
    expect(order.status).toBe(201);
    const paid = await request(server)
      .post('/api/v1/payments/dev/confirm')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ paymentId: order.body.data.id, status: 'PAID' });
    expect(paid.status).toBe(200);
    return paid.body.data.membership.id as string;
  }

  async function otp(membershipId: string, serviceId: string) {
    const res = await request(server)
      .post('/api/v1/redemptions/challenges')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ membershipId, serviceId });
    expect(res.status).toBe(201);
    return res.body.data as { code: string };
  }

  function signed(body: Record<string, unknown>) {
    const raw = JSON.stringify(body);
    const signature = createHmac('sha256', 'test-webhook-secret').update(raw).digest('hex');
    return { raw, signature };
  }
});
