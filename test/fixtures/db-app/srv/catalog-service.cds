using { shop } from '../db/schema';

service CatalogService {
  @readonly @cds.redirection.target
  @(restrict: [{ grant: 'READ', to: 'Reader' }])
  entity Books as projection on shop.Books;

  @readonly @(restrict: [{ grant: 'READ', to: 'Reader' }])
  entity Authors as projection on shop.Authors;

  // HANA-only: tests for it run only when the test profile's database is HANA
  @readonly @(restrict: [{ grant: 'READ', to: 'Reader' }])
  entity BooksAbove(min : Integer) as select from shop.BooksAbove(min: :min);
}

@impl: 'srv/admin-service.js'
service AdminService {
  @(restrict: [{ grant: '*', to: 'Admin' }])
  entity Books as projection on shop.Books;

  @(requires: 'Admin')
  action restock(book : UUID, amount : Integer) returns Integer;
}
