/**
 * Stockfish for the app, over UCI, with the website's engine API (`setSkill`,
 * `evaluate`, `terminate`). The engine runs on the website's /stockfish/
 * engine.html in a hidden web view (engine-host.tsx); `send` reaches it and
 * every line it prints comes back through `receive`.
 * shortcut: the engine page loads over the network, so Play and Analyse need a connection; bundle the wasm in the app if offline matters.
 */

import type { Score } from '@misri/core/analysis'

export type { Score }

const LOAD_TIMEOUT_MS = 20_000

export class Engine {
  private ready = false
  private waiting: string[] = []
  private listeners = new Set<(line: string) => void>()
  /** Set once the engine can't run; every search after that fails fast. */
  private failure: Error | null = null
  /** One search at a time; UCI has no request ids to match replies to. */
  private chain: Promise<unknown> = Promise.resolve()
  private abort: ((error: Error) => void) | null = null
  private loading: ReturnType<typeof setTimeout>

  private transport: (command: string) => void

  constructor(transport: (command: string) => void) {
    this.transport = transport
    this.send('uci')
    this.send('isready')
    this.loading = setTimeout(
      () =>
        this.fail(
          'The chess engine did not load. Check your connection and try again.',
        ),
      LOAD_TIMEOUT_MS,
    )
  }

  /** A line from the engine page. */
  receive(line: string) {
    if (line === 'loaded') {
      this.ready = true
      clearTimeout(this.loading)
      for (const command of this.waiting) this.transport(command)
      this.waiting = []
      return
    }
    if (line.startsWith('error ')) return this.fail(line.slice(6))
    for (const listener of this.listeners) listener(line)
  }

  private send(command: string) {
    if (this.ready) this.transport(command)
    else this.waiting.push(command)
  }

  private fail(message: string) {
    clearTimeout(this.loading)
    this.failure ??= new Error(message)
    this.abort?.(this.failure)
  }

  /** Stockfish's strength, 0 (weakest) to 20 (full), between searches. */
  setSkill(level: number) {
    this.chain = this.chain.then(() =>
      this.send(`setoption name Skill Level value ${level}`),
    )
  }

  /** Evaluates one position for `movetime` milliseconds. */
  evaluate(fen: string, movetime: number): Promise<Score> {
    const run = this.chain.then(() => this.search(fen, movetime))
    this.chain = run.catch(() => {})
    return run
  }

  private search(fen: string, movetime: number): Promise<Score> {
    const whiteToMove = fen.split(' ')[1] === 'w'
    return new Promise((resolve, reject) => {
      if (this.failure) return reject(this.failure)
      let score: Score = { cp: 0 }
      const cleanup = () => {
        this.listeners.delete(onLine)
        this.abort = null
      }
      this.abort = (error) => {
        cleanup()
        reject(error)
      }
      const onLine = (line: string) => {
        const match = /score (cp|mate) (-?\d+)/.exec(line)
        if (line.startsWith('info') && match) {
          // UCI scores are from the side to move; flip to White's view
          const value = Number(match[2]) * (whiteToMove ? 1 : -1)
          score =
            match[1] === 'cp'
              ? { cp: value }
              : // "mate 0": the side to move is already checkmated
                { mate: value !== 0 ? value : whiteToMove ? -1 : 1 }
        }
        if (line.startsWith('bestmove')) {
          cleanup()
          const best = line.split(' ')[1]
          resolve(best && best !== '(none)' ? { ...score, best } : score)
        }
      }
      this.listeners.add(onLine)
      this.send(`position fen ${fen}`)
      this.send(`go movetime ${movetime}`)
    })
  }

  /** Stops; a search in flight fails rather than hanging forever. */
  terminate() {
    this.fail('The chess engine was stopped.')
    this.listeners.clear()
  }
}
