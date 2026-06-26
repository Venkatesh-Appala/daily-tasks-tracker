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

// Editable task list fetched at runtime. Edit/commit tasks.json on GitHub and the
// live app picks up the change on next load — no rebuild or redeploy needed.
// (raw.githubusercontent.com is CDN-cached, so edits can take a few minutes to appear.)
const TASKS_URL =
  'https://raw.githubusercontent.com/Venkatesh-Appala/bujjamma-daily-tasks-tracker/main/tasks.json'

function App() {
  const [tasks, setTasks] = useState([])
  const [date, setDate] = useState(todayISO())
  const [activeTab, setActiveTab] = useState('tasks')
  const [unlockedGames, setUnlockedGames] = useState({})
  const [spentPoints, setSpentPoints] = useState(0)

  // Child profiles (name/age). One child today; the shape supports several later.
  const [children, setChildren] = useState([])
  const [activeChildId, setActiveChildId] = useState(null)
  // Kid Details form is edited locally and only persisted on Save.
  const [childForm, setChildForm] = useState({ name: '', age: '' })
  const [detailsSaved, setDetailsSaved] = useState(false)
  // True while adding a brand-new kid (the kid isn't created until Save).
  const [addingChild, setAddingChild] = useState(false)

  // Cloud-sync bookkeeping. cloudRecordRef holds the last full document so writes
  // preserve fields/other children we don't actively edit. canSyncRef gates writes
  // so we never overwrite the cloud with local-only data we failed to read.
  const cloudRecordRef = useRef({ children: [], progress: {} })
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

  const getDefaultTasks = () => [
    { id: 1, title: 'Water The Plants', points: 5, description: 'Give the plants a good drink.', completedDates: [] },
    { id: 2, title: 'Drink 3 Bottles Of Water', points: 5, description: 'Stay hydrated all day.', required: true, completedDates: [] },
    { id: 23, title: 'Brush Twice Daily', points: 5, description: 'Brush teeth Admorning and night.', required: true, completedDates: [] },
    { id: 3, title: 'Do Yoga', points: 5, description: 'Stretch, breathe and relax with yoga.', required: true, completedDates: [] },
    { id: 28, title: 'Read 5 Pages in a English book', points: 5, description: 'Read 3-5 pages from a book.', required: true, parentPresence: true, completedDates: [] },
    { id: 4, title: 'Do Piano', points: 5, description: 'Practice piano pieces and scales.', completedDates: [] },
    { id: 5, title: 'Practice 1 Music Song', points: 5, description: 'Practice 1 song to improve voice.', parentPresence: true, completedDates: [] },
    { id: 6, title: 'Chant 1 Bhagavad Gita Sloka', points: 5, description: 'Chant 1 Bhagavad-gita sloka.', parentPresence: true, completedDates: [] },
    { id: 7, title: 'Chant 2 Prajna Prayers', points: 5, description: 'Chant 2 Prajna prayers.', parentPresence: true, completedDates: [] },
    { id: 8, title: 'Do 3x3 Cube', points: 3, description: 'Practice 3x3 cube speed solving.', required: true, completedDates: [] },
    { id: 9, title: 'Do 4x4 Cube', points: 5, description: 'Practice 4x4 cube solving.', completedDates: [] },
    { id: 10, title: 'Do Maths Worksheet', points: 5, description: 'Finish one maths worksheet.', completedDates: [] },
    { id: 11, title: 'Do Xtra Math', points: 5, description: 'Solve Xtra maths questions.', completedDates: [] },
    { id: 12, title: 'Do IXL Math', points: 5, description: 'Practice IXL Math problems.', completedDates: [] },
    { id: 13, title: 'Do IXL Language Arts', points: 5, description: 'Practice IXL Language Arts.', completedDates: [] },
    { id: 14, title: 'Do IXL Science', points: 5, description: 'Practice IXL Science.', parentPresence: true, completedDates: [] },
    { id: 15, title: 'Do IXL Social Studies', points: 5, description: 'Practice IXL Social Studies.', parentPresence: true, completedDates: [] },
    { id: 16, title: 'Write An English Story', points: 5, description: 'Write a creative short story in English.', parentPresence: true, completedDates: [] },
    { id: 17, title: 'Write A Telugu Story', points: 5, description: 'Write a creative short story in Telugu.', parentPresence: true, completedDates: [] },
    { id: 18, title: 'Do Drawing', points: 5, description: 'Draw something creative.', completedDates: [] },
    { id: 19, title: 'Play Chess', points: 5, description: 'Study chess moves and practice.', completedDates: [] },
    { id: 20, title: 'Play Basketball', points: 5, description: 'Play a fun sport session.', completedDates: [] },
    { id: 21, title: 'Play Badminton', points: 5, description: 'Play a fun sport session.', parentPresence: true, completedDates: [] },
    { id: 24, title: 'Practice Dance', points: 5, description: 'Practice dance routine or exercises.', parentPresence: true, completedDates: [] },
    { id: 25, title: 'Go For A Walk', points: 5, description: 'Go for a walk outside for fresh air.', parentPresence: true, completedDates: [] },
    { id: 26, title: 'Ride Bicycle', points: 5, description: 'Ride bicycle for exercise.', parentPresence: true, completedDates: [] },
    { id: 27, title: 'Do Meditation', points: 5, description: 'Practice meditation for 10 minutes.', completedDates: [] },
    { id: 22, title: 'Help In The Kitchen', points: 5, description: 'Assist with cooking or cleaning.', parentPresence: true, completedDates: [] },
    { id: 31, title: 'Do 3 MashUp Puzzles', points: 5, description: 'Do 3 MashUp Puzzles.', parentPresence: true, completedDates: [] },
    { id: 29, title: 'Do Japa Chanting', points: 5, description: 'Do japa chanting for spiritual growth.', completedDates: [] },
    { id: 30, title: 'Feed Food To Fish', points: 2, description: 'Feed food to the fish.', required: true, completedDates: [] }
  ]

  // Generate stable incremental IDs stored in localStorage
  const nextId = () => {
    const key = 'nextTaskId'
    let id = Number(localStorage.getItem(key))
    if (!id || id <= 0) {
      const defaults = getDefaultTasks()
      const stored = localStorage.getItem('tasks')
      let maxId = defaults.reduce((m, t) => Math.max(m, t.id), 0)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            maxId = Math.max(maxId, ...parsed.map(p => p.id))
          }
        } catch (e) {}
      }
      id = maxId + 1
      localStorage.setItem(key, String(id + 1))
      return id
    }
    localStorage.setItem(key, String(id + 1))
    return id
  }

  // Add a new task at runtime (preserves existing tasks)
  const addTask = newTask => {
    const id = newTask.id ?? nextId()
    const taskWithId = { id, completedDates: [], ...newTask }
    setTasks(ts => {
      const updated = [...ts, taskWithId]
      localStorage.setItem('tasks', JSON.stringify(updated))
      return updated
    })
  }

  // Read this device's existing completion history out of localStorage as a
  // { [taskId]: dates[] } map (used for offline use and first-run cloud migration).
  const readLocalCompletion = () => {
    const map = {}
    const stored = localStorage.getItem('tasks')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          parsed.forEach(p => {
            if (Array.isArray(p.completedDates) && p.completedDates.length) map[p.id] = p.completedDates
          })
        }
      } catch (error) {
        console.warn('Invalid saved tasks in storage', error)
      }
    }
    return map
  }

  const unionDates = (a = [], b = []) => Array.from(new Set([...a, ...b])).sort()

  // Collect the active child's completion history from the live `tasks` array.
  const completionFromTasks = ts => {
    const map = {}
    ts.forEach(t => {
      if (Array.isArray(t.completedDates) && t.completedDates.length) map[t.id] = t.completedDates
    })
    return map
  }

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
      // 1. Task definitions: remote tasks.json with the bundled list as fallback.
      let defaults = getDefaultTasks()
      try {
        const res = await fetch(TASKS_URL, { cache: 'no-store' })
        if (res.ok) {
          const remote = await res.json()
          if (Array.isArray(remote) && remote.length > 0) defaults = remote
        }
      } catch (error) {
        console.warn('Could not load remote tasks.json, using bundled fallback', error)
      }
      if (cancelled) return

      // 2. This device's existing progress (for migration + offline).
      const localMap = readLocalCompletion()
      const localSpent = Number(localStorage.getItem('spentPoints')) || 0

      // 3. Cloud progress + child profiles.
      let kids = []
      let activeId = null
      let cloudMap = {}
      let cloudSpent = null
      if (SYNC_ENABLED) {
        try {
          const record = await fetchCloud()
          canSyncRef.current = true // read succeeded — safe to write back
          if (record && typeof record === 'object') {
            cloudRecordRef.current = record
            kids = Array.isArray(record.children) ? record.children : []
            activeId = record.activeChildId || (kids[0] && kids[0].id) || null
            const prog = activeId && record.progress ? record.progress[activeId] : null
            if (prog) {
              cloudMap = prog.completedDates || {}
              cloudSpent = Number(prog.spentPoints) || 0
            }
          }
        } catch (error) {
          // Couldn't read the cloud — stay read-only this session so we don't
          // overwrite good cloud data with local-only state.
          console.warn('Could not load cloud data, using local only', error)
        }
      }
      if (cancelled) return

      // 4. First run (no child yet): seed one from this device's data. Name/age
      //    are left blank for the parent to fill in the Kids tab.
      if (!activeId) {
        activeId = 'child-1'
        kids = [{ id: activeId, name: '', age: '' }]
      }

      // 5. Merge completion (union → never lose history) onto the definitions.
      const ids = new Set([...Object.keys(localMap), ...Object.keys(cloudMap)])
      const mergedMap = {}
      ids.forEach(id => {
        mergedMap[id] = unionDates(localMap[id], cloudMap[id])
      })
      const mergedTasks = defaults.map(d => ({ ...d, completedDates: mergedMap[d.id] || [] }))
      const mergedSpent = cloudSpent != null ? Math.max(cloudSpent, localSpent) : localSpent

      setChildren(kids)
      setActiveChildId(activeId)
      setTasks(mergedTasks)
      setSpentPoints(mergedSpent)

      // If the active kid has no name yet (e.g. this device already tracked
      // progress before profiles existed), guide the user straight to naming
      // that existing profile rather than letting them create a new empty kid.
      const activeKidObj = kids.find(k => k.id === activeId)
      if (!activeKidObj || !(activeKidObj.name && activeKidObj.name.trim())) {
        setActiveTab('kids')
      }

      if (!localStorage.getItem('nextTaskId')) {
        const maxId = defaults.reduce((m, t) => Math.max(m, t.id), 0)
        localStorage.setItem('nextTaskId', String(maxId + 1))
      }

      // The debounced save effect below picks up these state changes and pushes
      // the merged state to the cloud — that is what migrates an already-tracking
      // device's localStorage history up to JSONBin on first run.
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
    if (!SYNC_ENABLED || !canSyncRef.current || !activeChildId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const prev = cloudRecordRef.current || {}
      const record = {
        ...prev,
        children,
        activeChildId,
        progress: {
          ...(prev.progress || {}),
          [activeChildId]: {
            completedDates: completionFromTasks(tasks),
            spentPoints,
            stats: computeStats(tasks, spentPoints)
          }
        }
      }
      cloudRecordRef.current = record
      pushCloud(record).catch(error => console.warn('Cloud sync failed', error))
    }, 1500)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [tasks, spentPoints, children, activeChildId])

  // Load spent points from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('spentPoints')
    if (stored) {
      setSpentPoints(Number(stored))
    }
    // start locked by default; unlock via redeemPointsForGame
    setUnlockedGames({})
  }, [])

  useEffect(() => {
    if (tasks.length > 0) {
      localStorage.setItem('tasks', JSON.stringify(tasks))
    }
  }, [tasks])

  // Save spent points to localStorage
  useEffect(() => {
    localStorage.setItem('spentPoints', String(spentPoints))
  }, [spentPoints])

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
  const redeemPointsForGame = gameName => {
    const availablePoints = totalPoints - spentPoints
    if (availablePoints >= 50) {
      // Deduct points by marking for "redemption"
      setUnlockedGames(prev => ({ ...prev, [gameName]: true }))
      setSpentPoints(prev => prev + 50)
      alert(`Unlocked ${gameName}! 50 points redeemed.`)
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

  const activeChild = children.find(c => c.id === activeChildId) || null
  const childName = (activeChild && activeChild.name && activeChild.name.trim()) || ''
  // Only kids with a name appear in the selector (no "Unnamed kid" entries).
  const namedChildren = children.filter(c => c.name && c.name.trim())

  // Switch the active kid: repoint the tasks view to that kid's saved progress
  // (task definitions stay the same; only completion + spent points change).
  const selectChild = childId => {
    const prog = (cloudRecordRef.current.progress || {})[childId] || {}
    const cmap = prog.completedDates || {}
    setActiveChildId(childId)
    setTasks(ts => ts.map(t => ({ ...t, completedDates: cmap[t.id] || [] })))
    setSpentPoints(Number(prog.spentPoints) || 0)
  }

  // Start adding a new kid: open a blank Kid Details form. The kid is NOT
  // created here — only when Save is clicked (see saveChildDetails).
  const addChild = () => {
    setAddingChild(true)
    setChildForm({ name: '', age: '' })
    setDetailsSaved(false)
    setActiveTab('kids')
  }

  // Cancel adding a new kid and restore the form to the active kid.
  const cancelAddChild = () => {
    setAddingChild(false)
    setChildForm({ name: activeChild?.name || '', age: activeChild?.age ?? '' })
  }

  // Save the Kid Details form: create the new kid (add mode) or update the
  // active kid (edit mode). Both persist via the debounced cloud-save effect.
  const saveChildDetails = () => {
    const name = childForm.name.trim()
    if (addingChild) {
      if (!name) {
        alert("Please enter the kid's name.")
        return
      }
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `child-${Date.now()}`
      setChildren(cs => [...cs, { id, name, age: childForm.age }])
      setActiveChildId(id)
      setTasks(ts => ts.map(t => ({ ...t, completedDates: [] })))
      setSpentPoints(0)
      setAddingChild(false)
    } else {
      setChildren(cs =>
        cs.map(c => (c.id === activeChildId ? { ...c, name, age: childForm.age } : c))
      )
    }
    setDetailsSaved(true)
  }

  // Populate the details form whenever the active kid changes.
  useEffect(() => {
    if (activeChild) {
      setChildForm({ name: activeChild.name || '', age: activeChild.age ?? '' })
      setDetailsSaved(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChildId])

  // Keep the browser tab title in sync with the selected kid.
  useEffect(() => {
    document.title = childName ? `${childName}'s Daily Tasks Tracker` : 'Daily Tasks Tracker'
  }, [childName])

  const conversionRate = 100 // 100 points = $1
  const pointsEarned = tasks.reduce((sum, t) => (isDone(t, date) ? sum + (t.points || 0) : sum), 0)
  const totalPoints = tasks.reduce((sum, t) => sum + (Array.isArray(t.completedDates) ? t.completedDates.length * (t.points || 0) : 0), 0)
  const availablePoints = totalPoints - spentPoints
  const completedCount = tasks.filter(t => isDone(t, date)).length
  const todaysCash = (pointsEarned / conversionRate).toFixed(2)

  // Three task groups:
  // - Required: tasks flagged `required`, mandatory every day.
  // - Missed Yesterday: optional tasks NOT completed on the previous day (now mandatory).
  // - Optional: remaining optional tasks (either done yesterday or required ones already excluded).
  const prevDate = addDays(date, -1)
  const isCarriedOver = t => !t.required && !isDone(t, prevDate)
  const sortByParent = arr => [...arr].sort((a, b) => (a.parentPresence ? 1 : 0) - (b.parentPresence ? 1 : 0))
  const requiredTasks = sortByParent(tasks.filter(t => t.required))
  const missedTasks = sortByParent(tasks.filter(isCarriedOver))
  const optionalTasks = sortByParent(tasks.filter(t => !t.required && !isCarriedOver(t)))
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

  return (
    <div className="container">
      <div className="sticky-panel">
        <div className="hero">
          <div className="hero-top">
            <div className="hero-title">
              <h1>{childName ? `${childName}'s Daily Tasks Tracker` : 'Daily Tasks Tracker'}</h1>
              <p className="muted">Choose a date, complete your tasks, and earn points for every good action.</p>
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="muted">👧 Kid:</span>
                {namedChildren.length > 0 ? (
                  <select
                    value={namedChildren.some(c => c.id === activeChildId) ? activeChildId : ''}
                    onChange={e => selectChild(e.target.value)}
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
                  <span className="muted">none yet — add one in Kid Details</span>
                )}
                <button
                  className="btn btn-muted"
                  onClick={addChild}
                  style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.9rem' }}
                >
                  + Add Kid
                </button>
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
            className={`btn ${activeTab === 'kids' ? '' : 'btn-muted'}`}
            style={{
              backgroundColor: activeTab === 'kids' ? '#9C27B0' : '#f5f5f5',
              color: activeTab === 'kids' ? '#fff' : '#333',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: activeTab === 'kids' ? 'bold' : 'normal'
            }}
            onClick={() => setActiveTab('kids')}
          >
            👧 Kid Details
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

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
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

          {/* Optional Tasks */}
          <div className="section-title" style={{ fontSize: '1.05rem', margin: '1.5rem 0 0.5rem' }}>
            ✨ Optional <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.9rem' }}>({doneIn(optionalTasks)} of {optionalTasks.length} done)</span>
          </div>
          <div className="muted" style={{ marginBottom: '0.75rem' }}>Nice to do. Skip one and it becomes required the next day.</div>
          {optionalTasks.length === 0 ? (
            <div className="muted">No optional tasks remaining today.</div>
          ) : (
            <div className="task-grid">
              {optionalTasks.map(t => renderTaskCard(t))}
            </div>
          )}
          </>
        )}

        {/* Games Tab: link out to play on the website (embedding not supported) */}
        {activeTab === 'games' && (
          <div>
            <div className="section-title" style={{ marginBottom: '1rem' }}>🎮 Games</div>
            <div className="muted" style={{ marginBottom: '0.5rem' }}>Unlock a game with 50 points, then open it on the website to play.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              {[
                { name: 'Make a House', emoji: '🏠', url: 'https://www.abcya.com/games/make-a-house' },
                { name: 'Punctuation & Capitalization', emoji: '✏️', url: 'https://www.abcya.com/games/fun-factory-punctuation-capitalization' },
                { name: 'Lineum', emoji: '📐', url: 'https://www.abcya.com/games/lineum' },
                { name: 'Addition', emoji: '➕', url: 'https://www.abcya.com/games/addition' },
                { name: 'Estimating', emoji: '🔢', url: 'https://www.abcya.com/games/estimating' },
                { name: 'Build a Boat', emoji: '⛵', url: 'https://pbskids.org/games/play/build-a-boat/1283064' },
                { name: 'Stargazing', emoji: '🔭', url: 'https://pbskids.org/games/play/stargazing/1670899' },
                { name: 'My Bedtime', emoji: '🌙', url: 'https://pbskids.org/games/play/my-bedtime/8513' },
                { name: 'At the Dentist', emoji: '🦷', url: 'https://pbskids.org/games/play/at-the-dentist/836628' },
                { name: 'Backyard Bug Hunt', emoji: '🐞', url: 'https://pbskids.org/games/play/backyard-bug-hunt/1216876' },
                { name: 'Ramp Racers', emoji: '🏎️', url: 'https://pbskids.org/games/play/ramp-racers/140182' },
              ].map(game => (
                <div key={game.name} className="card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ fontWeight: 'bold' }}>{game.emoji} {game.name}</div>
                  </div>
                  {unlockedGames[game.name] ? (
                    <div>
                      <div className="muted" style={{ marginBottom: '0.5rem' }}>Unlocked — opens in a new tab.</div>
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
                      <div className="muted" style={{ marginBottom: '0.5rem' }}>Locked — redeem 50 points to unlock this game.</div>
                      <button
                        className="btn btn-success"
                        style={{ width: '100%', cursor: availablePoints < 50 ? 'not-allowed' : 'pointer' }}
                        onClick={() => redeemPointsForGame(game.name)}
                        disabled={availablePoints < 50}
                        title={availablePoints < 50 ? 'Need 50 available points to unlock' : 'Unlock for 50 pts'}
                      >
                        Unlock for 50 pts
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
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

        {/* Kid Details Tab */}
        {activeTab === 'kids' && (
          <div>
            <div className="section-title" style={{ marginBottom: '0.25rem' }}>
              {addingChild ? '➕ Add a New Kid' : '👧 Kid Details'}
            </div>
            <div className="muted" style={{ marginBottom: '1.25rem' }}>
              {addingChild
                ? "Enter the new kid's name and age, then click Save to add them."
                : "Update the child's name and age. These sync across devices along with their progress."}
            </div>
            {addingChild || activeChild ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '420px' }}>
                {!addingChild && activeChild && !(activeChild.name && activeChild.name.trim()) && (
                  <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.9rem' }}>
                    👋 This is your profile with your saved progress. Add your name below and click <strong>Save</strong> to sync it across devices. (Don't use “+ Add Kid” — that starts a new, empty profile.)
                  </div>
                )}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span className="muted">Name</span>
                  <input
                    type="text"
                    value={childForm.name}
                    placeholder="Enter child's name"
                    onChange={e => {
                      setChildForm(f => ({ ...f, name: e.target.value }))
                      setDetailsSaved(false)
                    }}
                    style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span className="muted">Age</span>
                  <input
                    type="number"
                    min="1"
                    max="25"
                    value={childForm.age}
                    placeholder="Enter age"
                    onChange={e => {
                      setChildForm(f => ({ ...f, age: e.target.value }))
                      setDetailsSaved(false)
                    }}
                    style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }}
                  />
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button
                    className="btn"
                    onClick={saveChildDetails}
                    style={{ backgroundColor: '#9C27B0', color: '#fff', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Save
                  </button>
                  {addingChild && (
                    <button
                      className="btn btn-muted"
                      onClick={cancelAddChild}
                      style={{ padding: '0.6rem 1.25rem', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  )}
                  {detailsSaved && !addingChild && <span style={{ color: '#22c55e', fontWeight: 'bold' }}>✓ Saved</span>}
                </div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {SYNC_ENABLED
                    ? 'Saved to the cloud and synced across devices.'
                    : '⚠ Cloud sync is off — details are saved on this device only.'}
                </div>
              </div>
            ) : (
              <div className="muted">Loading…</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
