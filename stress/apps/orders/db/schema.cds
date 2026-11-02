namespace sales;
using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';

entity Customers : cuid, managed {
  name   : String(100) @mandatory;
  email  : String(200) @PersonalData.IsPotentiallyPersonal;
  phone  : String(40)  @PersonalData.IsPotentiallyPersonal;
  orders : Association to many Orders on orders.customer = $self;
}
annotate Customers with @PersonalData.EntitySemantics: 'DataSubject';

entity OrderStatus : CodeList {
  key code : String(1) enum { Open = 'O'; Submitted = 'S'; Approved = 'A'; Rejected = 'R'; };
}

entity Orders : cuid, managed {
  title    : String(100) @mandatory;
  customer : Association to Customers;
  status   : Association to OrderStatus default 'O';
  total    : Decimal(9, 2) default 0;
  currency : String(3) default 'EUR';
  items    : Composition of many Items on items.order = $self;
}

entity Items : cuid {
  order    : Association to Orders;
  product  : String(100) @mandatory;
  quantity : Integer @assert.range: [1, 100];
  price    : Decimal(9, 2);
}
