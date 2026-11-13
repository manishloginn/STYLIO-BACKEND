export enum Role {
  CUSTOMER = 'CUSTOMER',
  SALON_OWNER = 'SALON_OWNER',
  SALON_STAFF = 'SALON_STAFF',
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export enum SalonStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export enum SalonType {
  UNISEX = 'UNISEX',
  MEN = 'MEN',
  WOMEN = 'WOMEN',
  SPA = 'SPA',
}

export enum BranchStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum SalonMemberRole {
  OWNER = 'OWNER',
  STAFF = 'STAFF',
}

export enum PlanType {
  VALUE = 'VALUE',
  SERVICE = 'SERVICE',
  BOTH = 'BOTH',
  DISCOUNT = 'DISCOUNT',
}

export enum PlanSource {
  EXISTING = 'EXISTING',
  STYLIO_CREATED = 'STYLIO_CREATED',
}

export enum PlanStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  PUBLISHED = 'PUBLISHED',
  PAUSED = 'PAUSED',
  REJECTED = 'REJECTED',
}

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  EXHAUSTED = 'EXHAUSTED',
}

export enum EntitlementType {
  VALUE = 'VALUE',
  QUANTITY = 'QUANTITY',
}

export enum LedgerEntryType {
  CONSUME = 'CONSUME',
  REVERSE = 'REVERSE',
  ADJUST = 'ADJUST',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

export enum AttributionSource {
  STYLIO = 'STYLIO',
  DIRECT = 'DIRECT',
}

export enum ChallengeStatus {
  ACTIVE = 'ACTIVE',
  USED = 'USED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum RedemptionStatus {
  COMPLETED = 'COMPLETED',
  REVERSED = 'REVERSED',
}

export enum RuleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum PayoutStatus {
  RECORDED = 'RECORDED',
}

export enum MiddlemanStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum MappingStatus {
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}

export enum CommissionEntryType {
  EARN = 'EARN',
  ADJUST = 'ADJUST',
}

export enum CommissionTxnStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  POSTED = 'POSTED',
}

export enum RefundStatus {
  COMPLETED = 'COMPLETED',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
}

export const SALON_PERMISSIONS = [
  'profile:write',
  'branches:write',
  'services:write',
  'plans:write',
  'memberships:read',
  'redemptions:verify',
  'sales:read',
  'sales:write',
  'staff:write',
  'reports:read',
] as const;

export type SalonPermission = (typeof SALON_PERMISSIONS)[number];
