import { BadRequestException } from '@nestjs/common';
import { EntitlementType, PlanType } from '../common/enums';
import { percentOf } from '../common/utils/money';

export interface PlanShape {
  planType: PlanType;
  sellingPrice: number;
  validityDays: number;
  serviceValueLimit?: number | null;
  discountPercentage?: number | null;
  discountCap?: number | null;
}

export interface PlanItemShape {
  serviceId: string;
  quantityLimit?: number | null;
  valueDeduction?: number | null;
  excluded?: boolean;
}

export interface EntitlementDraft {
  serviceId: string | null;
  entitlementType: EntitlementType;
  totalValue: number;
  totalQuantity: number;
}

export function validatePlanDefinition(plan: PlanShape, items: PlanItemShape[]): void {
  if (!Number.isInteger(plan.sellingPrice) || plan.sellingPrice < 0) {
    throw new BadRequestException('Selling price must be a non-negative integer in paise');
  }
  if (!Number.isInteger(plan.validityDays) || plan.validityDays < 1) {
    throw new BadRequestException('Validity must be at least 1 day');
  }
  const included = items.filter((item) => !item.excluded);
  if (included.length === 0) {
    throw new BadRequestException('Add at least one eligible service');
  }
  if (plan.planType === PlanType.VALUE || plan.planType === PlanType.BOTH) {
    if (!plan.serviceValueLimit || plan.serviceValueLimit <= 0) {
      throw new BadRequestException('Service-value entitlement is required for this plan type');
    }
    for (const item of included) {
      if (!item.valueDeduction || item.valueDeduction <= 0) {
        throw new BadRequestException('Each eligible service needs an entitlement deduction');
      }
    }
  }
  if (plan.planType === PlanType.SERVICE || plan.planType === PlanType.BOTH) {
    for (const item of included) {
      if (!item.quantityLimit || item.quantityLimit < 1) {
        throw new BadRequestException('Each eligible service needs a quantity of at least 1');
      }
    }
  }
  if (plan.planType === PlanType.DISCOUNT) {
    if (
      plan.discountPercentage == null ||
      !Number.isInteger(plan.discountPercentage) ||
      plan.discountPercentage < 0 ||
      plan.discountPercentage > 100
    ) {
      throw new BadRequestException('Discount percentage must be an integer from 0 to 100');
    }
  }
}

export function entitlementDrafts(plan: PlanShape, items: PlanItemShape[]): EntitlementDraft[] {
  validatePlanDefinition(plan, items);
  const included = items.filter((item) => !item.excluded);
  const drafts: EntitlementDraft[] = [];
  if (plan.planType === PlanType.VALUE || plan.planType === PlanType.BOTH) {
    drafts.push({
      serviceId: null,
      entitlementType: EntitlementType.VALUE,
      totalValue: plan.serviceValueLimit!,
      totalQuantity: 0,
    });
  }
  if (plan.planType === PlanType.SERVICE || plan.planType === PlanType.BOTH) {
    for (const item of included) {
      drafts.push({
        serviceId: item.serviceId,
        entitlementType: EntitlementType.QUANTITY,
        totalValue: 0,
        totalQuantity: item.quantityLimit!,
      });
    }
  }
  if (plan.planType === PlanType.DISCOUNT && plan.discountCap && plan.discountCap > 0) {
    drafts.push({
      serviceId: null,
      entitlementType: EntitlementType.VALUE,
      totalValue: plan.discountCap,
      totalQuantity: 0,
    });
  }
  return drafts;
}

export interface RedeemQuoteInput {
  planType: PlanType;
  item: PlanItemShape | null;
  retailPrice: number;
  valueRemaining: number | null;
  quantityRemaining: number | null;
  discountPercentage: number | null;
  discountCapRemaining: number | null;
}

export interface RedeemQuote {
  valueDelta: number;
  quantityDelta: number;
  discountAmount: number;
  customerPayable: number;
  entitlementDeduction: number;
  retailPrice: number;
}

export function quoteRedemption(input: RedeemQuoteInput): RedeemQuote {
  if (!input.item || input.item.excluded) {
    throw new BadRequestException('This service is not included in the membership');
  }
  if (!Number.isInteger(input.retailPrice) || input.retailPrice < 0) {
    throw new BadRequestException('Service price is invalid');
  }
  if (input.planType === PlanType.SERVICE || input.planType === PlanType.BOTH) {
    if (input.quantityRemaining == null || input.quantityRemaining < 1) {
      throw new BadRequestException('No remaining quantity for this service');
    }
  }
  if (input.planType === PlanType.VALUE || input.planType === PlanType.BOTH) {
    const deduction = input.item.valueDeduction ?? 0;
    if (deduction <= 0) {
      throw new BadRequestException('This service has no entitlement deduction');
    }
    if (input.valueRemaining == null || input.valueRemaining < deduction) {
      throw new BadRequestException('Not enough service value left on this membership');
    }
    return {
      valueDelta: deduction,
      quantityDelta: input.planType === PlanType.BOTH ? 1 : 0,
      discountAmount: 0,
      customerPayable: 0,
      entitlementDeduction: deduction,
      retailPrice: input.retailPrice,
    };
  }
  if (input.planType === PlanType.SERVICE) {
    return {
      valueDelta: 0,
      quantityDelta: 1,
      discountAmount: 0,
      customerPayable: 0,
      entitlementDeduction: 0,
      retailPrice: input.retailPrice,
    };
  }
  const discountBase = percentOf(input.retailPrice, input.discountPercentage ?? 0);
  const discountAmount =
    input.discountCapRemaining == null
      ? discountBase
      : Math.min(discountBase, input.discountCapRemaining);
  return {
    valueDelta: input.discountCapRemaining == null ? 0 : discountAmount,
    quantityDelta: 0,
    discountAmount,
    customerPayable: input.retailPrice - discountAmount,
    entitlementDeduction: discountAmount,
    retailPrice: input.retailPrice,
  };
}
