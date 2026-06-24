import React, { useState, useEffect } from 'react'

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

function App() {
  const [tasks, setTasks] = useState([])
  const [date, setDate] = useState(todayISO())
  const [activeTab, setActiveTab] = useState('games')
  const [unlockedGames, setUnlockedGames] = useState({})
  const [spentPoints, setSpentPoints] = useState(0)
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
  // Embed URL for external games
  const [embedUrl, setEmbedUrl] = useState('')

  const getDefaultTasks = () => [
    { id: 1, title: 'Water The Plants', points: 5, description: 'Give the plants a good drink.', completedDates: [] },
    { id: 2, title: 'Drink 3 Bottles Of Water', points: 5, description: 'Stay hydrated all day.', completedDates: [] },
    { id: 23, title: 'Brush Twice Daily', points: 5, description: 'Brush teeth twice daily, morning and night.', completedDates: [] },
    { id: 3, title: 'Do Yoga', points: 10, description: 'Stretch, breathe and relax with yoga.', completedDates: [] },
    { id: 28, title: 'Read 5 Pages in a book', points: 10, description: 'Read 3-5 pages from a book.', completedDates: [] },
    { id: 4, title: 'Do Piano', points: 5, description: 'Practice piano pieces and scales.', completedDates: [] },
    { id: 5, title: 'Practice 1 Music Song', points: 5, description: 'Practice one music song to improve voice and rhythm.', completedDates: [] },
    { id: 6, title: 'Chant 1 Bhagavad Gita Sloka', points: 5, description: 'Chant 1 Bhagavad-gita sloka for daily practice.', completedDates: [] },
    { id: 7, title: 'Chant 2 Prajna Prayers', points: 15, description: 'Chant 2 Prajna prayers for daily practice.', completedDates: [] },
    { id: 8, title: 'Do 3x3 Cube', points: 12, description: 'Practice 3x3 cube speed solving.', completedDates: [] },
    { id: 9, title: 'Do 4x4 Cube', points: 13, description: 'Practice 4x4 cube solving.', completedDates: [] },
    { id: 10, title: 'Do Maths Worksheet', points: 15, description: 'Finish one maths worksheet.', completedDates: [] },
    { id: 11, title: 'Do Xtra Math', points: 10, description: 'Solve Xtra maths questions.', completedDates: [] },
    { id: 12, title: 'Do IXL Math', points: 5, description: 'Practice IXL Math problems.', completedDates: [] },
    { id: 13, title: 'Do IXL Language Arts', points: 5, description: 'Practice IXL Language Arts.', completedDates: [] },
    { id: 14, title: 'Do IXL Science', points: 5, description: 'Practice IXL Science.', completedDates: [] },
    { id: 15, title: 'Do IXL Social Studies', points: 5, description: 'Practice IXL Social Studies.', completedDates: [] },
    { id: 16, title: 'Write An English Story', points: 15, description: 'Write a creative short story in English.', completedDates: [] },
    { id: 17, title: 'Write A Telugu Story', points: 15, description: 'Write a creative short story in Telugu.', completedDates: [] },
    { id: 18, title: 'Do Drawing', points: 10, description: 'Draw something creative.', completedDates: [] },
    { id: 19, title: 'Play Chess', points: 15, description: 'Study chess moves and practice.', completedDates: [] },
    { id: 20, title: 'Play Basketball', points: 15, description: 'Play a fun sport session.', completedDates: [] },
    { id: 21, title: 'Play Badminton', points: 15, description: 'Play a fun sport session.', completedDates: [] },
    { id: 24, title: 'Practice Dance', points: 10, description: 'Practice dance routine or exercises.', completedDates: [] },
    { id: 25, title: 'Go For A Walk', points: 15, description: 'Go for a walk outside for exercise and fresh air.', completedDates: [] },
    { id: 26, title: 'Ride Bicycle', points: 15, description: 'Ride bicycle for exercise.', completedDates: [] },
    { id: 27, title: 'Do Meditation', points: 10, description: 'Practice meditation for 10 minutes.', completedDates: [] },
    { id: 22, title: 'Help In The Kitchen', points: 15, description: 'Assist with cooking or cleaning.', completedDates: [] },
    { id: 28, title: 'Do 3 MashUp Puzzles', points: 15, description: 'Do 3 MashUp Puzzles.', completedDates: [] }
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

  useEffect(() => {
    const stored = localStorage.getItem('tasks')
    const defaults = getDefaultTasks()
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          // merge defaults that are missing by id without overwriting user data
          const merged = [
            ...parsed,
            ...defaults.filter(d => !parsed.some(p => p.id === d.id))
          ]
          setTasks(merged)
          // ensure nextTaskId is initialized
          if (!localStorage.getItem('nextTaskId')) {
            const maxId = merged.reduce((m, t) => Math.max(m, t.id), 0)
            localStorage.setItem('nextTaskId', String(maxId + 1))
          }
          return
        }
      } catch (error) {
        console.warn('Invalid saved tasks, resetting sample tasks', error)
      }
    }
    setTasks(defaults)
    const maxId = defaults.reduce((m, t) => Math.max(m, t.id), 0)
    localStorage.setItem('nextTaskId', String(maxId + 1))
  }, [])

  // Load spent points from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('spentPoints')
    if (stored) {
      setSpentPoints(Number(stored))
    }
    // PRE-UNLOCK selected games for testing (TicTacToe + Snake + Bigger)
    setUnlockedGames({
      ttt: true,
      snake: true,
      bigger: true
    })
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

  const conversionRate = 100 // 100 points = $1
  const pointsEarned = tasks.reduce((sum, t) => (isDone(t, date) ? sum + (t.points || 0) : sum), 0)
  const totalPoints = tasks.reduce((sum, t) => sum + (Array.isArray(t.completedDates) ? t.completedDates.length * (t.points || 0) : 0), 0)
  const completedCount = tasks.filter(t => isDone(t, date)).length
  const todaysCash = (pointsEarned / conversionRate).toFixed(2)
  const totalCash = (totalPoints / conversionRate).toFixed(2)

  return (
    <div className="container">
      <div className="sticky-panel">
        <div className="hero">
          <div>
            <h1>Bujjamma Daily Tasks Tracker</h1>
            <p className="muted">Choose a date, complete your tasks, and earn points for every good action.</p>
          </div>
          <div className="score-card score-line">
            <div>
              <div className="muted">Today's score</div>
              <div className="score">{pointsEarned} pts</div>
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
              <div className="score" style={{ fontSize: '1.25rem', color: '#4CAF50' }}>{totalPoints - spentPoints} pts</div>
            </div>
          </div>
        </div>

        <div className="card card-top">
          <div className="card-header">
            <div>
              <div className="section-title">Daily Task List</div>
              <div className="muted">{completedCount} of {tasks.length} tasks completed</div>
            </div>
            <button className="btn btn-danger btn-reset-today" onClick={resetAllForDate}>Reset Today Tasks</button>
          </div>

          <div className="calendar-section">
            <div className="date-nav">
              <button className="date-btn" onClick={() => setDate(addDays(weekStart(date), -7))}>Previous week</button>
              <div className="date-pills">
                {weekDates(date).map(day => (
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

      <div className="card" style={{ marginTop: '1rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '2px solid #ddd', paddingBottom: '1rem' }}>
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
        </div>

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div className="task-grid">
            {tasks.map(t => (
              <div key={t.id} className={`task task-card ${isDone(t, date) ? 'task-done' : ''}`}>
                <div>
                  <div className="task-title">{formatTaskTitle(t.title)}</div>
                  <div className="muted">{t.description}</div>
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
              </div>
            ))}
          </div>
        )}

        {/* Games Tab */}
        {activeTab === 'games' && (
          <div>
            <div className="section-title" style={{ marginBottom: '1rem' }}>🎮 Unlock Games with Points</div>
            <div className="muted" style={{ marginBottom: '0.5rem' }}>Redeem 50 points to unlock a game</div>
            <div style={{ marginBottom: '1.5rem', padding: '0.75rem', backgroundColor: '#e3f2fd', borderRadius: '4px', fontWeight: 'bold', color: '#1976D2' }}>
              💰 Available Balance: {totalPoints - spentPoints} pts
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {/* Snake Game */}
              <div className="card" style={{ backgroundColor: unlockedGames.snake ? '#e8f5e9' : '#f5f5f5', padding: '1rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>🐍 Snake</div>
                {unlockedGames.snake ? (
                  <div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <button className="btn" style={{ flex: 1 }} onClick={startStopSnake}>{snakeRunning ? 'Pause' : 'Start'}</button>
                      <button className="btn" style={{ flex: 1 }} onClick={resetSnake}>Reset</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, gap: '2px', background: '#ccc', padding: '4px' }}>
                      {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
                        const isSnake = snake.includes(i)
                        const isFood = food === i
                        return (
                          <div key={i} style={{ width: '20px', height: '20px', background: isSnake ? '#4CAF50' : isFood ? '#F44336' : '#fff', borderRadius: '3px' }} />
                        )
                      })}
                    </div>
                    <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>Score: {snakeScore}</div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.85rem' }} className="muted">Use arrow keys while running to change direction.</div>
                  </div>
                ) : (
                  <button className="btn btn-success" style={{ width: '100%' }} onClick={() => redeemPointsForGame('Snake')}>
                    Unlock for 50 pts
                  </button>
                )}
              </div>

              {/* Tic Tac Toe */}
              <div className="card" style={{ backgroundColor: unlockedGames.ttt ? '#e8f5e9' : '#f5f5f5', padding: '1rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>⭕ Tic Tac Toe</div>
                {unlockedGames.ttt ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.25rem', marginBottom: '0.5rem' }}>
                      {tictacToe.map((cell, i) => (
                        <button key={i} className="btn" style={{ padding: '1rem', fontSize: '1.25rem', fontWeight: 'bold' }} onClick={() => playTictacToe(i)}>
                          {cell}
                        </button>
                      ))}
                    </div>
                    {tictacToeWinner && <div style={{ textAlign: 'center', fontWeight: 'bold', color: '#4CAF50' }}>🎉 {tictacToeWinner} Wins!</div>}
                    <button className="btn" style={{ width: '100%', fontSize: '0.8rem', marginTop: '0.5rem' }} onClick={resetTictacToe}>Reset</button>
                  </div>
                ) : (
                  <button className="btn btn-success" style={{ width: '100%' }} onClick={() => redeemPointsForGame('TTT')}>
                    Unlock for 50 pts
                  </button>
                )}
              </div>

              {/* Bigger Game */}
              <div className="card" style={{ backgroundColor: unlockedGames.bigger ? '#e8f5e9' : '#f5f5f5', padding: '1rem' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>🔲 Bigger</div>
                {unlockedGames.bigger ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ margin: '0 auto', width: biggerSize + 'px', height: biggerSize + 'px', background: '#1976D2', borderRadius: '6px', marginBottom: '0.5rem' }} onClick={growBigger} />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn" style={{ flex: 1 }} onClick={growBigger}>Grow</button>
                      <button className="btn" style={{ flex: 1 }} onClick={resetBigger}>Reset</button>
                    </div>
                    <div style={{ marginTop: '0.5rem' }}>Times grown: {biggerScore}</div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.85rem' }} className="muted">Click the blue box or press Grow to increase size.</div>
                  </div>
                ) : (
                  <button className="btn btn-success" style={{ width: '100%' }} onClick={() => redeemPointsForGame('Bigger')}>
                    Unlock for 50 pts
                  </button>
                )}
              </div>

                {/* Embed external game */}
                <div className="card" style={{ backgroundColor: '#fffbe6', padding: '1rem' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>🌐 Embed External Game</div>
                  <div style={{ marginBottom: '0.5rem' }} className="muted">Paste an embeddable URL (CodePen, Itch.io, JSFiddle or other) below. Some sites block embedding.</div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <select className="btn" style={{ flex: 1 }} onChange={e => setEmbedUrl(e.target.value)} value={embedUrl}>
                      <option value="">Choose a preset...</option>
                      <option value="https://codepen.io/">CodePen (root)</option>
                      <option value="https://jsfiddle.net/">JSFiddle (root)</option>
                      <option value="https://itch.io/">Itch.io (root)</option>
                    </select>
                    <input placeholder="https://example.com/embed/..." style={{ flex: 2, padding: '0.5rem' }} value={embedUrl} onChange={e => setEmbedUrl(e.target.value)} />
                  </div>
                  {embedUrl ? (
                    <div>
                      <div style={{ width: '100%', height: '240px', border: '1px solid #ddd' }}>
                        <iframe title="embedded-game" src={embedUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
                      </div>
                      <div style={{ marginTop: '0.5rem' }} className="muted">If the game doesn't load, that site likely blocks embedding (X-Frame-Options).</div>
                    </div>
                  ) : null}
                </div>


            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
