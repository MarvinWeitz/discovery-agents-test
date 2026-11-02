using OrderService as service from '../../srv/order-service';

annotate service.Orders with @(
  UI.HeaderInfo: { TypeName: 'Order', TypeNamePlural: 'Orders', Title: { Value: title } },
  UI.SelectionFields: [ status_code, customer_ID ],
  UI.LineItem: [
    { Value: title },
    { Value: customer.name, Label: 'Customer' },
    { Value: status_code, Label: 'Status' },
    { Value: total },
    { $Type: 'UI.DataFieldForAction', Action: 'OrderService.submit', Label: 'Submit' },
    { $Type: 'UI.DataFieldForAction', Action: 'OrderService.approve', Label: 'Approve' },
    { $Type: 'UI.DataFieldForAction', Action: 'OrderService.reject', Label: 'Reject' }
  ],
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'General', Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', Label: 'Items', Target: 'items/@UI.LineItem' }
  ],
  UI.FieldGroup #General: { Data: [ { Value: title }, { Value: customer_ID }, { Value: total }, { Value: currency } ] }
) {
  total    @readonly;
  status   @readonly;
  customer @Common.ValueList: { CollectionPath: 'Customers', Parameters: [
    { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: customer_ID, ValueListProperty: 'ID' },
    { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
  ] };
};

annotate service.Items with @(
  UI.LineItem: [ { Value: product }, { Value: quantity }, { Value: price } ]
);
