import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from '../src/store.js';
import { createOrderService } from '../src/services/order-service.js';

describe('order service', () => {
  let service;

  beforeEach(() => {
    service = createOrderService(
      createStore([
        { id: 'a', customer: 'ana', total: 10, status: 'PLACED' },
        { id: 'b', customer: 'bo', total: 5, status: 'CANCELLED' }
      ])
    );
  });

  it('lists every order', () => {
    expect(service.listOrders().map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('excludes cancelled orders from revenue', () => {
    expect(service.totalRevenue()).toBe(10);
  });

  it('returns undefined for an unknown order', () => {
    expect(service.getOrder('nope')).toBeUndefined();
  });

  it('updates the status of a live order', () => {
    const result = service.updateStatus('a', 'SHIPPED');
    expect(result.order.status).toBe('SHIPPED');
    expect(service.getOrder('a').status).toBe('SHIPPED');
  });

  it('refuses an unknown status', () => {
    expect(service.updateStatus('a', 'TELEPORTED').error).toBe('invalid_status');
  });

  it('refuses to revive a cancelled order', () => {
    expect(service.updateStatus('b', 'SHIPPED').error).toBe('already_cancelled');
  });

  it('reports a missing order distinctly from a bad status', () => {
    expect(service.updateStatus('ghost', 'SHIPPED').error).toBe('not_found');
  });
});
