// src/services/billing.service.js
function createBillingService({ prisma, creditService,stripeService }) {
  const CREDITS_PER_USD = 250;

  async function getPlans() {
    return prisma.subscriptionPlan.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        monthlyPrice: 'asc'
      }
    });
  }

  async function getCreditBalance(userId) {
    const account = await creditService.getOrCreateAccount(userId);

    return {
      availableCredits: account.availableCredits,
      reservedCredits: account.reservedCredits || 0,
      pendingCredits: account.pendingCredits,
      lifetimeEarned: account.lifetimeEarned
    };
  }

  function creditsToMoney(credits) {
    return Number(credits) / CREDITS_PER_USD;
  }

  function moneyToCredits(amount) {
    return Math.floor(Number(amount) * CREDITS_PER_USD);
  }

  async function getPlan(planId) {
    const plan = await prisma.subscriptionPlan.findFirst({
      where: {
        isActive: true,
        OR: [
          {
            id: planId
          },
          {
            code: planId
          }
        ]
      }
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    return plan;
  }

  async function calculateQuote({ userId, planId, tx = prisma }) {
    const plan = await tx.subscriptionPlan.findFirst({
      where: {
        id: planId,
        isActive: true
      }
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    const account = await creditService.getOrCreateAccount(userId, tx);

    const planPrice = Number(plan.monthlyPrice);

    const availableCredits = Math.max(
      0,
      Number(account.availableCredits || 0)
    );

    const maximumCreditValue = creditsToMoney(
      availableCredits
    );

    const creditValueUsed = Math.min(
      planPrice,
      maximumCreditValue
    );

    const creditsUsed = moneyToCredits(
      creditValueUsed
    );

    const amountPayable = Math.max(
      0,
      Number(
        (planPrice - creditValueUsed).toFixed(2)
      )
    );

    return {
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        monthlyPrice: planPrice,
        currency: plan.currency,
        includedCredits: plan.includedCredits
      },
      credits: {
        available: availableCredits,
        used: creditsUsed,
        value: Number(creditValueUsed.toFixed(2))
      },
      payment: {
        amount: amountPayable,
        currency: plan.currency,
        required: amountPayable > 0
      }
    };
  }

  async function createPlanQuote({ userId, planId }) {
    return calculateQuote({
      userId,
      planId
    });
  }

  async function activateWithCredits({
    userId,
    planId,
    idempotencyKey
  }) {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey is required');
    }

    return prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payment.findUnique({
        where: {
          idempotencyKey
        }
      });

      if (existingPayment) {
        return {
          duplicate: true,
          payment: existingPayment
        };
      }

      const quote = await calculateQuote({
        userId,
        planId,
        tx
      });

      if (quote.payment.required) {
        throw new Error(
          'Credits do not fully cover this plan'
        );
      }

      if (quote.credits.used <= 0) {
        throw new Error(
          'No credits available for this purchase'
        );
      }

      /*
       * Reserve the credits first.
       *
       * Because this happens inside the same transaction,
       * the reservation is rolled back if anything fails.
       */
      const expiresAt = new Date(
        Date.now() + 15 * 60 * 1000
      );

      const reservation =
        await creditService.reserveCredits(
          {
            userId,
            amount: quote.credits.used,
            idempotencyKey:
              `billing:${idempotencyKey}:reservation`,
            expiresAt
          },
          tx
        );

      const subscription =
        await tx.subscription.create({
          data: {
            userId,
            planId: quote.plan.id,
            status: 'active',
            billingCycle: 'monthly',
            startDate: new Date()
          }
        });

      /*
       * The payment is fully covered by credits,
       * so consume the reservation immediately.
       */
      const payment =
        await tx.payment.create({
          data: {
            userId,
            planId: quote.plan.id,
            amount: quote.payment.amount,
            currency: quote.payment.currency,
            creditAmountUsed: quote.credits.used,
            status:
              quote.payment.required
                ? 'pending'
                : 'paid',
            provider:
              quote.payment.required
                ? 'stripe'
                : 'internal',
            idempotencyKey
          }
        });

      await tx.creditReservation.update({
        where: {
          id: reservation.reservation.id
        },
        data: {
          paymentId: payment.id
        }
      });

      await creditService.consumeReservation(
        {
          reservationId: reservation.reservation.id,
          idempotencyRef:
            `payment:${payment.id}:credits`,
          reason:
            `Credits used for ${quote.plan.name} subscription`
        },
        tx
      );

      return {
        duplicate: false,
        payment,
        subscription,
        creditsUsed: quote.credits.used,
        amountPaid: 0
      };
    });
  }

  /*
   * Creates a pending payment and reserves the
   * user's credits. Stripe checkout will be attached
   * to this payment in the next step.
   */
  async function preparePlanPurchase({
    userId,
    planId,
    idempotencyKey
  }) {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey is required');
    }

    return prisma.$transaction(async (tx) => {
      const existingPayment =
        await tx.payment.findUnique({
          where: {
            idempotencyKey
          }
        });

      if (existingPayment) {
        return {
          duplicate: true,
          payment: existingPayment
        };
      }

      const quote = await calculateQuote({
        userId,
        planId,
        tx
      });

      const expiresAt = new Date(
        Date.now() + 15 * 60 * 1000
      );

      let reservation = null;

      /*
       * Reserve only the credits that are actually
       * being applied to this purchase.
       */
      if (quote.credits.used > 0) {
        reservation =
          await creditService.reserveCredits(
            {
              userId,
              amount: quote.credits.used,
              idempotencyKey:
                `billing:${idempotencyKey}:reservation`,
              expiresAt
            },
            tx
          );
      }

      const payment =
        await tx.payment.create({
          data: {
            userId,
            planId: quote.plan.id,
            amount: quote.payment.amount,
            currency: quote.payment.currency,
            creditAmountUsed: quote.credits.used,
            status:
              quote.payment.required
                ? 'pending'
                : 'paid',
            provider:
              quote.payment.required
                ? 'stripe'
                : 'internal',
            idempotencyKey
          }
        });

      if (reservation) {
        await tx.creditReservation.update({
          where: {
            id: reservation.reservation.id
          },
          data: {
            paymentId: payment.id
          }
        });
      }

      /*
       * If credits cover the complete plan,
       * activate immediately.
       */
      if (!quote.payment.required) {
        const subscription =
          await tx.subscription.create({
            data: {
              userId,
              planId: quote.plan.id,
              status: 'active',
              billingCycle: 'monthly',
              startDate: new Date()
            }
          });

        await tx.payment.update({
          where: {
            id: payment.id
          },
          data: {
            subscriptionId: subscription.id
          }
        });

        if (reservation) {
          await creditService.consumeReservation(
            {
              reservationId:
                reservation.reservation.id,
              idempotencyRef:
                `payment:${payment.id}:credits`,
              reason:
                `Credits used for ${quote.plan.name} subscription`
            },
            tx
          );
        }

        return {
          duplicate: false,
          payment: {
            ...payment,
            status: 'paid'
          },
          subscription,
          creditsUsed: quote.credits.used,
          amountPaid: 0,
          checkoutRequired: false
        };
      }

      /*
       * Partial/no-credit purchase.
       *
       * Stripe checkout will be created using this
       * pending Payment in the next step.
       */
      return {
        duplicate: false,
        payment,
        reservation: reservation
          ? reservation.reservation
          : null,
        quote,
        checkoutRequired: true
      };
    });
  }

  async function prepareCreditPurchase({
    userId,
    amount,
    currency,
    idempotencyKey
  }) {
    if (!idempotencyKey) {
      throw new Error('idempotencyKey is required');
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    const normalizedCurrency =
      String(currency || 'USD').toUpperCase();

    const supportedCurrencies = ['USD', 'INR'];

    if (!supportedCurrencies.includes(normalizedCurrency)) {
      throw new Error(
        `Unsupported currency: ${normalizedCurrency}`
      );
    }

    // Billing rule:
    // 1 USD = 250 credits.
    // INR uses the existing 80 INR/USD exchange-rate assumption.
    const creditsPerCurrencyUnit =
      normalizedCurrency === 'INR'
        ? CREDITS_PER_USD / 80
        : CREDITS_PER_USD;

    const credits = Math.floor(
      numericAmount * creditsPerCurrencyUnit
    );

    if (!Number.isInteger(credits) || credits <= 0) {
      throw new Error(
        'Payment amount is too small to purchase credits'
      );
    }

    return prisma.$transaction(async (tx) => {
      const existingPayment =
        await tx.payment.findUnique({
          where: {
            idempotencyKey
          }
        });

      if (existingPayment) {
        return {
          duplicate: true,
          payment: existingPayment,
          credits
        };
      }

      const payment = await tx.payment.create({
        data: {
          userId,
          // PAYG credit purchase is not tied to a subscription plan.
          planId: null,
          amount: numericAmount,
          currency: normalizedCurrency,
          creditAmountUsed: 0,
          status: 'pending',
          provider: 'stripe',
          idempotencyKey
        }
      });

      return {
        duplicate: false,
        payment,
        credits,
        amount: numericAmount,
        currency: normalizedCurrency
      };
    });
  }


  async function createCheckoutSession({
    userId,
    paymentId
  }) {
    return stripeService.createCheckoutSession({
      userId,
      paymentId
    });
  }

  async function handleWebhook({
    rawBody,
    signature
  }) {
    return stripeService.handleWebhook({
      rawBody,
      signature
    });
  }

  return {
    getPlans,
    getCreditBalance,
    createPlanQuote,
    activateWithCredits,
    preparePlanPurchase,
    prepareCreditPurchase,
    createCheckoutSession,
    handleWebhook
  };
}

module.exports = {
  createBillingService
};