//src/services/credit.service.js
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


  async function reserveCredits({
    userId,
    amount,
    idempotencyKey,
    paymentId = null,
    expiresAt
  }, tx = prisma) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Reservation amount must be a positive integer');
    }

    if (!idempotencyKey) {
      throw new Error('idempotencyKey is required');
    }

    if (!expiresAt) {
      throw new Error('expiresAt is required');
    }

    const existing = await tx.creditReservation.findUnique({
      where: { idempotencyKey }
    });

    if (existing) {
      return {
        duplicate: true,
        reservation: existing
      };
    }

    const account = await tx.creditAccount.findUnique({
      where: { userId }
    });

    if (!account) {
      throw new Error('Credit account not found');
    }

    /*
     * Atomic conditional update.
     *
     * This prevents two simultaneous purchases from reserving
     * the same credits.
     */
    const updatedCount = await tx.creditAccount.updateMany({
      where: {
        id: account.id,
        availableCredits: {
          gte: amount
        }
      },
      data: {
        availableCredits: {
          decrement: amount
        },
        reservedCredits: {
          increment: amount
        },
        version: {
          increment: 1
        }
      }
    });

    if (updatedCount.count !== 1) {
      throw new Error('Insufficient available credits');
    }

    const reservation = await tx.creditReservation.create({
      data: {
        userId,
        accountId: account.id,
        amount,
        status: 'reserved',
        idempotencyKey,
        paymentId,
        expiresAt
      }
    });

    return {
      duplicate: false,
      reservation
    };
  }

  async function consumeReservation({
    reservationId,
    idempotencyRef,
    reason = 'Credits used for payment'
  }, tx = prisma) {
    if (!reservationId) {
      throw new Error('reservationId is required');
    }

    if (!idempotencyRef) {
      throw new Error('idempotencyRef is required');
    }

    const reservation = await tx.creditReservation.findUnique({
      where: { id: reservationId }
    });

    if (!reservation) {
      throw new Error('Credit reservation not found');
    }

    if (reservation.status === 'consumed') {
      return {
        duplicate: true,
        reservation
      };
    }

    if (reservation.status !== 'reserved') {
      throw new Error(
        `Credit reservation cannot be consumed from status: ${reservation.status}`
      );
    }

    const existingLedger = await tx.creditLedger.findUnique({
      where: { idempotencyRef }
    });

    if (existingLedger) {
      return {
        duplicate: true,
        reservation,
        ledger: existingLedger
      };
    }

    const account = await tx.creditAccount.findUnique({
      where: { id: reservation.accountId }
    });

    if (!account) {
      throw new Error('Credit account not found');
    }

    if (account.reservedCredits < reservation.amount) {
      throw new Error('Reserved credit balance is insufficient');
    }

    const updated = await tx.creditAccount.update({
      where: { id: account.id },
      data: {
        reservedCredits: {
          decrement: reservation.amount
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
        delta: -reservation.amount,
        availableAfter: updated.availableCredits,
        pendingAfter: updated.pendingCredits,
        idempotencyRef,
        refType: 'payment',
        refId: reservation.paymentId,
        reason
      }
    });

    const updatedReservation = await tx.creditReservation.update({
      where: { id: reservation.id },
      data: {
        status: 'consumed'
      }
    });

    return {
      duplicate: false,
      reservation: updatedReservation,
      account: updated,
      ledger
    };
  }

  async function releaseReservation({
    reservationId,
    reason = 'Payment failed or cancelled'
  }, tx = prisma) {
    if (!reservationId) {
      throw new Error('reservationId is required');
    }

    const reservation = await tx.creditReservation.findUnique({
      where: { id: reservationId }
    });

    if (!reservation) {
      throw new Error('Credit reservation not found');
    }

    if (reservation.status === 'released') {
      return {
        duplicate: true,
        reservation
      };
    }

    if (reservation.status !== 'reserved') {
      throw new Error(
        `Credit reservation cannot be released from status: ${reservation.status}`
      );
    }

    const account = await tx.creditAccount.findUnique({
      where: { id: reservation.accountId }
    });

    if (!account) {
      throw new Error('Credit account not found');
    }

    if (account.reservedCredits < reservation.amount) {
      throw new Error('Reserved credit balance is insufficient');
    }

    const updated = await tx.creditAccount.update({
      where: { id: account.id },
      data: {
        reservedCredits: {
          decrement: reservation.amount
        },
        availableCredits: {
          increment: reservation.amount
        },
        version: {
          increment: 1
        }
      }
    });

    const updatedReservation = await tx.creditReservation.update({
      where: { id: reservation.id },
      data: {
        status: 'released'
      }
    });

    return {
      duplicate: false,
      reservation: updatedReservation,
      account: updated,
      reason
    };
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
    debitCredits,
    reserveCredits,
    consumeReservation,
    releaseReservation
  };
}

module.exports = {
  createCreditService
};