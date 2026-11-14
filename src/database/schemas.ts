import { uuidSchema } from './schema.plugin';

export const UserSchema = uuidSchema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    email: { type: String },
    passwordHash: { type: String },
    role: { type: String, required: true },
    status: { type: String, required: true, default: 'ACTIVE' },
    refreshTokenHash: { type: String },
    otpHash: { type: String },
    otpExpiresAt: { type: Date },
  },
  'users',
);
UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true, sparse: true });

export const SalonSchema = uuidSchema(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    salonType: { type: String, required: true },
    city: { type: String, required: true },
    phone: { type: String, required: true },
    coverImage: { type: String },
    gallery: { type: [String], default: [] },
    status: { type: String, required: true, default: 'PENDING' },
    reviewNote: { type: String },
  },
  'salons',
);
SalonSchema.index({ status: 1, city: 1 });
SalonSchema.index({ name: 1 });

export const SalonUserSchema = uuidSchema(
  {
    userId: { type: String, required: true },
    salonId: { type: String, required: true },
    role: { type: String, required: true },
    permissions: { type: [String], default: [] },
  },
  'salon_users',
);
SalonUserSchema.index({ userId: 1, salonId: 1 }, { unique: true });
SalonUserSchema.index({ salonId: 1 });

export const BranchSchema = uuidSchema(
  {
    salonId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    latitude: { type: Number },
    longitude: { type: Number },
    status: { type: String, required: true, default: 'PENDING' },
    reviewNote: { type: String },
  },
  'branches',
);

export const SalonServiceSchema = uuidSchema(
  {
    salonId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, default: '' },
    retailPrice: { type: Number, required: true },
    active: { type: Boolean, default: true },
  },
  'salon_services',
);
SalonServiceSchema.index({ salonId: 1, category: 1 });

export const MembershipPlanSchema = uuidSchema(
  {
    salonId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    planType: { type: String, required: true },
    planSource: { type: String, required: true },
    externalPlanId: { type: String },
    sellingPrice: { type: Number, required: true },
    validityDays: { type: Number, required: true },
    serviceValueLimit: { type: Number },
    discountPercentage: { type: Number },
    discountCap: { type: Number },
    stackingAllowed: { type: Boolean, default: false },
    terms: { type: String, required: true },
    restrictions: { type: String, default: '' },
    status: { type: String, required: true, default: 'DRAFT' },
    createdBy: { type: String, required: true },
    reviewNote: { type: String },
  },
  'membership_plans',
);
MembershipPlanSchema.index({ salonId: 1, status: 1 });
MembershipPlanSchema.index({ status: 1, planSource: 1 });

export const MembershipPlanItemSchema = uuidSchema(
  {
    planId: { type: String, required: true, index: true },
    serviceId: { type: String, required: true },
    quantityLimit: { type: Number },
    valueDeduction: { type: Number },
    excluded: { type: Boolean, default: false },
  },
  'membership_plan_items',
);

export const MembershipPlanBranchSchema = uuidSchema(
  {
    planId: { type: String, required: true },
    branchId: { type: String, required: true },
  },
  'membership_plan_branches',
);
MembershipPlanBranchSchema.index({ planId: 1, branchId: 1 }, { unique: true });

export const MembershipSchema = uuidSchema(
  {
    userId: { type: String, required: true, index: true },
    salonId: { type: String, required: true, index: true },
    planId: { type: String, required: true },
    planSnapshot: { type: Object, required: true },
    purchasePrice: { type: Number, required: true },
    planTypeSnapshot: { type: String, required: true },
    startsAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, required: true },
    source: { type: String, required: true },
  },
  'memberships',
);

export const MembershipEntitlementSchema = uuidSchema(
  {
    membershipId: { type: String, required: true, index: true },
    serviceId: { type: String },
    entitlementType: { type: String, required: true },
    totalValue: { type: Number, required: true, default: 0 },
    consumedValue: { type: Number, required: true, default: 0 },
    totalQuantity: { type: Number, required: true, default: 0 },
    consumedQuantity: { type: Number, required: true, default: 0 },
  },
  'membership_entitlements',
);

