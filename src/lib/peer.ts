import { joinRoom as trysteroJoin, type Room } from 'trystero'
import type { DraftState, Side } from '../types'

export type PeerMessage =
  | { type: 'ready' } // legacy, kept for typing — no longer used
  | { type: 'hello'; side: Side }
  | { type: 'side-set'; side: Side }
  | { type: 'state'; draft: DraftState }
  | { type: 'reset' }

// App identifier scoped to this project — must be the same on both peers
// for them to find each other on the BitTorrent trackers used as signaling.
const APP_ID = 'dota-pick-cd-v1'

// Room id is restricted to alphanumeric so a peer id of `<appId>-<roomId>`
// always passes any sane validation downstream.
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
 * Join (or create) a P2P room over WebRTC. Uses trystero with public
 * BitTorrent trackers as signaling — no central broker, no CORS issues.
 *
 * The host/guest distinction is purely a UI concept; at the signaling level
 * both peers are symmetric and the room is auto-formed when the second peer
 * joins with the same room id.
 */
export function createRoom(roomId: string, cb: RoomCallbacks): RoomHandle {
  assertValidRoomId(roomId)

  let room: Room
  try {
    room = trysteroJoin(
      {
        appId: APP_ID,
        // Curated list of nostr relays. Trystero's default behavior picks a
        // random subset of ~100 relays, which often lands on dead or filter-
        // happy ones. The first five below were observed to successfully
        // upgrade WSS in production HAR captures; the rest are well-known
        // backups. We deliberately avoid relay.damus.io / snort.social /
        // nostr.band — damus aggressively rate-limits trystero's ephemeral
        // event spam, the others have been unreachable.
        relayUrls: [
          'wss://ftp.halifax.rwth-aachen.de/nostr',
          'wss://nostr.data.haus',
          'wss://santo.iguanatech.net',
          'wss://nostr.islandarea.net',
          'wss://staging.yabu.me',
          'wss://nos.lol',
          'wss://nostr.mom',
          'wss://relay.nostr.bg',
        ],
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

  // trystero requires a JsonValue-compatible payload type; PeerMessage uses
  // structural interfaces that TS won't widen automatically, so we type the
  // action loosely and re-cast on the receiving side.
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
