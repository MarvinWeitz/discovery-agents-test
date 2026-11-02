sap.ui.define(["sap/ui/core/mvc/Controller", "sap/m/MessageToast", "sap/m/MessageBox"], function (Controller, MessageToast, MessageBox) {
  "use strict";
  return Controller.extend("stress.shop.controller.Main", {
    onOrder: async function () {
      const item = this.byId("books").getSelectedItem();
      if (!item) return MessageToast.show(this.getText("selectBook"));
      const action = this.getView().getModel().bindContext("/submitOrder(...)");
      action.setParameter("book", item.getBindingContext().getProperty("ID"));
      action.setParameter("quantity", this.byId("quantity").getValue());
      try {
        await action.invoke();
        MessageToast.show(this.getText("ordered"));
        this.byId("books").getBinding("items").refresh();
      } catch (e) {
        MessageBox.error(e.message);
      }
    },
    getText: function (key) {
      return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(key);
    }
  });
});
