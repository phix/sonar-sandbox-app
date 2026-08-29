import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';

function appWith(orders) {
  return createApp({ store: createStore(orders) });
}

describe('orders API', () => {
  const orders = [{ id: 'a', customer: 'ana', total: 10, status: 'PLACED' }];

  it('reports health', async () => {
    const res = await request(appWith(orders)).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('lists orders', async () => {
    const res = await request(appWith(orders)).get('/api/orders');
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
  });

  it('404s an unknown order', async () => {
    const res = await request(appWith(orders)).get('/api/orders/ghost');
    expect(res.status).toBe(404);
  });

  it('400s an invalid status transition', async () => {
    const res = await request(appWith(orders))
      .patch('/api/orders/a/status')
      .send({ status: 'TELEPORTED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_status');
  });

  it('patches a valid status', async () => {
    const res = await request(appWith(orders))
      .patch('/api/orders/a/status')
      .send({ status: 'DELIVERED' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('DELIVERED');
  });
});
