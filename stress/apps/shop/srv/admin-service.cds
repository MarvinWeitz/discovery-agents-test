using { shop } from '../db/schema';

@path: '/admin'
@requires: 'ShopAdmin'
service AdminService {
  entity Books as projection on shop.Books;
  entity Orders as projection on shop.Orders;
}
