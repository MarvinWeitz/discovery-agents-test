namespace shop;
using { cuid, managed } from '@sap/cds/common';

entity Books : cuid {
  title  : String(111) @mandatory;
  author : String(111);
  stock  : Integer @assert.range: [0, 9999];
  price  : Decimal(9, 2);
}

entity Orders : cuid, managed {
  book     : Association to Books;
  quantity : Integer @assert.range: [1, 10];
  status   : String(1) enum { New = 'N'; Shipped = 'S'; Cancelled = 'C' } default 'N';
}
