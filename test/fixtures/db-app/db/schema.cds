namespace shop;
using { cuid, managed } from '@sap/cds/common';

entity Books : cuid, managed {
  title  : String(100) not null;
  stock  : Integer default 0;
  price  : Decimal(9, 2);
  author : Association to Authors;
}

entity Authors : cuid {
  name  : String(100);
  books : Association to many Books on books.author = $self;
}

// parameterized view: HANA (and only HANA) can deploy it
entity BooksAbove(min : Integer) as select from Books { ID, title, stock } where stock > :min;
