import cds from '@sap/cds'
import { test, describe } from 'node:test'
import assert from 'node:assert'

describe('catalog', () => {
  const { GET, POST, axios } = cds.test(__dirname + '/..')
  axios.defaults.validateStatus = () => true
  const carla = { auth: { username: 'carla', password: '' } }
  const dan = { auth: { username: 'dan', password: '' } }

  test('anonymous gets 401', async () => {
    assert.strictEqual((await GET('/catalog/Books')).status, 401)
  })
  test('submitOrder reduces the stock and emits BookOrdered', async () => {
    const srv = await cds.connect.to('CatalogService')
    let seen = 0
    srv.on('BookOrdered', () => { seen++ })
    const r = await POST('/catalog/submitOrder', { book: 'b0000000-0000-0000-0000-000000000001', quantity: 2 }, carla)
    assert.strictEqual(r.status, 200)
    const b = await GET('/catalog/Books(b0000000-0000-0000-0000-000000000001)', carla)
    assert.strictEqual(b.data.stock, 10)
    assert.strictEqual(seen, 1)
  })
  test('out of stock is refused', async () => {
    const r = await POST('/catalog/submitOrder', { book: 'b0000000-0000-0000-0000-000000000002', quantity: 1 }, carla)
    assert.strictEqual(r.status, 409)
  })
  test('cancel only new orders, only own', async () => {
    assert.strictEqual((await POST('/catalog/Orders(c0000000-0000-0000-0000-000000000002)/CatalogService.cancel', {}, carla)).status, 409)
    assert.strictEqual((await POST('/catalog/Orders(c0000000-0000-0000-0000-000000000001)/CatalogService.cancel', {}, dan)).status, 403)
    assert.strictEqual((await POST('/catalog/Orders(c0000000-0000-0000-0000-000000000001)/CatalogService.cancel', {}, carla)).status, 200)
  })
  test('admin service needs ShopAdmin', async () => {
    assert.strictEqual((await GET('/admin/Books', carla)).status, 403)
  })
})
