import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import {
  getDatabase,
  ref,
  onValue,
  onChildAdded,
  set,
  push,
  remove,
  onDisconnect,
  serverTimestamp,
  type DataSnapshot,
} from 'firebase/database'
import type { DraftState, Side } from '../types'

export type PeerMessage =
  | { type: 'ready' } // legacy, kept for typing — no longer used
  | { type: 'hello'; side: Side }
  | { type: 'side-set'; side: Side }
  | { type: 'state'; draft: DraftState }
  | { type: 'reset' }

// Firebase config — Realtime DB only, no auth required (test rules allow
// anonymous read/write until 2026-05-07).
const FIREBASE_DB_URL =
  'https://dota-pick-159ba-default-rtdb.europe-west1.firebasedatabase.app'

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

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // freestun.net — public free TURN, no signup
  {
    urls: 'turn:freestun.net:3478',
    username: 'free',
    credential: 'free',
  },
  {
    urls: 'turns:freestun.net:5350',
    username: 'free',
    credential: 'free',
  },
  // openrelay backup
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

let firebaseApp: FirebaseApp | null = null
function getFirebase(): FirebaseApp {
  if (firebaseApp) return firebaseApp
  // Reuse default app if HMR re-imported the module
  if (getApps().length > 0) {
    firebaseApp = getApp()
    return firebaseApp
  }
  firebaseApp = initializeApp({ databaseURL: FIREBASE_DB_URL })
  return firebaseApp
}

// Stable per-tab id, regenerated on full reload.
const SELF_ID = Math.random().toString(36).slice(2, 12)

/**
 * Hand-rolled WebRTC P2P with Firebase Realtime DB as the signaling layer.
 *
 * Why custom: trystero's firebase strategy was silently failing to progress
 * peers past the announcement stage in our setup, and debugging through its
 * many strategy abstractions wasn't productive. The signaling protocol here
 * is intentionally minimal:
 *
 *   /rooms/{roomId}/peers/{peerId}: { ts }       — presence
 *   /rooms/{roomId}/signal/{from}/{to}/...        — directed signaling
 *     ├─ offer:     { sdp }
 *     ├─ answer:    { sdp }
 *     └─ candidates/{pushKey}: { candidate, sdpMid, sdpMLineIndex }
 *
 * Tie-breaking: the peer with the lexicographically smaller id is the
 * "offerer" and creates the RTCPeerConnection offer. The other side answers.
 * Because at most two peers ever join a room, this gives us a deterministic
 * 1:1 setup with no race conditions.
 */
