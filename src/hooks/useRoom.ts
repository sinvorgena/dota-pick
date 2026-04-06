import { useEffect, useRef, useState } from 'react'
import type { DataConnection } from 'peerjs'
import { createHost, joinRoom, type PeerMessage, type RoomHandle } from '../lib/peer'
import { useDraftStore } from '../store/draftStore'
import type { Side } from '../types'

export type ConnStatus = 'idle' | 'connecting' | 'waiting' | 'connected' | 'error'

export function useRoom(roomId: string, asHost: boolean) {
  const [status, setStatus] = useState<ConnStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const handleRef = useRef<RoomHandle | null>(null)
  const suppressNext = useRef(false)

  useEffect(() => {
    if (!roomId) return
    setStatus(asHost ? 'waiting' : 'connecting')

    const sendCurrentState = (conn: DataConnection) => {
      const st = useDraftStore.getState()
      conn.send({ type: 'state', draft: st.draft } satisfies PeerMessage)
      if (st.mySide) {
        conn.send({ type: 'hello', side: st.mySide } satisfies PeerMessage)
      }
    }

    const onConn = (conn: DataConnection) => {
      setStatus('connected')
      useDraftStore.getState().setOpponentReady(true)

      // attach data handler FIRST so nothing is missed
      conn.on('data', (raw) => {
        const msg = raw as PeerMessage
        if (msg.type === 'ready') {
          // guest signaled it's ready — host pushes current state + side
          if (asHost) sendCurrentState(conn)
        } else if (msg.type === 'state') {
          suppressNext.current = true
          useDraftStore.getState().applyDraft(msg.draft)
        } else if (msg.type === 'side-set' || msg.type === 'hello') {
          const opp: Side = msg.side === 'radiant' ? 'dire' : 'radiant'
          useDraftStore.getState().setMySide(opp)
        } else if (msg.type === 'reset') {
          useDraftStore.getState().reset()
        }
      })
      conn.on('close', () => {
        setStatus('idle')
        useDraftStore.getState().setOpponentReady(false)
      })

      // guest announces readiness AFTER attaching the data listener.
      // host will respond with current state + hello.
      if (!asHost) {
        conn.send({ type: 'ready' } satisfies PeerMessage)
      }
    }

    const onError = (e: Error) => {
      setError(e.message || String(e))
      setStatus('error')
    }

    const h = asHost
      ? createHost(roomId, onConn, onError)
      : joinRoom(roomId, onConn, onError)
    handleRef.current = h

    return () => {
      h.destroy()
      handleRef.current = null
    }
  }, [roomId, asHost])

  // broadcast local draft changes to peer
  useEffect(() => {
    return useDraftStore.subscribe((state, prev) => {
      if (state.draft === prev.draft) return
      if (suppressNext.current) {
        suppressNext.current = false
        return
      }
      handleRef.current?.send({ type: 'state', draft: state.draft })
    })
  }, [])

  // re-broadcast my side whenever it changes (covers: host picks side AFTER
  // guest already connected, or just changes their mind)
  useEffect(() => {
    let prevSide: Side | null = useDraftStore.getState().mySide
    return useDraftStore.subscribe((s) => {
      if (s.mySide !== prevSide) {
        prevSide = s.mySide
        if (s.mySide) {
          handleRef.current?.send({ type: 'hello', side: s.mySide })
        }
      }
    })
  }, [])

  const sendHello = (side: Side) => {
    handleRef.current?.send({ type: 'hello', side })
  }

  return { status, error, sendHello }
}
