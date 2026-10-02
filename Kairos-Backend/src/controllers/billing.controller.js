// src/controllers/billing.controller.js
function createBillingController({ billingService }) {
  async function plans(req, res, next) {
    try {
      const plans = await billingService.getPlans();

      res.json({
        ok: true,
        plans
      });
    } catch (error) {
      next(error);
    }
  }

  async function balance(req, res, next) {
    try {
      const result = await billingService.getCreditBalance(
        req.user.id
      );

      res.json({
        ok: true,
        credits: result
      });
    } catch (error) {
      next(error);
    }
  }

  async function quote(req, res, next) {
    try {
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({
          ok: false,
          error: {
            message: 'planId is required'
          }
        });
      }

      const result = await billingService.createPlanQuote({
        userId: req.user.id,
        planId
      });

      res.json({
        ok: true,
        quote: result
      });
    } catch (error) {
      next(error);
    }
  }

  async function purchase(req, res, next) {
    try {
      const { planId, idempotencyKey } = req.body;

      if (!planId) {
        return res.status(400).json({
          ok: false,
          error: {
            message: 'planId is required'
          }
        });
      }

      if (!idempotencyKey) {
        return res.status(400).json({
          ok: false,
          error: {
            message: 'idempotencyKey is required'
          }
        });
      }

      const result =
        await billingService.preparePlanPurchase({
          userId: req.user.id,
          planId,
          idempotencyKey
        });

      res.json({
        ok: true,
        purchase: result
      });
    } catch (error) {
      next(error);
    }
  }


  async function checkout(req, res, next) {  
    try {
      const { planId, idempotencyKey } = req.body;

      if (!planId) {
        return res.status(400).json({
          ok: false,
          error: {
            message: 'planId is required'
          }
        });
      }

      if (!idempotencyKey) {
        return res.status(400).json({
          ok: false,
          error: {
            message: 'idempotencyKey is required'
          }
        });
      }

      const purchase =
        await billingService.preparePlanPurchase({
          userId: req.user.id,
          planId,
          idempotencyKey
        });

      /*
       * Credits completely covered the purchase.
       * No Stripe checkout is required.
       */
      if (!purchase.checkoutRequired) {
        return res.json({
          ok: true,
          checkoutRequired: false,
          purchase
        });
      }

      if (!purchase.payment?.id) {
        throw new Error(
          'Payment was not created'
        );
      }

      const checkout =
        await billingService.createCheckoutSession({
          userId: req.user.id,
          paymentId: purchase.payment.id
        });

      return res.json({
        ok: true,
        checkoutRequired: true,
        checkout,
        purchase
      });
    } catch (error) {
      next(error);
    }
  }

  async function creditCheckout(req, res, next) {
    try {
      const {
        amount,
        currency,
        idempotencyKey
      } = req.body;

      if (amount === undefined || amount === null || amount === '') {
        return res.status(400).json({
          ok: false,
          error: {
            message: 'amount is required'
          }
        });
      }

      if (!currency) {
        return res.status(400).json({
          ok: false,
          error: {
            message: 'currency is required'
          }
        });
      }

      if (!idempotencyKey) {
        return res.status(400).json({
          ok: false,
          error: {
            message: 'idempotencyKey is required'
          }
        });
      }

      const purchase =
        await billingService.prepareCreditPurchase({
          userId: req.user.id,
          amount,
          currency,
          idempotencyKey
        });

      if (!purchase.payment?.id) {
        throw new Error('Payment was not created');
      }

      const checkout =
        await billingService.createCheckoutSession({
          userId: req.user.id,
          paymentId: purchase.payment.id
        });

      return res.json({
        ok: true,
        checkoutRequired: true,
        checkout,
        purchase
      });
    } catch (error) {
      next(error);
    }
  }


  async function webhook(req, res, next) {
    try {
      const signature =
        req.headers['stripe-signature'];

      if (!signature) {
        return res.status(400).json({
          ok: false,
          error: {
            message: 'Missing Stripe signature'
          }
        });
      }

      const result =
        await billingService.handleWebhook({
          rawBody: req.body,
          signature
        });

      return res.json({
        ok: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  return {
    plans,
    balance,
    quote,
    purchase,
    checkout,
    creditCheckout,
    webhook
  };
}

module.exports = {
  createBillingController
};