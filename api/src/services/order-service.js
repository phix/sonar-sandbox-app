const VALID_STATUSES = ['PLACED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

/**
 * Order business rules. Kept separate from the routes so the HTTP layer stays
 * thin and the rules are testable without a server.
 */
export function createOrderService(store) {
  return {
    listOrders() {
      return store.list();
    },

    getOrder(id) {
      return store.find(id);
    },

    /** Total value of every order not cancelled. */
    totalRevenue() {
      return store
        .list()
        .filter((order) => order.status !== 'CANCELLED')
        .reduce((sum, order) => sum + order.total, 0);
    },

    /**
     * Move an order to a new status.
     * @returns the updated order, or an object describing why it was refused.
     */
    updateStatus(id, status) {
      if (!VALID_STATUSES.includes(status)) {
        return { error: 'invalid_status', validStatuses: VALID_STATUSES };
      }

      const order = store.find(id);
      if (!order) {
        return { error: 'not_found' };
      }

      if (order.status === 'CANCELLED') {
        return { error: 'already_cancelled' };
      }

      return { order: store.save({ ...order, status }) };
    }
  };
}

export { VALID_STATUSES };
