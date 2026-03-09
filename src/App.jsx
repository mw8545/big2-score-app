import React, { useEffect, useMemo, useState } from 'react'

const DEFAULT_PLAYERS = ['榮', '成', '勳', '西']
const SPECIAL_MAP = { 9: 18, 10: 20, 11: 22, 12: 36, 13: 52 }
const STORAGE_KEY = 'big2_score_pwa_v1'

function normalizeValue(v) {
  return String(v).replace(/Ｏ|O|o/g, '0').replace(/[－—–]/g, '-').trim()
}
function parseValue(v) {
  const s = normalizeValue(v)
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
function pairwiseSettlement(players, scores) {
  const net = new Array(players.length).fill(0)
  const lines = []
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const diff = scores[i] - scores[j]
      if (diff === 0) {
        lines.push(`${players[i]} vs ${players[j]}：$0`)
      } else if (diff > 0) {
        lines.push(`${players[i]} vs ${players[j]}：${players[i]} 畀 $${diff} ${players[j]}`)
        net[i] -= diff
        net[j] += diff
      } else {
        const amt = -diff
        lines.push(`${players[i]} vs ${players[j]}：${players[j]} 畀 $${amt} ${players[i]}`)
        net[j] -= amt
        net[i] += amt
      }
    }
  }
  return { net, lines }
}
function diffSums(scores) {
  return scores.map((s, i) => scores.reduce((acc, other, j) => (i === j ? acc : acc + (s - other)), 0))
}

