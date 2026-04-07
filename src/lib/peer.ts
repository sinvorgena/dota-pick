import { joinRoom as trysteroJoin, type Room } from '@trystero-p2p/firebase'
import type { DraftState, Side } from '../types'

export type PeerMessage =
  | { type: 'ready' } // legacy, kept for typing — no longer used
  | { type: 'hello'; side: Side }
  | { type: 'side-set'; side: Side }
  | { type: 'state'; draft: DraftState }
  | { type: 'reset' }

// Firebase Realtime DB URL is passed as `appId` — trystero's firebase strategy
// uses it both as the namespace for topic paths AND to initialise the database
// connection. Both peers must use the exact same string for them to find each
// other.
const FIREBASE_DB_URL =
  'https://dota-pick-159ba-default-rtdb.europe-west1.firebasedatabase.app'

// Room id is restricted to alphanumeric so it's safe as a Firebase RTDB child
// key (no '.', '#', '$', '[', ']', '/').
const VALID_ROOM_ID = /^[A-Za-z0-9]+$/

function assertValidRoomId(roomId: string) {
  if (!VALID_ROOM_ID.test(roomId)) {
    throw new Error(
      `Invalid room id "${roomId}": only letters and digits allowed`,
    )
  }
}

export interface RoomCallbacks {
  onPeerJoin: () => void
  onPeerLeave: () => void
  onMessage: (msg: PeerMessage) => void
  onError: (err: Error) => void
}

export interface RoomHandle {
  send: (msg: PeerMessage) => void
  destroy: () => void
}

/**
 * Join (or create) a P2P room over WebRTC. Uses trystero with Firebase
 * Realtime Database as the signaling layer — reliable, runs on wss/443, no
 * rate limiting like the public nostr relays we tried before.
 */
export function createRoom(roomId: string, cb: RoomCallbacks): RoomHandle {
  assertValidRoomId(roomId)

  let room: Room
  try {
    room = trysteroJoin(
      {
        appId: FIREBASE_DB_URL,
        // STUN alone fails when either peer sits behind a symmetric NAT
        // (mobile carriers, many corporate/home routers). Add free TURN
        // relays from Open Relay Project so traffic can fall back to TURN.
        rtcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelayproject',
              credential: 'openrelayproject',
            },
          ],
        },
      },
      roomId,
    )
  } catch (e) {
    cb.onError(e instanceof Error ? e : new Error(String(e)))
    return { send: () => {}, destroy: () => {} }
  }

  const [sendMsg, getMsg] = room.makeAction('msg')

  getMsg((data, peerId) => {
    console.log('[peer] recv', peerId, data)
    cb.onMessage(data as unknown as PeerMessage)
  })
  room.onPeerJoin((peerId) => {
    console.log('[peer] join', peerId, 'active peers:', Object.keys(room.getPeers()))
    cb.onPeerJoin()
  })
  room.onPeerLeave((peerId) => {
    console.log('[peer] leave', peerId)
    cb.onPeerLeave()
  })

  return {
    send: (msg) => {
      const peers = Object.keys(room.getPeers())
      console.log('[peer] send', msg, 'to peers:', peers)
      sendMsg(msg as unknown as Parameters<typeof sendMsg>[0]).catch((e) => {
        console.warn('[peer] send failed', e)
      })
    },
    destroy: () => {
      room.leave()
    },
  }
}
