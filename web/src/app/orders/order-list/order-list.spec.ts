import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import { OrderList } from './order-list';
import { Order } from '../order.model';

describe('OrderList', () => {
  let fixture: ComponentFixture<OrderList>;
  let http: HttpTestingController;

  const orders: Order[] = [
    { id: 'a', customer: 'ana', total: 10, status: 'PLACED' },
    { id: 'b', customer: 'bo', total: 5, status: 'DELIVERED' },
    { id: 'c', customer: 'cy', total: 7, status: 'CANCELLED' }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OrderList],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    fixture = TestBed.createComponent(OrderList);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('counts only orders still in flight as open', () => {
    fixture.detectChanges();
    http.expectOne('/api/orders').flush({ orders });
    fixture.detectChanges();

    expect(fixture.componentInstance.openOrders().map((o) => o.id)).toEqual(['a']);
  });

  it('surfaces a message when loading fails', () => {
    fixture.detectChanges();
    http.expectOne('/api/orders').error(new ProgressEvent('network'));
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe('Could not load orders.');
    expect(fixture.componentInstance.loading()).toBe(false);
  });
});
