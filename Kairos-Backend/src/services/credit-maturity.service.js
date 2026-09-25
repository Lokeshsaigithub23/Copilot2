function createCreditMaturityService({ prisma, creditService, now = () => new Date() }) {
  async function maturePendingCredits() {
    const currentTime = now();

    const pendingEntries = await prisma.creditLedger.findMany({
      where: {
        entryType: 'referral_award',
        maturesAt: {
          lte: currentTime
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    let matured = 0;

    for (const entry of pendingEntries) {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.creditLedger.findUnique({
          where: {
            idempotencyRef: `referral_matured:${entry.id}`
          }
        });

        if (existing) {
          return {
            processed: false
          };
        }

        const account = await tx.creditAccount.findUnique({
          where: {
            id: entry.accountId
          }
        });

        if (!account) {
          return {
            processed: false
          };
        }

        const amount = entry.delta;

        if (amount <= 0) {
          return {
            processed: false
          };
        }

        if (account.pendingCredits < amount) {
          throw new Error(
            `Insufficient pending credits for account ${account.id}`
          );
        }

        const updated = await tx.creditAccount.update({
          where: {
            id: account.id
          },
          data: {
            pendingCredits: {
              decrement: amount
            },
            availableCredits: {
              increment: amount
            },
            version: {
              increment: 1
            }
          }
        });

        await tx.creditLedger.create({
            data: {
                accountId: account.id,
                entryType: 'referral_matured',
                delta: amount,
                availableAfter: updated.availableCredits,
                pendingAfter: updated.pendingCredits,
                idempotencyRef: `referral_matured:${entry.id}`,
                refType: 'credit_ledger',
                refId: entry.id,
                expiresAt: new Date(
                Date.now() + 365 * 24 * 60 * 60 * 1000
                ),
                reason: 'Referral reward matured'
            }
        });

        return {
          processed: true
        };
      });

      if (result.processed) {
        matured += 1;
      }
    }

    return {
      checked: pendingEntries.length,
      matured
    };
  }

  return {
    maturePendingCredits
  };
}

module.exports = {
  createCreditMaturityService
};