export default function App() {
  const [players] = useState(DEFAULT_PLAYERS)
  const [totals, setTotals] = useState([0, 0, 0, 0])
  const [inputs, setInputs] = useState(['', '', '', ''])
  const [directScores, setDirectScores] = useState(['', '', '', ''])
  const [lastZeroWinners, setLastZeroWinners] = useState([])
  const [history, setHistory] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [useSpecialMap, setUseSpecialMap] = useState(false)
  const [status, setStatus] = useState('準備好。')

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      setTotals(parsed.totals || [0, 0, 0, 0])
      setLastZeroWinners(parsed.lastZeroWinners || [])
      setHistory(parsed.history || [])
      setRedoStack(parsed.redoStack || [])
      setUseSpecialMap(!!parsed.useSpecialMap)
    } catch {}
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ totals, lastZeroWinners, history, redoStack, useSpecialMap }))
  }, [totals, lastZeroWinners, history, redoStack, useSpecialMap])

  const settlement = useMemo(() => pairwiseSettlement(players, totals), [players, totals])
  const diffTotals = useMemo(() => diffSums(totals), [totals])

  function pushSnapshot(type, payload) {
    setHistory(h => [...h, { type, payload, before: { totals, lastZeroWinners, useSpecialMap } }])
    setRedoStack([])
  }

  function addRound() {
    const raw = inputs.map(parseValue)
    if (raw.some(v => v === null)) {
      setStatus('請輸入 4 個有效數字。')
      return
    }
    const rawNums = raw
    const used = rawNums.map(n => (useSpecialMap && SPECIAL_MAP[n] ? SPECIAL_MAP[n] : n))
    const winners = rawNums.map((n, i) => (n === 0 ? i : -1)).filter(x => x !== -1)

    pushSnapshot('round', { rawNums, used, winners })
    setTotals(t => t.map((v, i) => v + used[i]))
    setLastZeroWinners(winners)
    setInputs(['', '', '', ''])
    setStatus('已加入本局。')
  }

  function undo() {
    if (!history.length) { setStatus('冇得 Undo。'); return }
    const last = history[history.length - 1]
    setRedoStack(r => [...r, { type: last.type, payload: last.payload }])
    setHistory(h => h.slice(0, -1))
    setTotals(last.before.totals)
    setLastZeroWinners(last.before.lastZeroWinners)
    setUseSpecialMap(last.before.useSpecialMap)
    setStatus('已 Undo。')
  }

  function redo() {
    if (!redoStack.length) { setStatus('冇得 Redo。'); return }
    const item = redoStack[redoStack.length - 1]
    setRedoStack(r => r.slice(0, -1))
    if (item.type === 'round') {
      pushSnapshot('round', item.payload)
      setTotals(t => t.map((v, i) => v + item.payload.used[i]))
      setLastZeroWinners(item.payload.winners)
    } else if (item.type === 'setTotals') {
      pushSnapshot('setTotals', item.payload)
      setTotals(item.payload.newTotals)
      setLastZeroWinners([])
    }
    setStatus('已 Redo。')
  }

  function resetAll() {
    pushSnapshot('setTotals', { newTotals: [0, 0, 0, 0] })
    setTotals([0, 0, 0, 0])
    setLastZeroWinners([])
    setStatus('已清零。')
  }

  function applyDirectTotals() {
    const vals = directScores.map(parseValue)
    if (vals.some(v => v === null)) { setStatus('請輸入 4 個總分。'); return }
    const newTotals = vals
    pushSnapshot('setTotals', { newTotals })
    setTotals(newTotals)
    setLastZeroWinners([])
    setStatus('已覆蓋總分。')
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ players, totals, history, useSpecialMap, lastZeroWinners }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'big2-score-session.json'
    a.click()
    URL.revokeObjectURL(a.href)
    setStatus('已匯出 JSON。')
  }

  async function copySummary() {
    const text = players.map((p, i) => `${lastZeroWinners.includes(i) ? '*' : ''}${p} ${totals[i]}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setStatus('已複製最新分數。')
    } catch {
      setStatus('複製失敗。')
    }
  }

  return (
    <div className="app-shell">
      <div className="container">
        <header className="hero">
          <h1>鋤大地記分 Pro</h1>
          <p>iPhone 版 Web App / PWA。上傳去 Vercel 之後，就可以用 Safari 加到主畫面。</p>
        </header>

        <section className="grid two">
          <div className="card">
            <h2>最新總分</h2>
            <div className="score-grid">
              {players.map((name, i) => (
                <div className="score-box" key={i}>
                  <div className="row-between">
                    <div className="player-name">{lastZeroWinners.includes(i) ? `*${name}` : name}</div>
                    {lastZeroWinners.includes(i) ? <span className="pill">勝家</span> : null}
                  </div>
                  <div className="score-num">{totals[i]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>加入新一局</h2>
            <div className="input-grid">
              {players.map((name, i) => (
                <label className="field" key={i}>
                  <span>{name}</span>
                  <input value={inputs[i]} onChange={(e) => setInputs(arr => arr.map((v, idx) => idx === i ? e.target.value : v))} placeholder="輸入分數" />
                </label>
              ))}
            </div>
            <label className="switch-row">
              <input type="checkbox" checked={useSpecialMap} onChange={(e) => setUseSpecialMap(e.target.checked)} />
              <span>特殊牌值：9=18、10=20、11=22、12=36、13=52</span>
            </label>
            <div className="btn-row">
              <button onClick={addRound}>加入本局</button>
              <button className="secondary" onClick={undo}>Undo</button>
              <button className="secondary" onClick={redo}>Redo</button>
              <button className="danger" onClick={resetAll}>清零</button>
            </div>
          </div>
        </section>

        <section className="grid two">
          <div className="card">
            <h2>直接設定總分</h2>
            <div className="input-grid">
              {players.map((name, i) => (
                <label className="field" key={i}>
                  <span>{name}</span>
                  <input value={directScores[i]} onChange={(e) => setDirectScores(arr => arr.map((v, idx) => idx === i ? e.target.value : v))} placeholder="總分" />
                </label>
              ))}
            </div>
            <div className="btn-row">
              <button onClick={applyDirectTotals}>覆蓋總分</button>
              <button className="secondary" onClick={copySummary}>複製最新分數</button>
              <button className="secondary" onClick={exportJson}>匯出 JSON</button>
            </div>
          </div>

          <div className="card">
            <h2>二順結算</h2>
            <div className="list-box">
              {settlement.lines.map((line, idx) => <div key={idx} className="line">{line}</div>)}
            </div>
            <div className="settle-grid">
              {players.map((p, i) => (
                <div key={i} className="mini-box">
                  <div className="mini-label">{p}</div>
                  <div className={`mini-num ${settlement.net[i] > 0 ? 'up' : settlement.net[i] < 0 ? 'down' : ''}`}>
                    {settlement.net[i] > 0 ? '+' : ''}${settlement.net[i]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid two">
          <div className="card">
            <h2>相減總和</h2>
            <div className="stack">
              {players.map((p, i) => (
                <div className="mini-box row-between" key={i}>
                  <span>{p}</span>
                  <strong>{diffTotals[i]}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>歷史紀錄</h2>
            <div className="stack history">
              {history.filter(x => x.type === 'round').length === 0 ? (
                <div className="muted">未有局數記錄</div>
              ) : (
                history.filter(x => x.type === 'round').map((item, idx) => (
                  <div key={idx} className="mini-box">
                    <div><strong>第 {idx + 1} 局</strong></div>
                    <div className="muted">輸入：{(item.payload.rawNums || []).join(' ')}</div>
                    <div className="muted">實計：{(item.payload.used || []).join(' ')}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="card">
          <h2>狀態</h2>
          <div className="status">{status}</div>
        </section>
      </div>
    </div>
  )
}
