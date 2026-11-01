const cds = require('@sap/cds')

module.exports = class OrderService extends cds.ApplicationService {
  init() {
    const { Orders, Items } = this.entities

    this.before(['CREATE', 'UPDATE'], Items, req => {
      if (req.data.price != null && req.data.price < 0) req.error(400, 'Price must not be negative', 'price')
    })

    this.before('UPDATE', Orders, async req => {
      const order = await SELECT.one.from(Orders, req.data.ID).columns('status_code')
      if (order && order.status_code !== 'O') req.reject(409, `Order is ${order.status_code}, only open orders can be changed`)
    })

    this.on('submit', Orders, async req => {
      const ID = req.params[0].ID ?? req.params[0]
      const order = await SELECT.one.from(Orders, ID).columns('status_code')
      if (!order) return req.reject(404, 'Order not found')
      if (order.status_code !== 'O') return req.reject(409, 'Only open orders can be submitted')
      await UPDATE(Orders, ID).with({ status_code: 'S' })
      return SELECT.one.from(Orders, ID)
    })

    this.on('approve', Orders, async req => {
      const ID = req.params[0].ID ?? req.params[0]
      const order = await SELECT.one.from(Orders, ID).columns('status_code', 'total')
      if (!order) return req.reject(404, 'Order not found')
      if (order.status_code !== 'S') return req.reject(409, 'Only submitted orders can be approved')
      await UPDATE(Orders, ID).with({ status_code: 'A' })
      await this.emit('OrderApproved', { order: ID, total: order.total })
      return SELECT.one.from(Orders, ID)
    })

    this.on('reject', Orders, async req => {
      const ID = req.params[0].ID ?? req.params[0]
      const order = await SELECT.one.from(Orders, ID).columns('status_code')
      if (!order) return req.reject(404, 'Order not found')
      if (order.status_code !== 'S') return req.reject(409, 'Only submitted orders can be rejected')
      await UPDATE(Orders, ID).with({ status_code: 'R' })
      return SELECT.one.from(Orders, ID)
    })

    this.after(['CREATE', 'UPDATE'], Items, async (_, req) => {
      const orderID = req.data.order_ID
      if (!orderID) return
      const { sum } = await SELECT.one.from(Items).columns('sum(quantity * price) as sum').where({ order_ID: orderID })
      await UPDATE(Orders, orderID).with({ total: sum ?? 0 })
    })

    return super.init()
  }
}
