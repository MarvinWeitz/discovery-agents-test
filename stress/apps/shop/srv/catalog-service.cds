using { shop } from '../db/schema';

@path: '/catalog'
@requires: 'authenticated-user'
service CatalogService {
  @readonly entity Books as projection on shop.Books;

  @restrict: [
    { grant: ['READ', 'cancel'], to: 'Customer', where: 'createdBy = $user' },
    { grant: ['READ'], to: 'ShopAdmin' }
  ]
  entity Orders as projection on shop.Orders actions {
    @Core.OperationAvailable: ($self.status = 'N')
    action cancel() returns Orders;
  };

  @requires: 'Customer'
  action submitOrder(book : Books:ID, quantity : Integer) returns Orders;

  event BookOrdered : { book : Books:ID; quantity : Integer; buyer : String };
}
