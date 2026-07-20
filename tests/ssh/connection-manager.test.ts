import { describe, it, expect, afterEach } from 'vitest'
import { ConnectionManager } from '../../electron/ssh/connection-manager'
import { startMockSshServer } from '../helpers/mock-ssh-server'
import type { ConnectionConfig } from '../../electron/types'

const TEST_PORT = 2222
let serverHandle: { close: () => Promise<void> } | null = null

async function startServer(files?: Record<string, string>) {
  const handle = await startMockSshServer({
    port: TEST_PORT,
    username: 'testuser',
    password: 'testpass',
    files,
  })
  serverHandle = handle
  return handle
}

afterEach(async () => {
  if (serverHandle) {
    await serverHandle.close()
    serverHandle = null
  }
})

function makeConn(): ConnectionConfig {
  return {
    id: 'test-conn',
    name: 'Test',
    host: '127.0.0.1',
    port: TEST_PORT,
    username: 'testuser',
    authMethod: 'password',
    password: 'testpass',
  }
}

describe('ConnectionManager', () => {
  it('connects to a server and reports connected status', async () => {
    await startServer()
    const mgr = new ConnectionManager()
    await mgr.connect(makeConn())
    expect(mgr.isConnected('test-conn')).toBe(true)
    await mgr.disconnect('test-conn')
  })

  it('rejects wrong password', async () => {
    await startServer()
    const mgr = new ConnectionManager()
    const conn = makeConn()
    conn.password = 'wrong'
    await expect(mgr.connect(conn)).rejects.toThrow()
    expect(mgr.isConnected('test-conn')).toBe(false)
  })

  it('disconnects cleanly', async () => {
    await startServer()
    const mgr = new ConnectionManager()
    await mgr.connect(makeConn())
    await mgr.disconnect('test-conn')
    expect(mgr.isConnected('test-conn')).toBe(false)
  })

  it('getSftp returns an active sftp handle', async () => {
    await startServer()
    const mgr = new ConnectionManager()
    await mgr.connect(makeConn())
    const sftp = await mgr.getSftp('test-conn')
    expect(sftp).toBeDefined()
    await mgr.disconnect('test-conn')
  })

  it('throws when getSftp called on disconnected connection', async () => {
    const mgr = new ConnectionManager()
    await expect(mgr.getSftp('nonexistent')).rejects.toThrow()
  })
})
