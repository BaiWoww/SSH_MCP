import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CredentialStore } from '../../electron/ssh/credential-store'

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(null),
    setPassword: vi.fn().mockResolvedValue(undefined),
    deletePassword: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('electron-store', () => {
  return {
    default: class {
      private data: Record<string, unknown>
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        this.data = opts?.defaults ? { ...opts.defaults } : {}
      }
      get(key: string) { return this.data[key] }
      set(key: string, val: unknown) { this.data[key] = val }
      delete(key: string) { delete this.data[key] }
    },
  }
})

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/agentssh-test-userdata') },
}))

describe('CredentialStore', () => {
  let store: CredentialStore

  beforeEach(() => {
    store = new CredentialStore()
  })

  it('saves and retrieves a connection with encrypted password', async () => {
    const conn = {
      id: 'test-1',
      name: 'My Server',
      host: 'example.com',
      port: 22,
      username: 'root',
      authMethod: 'password' as const,
      password: 's3cret-pass',
    }
    await store.saveConnection(conn)
    const retrieved = await store.getConnection('test-1')
    expect(retrieved).toBeDefined()
    expect(retrieved!.password).toBe('s3cret-pass')
    expect(retrieved!.host).toBe('example.com')
  })

  it('lists all saved connections', async () => {
    await store.saveConnection({
      id: 'a', name: 'A', host: 'a.com', port: 22, username: 'u',
      authMethod: 'password', password: 'p1',
    })
    await store.saveConnection({
      id: 'b', name: 'B', host: 'b.com', port: 22, username: 'u',
      authMethod: 'password', password: 'p2',
    })
    const list = await store.listConnections()
    expect(list).toHaveLength(2)
    expect(list.map(c => c.id).sort()).toEqual(['a', 'b'])
  })

  it('deletes a connection', async () => {
    await store.saveConnection({
      id: 'del', name: 'Del', host: 'd.com', port: 22, username: 'u',
      authMethod: 'password', password: 'p',
    })
    await store.deleteConnection('del')
    const retrieved = await store.getConnection('del')
    expect(retrieved).toBeUndefined()
  })

  it('stored password in electron-store is NOT plaintext', async () => {
    const conn = {
      id: 'enc-test', name: 'Enc', host: 'e.com', port: 22, username: 'u',
      authMethod: 'password' as const, password: 'plaintext-secret',
    }
    await store.saveConnection(conn)
    const raw = store.getRawMetadata('enc-test')
    expect(JSON.stringify(raw)).not.toContain('plaintext-secret')
  })
})