export function createRoom(roomId: string, cb: RoomCallbacks): RoomHandle {
  assertValidRoomId(roomId)

  const app = getFirebase()
  const db = getDatabase(app)

  const roomRef = ref(db, `rooms/${roomId}`)
  const peersRef = ref(db, `rooms/${roomId}/peers`)
  const selfPresenceRef = ref(db, `rooms/${roomId}/peers/${SELF_ID}`)

  // Auto-cleanup our presence when we disconnect
  set(selfPresenceRef, { ts: serverTimestamp() }).catch((e) =>
    cb.onError(e instanceof Error ? e : new Error(String(e))),
  )
  onDisconnect(selfPresenceRef).remove()

  let pc: RTCPeerConnection | null = null
  let dc: RTCDataChannel | null = null
  let remotePeerId: string | null = null
  let isOfferer = false
  // Per-channel ICE candidate refs we set up so we can detach onChildAdded.
  const unsubFns: (() => void)[] = []

  const log = (...args: unknown[]) => console.log('[peer]', ...args)

  const cleanupConnection = () => {
    if (dc) {
      try {
        dc.close()
      } catch {
        /* ignore */
      }
      dc = null
    }
    if (pc) {
      try {
        pc.close()
      } catch {
        /* ignore */
      }
      pc = null
    }
  }

  const wireDataChannel = (channel: RTCDataChannel) => {
    dc = channel
    channel.onopen = () => {
      log('datachannel open')
      cb.onPeerJoin()
    }
    channel.onclose = () => {
      log('datachannel close')
      cb.onPeerLeave()
    }
    channel.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as PeerMessage
        log('recv', msg)
        cb.onMessage(msg)
      } catch (err) {
        console.warn('[peer] failed to parse message', err)
      }
    }
  }

  const startConnection = async (peerId: string) => {
    if (pc) return // already started
    remotePeerId = peerId
    isOfferer = SELF_ID < peerId
    log('starting connection with', peerId, 'as', isOfferer ? 'offerer' : 'answerer')

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.onconnectionstatechange = () => {
      log('connectionState', pc?.connectionState)
      if (
        pc?.connectionState === 'failed' ||
        pc?.connectionState === 'disconnected'
      ) {
        cb.onPeerLeave()
      }
    }
    pc.oniceconnectionstatechange = () => {
      log('iceConnectionState', pc?.iceConnectionState)
    }

    // Outgoing ICE candidates
    const candidatesOutRef = ref(
      db,
      `rooms/${roomId}/signal/${SELF_ID}/${peerId}/candidates`,
    )
    pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
      if (!e.candidate) return
      const c = e.candidate.toJSON()
      const cRef = push(candidatesOutRef)
      set(cRef, c).catch((err: unknown) =>
        console.warn('[peer] candidate write', err),
      )
    }

    if (isOfferer) {
      // Create data channel BEFORE the offer (offerer side owns it)
      const channel = pc.createDataChannel('msg')
      wireDataChannel(channel)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await set(
        ref(db, `rooms/${roomId}/signal/${SELF_ID}/${peerId}/offer`),
        { sdp: offer.sdp, type: offer.type },
      )
      log('wrote offer')
    } else {
      // Answerer waits for the offer to arrive on its channel
      pc.ondatachannel = (e: RTCDataChannelEvent) => {
        log('ondatachannel')
        wireDataChannel(e.channel)
      }
    }

    // Listen for incoming signals from this peer (offer/answer)
    const offerRef = ref(
      db,
      `rooms/${roomId}/signal/${peerId}/${SELF_ID}/offer`,
    )
    const answerRef = ref(
      db,
      `rooms/${roomId}/signal/${peerId}/${SELF_ID}/answer`,
    )
    const candidatesInRef = ref(
      db,
      `rooms/${roomId}/signal/${peerId}/${SELF_ID}/candidates`,
    )

    const offUnsub = onValue(offerRef, async (snap: DataSnapshot) => {
      const data = snap.val() as RTCSessionDescriptionInit | null
      if (!data || !pc || isOfferer) return
      log('recv offer')
      await pc.setRemoteDescription(data)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await set(
        ref(db, `rooms/${roomId}/signal/${SELF_ID}/${peerId}/answer`),
        { sdp: answer.sdp, type: answer.type },
      )
      log('wrote answer')
    })
    unsubFns.push(offUnsub)

    const ansUnsub = onValue(answerRef, async (snap: DataSnapshot) => {
      const data = snap.val() as RTCSessionDescriptionInit | null
      if (!data || !pc || !isOfferer) return
      if (pc.currentRemoteDescription) return
      log('recv answer')
      await pc.setRemoteDescription(data)
    })
    unsubFns.push(ansUnsub)

    const candUnsub = onChildAdded(
      candidatesInRef,
      async (snap: DataSnapshot) => {
        const c = snap.val() as RTCIceCandidateInit | null
        if (!c || !pc) return
        try {
          await pc.addIceCandidate(c)
        } catch (err) {
          console.warn('[peer] addIceCandidate', err)
        }
      },
    )
    unsubFns.push(candUnsub)
  }

  // Watch for the other peer to join the room. Because rooms are 1:1, the
  // first non-self id we see is our partner.
  const peersUnsub = onChildAdded(peersRef, (snap: DataSnapshot) => {
    const id = snap.key
    if (!id || id === SELF_ID || remotePeerId) return
    log('discovered peer', id)
    startConnection(id).catch((e: unknown) => {
      console.warn('[peer] startConnection failed', e)
      cb.onError(e instanceof Error ? e : new Error(String(e)))
    })
  })
  unsubFns.push(peersUnsub)

  // Detect peer disconnect via presence removal
  const peersValueUnsub = onValue(peersRef, (snap: DataSnapshot) => {
    const peers = (snap.val() as Record<string, unknown>) ?? {}
    if (remotePeerId && !(remotePeerId in peers)) {
      log('peer left', remotePeerId)
      remotePeerId = null
      cleanupConnection()
      cb.onPeerLeave()
    }
  })
  unsubFns.push(peersValueUnsub)

  log('init', { roomId, selfId: SELF_ID })

  return {
    send: (msg) => {
      if (!dc || dc.readyState !== 'open') {
        log('send skipped — datachannel not open', msg, dc?.readyState)
        return
      }
      try {
        dc.send(JSON.stringify(msg))
      } catch (err) {
        console.warn('[peer] send failed', err)
      }
    },
    destroy: () => {
      log('destroy')
      unsubFns.forEach((u) => {
        try {
          u()
        } catch {
          /* ignore */
        }
      })
      cleanupConnection()
      // Best-effort cleanup of our signaling tree
      remove(selfPresenceRef).catch(() => {})
      if (remotePeerId) {
        remove(
          ref(db, `rooms/${roomId}/signal/${SELF_ID}/${remotePeerId}`),
        ).catch(() => {})
      }
      // Drop the whole room when nobody is left — best-effort
      onValue(
        peersRef,
        (snap: DataSnapshot) => {
          if (!snap.exists()) {
            remove(roomRef).catch(() => {})
          }
        },
        { onlyOnce: true },
      )
    },
  }
}
