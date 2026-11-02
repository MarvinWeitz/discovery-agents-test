import cds from '@sap/cds'

export default class CatalogService extends cds.ApplicationService {
  async init() {
    const { Books, Orders } = this.entities

    this.on('submitOrder', async req => {
      const { book, quantity } = req.data
      const row = await SELECT.one.from(Books, book).columns('ID', 'stock')
      if (!row) return req.reject(404, `Book ${book} not found`)
      if (quantity > row.stock) return req.reject(409, `Only ${row.stock} left`)
      await UPDATE(Books, book).with({ stock: { '-=': quantity } })
      const ID = cds.utils.uuid()
      await INSERT.into(Orders).entries({ ID, book_ID: book, quantity, status: 'N' })
      await this.emit('BookOrdered', { book, quantity, buyer: req.user.id })
      return SELECT.one.from(Orders, ID)
    })

    this.on('cancel', Orders, async req => {
      const ID = (req.params[0] as any).ID ?? req.params[0]
      const order = await SELECT.one.from(Orders, ID).columns('status', 'quantity', 'book_ID')
      if (!order) return req.reject(404, 'Order not found')
      if (order.status !== 'N') return req.reject(409, 'Only new orders can be cancelled')
      await UPDATE(Orders, ID).with({ status: 'C' })
      await UPDATE(Books, order.book_ID).with({ stock: { '+=': order.quantity } })
      return SELECT.one.from(Orders, ID)
    })

    return super.init()
  }
}
