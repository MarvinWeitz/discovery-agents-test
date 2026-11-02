using { sales } from '../db/schema';

@path: '/orders'
@requires: 'authenticated-user'
service OrderService {
  @odata.draft.enabled
  @restrict: [
    { grant: ['READ', 'WRITE', 'submit'], to: 'Buyer', where: 'createdBy = $user' },
    { grant: ['READ', 'approve', 'reject'], to: 'Approver' }
  ]
  entity Orders as projection on sales.Orders actions {
    @(Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'in/status_code' }, 'O' ] } })
    action submit() returns Orders;
    @(Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'in/status_code' }, 'S' ] } })
    action approve() returns Orders;
    @(Core.OperationAvailable: { $edmJson: { $Eq: [ { $Path: 'in/status_code' }, 'S' ] } })
    action reject(reason : String) returns Orders;
  };
  @readonly entity Customers as projection on sales.Customers { ID, name };
  @readonly entity OrderStatus as projection on sales.OrderStatus;

  event OrderApproved : { order : UUID; total : Decimal(9, 2) };
}
