import { Routes } from '@angular/router';
import { OrderList } from './orders/order-list/order-list';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'orders' },
  { path: 'orders', component: OrderList }
];