export const EntitlementLedgerSchema = uuidSchema(
  {
    membershipId: { type: String, required: true, index: true },
    entitlementId: { type: String, required: true },
    redemptionId: { type: String },
    entryType: { type: String, required: true },
    valueDelta: { type: Number, required: true },
    quantityDelta: { type: Number, required: true },
    idempotencyKey: { type: String, required: true },
  },
  'entitlement_ledger',
);
EntitlementLedgerSchema.index({ idempotencyKey: 1 }, { unique: true });

export const PaymentSchema = uuidSchema(
  {
    userId: { type: String, required: true, index: true },
    salonId: { type: String, required: true },
    planId: { type: String, required: true },
    membershipId: { type: String },
    gateway: { type: String, required: true },
    gatewayOrderId: { type: String },
    gatewayPaymentId: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'INR' },
    status: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    paidAt: { type: Date },
  },
  'payments',
);
PaymentSchema.index({ idempotencyKey: 1 }, { unique: true });
PaymentSchema.index({ gatewayOrderId: 1 }, { unique: true, sparse: true });

export const CommissionRuleSchema = uuidSchema(
  {
    salonId: { type: String },
    middlemanId: { type: String },
    baseRateBps: { type: Number },
    middlemanRateBps: { type: Number },
    rateBps: { type: Number, required: true },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    status: { type: String, required: true },
    createdBy: { type: String, required: true },
  },
  'commission_rules',
);
CommissionRuleSchema.index({ salonId: 1, status: 1, effectiveFrom: 1 });

export const CommissionSchema = uuidSchema(
  {
    paymentId: { type: String, required: true, index: true },
    membershipId: { type: String, required: true },
    salonId: { type: String, required: true, index: true },
    ruleId: { type: String, required: true },
    middlemanId: { type: String },
    baseRateBps: { type: Number },
    middlemanRateBps: { type: Number },
    rateBps: { type: Number, required: true },
    commissionPaise: { type: Number, required: true },
    salonPayablePaise: { type: Number, required: true },
    reversedPaise: { type: Number, required: true, default: 0 },
    payoutId: { type: String },
  },
  'commissions',
);

export const AttributionRecordSchema = uuidSchema(
  {
    customerId: { type: String, required: true },
    salonId: { type: String, required: true },
    source: { type: String, required: true },
    paymentId: { type: String, required: true },
    membershipId: { type: String, required: true },
  },
  'attribution_records',
);
AttributionRecordSchema.index({ membershipId: 1 }, { unique: true });

export const RedemptionChallengeSchema = uuidSchema(
  {
    membershipId: { type: String, required: true, index: true },
    serviceId: { type: String, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, required: true },
  },
  'redemption_challenges',
);
RedemptionChallengeSchema.index({ codeHash: 1, status: 1 });

export const RedemptionSchema = uuidSchema(
  {
    membershipId: { type: String, required: true, index: true },
    salonId: { type: String, required: true, index: true },
    branchId: { type: String, required: true },
    serviceId: { type: String, required: true },
    verifiedBy: { type: String, required: true },
    serviceQuantity: { type: Number, required: true },
    retailPriceSnapshot: { type: Number, required: true },
    entitlementDeduction: { type: Number, required: true },
    discountAmount: { type: Number, required: true, default: 0 },
    customerPayable: { type: Number, required: true, default: 0 },
    status: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    challengeId: { type: String, required: true },
    redeemedAt: { type: Date, required: true },
  },
  'redemptions',
);
RedemptionSchema.index({ idempotencyKey: 1 }, { unique: true });

