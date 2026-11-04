const cds = require('@sap/cds')
module.exports = class AdminService extends cds.ApplicationService {
  init() {
    this.on('restock', async req => {
      const { book, amount } = req.data
      if (!(amount > 0)) return req.error(400, 'amount must be positive')
      await UPDATE(this.entities.Books, book).with({ stock: { '+=': amount } })
      return amount
    })
    return super.init()
  }
}
