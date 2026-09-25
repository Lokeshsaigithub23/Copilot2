function createCreditExpiryService({ prisma }) {
  async function expireCredits() {
    const now = new Date();

    const expiredEntries =
      await prisma.creditLedger.findMany({
        where: {
          entryType: 'referral_matured',
          expiresAt: {
            lte: now
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

    let expired = 0;

    for (const entry of expiredEntries) {
      const result = await prisma.$transaction(
        async (tx) => {
          const existing =
            await tx.creditLedger.findUnique({
              where: {
                idempotencyRef:
                  `expiry:${entry.id}`
              }
            });

          if (existing) {
            return {
              processed: false
            };
          }

          const account =
            await tx.creditAccount.findUnique({
              where: {
                id: entry.accountId
              }
            });

          if (!account) {
            return {
              processed: false
            };
          }

          // Never allow expiry to make the balance negative.
          const amount = Math.min(
            entry.delta,
            account.availableCredits
          );

          if (amount <= 0) {
            return {
              processed: false
            };
          }

          const updated =
            await tx.creditAccount.update({
              where: {
                id: account.id
              },
              data: {
                availableCredits: {
                  decrement: amount
                },
                version: {
                  increment: 1
                }
              }
            });

          await tx.creditLedger.create({
            data: {
              accountId: account.id,
              entryType: 'expiry',
              delta: -amount,
              availableAfter:
                updated.availableCredits,
              pendingAfter:
                updated.pendingCredits,
              idempotencyRef:
                `expiry:${entry.id}`,
              refType: 'credit_ledger',
              refId: entry.id,
              reason:
                'Referral credits expired'
            }
          });

          return {
            processed: true
          };
        }
      );

      if (result.processed) {
        expired += 1;
      }
    }

    return {
      checked: expiredEntries.length,
      expired
    };
  }

  return {
    expireCredits
  };
}

module.exports = {
  createCreditExpiryService
};