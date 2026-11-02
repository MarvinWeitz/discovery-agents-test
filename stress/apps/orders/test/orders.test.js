const cds = require('@sap/cds')
const { test, describe } = require('node:test')
const assert = require('node:assert')

describe('orders', () => {
  const { GET, POST, PATCH, axios } = cds.test(__dirname + '/..')
  const as = user => ({ auth: { username: user, password: '' } })
  axios.defaults.validateStatus = () => true

  test('anonymous is rejected', async () => {
    const r = await GET('/orders/Orders')
    assert.strictEqual(r.status, 401)
  })
  test('a buyer sees only own orders', async () => {
    const r = await GET('/orders/Orders?$filter=IsActiveEntity eq true', as('alice'))
    assert.strictEqual(r.status, 200)
    assert.ok(r.data.value.every(o => o.createdBy === 'alice'))
  })
  test('a buyer may not approve', async () => {
    const r = await POST(`/orders/Orders(ID=aaaaaaaa-0000-0000-0000-000000000002,IsActiveEntity=true)/OrderService.approve`, {}, as('alice'))
    assert.strictEqual(r.status, 403)
  })
  test('approve only in state S', async () => {
    const r = await POST(`/orders/Orders(ID=aaaaaaaa-0000-0000-0000-000000000001,IsActiveEntity=true)/OrderService.approve`, {}, as('carol'))
    assert.strictEqual(r.status, 409)
  })
  test('approve a submitted order emits OrderApproved', async () => {
    const srv = await cds.connect.to('OrderService')
    let got
    srv.on('OrderApproved', msg => { got = msg.data })
    const r = await POST(`/orders/Orders(ID=aaaaaaaa-0000-0000-0000-000000000002,IsActiveEntity=true)/OrderService.approve`, {}, as('carol'))
    assert.strictEqual(r.status, 200)
    assert.strictEqual(r.data.status_code, 'A')
    assert.ok(got)
  })
  test('admin service needs Admin', async () => {
    assert.strictEqual((await GET('/admin/Customers', as('alice'))).status, 403)
    assert.strictEqual((await GET('/admin/Customers', as('admin'))).status, 200)
  })
})
