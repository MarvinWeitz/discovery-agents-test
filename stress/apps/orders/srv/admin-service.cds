using { sales } from '../db/schema';

@path: '/admin'
@requires: 'Admin'
service AdminService {
  entity Customers as projection on sales.Customers;
  entity Orders as projection on sales.Orders;
}
