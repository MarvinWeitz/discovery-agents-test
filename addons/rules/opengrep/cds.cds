// Rule tests in Opengrep's own format for cds.yml (see js.js)
service S {
  // ruleid: commented-out-grant
  // @(restrict: [{ grant: 'READ', to: 'Viewer' }])
  entity A as select from B {
    // ruleid: hard-coded-currency
    'USD' as CurrencyCode_code : String(3),
    // ok: hard-coded-currency
    'USD' as Label : String(3),
  };
}
