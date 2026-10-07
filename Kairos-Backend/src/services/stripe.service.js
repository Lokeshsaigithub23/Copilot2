// src/services/stripe.service.js

const Stripe = require('stripe');

function createStripeService({ prisma,creditService }) {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  const stripe = new Stripe(secretKey);

  const successUrl =
    process.env.STRIPE_SUCCESS_URL ||
    'http://localhost:3000/?window=subscription';

  const cancelUrl =
    process.env.STRIPE_CANCEL_URL ||
    'http://localhost:3000/?window=subscription';

  function toStripeAmount(amount, currency) {
    const zeroDecimalCurrencies = new Set([
      'jpy',
      'krw',
      'vnd'
    ]);

    const normalizedCurrency =
      String(currency || 'USD').toLowerCase();

    if (zeroDecimalCurrencies.has(normalizedCurrency)) {
      return Math.round(Number(amount));
    }

    return Math.round(Number(amount) * 100);
  }

  async function createCheckoutSession({
    userId,
    paymentId
  }) {
    const payment =
      await prisma.payment.findUnique({
        where: {
          id: paymentId
        }
      });

    if (!payment) {
      throw new Error('Payment not found');
    }

    if (payment.userId !== userId) {
      throw new Error(
        'Payment does not belong to this user'
      );
    }

    if (payment.status !== 'pending') {
      throw new Error(
        `Payment is not pending: ${payment.status}`
      );
    }

    if (payment.provider !== 'stripe') {
      throw new Error(
        'Payment is not a Stripe payment'
      );
    }

    /*
     * If a Checkout Session already exists,
     * return it instead of creating another one.
     */
    if (payment.providerCheckoutId) {
      const existingSession =
        await stripe.checkout.sessions.retrieve(
          payment.providerCheckoutId
        );

      return {
        paymentId: payment.id,
        checkoutSessionId: existingSession.id,
        checkoutUrl: existingSession.url
      };
    }

    const plan =
      payment.planId
        ? await prisma.subscriptionPlan.findUnique({
            where: {
              id: payment.planId
            }
          })
        : null;

    if (payment.planId && !plan) {
      throw new Error(
        'Subscription plan not found for payment'
      );
    }

    const reservation =
      await prisma.creditReservation.findFirst({
        where: {
          paymentId: payment.id,
          status: 'reserved'
        }
      });

    const session =
      await stripe.checkout.sessions.create(
        {
          mode: 'payment',

          phone_number_collection: {
            enabled: true
          },

          line_items: [
            {
              price_data: {
                currency:
                  String(payment.currency).toLowerCase(),

                product_data: {
                  name: plan
                    ? plan.name
                    : 'Credits Purchase'
                },

                unit_amount: toStripeAmount(
                  payment.amount,
                  payment.currency
                )
              },

              quantity: 1
            }
          ],

          success_url: successUrl,
          cancel_url: cancelUrl,

          client_reference_id: payment.id,

          metadata: {
            paymentId: payment.id,
            userId: payment.userId,
            planId: payment.planId || '',
            reservationId:
              reservation?.id || '',
            creditsPurchased:
              payment.planId
                ? ''
                : String(
                    Math.floor(
                      Number(payment.amount) *
                        (String(payment.currency).toUpperCase() === 'INR'
                          ? 250 / 80
                          : 250)
                    )
                  )
          }
        },

        {
          idempotencyKey:
            `checkout:${payment.id}`
        }
      );

    await prisma.payment.update({
      where: {
        id: payment.id
      },

      data: {
        providerCheckoutId: session.id
      }
    });

    return {
      paymentId: payment.id,
      checkoutSessionId: session.id,
      checkoutUrl: session.url
    };
  }


  async function handleWebhook({  
    rawBody,
    signature
  }) {
    const webhookSecret =
      process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET is not configured'
      );
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
    } catch (error) {
      const err = new Error(
        `Invalid Stripe webhook signature: ${error.message}`
      );

      err.statusCode = 400;
      throw err;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const paymentId =
        session.metadata?.paymentId ||
        session.client_reference_id;

      if (!paymentId) {
        throw new Error(
          'Stripe Checkout session is missing paymentId'
        );
      }

      const result =
        await prisma.$transaction(async (tx) => {
          const payment =
            await tx.payment.findUnique({
              where: {
                id: paymentId
              }
            });

          if (!payment) {
            throw new Error(
              `Payment not found: ${paymentId}`
            );
          }

          /*
           * Webhook delivery can happen more than once.
           * If this payment is already paid, do nothing.
           */
          if (payment.status === 'paid') {
            return {
              duplicate: true,
              payment
            };
          }

          if (payment.status !== 'pending') {
            throw new Error(
              `Payment is not pending: ${payment.status}`
            );
          }

          /*
           * Validate the Stripe Checkout amount.
           */
          const expectedAmount =
            Math.round(
              Number(payment.amount) * 100
            );

          if (
            session.amount_total !== null &&
            session.amount_total !== expectedAmount
          ) {
            throw new Error(
              'Stripe payment amount does not match internal payment'
            );
          }

          if (
            session.currency &&
            String(session.currency).toLowerCase() !==
              String(payment.currency).toLowerCase()
          ) {
            throw new Error(
              'Stripe payment currency does not match internal payment'
            );
          }

                    /*
           * Subscription payment:
           * create/restore the subscription.
           *
           * PAYG credit payment:
           * no subscription is created.
           */
          let subscription = null;

          if (payment.planId) {
            const existingSubscription =
              payment.subscriptionId
                ? await tx.subscription.findUnique({
                    where: {
                      id: payment.subscriptionId
                    }
                  })
                : null;

            if (existingSubscription) {
              subscription = existingSubscription;
            } else {
              await tx.subscription.updateMany({
                where: {
                  userId: payment.userId,
                  status: 'active'
                },
                data: {
                  status: 'inactive',
                  endDate: new Date()
                }
              });

              subscription = await tx.subscription.create({
                data: {
                  userId: payment.userId,
                  planId: payment.planId,
                  status: 'active',
                  billingCycle: 'monthly',
                  startDate: new Date()
                }
              });
            }
          }

          /*
           * Mark the payment as successfully paid.
           */
          const updatedPayment =
            await tx.payment.update({
              where: {
                id: payment.id
              },
              data: {
                status: 'paid',
                subscriptionId:
                  subscription?.id || null,
                providerPaymentId:
                  session.payment_intent
                    ? String(session.payment_intent)
                    : null
              }
            });
          
          /*
           * PAYG credit purchase:
           * add the purchased credits only after
           * Stripe confirms the payment.
           */
          let creditsAdded = 0;

          if (!payment.planId) {
            const creditsPurchased =
              Number(
                session.metadata?.creditsPurchased
              );

            if (
              !Number.isInteger(creditsPurchased) ||
              creditsPurchased <= 0
            ) {
              throw new Error(
                'Invalid PAYG credit amount'
              );
            }

            await creditService.addAvailableCredits(
              {
                userId: payment.userId,
                amount: creditsPurchased,
                entryType: 'purchase',
                idempotencyRef:
                  `payment:${payment.id}:credit-purchase`,
                refType: 'payment',
                refId: payment.id,
                reason:
                  'Credits purchased through Stripe'
              },
              tx
            );

            creditsAdded = creditsPurchased;
          }      



          /*
           * If credits were reserved for this payment,
           * consume them now that Stripe payment succeeded.
           */
          if (payment.creditAmountUsed > 0) {
            const reservation =
              await tx.creditReservation.findFirst({
                where: {
                  paymentId: payment.id,
                  status: 'reserved'
                }
              });

            if (reservation) {
              await creditService.consumeReservation(
                {
                  reservationId: reservation.id,
                  idempotencyRef:
                    `payment:${payment.id}:credits`,
                  reason:
                    'Credits used for subscription purchase'
                },
                tx
              );
            }
          }

          return {
            duplicate: false,
            payment: updatedPayment,
            subscription,
            creditsAdded
          };
        });

      return {
        received: true,
        eventId: event.id,
        eventType: event.type,
        ...result
      };
    }

    return {
      received: true,
      eventId: event.id,
      eventType: event.type,
      ignored: true
    };
  }

  return {
    createCheckoutSession,
    handleWebhook
  };
}

module.exports = {
  createStripeService
};