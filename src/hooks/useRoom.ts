import { useEffect, useRef, useState } from 'react'
import { createRoom, type PeerMessage, type RoomHandle } from '../lib/peer'
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
    setError(null)

    const pushFullState = () => {
      const st = useDraftStore.getState()
      // Host is the source of truth for the draft state — only host pushes
      // the draft itself when a peer joins. Both sides push their own side.
      if (asHost) {
        handleRef.current?.send({ type: 'state', draft: st.draft })
      }
      if (st.mySide) {
        handleRef.current?.send({ type: 'hello', side: st.mySide })
      }
    }

    const room = createRoom(roomId, {
      onPeerJoin: () => {
        setStatus('connected')
        useDraftStore.getState().setOpponentReady(true)
        // small delay so trystero has finished wiring its data channel
        setTimeout(pushFullState, 50)
      },
      onPeerLeave: () => {
        setStatus(asHost ? 'waiting' : 'connecting')
        useDraftStore.getState().setOpponentReady(false)
      },
      onMessage: (msg: PeerMessage) => {
        if (msg.type === 'state') {
          suppressNext.current = true
          useDraftStore.getState().applyDraft(msg.draft)
        } else if (msg.type === 'hello' || msg.type === 'side-set') {
          const opp: Side = msg.side === 'radiant' ? 'dire' : 'radiant'
          useDraftStore.getState().setMySide(opp)
        } else if (msg.type === 'reset') {
          useDraftStore.getState().reset()
        }
      },
      onError: (e) => {
        setError(e.message || String(e))
        setStatus('error')
      },
    })
    handleRef.current = room

    return () => {
      room.destroy()
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

  // re-broadcast my side whenever it changes
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
