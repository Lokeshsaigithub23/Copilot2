function createCreditService({ prisma }) {
  async function getAccount(userId, tx = prisma) {
    return tx.creditAccount.findUnique({
      where: { userId }
    });
  }

  async function getOrCreateAccount(userId, tx = prisma) {
    const existing = await tx.creditAccount.findUnique({
      where: { userId }
    });

    if (existing) {
      return existing;
    }

    return tx.creditAccount.create({
      data: {
        userId,
        availableCredits: 0,
        pendingCredits: 0,
        lifetimeEarned: 0,
        version: 0
      }
    });
  }

  async function addAvailableCredits({
    userId,
    amount,
    entryType,
    idempotencyRef,
    refType = null,
    refId = null,
    reason = null,
    adminId = null,
    expiresAt = null
  }, tx = prisma) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Credit amount must be a positive integer');
    }

    if (!idempotencyRef) {
      throw new Error('idempotencyRef is required');
    }

    const existing = await tx.creditLedger.findUnique({
      where: { idempotencyRef }
    });

    if (existing) {
      return {
        duplicate: true,
        account: await tx.creditAccount.findUnique({
          where: { id: existing.accountId }
        }),
        ledger: existing
      };
    }

    const account = await getOrCreateAccount(userId, tx);

    const updated = await tx.creditAccount.update({
      where: { id: account.id },
      data: {
        availableCredits: {
          increment: amount
        },
        lifetimeEarned: {
          increment: amount
        },
        version: {
          increment: 1
        }
      }
    });

    const ledger = await tx.creditLedger.create({
      data: {
        accountId: updated.id,
        entryType,
        delta: amount,
        availableAfter: updated.availableCredits,
        pendingAfter: updated.pendingCredits,
        idempotencyRef,
        refType,
        refId,
        expiresAt,
        adminId,
        reason
      }
    });

    return {
      duplicate: false,
      account: updated,
      ledger
    };
  }

  async function addPendingCredits({
    userId,
    amount,
    entryType,
    idempotencyRef,
    maturesAt,
    refType = null,
    refId = null,
    reason = null,
    adminId = null
  }, tx = prisma) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Credit amount must be a positive integer');
    }

    if (!idempotencyRef) {
      throw new Error('idempotencyRef is required');
    }

    if (!maturesAt) {
      throw new Error('maturesAt is required');
    }

    const existing = await tx.creditLedger.findUnique({
      where: { idempotencyRef }
    });

    if (existing) {
      return {
        duplicate: true,
        account: await tx.creditAccount.findUnique({
          where: { id: existing.accountId }
        }),
        ledger: existing
      };
    }

    const account = await getOrCreateAccount(userId, tx);

    const updated = await tx.creditAccount.update({
      where: { id: account.id },
      data: {
        pendingCredits: {
          increment: amount
        },
        lifetimeEarned: {
          increment: amount
        },
        version: {
          increment: 1
        }
      }
    });

    const ledger = await tx.creditLedger.create({
      data: {
        accountId: updated.id,
        entryType,
        delta: amount,
        availableAfter: updated.availableCredits,
        pendingAfter: updated.pendingCredits,
        idempotencyRef,
        refType,
        refId,
        maturesAt,
        adminId,
        reason
      }
    });

    return {
      duplicate: false,
      account: updated,
      ledger
    };
  }

  async function debitCredits({
    userId,
    amount,
    idempotencyRef,
    refType = null,
    refId = null,
    reason = null
  }, tx = prisma) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Credit amount must be a positive integer');
    }

    if (!idempotencyRef) {
      throw new Error('idempotencyRef is required');
    }

    const existing = await tx.creditLedger.findUnique({
      where: { idempotencyRef }
    });

    if (existing) {
      return {
        duplicate: true,
        account: await tx.creditAccount.findUnique({
          where: { id: existing.accountId }
        }),
        ledger: existing
      };
    }

    const account = await tx.creditAccount.findUnique({
      where: { userId }
    });

    if (!account) {
      throw new Error('Credit account not found');
    }

    if (account.availableCredits < amount) {
      throw new Error('Insufficient available credits');
    }

    const updated = await tx.creditAccount.update({
      where: { id: account.id },
      data: {
        availableCredits: {
          decrement: amount
        },
        version: {
          increment: 1
        }
      }
    });

    const ledger = await tx.creditLedger.create({
      data: {
        accountId: updated.id,
        entryType: 'usage_debit',
        delta: -amount,
        availableAfter: updated.availableCredits,
        pendingAfter: updated.pendingCredits,
        idempotencyRef,
        refType,
        refId,
        reason
      }
    });

    return {
      duplicate: false,
      account: updated,
      ledger
    };
  }

  return {
    getAccount,
    getOrCreateAccount,
    addAvailableCredits,
    addPendingCredits,
    debitCredits
  };
}

module.exports = {
  createCreditService
};