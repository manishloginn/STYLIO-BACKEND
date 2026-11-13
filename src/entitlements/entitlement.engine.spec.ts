import { PlanType } from '../common/enums';
import { entitlementDrafts, quoteRedemption, validatePlanDefinition } from './entitlement.engine';

const servicePlan = {
  planType: PlanType.SERVICE,
  sellingPrice: 150000,
  validityDays: 180,
};

describe('entitlement engine', () => {
  it('builds quantity drafts for a service plan', () => {
    const drafts = entitlementDrafts(servicePlan, [
      { serviceId: 'beard', quantityLimit: 4 },
      { serviceId: 'cut', quantityLimit: 1 },
    ]);
    expect(drafts).toEqual([
      { serviceId: 'beard', entitlementType: 'QUANTITY', totalValue: 0, totalQuantity: 4 },
      { serviceId: 'cut', entitlementType: 'QUANTITY', totalValue: 0, totalQuantity: 1 },
    ]);
  });

  it('requires both limits for a combined plan', () => {
    expect(() =>
      validatePlanDefinition(
        { planType: PlanType.BOTH, sellingPrice: 150000, validityDays: 30, serviceValueLimit: 2000000 },
        [{ serviceId: 'cut', quantityLimit: 4 }],
      ),
    ).toThrow(/deduction/);
  });

  it('quotes value, quantity, combined, and salon-funded discount', () => {
    expect(
      quoteRedemption({
        planType: PlanType.VALUE,
        item: { serviceId: 'cut', valueDeduction: 50000 },
        retailPrice: 70000,
        valueRemaining: 200000,
        quantityRemaining: null,
        discountPercentage: null,
        discountCapRemaining: null,
      }).entitlementDeduction,
    ).toBe(50000);

    expect(
      quoteRedemption({
        planType: PlanType.SERVICE,
        item: { serviceId: 'beard', quantityLimit: 4 },
        retailPrice: 30000,
        valueRemaining: null,
        quantityRemaining: 4,
        discountPercentage: null,
        discountCapRemaining: null,
      }).quantityDelta,
    ).toBe(1);

    expect(() =>
      quoteRedemption({
        planType: PlanType.BOTH,
        item: { serviceId: 'cut', quantityLimit: 4, valueDeduction: 80000 },
        retailPrice: 80000,
        valueRemaining: 20000,
        quantityRemaining: 3,
        discountPercentage: null,
        discountCapRemaining: null,
      }),
    ).toThrow(/service value/);

    expect(() =>
      quoteRedemption({
        planType: PlanType.BOTH,
        item: { serviceId: 'cut', quantityLimit: 1, valueDeduction: 100 },
        retailPrice: 100,
        valueRemaining: 5000,
        quantityRemaining: 0,
        discountPercentage: null,
        discountCapRemaining: null,
      }),
    ).toThrow(/quantity/);

    const discount = quoteRedemption({
      planType: PlanType.DISCOUNT,
      item: { serviceId: 'cut' },
      retailPrice: 10000,
      valueRemaining: null,
      quantityRemaining: null,
      discountPercentage: 10,
      discountCapRemaining: null,
    });
    expect(discount.discountAmount).toBe(1000);
    expect(discount.customerPayable).toBe(9000);
  });
});
