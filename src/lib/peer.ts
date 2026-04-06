import Peer, { type DataConnection } from 'peerjs'
import type { DraftState, Side } from '../types'

export type PeerMessage =
  | { type: 'ready' } // guest → host: I'm fully listening, send me current state
  | { type: 'hello'; side: Side }
  | { type: 'side-set'; side: Side }
  | { type: 'state'; draft: DraftState }
  | { type: 'reset' }

const PREFIX = 'dota-pick-cd-'

// Public PeerJS broker validates IDs against this regex. The full peer id
// is `<PREFIX><roomId>` so the room id must be alphanumeric (no `_-`) to
// avoid producing consecutive separators or trailing separators.
const VALID_ROOM_ID = /^[A-Za-z0-9]+$/

function assertValidRoomId(roomId: string) {
  if (!VALID_ROOM_ID.test(roomId)) {
    throw new Error(
      `Invalid room id "${roomId}": only letters and digits allowed`,
    )
  }
}

export interface RoomHandle {
  peer: Peer
  /** when host: incoming guest conn; when guest: outgoing conn to host */
  conn: DataConnection | null
  isHost: boolean
  roomId: string // bare id without prefix
  send: (msg: PeerMessage) => void
  destroy: () => void
}

function makePeer(id?: string): Peer {
  return new Peer(id ?? '', {
    debug: 1,
  })
}

/**
 * Create a host peer with a deterministic id and wait for guest to join.
 */
export function createHost(
  roomId: string,
  onConn: (conn: DataConnection) => void,
  onError: (err: Error) => void,
): RoomHandle {
  assertValidRoomId(roomId)
  const peerId = PREFIX + roomId
  const peer = makePeer(peerId)
  const handle: RoomHandle = {
    peer,
    conn: null,
    isHost: true,
    roomId,
    send: (msg) => handle.conn?.send(msg),
    destroy: () => {
      handle.conn?.close()
      peer.destroy()
    },
  }

  peer.on('open', () => {
    /* ready */
  })
  peer.on('connection', (conn) => {
    handle.conn = conn
    conn.on('open', () => onConn(conn))
  })
  peer.on('error', (e) => onError(e as unknown as Error))

  return handle
}

/**
 * Connect to an existing host as guest.
 */
export function joinRoom(
  roomId: string,
  onConn: (conn: DataConnection) => void,
  onError: (err: Error) => void,
): RoomHandle {
  assertValidRoomId(roomId)
  const peer = makePeer() // anonymous
  const handle: RoomHandle = {
    peer,
    conn: null,
    isHost: false,
    roomId,
    send: (msg) => handle.conn?.send(msg),
    destroy: () => {
      handle.conn?.close()
      peer.destroy()
    },
  }

  peer.on('open', () => {
    const conn = peer.connect(PREFIX + roomId, { reliable: true })
    handle.conn = conn
    conn.on('open', () => onConn(conn))
    conn.on('error', (e) => onError(e as unknown as Error))
  })
  peer.on('error', (e) => onError(e as unknown as Error))

  return handle
}
