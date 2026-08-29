import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import { OrderService } from './order.service';
import { Order } from './order.model';

describe('OrderService', () => {
  let service: OrderService;
  let http: HttpTestingController;

  const orders: Order[] = [
    { id: 'a', customer: 'ana', total: 10, status: 'PLACED' }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(OrderService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('unwraps the orders envelope', () => {
    let received: Order[] | undefined;
    service.list().subscribe((o) => (received = o));

    http.expectOne('/api/orders').flush({ orders });
    expect(received).toEqual(orders);
  });

  it('unwraps the revenue envelope', () => {
    let received: number | undefined;
    service.revenue().subscribe((r) => (received = r));

    http.expectOne('/api/orders/revenue').flush({ revenue: 42 });
    expect(received).toBe(42);
  });

  it('patches a status and unwraps the order', () => {
    let received: Order | undefined;
    service.updateStatus('a', 'SHIPPED').subscribe((o) => (received = o));

    const req = http.expectOne('/api/orders/a/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'SHIPPED' });
    req.flush({ order: { ...orders[0], status: 'SHIPPED' } });

    expect(received?.status).toBe('SHIPPED');
  });
});
