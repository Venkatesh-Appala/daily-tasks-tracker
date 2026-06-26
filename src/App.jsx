import React, { useState, useEffect, useRef } from 'react'
import { SYNC_ENABLED, fetchCloud, pushCloud } from './sync'

function toISODate(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseISODate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function todayISO() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)

  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

function addDays(dateStr, offset) {
  const d = parseISODate(dateStr)
  d.setDate(d.getDate() + offset)
  return toISODate(d)
}

function formatDateDay(dateStr) {
  const d = parseISODate(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

function formatDateMonthDay(dateStr) {
  const d = parseISODate(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateYear(dateStr) {
  const d = parseISODate(dateStr)
  return d.toLocaleDateString('en-US', { year: 'numeric' })
}

function weekStart(dateStr) {
  const selected = parseISODate(dateStr)
  return addDays(dateStr, -selected.getDay())
}

function weekDates(dateStr) {
  const startOfWeek = weekStart(dateStr)
  return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek, index))
}

function formatTaskTitle(title) {
  return title
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
}

function uuid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

// 3-way merge of an id-keyed collection so a save preserves changes made
// elsewhere (dashboard / scripts / another device) while still applying this
// session's edits, additions and deletions.
//  - baseline: the collection as this session last loaded/saved it
//  - current:  the collection in app state now (our edits)
//  - theirs:   the freshly-fetched collection (may contain external changes)
function mergeCollection(baseline, current, theirs, idKey = 'id') {
  const baselineById = new Map((baseline || []).map(x => [x[idKey], x]))
  const currentById = new Map((current || []).map(x => [x[idKey], x]))
  const theirsById = new Map((theirs || []).map(x => [x[idKey], x]))
  const result = []
  for (const t of theirs || []) {
    const id = t[idKey]
    const inBaseline = baselineById.has(id)
    const inCurrent = currentById.has(id)
    if (inBaseline && !inCurrent) continue // we deleted it → respect deletion
    if (inCurrent) {
      const cur = currentById.get(id)
      const bl = baselineById.get(id)
      const weModified = !bl || JSON.stringify(cur) !== JSON.stringify(bl)
      result.push(weModified ? cur : t) // prefer our edit, else keep theirs
    } else {
      result.push(t) // external addition (or unchanged) → keep
    }
  }
  for (const c of current || []) {
    const id = c[idKey]
    if (!baselineById.has(id) && !theirsById.has(id)) result.push(c) // our new item
  }
  return result
}

// How long a game stays playable after a kid unlocks it.
const GAME_MINUTES = 5
const GAME_DURATION_MS = GAME_MINUTES * 60 * 1000

function App() {
  const [tasks, setTasks] = useState([])
  const [date, setDate] = useState(todayISO())
  const [activeTab, setActiveTab] = useState('tasks')
  // Per-kid game unlocks: { [gameId]: unlockTimestampMs }. A game is playable
  // for GAME_DURATION_MS after its timestamp; the timestamp also marks it "played".
  const [unlockedGames, setUnlockedGames] = useState({})
  const [now, setNow] = useState(() => Date.now())
  const [spentPoints, setSpentPoints] = useState(0)

  // Parents own a task library and a set of kids. The app is parent-login-first.
  const [parents, setParents] = useState([])
  const [activeParentId, setActiveParentId] = useState(null)
  const [allTasks, setAllTasks] = useState([]) // full task library (all parents)
  const [allGames, setAllGames] = useState([]) // game links (all parents)
  const [children, setChildren] = useState([])
  const [activeChildId, setActiveChildId] = useState(null)

  // Parent login form.
  const [loginParentId, setLoginParentId] = useState('')
  const [parentPinInput, setParentPinInput] = useState('')
  const [parentLoginError, setParentLoginError] = useState('')
  const [addingParent, setAddingParent] = useState(false)
  const [parentForm, setParentForm] = useState({ name: '', pin: '' })
  // Admin is re-locked behind the parent PIN within a session (so a kid using
  // the tracker can't open it). Unlocked only after the PIN is entered.
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [adminPinInput, setAdminPinInput] = useState('')
  const [adminPinError, setAdminPinError] = useState('')

  // PIN gate: when a kid with a PIN is picked, hold their id here until the
  // correct PIN is entered before actually switching to them.
  const [pinPromptKidId, setPinPromptKidId] = useState(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')

  // Cloud-sync bookkeeping. cloudRecordRef holds the last full document so writes
  // preserve fields/other children we don't actively edit. canSyncRef gates writes
  // so we never overwrite the cloud with local-only data we failed to read.
  const cloudRecordRef = useRef({ children: [], progress: {} })
  // The record as this session last loaded/saved it — the baseline for 3-way
  // merges so concurrent external edits aren't clobbered.
  const loadedRecordRef = useRef({})
  const canSyncRef = useRef(false)
  const saveTimerRef = useRef(null)
  const [tictacToe, setTictacToe] = useState(Array(9).fill(null))
  const [tictacToeWinner, setTictacToeWinner] = useState(null)

  // Snake game state
  const GRID_SIZE = 12
  const [snake, setSnake] = useState([Math.floor((GRID_SIZE * GRID_SIZE) / 2)])
  const [direction, setDirection] = useState(1) // 1:right, -1:left, GRID_SIZE:down, -GRID_SIZE:up
  const [food, setFood] = useState(null)
  const [snakeRunning, setSnakeRunning] = useState(false)
  const [snakeScore, setSnakeScore] = useState(0)

  // Bigger game state (grow a box by clicking)
  const [biggerSize, setBiggerSize] = useState(60)
  const [biggerScore, setBiggerScore] = useState(0)

  // Snapshot the score metrics so they're readable directly from the bin. These
  // are derived from completedDates + spentPoints; `todayScore` is for the actual
  // current day (not the date being browsed), so it's stable across devices.
  const computeStats = (ts, spent) => {
    const today = todayISO()
    let total = 0
    let todayScore = 0
    ts.forEach(t => {
      const dates = Array.isArray(t.completedDates) ? t.completedDates : []
      total += dates.length * (t.points || 0)
      if (dates.includes(today)) todayScore += t.points || 0
    })
    return {
      todayScore,
      totalPoints: total,
      spentPoints: spent,
      availableBalance: total - spent,
      updatedAt: new Date().toISOString()
    }
  }

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      // The cloud (JSONBin) holds everything: parents, the task library, kids,
      // and per-kid progress. Nothing is auto-selected — the app starts at the
      // parent login screen.
      let record = null
      if (SYNC_ENABLED) {
        try {
          record = await fetchCloud()
          canSyncRef.current = true // read succeeded — safe to write back
          if (record && typeof record === 'object') {
            cloudRecordRef.current = record
            loadedRecordRef.current = record
          }
        } catch (error) {
          // Couldn't read the cloud — stay read-only this session so we don't
          // overwrite good cloud data. With no local cache, nothing loads until
          // the connection is back.
          console.warn('Could not load cloud data', error)
        }
      }
      if (cancelled) return

      setParents(record && Array.isArray(record.parents) ? record.parents : [])
      // Drop the legacy `required` flag — all tasks are daily/required now.
      setAllTasks(
        (record && Array.isArray(record.tasks) ? record.tasks : []).map(({ required, ...t }) => t)
      )
      setAllGames(record && Array.isArray(record.games) ? record.games : [])
      setChildren(record && Array.isArray(record.children) ? record.children : [])
      setActiveParentId(null)
      setActiveChildId(null)
      setTasks([])
      setSpentPoints(0)
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced cloud save: whenever progress or child details change (after load),
  // write the document back to JSONBin ~1.5s after the last change to stay well
  // within the free request quota. Gated on canSyncRef so a failed initial read
  // never clobbers existing cloud data.
  useEffect(() => {
    if (!SYNC_ENABLED || !canSyncRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      // Read-before-write: fetch the latest so external changes (dashboard,
      // scripts, other devices) become the base we merge our edits onto.
      let base = cloudRecordRef.current || {}
      try {
        const latest = await fetchCloud()
        if (latest && typeof latest === 'object') base = latest
      } catch (error) {
        console.warn('Could not refresh before save; using last known record', error)
      }
      const baseline = loadedRecordRef.current || {}
      const mergedParents = mergeCollection(baseline.parents, parents, base.parents)
      const mergedTasks = mergeCollection(baseline.tasks, allTasks, base.tasks)
      const mergedGames = mergeCollection(baseline.games, allGames, base.games)
      const mergedChildren = mergeCollection(baseline.children, children, base.children)

      // Other kids' progress comes from the fresh base; overlay the active kid's.
      const progress = { ...(base.progress || {}) }
      if (activeChildId) {
        const newDates = { ...(progress[activeChildId]?.completedDates || {}) }
        tasks.forEach(t => {
          if (Array.isArray(t.completedDates) && t.completedDates.length) newDates[t.id] = t.completedDates
          else delete newDates[t.id]
        })
        progress[activeChildId] = {
          completedDates: newDates,
          spentPoints,
          unlockedGames,
          stats: computeStats(tasks, spentPoints)
        }
      }

      const record = {
        ...base, // preserves external-only fields (starterTasks, starterGames, …)
        parents: mergedParents,
        tasks: mergedTasks,
        games: mergedGames,
        children: mergedChildren,
        progress
      }
      cloudRecordRef.current = record
      loadedRecordRef.current = record // advance baseline to what we just wrote
      pushCloud(record).catch(error => console.warn('Cloud sync failed', error))
    }, 1500)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [tasks, spentPoints, unlockedGames, children, activeChildId, parents, allTasks, allGames])

  // Tick every second while the Games tab is open, so countdowns update live.
  useEffect(() => {
    if (activeTab !== 'games') return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeTab])

  const isDone = (task, dateStr) => {
    if (!task) return false
    if (Array.isArray(task.completedDates)) return task.completedDates.includes(dateStr)
    // backward compat: support boolean `done`
    return !!task.done
  }

  const toggleTaskForDate = id => {
    setTasks(ts =>
      ts.map(t => {
        if (t.id !== id) return t
        const dates = Array.isArray(t.completedDates) ? [...t.completedDates] : []
        const idx = dates.indexOf(date)
        if (idx >= 0) dates.splice(idx, 1)
        else dates.push(date)
        return { ...t, completedDates: dates }
      })
    )
  }

  const resetAllForDate = () => {
    setTasks(ts => ts.map(t => ({ ...t, completedDates: (t.completedDates || []).filter(d => d !== date) })))
  }

  // Redeem points to unlock games (costs 50 pts per unlock)
  const redeemPointsForGame = game => {
    const gameName = game.name
    const availablePoints = totalPoints - spentPoints
    if (availablePoints >= 50) {
      // Store the unlock time: the game is playable for GAME_MINUTES from now.
      const ts = Date.now()
      setUnlockedGames(prev => ({ ...prev, [game.id]: ts }))
      setNow(ts)
      setSpentPoints(prev => prev + 50)
      alert(`Unlocked ${gameName} for ${GAME_MINUTES} minutes! 50 points redeemed.`)
    } else {
      alert(`Need 50 points to unlock ${gameName}. You have ${availablePoints} pts available.`)
    }
  }

  // Snake game helpers
  const placeFood = (snakeArr = snake) => {
    const max = GRID_SIZE * GRID_SIZE
    let idx = Math.floor(Math.random() * max)
    while (snakeArr.includes(idx)) idx = Math.floor(Math.random() * max)
    setFood(idx)
  }

  useEffect(() => {
    // place initial food
    placeFood()
  }, [])

  useEffect(() => {
    if (!snakeRunning) return
    const id = setInterval(() => {
      setSnake(prev => {
        const head = prev[prev.length - 1]
        let next = head + direction
        // wrap horizontally
        if (direction === 1 && head % GRID_SIZE === GRID_SIZE - 1) next = head - (GRID_SIZE - 1)
        if (direction === -1 && head % GRID_SIZE === 0) next = head + (GRID_SIZE - 1)
        // wrap vertically
        if (direction === GRID_SIZE && head + GRID_SIZE >= GRID_SIZE * GRID_SIZE) next = head + GRID_SIZE - GRID_SIZE * GRID_SIZE
        if (direction === -GRID_SIZE && head - GRID_SIZE < 0) next = head - GRID_SIZE + GRID_SIZE * GRID_SIZE

        if (prev.includes(next)) {
          // collision: stop game
          setSnakeRunning(false)
          return prev
        }

        let grew = false
        if (next === food) {
          grew = true
          setSnakeScore(s => s + 1)
          placeFood([...prev, next])
        }

        const newSnake = grew ? [...prev, next] : [...prev.slice(1), next]
        return newSnake
      })
    }, 180)
    return () => clearInterval(id)
  }, [snakeRunning, direction, food])

  // handle arrow keys
  useEffect(() => {
    const onKey = e => {
      if (!snakeRunning) return
      if (e.key === 'ArrowUp') setDirection(d => (d === GRID_SIZE ? d : -GRID_SIZE))
      if (e.key === 'ArrowDown') setDirection(d => (d === -GRID_SIZE ? d : GRID_SIZE))
      if (e.key === 'ArrowLeft') setDirection(d => (d === 1 ? d : -1))
      if (e.key === 'ArrowRight') setDirection(d => (d === -1 ? d : 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [snakeRunning])

  const startStopSnake = () => setSnakeRunning(r => !r)

  const resetSnake = () => {
    setSnake([Math.floor((GRID_SIZE * GRID_SIZE) / 2)])
    setDirection(1)
    setSnakeScore(0)
    placeFood([Math.floor((GRID_SIZE * GRID_SIZE) / 2)])
    setSnakeRunning(false)
  }

  // Bigger game functions
  const growBigger = () => {
    setBiggerSize(s => s + 10)
    setBiggerScore(sc => sc + 1)
  }

  const resetBigger = () => {
    setBiggerSize(60)
    setBiggerScore(0)
  }

  // Tic Tac Toe - check winner
  const checkWinner = board => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
    for (let line of lines) {
      if (board[line[0]] && board[line[0]] === board[line[1]] && board[line[1]] === board[line[2]]) return board[line[0]]
    }
    return null
  }

  // Tic Tac Toe - player move
  const playTictacToe = index => {
    if (tictacToe[index] || tictacToeWinner) return
    let newBoard = [...tictacToe]
    newBoard[index] = 'X'
    
    // Computer move (AI)
    let emptySpaces = newBoard.map((v, i) => v === null ? i : null).filter(v => v !== null)
    if (emptySpaces.length > 0) {
      const computerIndex = emptySpaces[Math.floor(Math.random() * emptySpaces.length)]
      newBoard[computerIndex] = 'O'
    }
    
    const winner = checkWinner(newBoard)
    setTictacToe(newBoard)
    if (winner) setTictacToeWinner(winner)
  }

  // Reset Tic Tac Toe
  const resetTictacToe = () => {
    setTictacToe(Array(9).fill(null))
    setTictacToeWinner(null)
  }

  const activeParent = parents.find(p => p.id === activeParentId) || null
  const activeChild = children.find(c => c.id === activeChildId) || null
  const childName = (activeChild && activeChild.name && activeChild.name.trim()) || ''
  // Kids and task library scoped to the logged-in parent.
  const parentChildren = children.filter(c => c.parentId === activeParentId)
  const parentTaskLibrary = allTasks.filter(t => t.parentId === activeParentId)
  const parentGames = allGames.filter(g => g.parentId === activeParentId)
  // Only kids with a name appear in the selector (no "Unnamed kid" entries).
  const namedChildren = parentChildren.filter(c => c.name && c.name.trim())

  // ---- Parent login / management ----
  const loginParent = parentArg => {
    const p = parentArg || parents.find(x => x.id === loginParentId)
    if (!p) {
      setParentLoginError('Please select a parent.')
      return
    }
    if (p.pin && parentPinInput.trim() !== String(p.pin)) {
      setParentLoginError('Incorrect PIN.')
      return
    }
    setActiveParentId(p.id)
    setParentPinInput('')
    setParentLoginError('')
    setActiveChildId(null)
    setTasks([])
    setSpentPoints(0)
    setUnlockedGames({})
    setActiveTab('tasks')
    // Admin starts locked each login; the parent PIN unlocks it. A parent with
    // no PIN has nothing to verify, so Admin is open for them.
    setAdminUnlocked(!p.pin)
    setAdminPinInput('')
    setAdminPinError('')
  }

  // Pick a parent on the login screen: log in immediately if no PIN, else
  // select them and reveal the PIN field.
  const pickParent = p => {
    setParentLoginError('')
    setParentPinInput('')
    setLoginParentId(p.id)
    if (!p.pin) loginParent(p)
  }

  const submitAdminPin = () => {
    if (activeParent && adminPinInput.trim() === String(activeParent.pin)) {
      setAdminUnlocked(true)
      setAdminPinInput('')
      setAdminPinError('')
    } else {
      setAdminPinError('Incorrect PIN. Try again.')
    }
  }

  const logoutParent = () => {
    setActiveParentId(null)
    setActiveChildId(null)
    setTasks([])
    setSpentPoints(0)
    setLoginParentId('')
    setParentPinInput('')
    setUnlockedGames({})
    setActiveTab('tasks')
    setAdminUnlocked(false)
    setAdminPinInput('')
    setAdminPinError('')
  }

  const addParent = () => {
    const name = parentForm.name.trim()
    const pin = (parentForm.pin || '').trim()
    if (!name) {
      alert('Please enter the parent name.')
      return
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      alert('PIN must be 4 digits (or left blank for no lock).')
      return
    }
    const id = uuid()
    setParents(ps => [...ps, { id, name, pin }])
    setParentForm({ name: '', pin: '' })
    setAddingParent(false)
    // Log straight into the new parent's Admin to add kids/tasks.
    setActiveParentId(id)
    setActiveChildId(null)
    setActiveTab('admin')
    setAdminUnlocked(true)
  }

  const updateActiveParent = patch =>
    setParents(ps => ps.map(p => (p.id === activeParentId ? { ...p, ...patch } : p)))

  // Remove the logged-in parent and everything they own (kids, tasks, progress),
  // then return to the login screen.
  const removeActiveParent = () => {
    if (!activeParent) return
    if (
      !window.confirm(
        `Remove parent "${activeParent.name}" and ALL their kids, tasks and progress? This cannot be undone.`
      )
    )
      return
    const kidIds = children.filter(c => c.parentId === activeParentId).map(c => c.id)
    // Drop the removed kids' progress so it doesn't linger in the bin.
    const prev = cloudRecordRef.current || {}
    const newProgress = { ...(prev.progress || {}) }
    kidIds.forEach(id => delete newProgress[id])
    cloudRecordRef.current = { ...prev, progress: newProgress }
    setParents(ps => ps.filter(p => p.id !== activeParentId))
    setChildren(cs => cs.filter(c => c.parentId !== activeParentId))
    setAllTasks(ts => ts.filter(t => t.parentId !== activeParentId))
    logoutParent()
  }

  // ---- Kid selection (PIN-gated) ----
  const requestSelectChild = childId => {
    if (!childId) return
    const kid = children.find(c => c.id === childId)
    if (kid && kid.pin) {
      setPinPromptKidId(childId)
      setPinInput('')
      setPinError('')
    } else {
      selectChild(childId)
    }
  }

  const submitPin = () => {
    const kid = children.find(c => c.id === pinPromptKidId)
    if (kid && pinInput.trim() === String(kid.pin)) {
      selectChild(pinPromptKidId)
      setPinPromptKidId(null)
      setPinInput('')
      setPinError('')
    } else {
      setPinError('Incorrect PIN. Try again.')
    }
  }

  const cancelPin = () => {
    setPinPromptKidId(null)
    setPinInput('')
    setPinError('')
  }

  // Build the active kid's task view: the parent's tasks assigned to that kid,
  // overlaid with the kid's saved completion dates.
  const selectChild = childId => {
    const kid = children.find(c => c.id === childId)
    const prog = (cloudRecordRef.current.progress || {})[childId] || {}
    const cmap = prog.completedDates || {}
    const taskIds = kid && Array.isArray(kid.taskIds) ? kid.taskIds : []
    const assigned = allTasks.filter(t => t.parentId === activeParentId && taskIds.includes(t.id))
    setActiveChildId(childId)
    setTasks(assigned.map(t => ({ ...t, completedDates: cmap[t.id] || [] })))
    setSpentPoints(Number(prog.spentPoints) || 0)
    setUnlockedGames(prog.unlockedGames || {})
  }

  // ---- Admin: manage kids ----
  const updateChild = (id, patch) =>
    setChildren(cs => cs.map(c => (c.id === id ? { ...c, ...patch } : c)))

  const addKidInAdmin = () => {
    const id = uuid()
    setChildren(cs => [
      ...cs,
      { id, parentId: activeParentId, name: '', age: '', pin: '', taskIds: parentTaskLibrary.map(t => t.id) }
    ])
  }

  const removeKid = id => {
    if (!window.confirm('Remove this kid and their saved progress?')) return
    setChildren(cs => cs.filter(c => c.id !== id))
    if (activeChildId === id) {
      setActiveChildId(null)
      setTasks([])
      setSpentPoints(0)
      setUnlockedGames({})
    }
  }

  const toggleKidTask = (kidId, taskId) =>
    setChildren(cs =>
      cs.map(c => {
        if (c.id !== kidId) return c
        const ids = Array.isArray(c.taskIds) ? c.taskIds : []
        return { ...c, taskIds: ids.includes(taskId) ? ids.filter(x => x !== taskId) : [...ids, taskId] }
      })
    )

  // ---- Admin: manage the parent's task library ----
  const updateTaskDef = (id, patch) =>
    setAllTasks(ts => ts.map(t => (t.id === id ? { ...t, ...patch } : t)))

  const addTaskDef = () => {
    const maxId = allTasks.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0)
    const id = maxId + 1
    setAllTasks(ts => [
      ...ts,
      { id, parentId: activeParentId, title: 'New Task', points: 5, description: '', parentPresence: false }
    ])
  }

  // Load the starter tasks (template lives in the bin under `starterTasks`) into
  // this parent's library, skipping any already present (matched by title).
  const loadStarterTasks = () => {
    const templates = (cloudRecordRef.current && cloudRecordRef.current.starterTasks) || []
    const existing = new Set(parentTaskLibrary.map(t => (t.title || '').trim().toLowerCase()))
    let maxId = allTasks.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0)
    const toAdd = templates
      .filter(t => t.title && !existing.has(t.title.trim().toLowerCase()))
      .map(t => ({ parentPresence: false, ...t, id: ++maxId, parentId: activeParentId }))
    if (toAdd.length === 0) return
    setAllTasks(ts => [...ts, ...toAdd])
  }

  const removeTaskDef = id => {
    if (!window.confirm('Remove this task? It will be unassigned from all kids.')) return
    setAllTasks(ts => ts.filter(t => t.id !== id))
    setChildren(cs => cs.map(c => ({ ...c, taskIds: (c.taskIds || []).filter(x => x !== id) })))
  }

  // ---- Admin: manage the parent's game links ----
  const updateGameDef = (id, patch) =>
    setAllGames(gs => gs.map(g => (g.id === id ? { ...g, ...patch } : g)))

  const addGameDef = () =>
    setAllGames(gs => [...gs, { id: uuid(), parentId: activeParentId, name: 'New Game', emoji: '🎮', url: '' }])

  // Load the starter games (template lives in the bin under `starterGames`) into
  // this parent's library, skipping any already present (matched by URL).
  const loadStarterGames = () => {
    const templates = (cloudRecordRef.current && cloudRecordRef.current.starterGames) || []
    const existingUrls = new Set(parentGames.map(g => g.url))
    const toAdd = templates
      .filter(g => g.url && !existingUrls.has(g.url))
      .map(g => ({ ...g, id: uuid(), parentId: activeParentId }))
    if (toAdd.length === 0) return
    setAllGames(gs => [...gs, ...toAdd])
  }

  const removeGameDef = id => {
    if (!window.confirm('Remove this game link?')) return
    setAllGames(gs => gs.filter(g => g.id !== id))
  }

  // Keep the browser tab title in sync with the selected kid / parent.
  useEffect(() => {
    document.title = childName
      ? `${childName}'s Daily Tasks Tracker`
      : activeParent
        ? `${activeParent.name} — Daily Tasks Tracker`
        : 'Daily Tasks Tracker'
  }, [childName, activeParent])

  const conversionRate = 100 // 100 points = $1
  const pointsEarned = tasks.reduce((sum, t) => (isDone(t, date) ? sum + (t.points || 0) : sum), 0)
  const totalPoints = tasks.reduce((sum, t) => sum + (Array.isArray(t.completedDates) ? t.completedDates.length * (t.points || 0) : 0), 0)
  const availablePoints = totalPoints - spentPoints
  const completedCount = tasks.filter(t => isDone(t, date)).length
  const todaysCash = (pointsEarned / conversionRate).toFixed(2)

  // Two task groups (all tasks are daily/required):
  // - Missed Yesterday: tasks NOT completed on the previous day (highlighted).
  // - Required: every other task for today.
  const prevDate = addDays(date, -1)
  const isCarriedOver = t => !isDone(t, prevDate)
  const sortByParent = arr => [...arr].sort((a, b) => (a.parentPresence ? 1 : 0) - (b.parentPresence ? 1 : 0))
  const missedTasks = sortByParent(tasks.filter(isCarriedOver))
  const requiredTasks = sortByParent(tasks.filter(t => !isCarriedOver(t)))
  const doneIn = arr => arr.filter(t => isDone(t, date)).length
  const totalCash = (totalPoints / conversionRate).toFixed(2)

  // Aggregate total points earned per day across all tasks (for the Report chart)
  const dailyPointsMap = {}
  tasks.forEach(t => {
    (t.completedDates || []).forEach(d => {
      dailyPointsMap[d] = (dailyPointsMap[d] || 0) + (t.points || 0)
    })
  })
  const dailyPoints = Object.keys(dailyPointsMap)
    .sort()
    .map(d => ({ date: d, points: dailyPointsMap[d] }))
  const maxDailyPoints = dailyPoints.reduce((m, d) => Math.max(m, d.points), 0)

  const renderTaskCard = (t, { missed = false } = {}) => (
    <div key={t.id} className={`task task-card ${isDone(t, date) ? 'task-done' : ''}`}>
      <div className="task-main">
        <div className="task-title">{formatTaskTitle(t.title)}</div>
        <div className="muted">{t.description}</div>
        {missed && (
          <div style={{ marginTop: '0.35rem', display: 'inline-block', fontSize: '0.75rem', fontWeight: 'bold', color: '#b45309', background: '#fef3c7', borderRadius: '999px', padding: '0.15rem 0.6rem' }}>
            ⚠ Missed yesterday — required today
          </div>
        )}
      </div>
      <div className="task-right">
        <div className="task-badge">{t.points || 0} pts</div>
        <button
          className={`toggle-switch ${isDone(t, date) ? 'on' : ''}`}
          onClick={() => toggleTaskForDate(t.id)}
          aria-label={isDone(t, date) ? 'Mark undone' : 'Mark done'}
        >
          <span className="toggle-thumb" />
        </button>
      </div>
      <div className="task-parent-col">
        {t.parentPresence && (
          <span className="parent-icon" title="Do this task in a parent's presence" aria-label="Do this task in a parent's presence">👨‍👩‍👧</span>
        )}
      </div>
    </div>
  )

  const pinPromptKid = children.find(c => c.id === pinPromptKidId) || null

  // ---- Parent login screen (shown until a parent logs in) ----
  if (!activeParentId) {
    const loginPick = parents.find(p => p.id === loginParentId) || null
    const avatarColors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#ef4444', '#8b5cf6']
    const fieldStyle = { padding: '0.7rem 0.85rem', borderRadius: '12px', border: '2px solid #e5e7eb', fontSize: '1rem', outline: 'none', width: '100%', boxSizing: 'border-box' }
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 45%, #ec4899 100%)' }}>
        <div style={{ width: '100%', maxWidth: '440px', background: '#fff', borderRadius: '24px', padding: '2.5rem 2rem', boxShadow: '0 24px 70px rgba(0,0,0,0.32)', textAlign: 'center' }}>
          <div style={{ width: '76px', height: '76px', margin: '0 auto 0.85rem', borderRadius: '22px', background: 'linear-gradient(135deg, #6366f1, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.4rem', boxShadow: '0 10px 24px rgba(99,102,241,0.4)' }}>⭐</div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.6rem', color: '#1f2937' }}>Daily Tasks Tracker</h1>
          <p style={{ margin: '0 0 1.9rem', color: '#6b7280' }}>Build great habits, earn rewards 🎉</p>

          {addingParent ? (
            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontWeight: 700, color: '#1f2937', textAlign: 'center', marginBottom: '0.25rem' }}>➕ Add a Parent</div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ color: '#6b7280', fontSize: '0.85rem', fontWeight: 600 }}>Parent name</span>
                <input type="text" value={parentForm.name} placeholder="e.g. Mom, Dad, Venkatesh" autoFocus onChange={e => setParentForm(f => ({ ...f, name: e.target.value }))} style={fieldStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ color: '#6b7280', fontSize: '0.85rem', fontWeight: 600 }}>PIN (4 digits — optional)</span>
                <input type="password" inputMode="numeric" maxLength={4} value={parentForm.pin} placeholder="Leave blank for no PIN" onChange={e => setParentForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} style={fieldStyle} />
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button onClick={addParent} style={{ flex: 1, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', padding: '0.75rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
                  Create &amp; Continue
                </button>
                <button onClick={() => { setAddingParent(false); setParentForm({ name: '', pin: '' }) }} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: 'none', padding: '0.75rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 600 }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {parents.length === 0 ? (
                <p style={{ color: '#6b7280', marginBottom: '1.25rem' }}>No parents yet — add the first one to get started.</p>
              ) : (
                <>
                  <div style={{ color: '#374151', fontWeight: 700, marginBottom: '1rem' }}>Who's managing today?</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', marginBottom: '1.25rem' }}>
                    {parents.map((p, i) => {
                      const selected = p.id === loginParentId
                      const color = avatarColors[i % avatarColors.length]
                      return (
                        <button key={p.id} onClick={() => pickParent(p)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem', background: 'none', border: 'none', cursor: 'pointer', width: '88px' }}>
                          <div style={{ width: '66px', height: '66px', borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.7rem', fontWeight: 'bold', boxShadow: selected ? `0 0 0 4px #fff, 0 0 0 7px ${color}` : '0 6px 14px rgba(0,0,0,0.18)', transition: 'box-shadow 0.15s' }}>
                            {(p.name || '?').trim().charAt(0).toUpperCase() || '?'}
                          </div>
                          <span style={{ fontSize: '0.85rem', color: selected ? '#1f2937' : '#6b7280', fontWeight: selected ? 700 : 500, maxWidth: '88px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  {loginPick && loginPick.pin && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '0.6rem' }}>🔒 Enter PIN for {loginPick.name}</div>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        autoFocus
                        value={parentPinInput}
                        onChange={e => { setParentPinInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setParentLoginError('') }}
                        onKeyDown={e => e.key === 'Enter' && loginParent()}
                        style={{ width: '170px', padding: '0.7rem', borderRadius: '12px', border: '2px solid #e5e7eb', fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.6rem', outline: 'none' }}
                      />
                      <div>
                        <button onClick={() => loginParent()} style={{ marginTop: '0.9rem', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', padding: '0.7rem 2rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
                          Login →
                        </button>
                      </div>
                    </div>
                  )}
                  {parentLoginError && <div style={{ color: '#dc2626', fontSize: '0.9rem', marginBottom: '0.75rem' }}>{parentLoginError}</div>}
                </>
              )}
              <button onClick={() => setAddingParent(true)} style={{ marginTop: '0.85rem', background: 'none', border: '2px dashed #d1d5db', color: '#6b7280', padding: '0.65rem 1.2rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 600 }}>
                + Add Parent
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      {pinPromptKid && (
        <div
          onClick={cancelPin}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '320px', maxWidth: '90vw', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
          >
            <div className="section-title" style={{ marginBottom: '0.25rem' }}>🔒 Enter PIN</div>
            <div className="muted" style={{ marginBottom: '1rem' }}>
              Enter the 4-digit PIN for {pinPromptKid.name}.
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pinInput}
              onChange={e => {
                setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                setPinError('')
              }}
              onKeyDown={e => e.key === 'Enter' && submitPin()}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1.25rem', textAlign: 'center', letterSpacing: '0.5rem', boxSizing: 'border-box' }}
            />
            {pinError && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '0.5rem' }}>{pinError}</div>}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                onClick={submitPin}
                style={{ flex: 1, backgroundColor: '#9C27B0', color: '#fff', border: 'none', padding: '0.6rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Unlock
              </button>
              <button
                onClick={cancelPin}
                className="btn btn-muted"
                style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="sticky-panel">
        <div className="hero">
          <div className="hero-top">
            <div className="hero-title">
              <h1>{childName ? `${childName}'s Daily Tasks Tracker` : 'Daily Tasks Tracker'}</h1>
              <p className="muted">Choose a date, complete your tasks, and earn points for every good action.</p>
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span className="muted">👤 {activeParent ? activeParent.name : ''}</span>
                <button
                  className="btn btn-muted"
                  onClick={logoutParent}
                  style={{ padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.85rem' }}
                >
                  Logout
                </button>
                <span style={{ color: '#ddd' }}>|</span>
                <span className="muted">👧 Kid:</span>
                {namedChildren.length > 0 ? (
                  <select
                    value={namedChildren.some(c => c.id === activeChildId) ? activeChildId : ''}
                    onChange={e => requestSelectChild(e.target.value)}
                    style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #ccc', fontSize: '0.95rem' }}
                  >
                    {!namedChildren.some(c => c.id === activeChildId) && <option value="">Select a kid…</option>}
                    {namedChildren.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name.trim()}
                        {c.age ? ` (age ${c.age})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="muted">none yet — add one in Admin</span>
                )}
              </div>
            </div>

            <div className="hero-tasklist">
              <div className="calendar-section">
                <div className="date-nav">
                  <button className="date-btn" onClick={() => setDate(addDays(weekStart(date), -7))}>Previous week</button>
                  <div className="date-pills">
                    {weekDates(date).filter(day => day <= todayISO()).map(day => (
                      <button
                        key={day}
                        className={`date-pill ${day === date ? 'active' : ''}`}
                        onClick={() => setDate(day)}
                      >
                        <span className="date-pill-day">{formatDateDay(day)}</span>
                        <span className="date-pill-date">{formatDateMonthDay(day)}</span>
                        <span className="date-pill-year">{formatDateYear(day)}</span>
                      </button>
                    ))}
                  </div>
                  <button className="date-btn" onClick={() => setDate(todayISO())}>Today</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '0.5rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderBottom: '2px solid #ddd', paddingBottom: '1rem' }}>
          <button
            className={`btn ${activeTab === 'tasks' ? '' : 'btn-muted'}`}
            style={{
              backgroundColor: activeTab === 'tasks' ? '#2196F3' : '#f5f5f5',
              color: activeTab === 'tasks' ? '#fff' : '#333',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: activeTab === 'tasks' ? 'bold' : 'normal'
            }}
            onClick={() => setActiveTab('tasks')}
          >
            📋 Daily Tasks
          </button>
          <button
            className={`btn ${activeTab === 'games' ? '' : 'btn-muted'}`}
            style={{
              backgroundColor: activeTab === 'games' ? '#4CAF50' : '#f5f5f5',
              color: activeTab === 'games' ? '#fff' : '#333',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: activeTab === 'games' ? 'bold' : 'normal'
            }}
            onClick={() => setActiveTab('games')}
          >
            🎮 Unlock Games
          </button>
          <button
            className={`btn ${activeTab === 'report' ? '' : 'btn-muted'}`}
            style={{
              backgroundColor: activeTab === 'report' ? '#FF9800' : '#f5f5f5',
              color: activeTab === 'report' ? '#fff' : '#333',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: activeTab === 'report' ? 'bold' : 'normal'
            }}
            onClick={() => setActiveTab('report')}
          >
            📊 Report
          </button>
          <button
            className={`btn ${activeTab === 'admin' ? '' : 'btn-muted'}`}
            style={{
              backgroundColor: activeTab === 'admin' ? '#9C27B0' : '#f5f5f5',
              color: activeTab === 'admin' ? '#fff' : '#333',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: activeTab === 'admin' ? 'bold' : 'normal'
            }}
            onClick={() => setActiveTab('admin')}
          >
            ⚙️ Admin
          </button>
          <div className="score-card score-line score-card-tabs" style={{ marginLeft: 'auto' }}>
            <div>
              <div className="muted">Today's score</div>
              <div className="score" style={{ fontSize: '1.25rem' }}>{pointsEarned} pts</div>
            </div>
            <div>
              <div className="muted">Total points earned</div>
              <div className="score" style={{ fontSize: '1.25rem' }}>{totalPoints} pts</div>
            </div>
            <div>
              <div className="muted">Points redeemed</div>
              <div className="score" style={{ fontSize: '1.25rem', color: '#FF9800' }}>{spentPoints} pts</div>
            </div>
            <div>
              <div className="muted">Available balance</div>
              <div className="score" style={{ fontSize: '1.25rem', color: '#22c55e' }}>{totalPoints - spentPoints} pts</div>
            </div>
          </div>
        </div>

        {/* No kid selected yet — prompt to pick one before showing tasks */}
        {activeTab === 'tasks' && !activeChildId && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>👧</div>
            <div className="section-title" style={{ marginBottom: '0.5rem' }}>Select a kid to begin</div>
            <div className="muted">
              {namedChildren.length > 0
                ? 'Choose a kid from the “👧 Kid:” selector at the top to view and track their tasks.'
                : 'No kids yet — go to the ⚙️ Admin tab to add a kid and assign tasks.'}
            </div>
          </div>
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && activeChildId && (
          <>
          <div className="card-header" style={{ marginBottom: '1rem' }}>
            <div>
              <div className="section-title">Daily Task List</div>
              <div className="muted">{completedCount} of {tasks.length} tasks completed</div>
            </div>
            <button className="btn btn-danger btn-reset-today" onClick={resetAllForDate}>Reset Today Tasks</button>
          </div>

          {/* Required Tasks */}
          <div className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>
            ⭐ Required <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.9rem' }}>({doneIn(requiredTasks)} of {requiredTasks.length} done)</span>
          </div>
          <div className="muted" style={{ marginBottom: '0.75rem' }}>Must be done every day.</div>
          <div className="task-grid">
            {requiredTasks.map(t => renderTaskCard(t))}
          </div>

          {/* Missed Yesterday Tasks */}
          <div className="section-title" style={{ fontSize: '1.05rem', margin: '1.5rem 0 0.5rem' }}>
            ⚠ Missed Yesterday <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.9rem' }}>({doneIn(missedTasks)} of {missedTasks.length} done)</span>
          </div>
          <div className="muted" style={{ marginBottom: '0.75rem' }}>Optional tasks skipped yesterday — required today.</div>
          {missedTasks.length === 0 ? (
            <div className="muted">Nothing was missed yesterday — great job keeping up!</div>
          ) : (
            <div className="task-grid">
              {missedTasks.map(t => renderTaskCard(t, { missed: true }))}
            </div>
          )}
          </>
        )}

        {/* Games Tab: link out to play on the website (embedding not supported) */}
        {activeTab === 'games' && (
          <div>
            <div className="section-title" style={{ marginBottom: '1rem' }}>🎮 Games</div>
            <div className="muted" style={{ marginBottom: '0.5rem' }}>Unlock a game with 50 points, then open it on the website to play.</div>
            {parentGames.length === 0 ? (
              <div className="muted">No games yet — add some in the ⚙️ Admin tab.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                {parentGames.map(game => {
                  const unlockedAt = unlockedGames[game.id]
                  const everPlayed = !!unlockedAt
                  const remaining = unlockedAt ? GAME_DURATION_MS - (now - unlockedAt) : 0
                  const active = remaining > 0
                  const mm = Math.floor(remaining / 60000)
                  const ss = Math.floor((remaining % 60000) / 1000)
                  return (
                    <div key={game.id} className="card" style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <div style={{ fontWeight: 'bold' }}>{game.emoji} {game.name}</div>
                        {everPlayed && (
                          <span title="Already played" style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#16a34a', background: '#dcfce7', borderRadius: '999px', padding: '0.15rem 0.5rem', whiteSpace: 'nowrap' }}>
                            ✅ Played
                          </span>
                        )}
                      </div>
                      {active ? (
                        <div>
                          <div style={{ marginBottom: '0.5rem', fontWeight: 'bold', color: '#16a34a' }}>
                            ⏱ {mm}:{String(ss).padStart(2, '0')} left
                          </div>
                          <a
                            href={game.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-success"
                            style={{ display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
                          >
                            ▶ Play on website
                          </a>
                        </div>
                      ) : (
                        <div>
                          <div className="muted" style={{ marginBottom: '0.5rem' }}>
                            {everPlayed
                              ? `Time's up — unlock again for ${GAME_MINUTES} more minutes (50 pts).`
                              : `Locked — redeem 50 points for ${GAME_MINUTES} minutes of play.`}
                          </div>
                          <button
                            className="btn btn-success"
                            style={{ width: '100%', cursor: availablePoints < 50 ? 'not-allowed' : 'pointer' }}
                            onClick={() => redeemPointsForGame(game)}
                            disabled={availablePoints < 50}
                            title={availablePoints < 50 ? 'Need 50 available points to unlock' : 'Unlock for 50 pts'}
                          >
                            {everPlayed ? 'Play again — 50 pts' : 'Unlock for 50 pts'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Report Tab */}
        {activeTab === 'report' && (
          <div>
            <div className="section-title" style={{ marginBottom: '0.25rem' }}>📊 Points Earned Per Day</div>
            <div className="muted" style={{ marginBottom: '1.25rem' }}>Total points earned across all tasks, by day.</div>
            {dailyPoints.length === 0 ? (
              <div className="muted">No completed tasks yet — finish some tasks to see your progress here.</div>
            ) : (
              <div className="bar-chart">
                {dailyPoints.map(d => (
                  <div key={d.date} className="bar-col" title={`${d.points} pts on ${d.date}`}>
                    <div className="bar-value">{d.points}</div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ height: `${maxDailyPoints ? (d.points / maxDailyPoints) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="bar-label">{formatDateMonthDay(d.date)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Admin Tab — locked behind the parent PIN */}
        {activeTab === 'admin' && !adminUnlocked && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', maxWidth: '320px', margin: '0 auto' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔒</div>
            <div className="section-title" style={{ marginBottom: '0.5rem' }}>Admin is locked</div>
            <div className="muted" style={{ marginBottom: '1.25rem' }}>
              Enter {activeParent ? activeParent.name + "'s" : 'the'} parent PIN to manage kids and tasks.
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={adminPinInput}
              onChange={e => { setAdminPinInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setAdminPinError('') }}
              onKeyDown={e => e.key === 'Enter' && submitAdminPin()}
              style={{ width: '170px', padding: '0.7rem', borderRadius: '12px', border: '2px solid #e5e7eb', fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.6rem', outline: 'none' }}
            />
            {adminPinError && <div style={{ color: '#dc2626', fontSize: '0.9rem', marginTop: '0.6rem' }}>{adminPinError}</div>}
            <div>
              <button onClick={submitAdminPin} style={{ marginTop: '1rem', background: 'linear-gradient(135deg, #9C27B0, #6366f1)', color: '#fff', border: 'none', padding: '0.7rem 2rem', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
                Unlock
              </button>
            </div>
          </div>
        )}

        {/* Admin Tab: manage kids (+ task assignment) and the task library */}
        {activeTab === 'admin' && adminUnlocked && (
          <div>
            {/* ---- Parent settings ---- */}
            <div className="section-title" style={{ marginBottom: '0.75rem' }}>👤 Parent</div>
            {activeParent && (
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '2 1 200px' }}>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>Name</span>
                  <input type="text" value={activeParent.name || ''} onChange={e => updateActiveParent({ name: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 140px' }}>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>PIN (4 digits)</span>
                  <input type="text" inputMode="numeric" maxLength={4} value={activeParent.pin || ''} placeholder="optional" onChange={e => updateActiveParent({ pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                </label>
                <button className="btn btn-danger" onClick={removeActiveParent} style={{ padding: '0.5rem 0.9rem', borderRadius: '6px', cursor: 'pointer' }}>
                  Remove Parent
                </button>
              </div>
            )}

            {/* ---- Manage Kids ---- */}
            <div className="card-header" style={{ marginBottom: '0.75rem' }}>
              <div className="section-title">👧 Manage Kids</div>
              <button className="btn" onClick={addKidInAdmin} style={{ backgroundColor: '#9C27B0', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                + Add Kid
              </button>
            </div>
            <div className="muted" style={{ marginBottom: '1rem' }}>
              Edit each kid's name, age and PIN, and tick which tasks they get. Changes save automatically.
            </div>
            {parentChildren.length === 0 ? (
              <div className="muted" style={{ marginBottom: '2rem' }}>No kids yet — click “+ Add Kid”.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                {parentChildren.map(kid => (
                  <div key={kid.id} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '2 1 160px' }}>
                        <span className="muted" style={{ fontSize: '0.8rem' }}>Name</span>
                        <input type="text" value={kid.name || ''} placeholder="Kid's name" onChange={e => updateChild(kid.id, { name: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 80px' }}>
                        <span className="muted" style={{ fontSize: '0.8rem' }}>Age</span>
                        <input type="number" min="1" max="25" value={kid.age ?? ''} placeholder="Age" onChange={e => updateChild(kid.id, { age: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 100px' }}>
                        <span className="muted" style={{ fontSize: '0.8rem' }}>PIN (4 digits)</span>
                        <input type="text" inputMode="numeric" maxLength={4} value={kid.pin || ''} placeholder="optional" onChange={e => updateChild(kid.id, { pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                      </label>
                      <button className="btn btn-danger" onClick={() => removeKid(kid.id)} style={{ padding: '0.5rem 0.9rem', borderRadius: '6px', cursor: 'pointer' }}>
                        Remove
                      </button>
                    </div>
                    <div style={{ marginTop: '0.85rem' }}>
                      <div className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.4rem' }}>
                        Assigned tasks ({(kid.taskIds || []).length} of {parentTaskLibrary.length})
                      </div>
                      {parentTaskLibrary.length === 0 ? (
                        <div className="muted" style={{ fontSize: '0.85rem' }}>No tasks in the library yet — add some below.</div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem' }}>
                          {parentTaskLibrary.map(t => (
                            <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', flex: '1 1 220px' }}>
                              <input type="checkbox" checked={(kid.taskIds || []).includes(t.id)} onChange={() => toggleKidTask(kid.id, t.id)} />
                              {formatTaskTitle(t.title)}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ---- Manage Task Library ---- */}
            <div className="card-header" style={{ marginBottom: '0.75rem' }}>
              <div className="section-title">📋 Task Library</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-muted" onClick={loadStarterTasks} style={{ padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}>
                  Load starter tasks
                </button>
                <button className="btn" onClick={addTaskDef} style={{ backgroundColor: '#2196F3', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                  + Add Task
                </button>
              </div>
            </div>
            <div className="muted" style={{ marginBottom: '1rem' }}>
              These tasks belong to {activeParent ? activeParent.name : 'this parent'}. Assign them to kids above.
            </div>
            {parentTaskLibrary.length === 0 ? (
              <div className="muted">No tasks yet — click “+ Add Task”.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {parentTaskLibrary.map(t => (
                  <div key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.85rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '2 1 180px' }}>
                      <span className="muted" style={{ fontSize: '0.8rem' }}>Title</span>
                      <input type="text" value={t.title || ''} onChange={e => updateTaskDef(t.id, { title: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 70px' }}>
                      <span className="muted" style={{ fontSize: '0.8rem' }}>Points</span>
                      <input type="number" min="0" value={t.points ?? 0} onChange={e => updateTaskDef(t.id, { points: Number(e.target.value) || 0 })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '3 1 220px' }}>
                      <span className="muted" style={{ fontSize: '0.8rem' }}>Description</span>
                      <input type="text" value={t.description || ''} onChange={e => updateTaskDef(t.id, { description: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
                      <input type="checkbox" checked={!!t.parentPresence} onChange={e => updateTaskDef(t.id, { parentPresence: e.target.checked })} />
                      Parent present
                    </label>
                    <button className="btn btn-danger" onClick={() => removeTaskDef(t.id)} style={{ padding: '0.5rem 0.9rem', borderRadius: '6px', cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ---- Manage Game Links ---- */}
            <div className="card-header" style={{ margin: '2rem 0 0.75rem' }}>
              <div className="section-title">🎮 Game Links</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-muted" onClick={loadStarterGames} style={{ padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}>
                  Load starter games
                </button>
                <button className="btn" onClick={addGameDef} style={{ backgroundColor: '#4CAF50', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                  + Add Game
                </button>
              </div>
            </div>
            <div className="muted" style={{ marginBottom: '1rem' }}>
              Games kids can unlock with 50 points. Each opens its link in a new tab.
            </div>
            {parentGames.length === 0 ? (
              <div className="muted">No games yet — click “+ Add Game”.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {parentGames.map(g => (
                  <div key={g.id} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.85rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '0 1 70px' }}>
                      <span className="muted" style={{ fontSize: '0.8rem' }}>Emoji</span>
                      <input type="text" value={g.emoji || ''} maxLength={4} onChange={e => updateGameDef(g.id, { emoji: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc', textAlign: 'center' }} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '2 1 160px' }}>
                      <span className="muted" style={{ fontSize: '0.8rem' }}>Name</span>
                      <input type="text" value={g.name || ''} onChange={e => updateGameDef(g.id, { name: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '4 1 280px' }}>
                      <span className="muted" style={{ fontSize: '0.8rem' }}>Link (URL)</span>
                      <input type="url" value={g.url || ''} placeholder="https://…" onChange={e => updateGameDef(g.id, { url: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }} />
                    </label>
                    <button className="btn btn-danger" onClick={() => removeGameDef(g.id)} style={{ padding: '0.5rem 0.9rem', borderRadius: '6px', cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
