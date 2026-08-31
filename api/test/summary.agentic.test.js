import { describe, it, expect } from 'vitest';
import { countPending } from '../src/reports/summary.js';

describe('countPending', () => {
  it('should return the count of pending orders', () => {
    const orders = [
      { id: 1, status: 'PENDING' },
      { id: 2, status: 'PROCESSING' },
      { id: 3, status: 'PLACED' },
      { id: 4, status: 'SHIPPED' }
    ];
    expect(countPending(orders)).toBe(2);
  });

  it('should return 0 if there are no pending orders', () => {
    const orders = [
      { id: 1, status: 'PLACED' },
      { id: 2, status: 'SHIPPED' }
    ];
    expect(countPending(orders)).toBe(0);
  });

  it('should return 0 if there are no orders', () => {
    expect(countPending([])).toBe(0);
  });
});