export const SalonPayoutSchema = uuidSchema(
  {
    salonId: { type: String, required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    grossPaise: { type: Number, required: true },
    commissionPaise: { type: Number, required: true },
    reservePaise: { type: Number, required: true },
    netPaise: { type: Number, required: true },
    status: { type: String, required: true },
    note: { type: String, default: '' },
  },
  'salon_payouts',
);

export const ReserveLedgerSchema = uuidSchema(
  {
    salonId: { type: String, required: true, index: true },
    payoutId: { type: String, required: true },
    deltaPaise: { type: Number, required: true },
    reason: { type: String, required: true },
  },
  'reserve_ledger',
);

export const RefundSchema = uuidSchema(
  {
    paymentId: { type: String, required: true, index: true },
    membershipId: { type: String },
    amount: { type: Number, required: true },
    commissionReversalPaise: { type: Number, required: true, default: 0 },
    rateBpsSnapshot: { type: Number },
    status: { type: String, required: true },
    reason: { type: String, required: true },
    createdBy: { type: String, required: true },
  },
  'refunds',
);

export const MembershipEventSchema = uuidSchema(
  {
    membershipId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    actorId: { type: String },
    metadata: { type: Object, default: {} },
  },
  'membership_events',
);

export const AuditLogSchema = uuidSchema(
  {
    actorId: { type: String, required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    metadata: { type: Object, default: {} },
  },
  'audit_logs',
);
AuditLogSchema.index({ entityType: 1, entityId: 1 });

export const SupportTicketSchema = uuidSchema(
  {
    userId: { type: String, required: true, index: true },
    salonId: { type: String },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, required: true, default: 'OPEN' },
    updates: {
      type: [
        {
          actorId: String,
          message: String,
          at: Date,
        },
      ],
      default: [],
    },
  },
  'support_tickets',
);

export const ReviewSchema = uuidSchema(
  {
    userId: { type: String, required: true },
    salonId: { type: String, required: true, index: true },
    rating: { type: Number, required: true },
    comment: { type: String, default: '' },
  },
  'reviews',
);
ReviewSchema.index({ userId: 1, salonId: 1 }, { unique: true });

export const MiddlemanSchema = uuidSchema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    status: { type: String, required: true },
    defaultRateBps: { type: Number, required: true },
    notes: { type: String, default: '' },
    createdBy: { type: String, required: true },
  },
  'middlemen',
);
MiddlemanSchema.index({ phone: 1 }, { unique: true });
MiddlemanSchema.index({ email: 1 }, { unique: true, sparse: true });

export const MiddlemanSalonMappingSchema = uuidSchema(
  {
    middlemanId: { type: String, required: true, index: true },
    salonId: { type: String, required: true },
    agreedRateBps: { type: Number, required: true },
    status: { type: String, required: true },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    createdBy: { type: String, required: true },
    endedBy: { type: String },
  },
  'middleman_salon_mappings',
);
MiddlemanSalonMappingSchema.index(
  { salonId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);

export const CommissionTransactionSchema = uuidSchema(
  {
    paymentId: { type: String, required: true, index: true },
    membershipId: { type: String, required: true },
    salonId: { type: String, required: true, index: true },
    middlemanId: { type: String, required: true, index: true },
    entryType: { type: String, required: true },
    salonRuleId: { type: String, required: true },
    salonRateBps: { type: Number, required: true },
    middlemanRateBps: { type: Number, required: true },
    grossPaise: { type: Number, required: true },
    salonCommissionPaise: { type: Number, required: true },
    middlemanCommissionPaise: { type: Number, required: true },
    stylioCommissionPaise: { type: Number, required: true },
    middlemanReversedPaise: { type: Number, required: true, default: 0 },
    stylioReversedPaise: { type: Number, required: true, default: 0 },
    status: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    relatedTransactionId: { type: String },
    payoutId: { type: String },
    settledWithEarn: { type: Boolean, required: true, default: false },
  },
  'commission_transactions',
);
CommissionTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
CommissionTransactionSchema.index({ middlemanId: 1, status: 1 });

export const MiddlemanPayoutSchema = uuidSchema(
  {
    middlemanId: { type: String, required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    amountPaise: { type: Number, required: true },
    status: { type: String, required: true },
    note: { type: String, default: '' },
    createdBy: { type: String, required: true },
  },
  'middleman_payouts',
);

export const NotificationSchema = uuidSchema(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    readAt: { type: Date },
  },
  'notifications',
);
