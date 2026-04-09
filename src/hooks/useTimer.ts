import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pro-match style draft timer.
 *
 * Each side has:
 *   - RESERVE_TIME (130s) — shared pool that ticks down when bonus runs out
 *   - Bonus per action: BAN_BONUS (30s) or PICK_BONUS (35s)
 *
 * When bonus expires → reserve ticks. When reserve expires → goes negative.
 */

const RESERVE_TIME = 130 // seconds
const BAN_BONUS = 30
const PICK_BONUS = 35

export interface TimerState {
  /** Reserve time remaining (can go negative) */
  radiantReserve: number
  direReserve: number
  /** Current action bonus remaining */
  bonus: number
  /** Is timer running */
  running: boolean
}

export function useTimer(
  step: number,
  phase: string,
  actionKind: 'ban' | 'pick' | null,
  actionSide: 'radiant' | 'dire' | null,
  enabled: boolean,
) {
  const [state, setState] = useState<TimerState>({
    radiantReserve: RESERVE_TIME,
    direReserve: RESERVE_TIME,
    bonus: BAN_BONUS,
    running: false,
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevStepRef = useRef(step)

  // Start timer
  const start = useCallback(() => {
    setState((s) => ({ ...s, running: true }))
  }, [])

  // Reset timer completely
  const resetTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    setState({
      radiantReserve: RESERVE_TIME,
      direReserve: RESERVE_TIME,
      bonus: actionKind === 'pick' ? PICK_BONUS : BAN_BONUS,
      running: false,
    })
  }, [actionKind])

  // When step changes, give new bonus for the new action
  useEffect(() => {
    if (step !== prevStepRef.current) {
      prevStepRef.current = step
      const newBonus = actionKind === 'pick' ? PICK_BONUS : BAN_BONUS
      setState((s) => ({ ...s, bonus: newBonus }))
    }
  }, [step, actionKind])

  // Tick logic
  useEffect(() => {
    if (!enabled || !state.running || phase !== 'drafting' || !actionSide) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      setState((s) => {
        if (!s.running) return s

        if (s.bonus > 0) {
          // Tick bonus
          return { ...s, bonus: +(s.bonus - 0.1).toFixed(1) }
        }

        // Bonus exhausted → tick reserve
        const key = actionSide === 'radiant' ? 'radiantReserve' : 'direReserve'
        return {
          ...s,
          bonus: 0,
          [key]: +(s[key] - 0.1).toFixed(1),
        }
      })
    }, 100)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, state.running, phase, actionSide])

  // Stop when draft is done
  useEffect(() => {
    if (phase !== 'drafting' && state.running) {
      setState((s) => ({ ...s, running: false }))
    }
  }, [phase, state.running])

  return { timer: state, startTimer: start, resetTimer }
}

export function formatTime(seconds: number): string {
  const neg = seconds < 0
  const abs = Math.abs(seconds)
  const m = Math.floor(abs / 60)
  const s = Math.floor(abs % 60)
  return `${neg ? '-' : ''}${m}:${s.toString().padStart(2, '0')}`
}
