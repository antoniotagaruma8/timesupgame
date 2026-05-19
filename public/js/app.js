// Socket.io
const socket = io();

// State variables
let state = {
    teams: [],
    currentTeamIndex: 0,
    turnDuration: 30,
    
    // Word deck
    allWords: [], 
    deck: [],
    
    // Turn state
    timer: null,
    timeLeft: 0,
    currentWordIndex: -1,
    turnScore: 0,

    roomId: null
};

// Audio context
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playBeep(freq, type, duration) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// UI Elements mapping
const screens = {
    welcome: document.getElementById('screen-welcome'),
    howToPlay: document.getElementById('screen-how-to-play'),
    rules: document.getElementById('screen-rules'),
    setup: document.getElementById('screen-setup'),
    submission: document.getElementById('screen-submission'),
    roundIntro: document.getElementById('screen-round-intro'),
    gameplay: document.getElementById('screen-gameplay'),
    turnSummary: document.getElementById('screen-turn-summary'),
    gameOver: document.getElementById('screen-game-over')
};

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

// --- ONBOARDING PHASE ---
document.getElementById('btn-start-onboarding').addEventListener('click', () => {
    playBeep(600, 'sine', 0.1);
    showScreen('howToPlay');
});

document.getElementById('btn-next-rules').addEventListener('click', () => {
    playBeep(600, 'sine', 0.1);
    showScreen('rules');
});

document.getElementById('btn-next-setup').addEventListener('click', () => {
    playBeep(800, 'sine', 0.1);
    showScreen('setup');
});

// --- SETUP PHASE ---

const inputMinutes = document.getElementById('timer-minutes');
const inputSeconds = document.getElementById('timer-seconds');

function generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code
}

document.getElementById('btn-open-submissions').addEventListener('click', () => {
    state.teams = []; // Reset teams on new room creation
    
    const mins = parseInt(inputMinutes.value) || 0;
    const secs = parseInt(inputSeconds.value) || 0;
    state.turnDuration = (mins * 60) + secs;
    if (state.turnDuration <= 0) state.turnDuration = 30; // safety fallback
    
    state.currentTeamIndex = 0;
    
    initAudio();
    
    state.roomId = generateRoomId();
    document.getElementById('room-code-display').textContent = state.roomId;
    
    // Tell server to create this room
    socket.emit('createRoom', state.roomId);

    // Generate URLs dynamically (QR Code relies on this)
    let currentHost = window.location.host;
    let currentPath = window.location.pathname.replace('index.html', '');
    if(!currentPath.endsWith('/')) currentPath += '/';
    
    // Set projector URL
    const projUrl = window.location.protocol + '//' + currentHost + currentPath + `projector.html?room=${state.roomId}`;
    const btnProj = document.getElementById('btn-open-projector');
    if(btnProj) {
        btnProj.onclick = () => window.open(projUrl, '_blank');
        btnProj.style.display = 'inline-block';
    }
    
    // Force the QR code to point to the production URL, not localhost
    const submitUrl = `https://timesupgame.fly.dev/submit.html?room=${state.roomId}`;
    
    const canvas = document.getElementById('qrcode');
    QRCode.toCanvas(canvas, submitUrl, { width: 500, margin: 1, color: { dark: '#000000', light: '#ffffff' } }, function (error) {
        if (error) console.error(error);
    });

    state.allWords = [];
    document.getElementById('live-word-count').textContent = '0';
    
    showScreen('submission');
});

// --- SOCKET WORD SUBMISSIONS ---

const liveWordCount = document.getElementById('live-word-count');
const liveTeamList = document.getElementById('live-team-list');
const teamCount = document.getElementById('team-count');

socket.on('stateUpdate', (data) => {
    liveWordCount.textContent = data.wordCount;
});

socket.on('newTeam', (data) => {
    state.teams = data.teams;
    teamCount.textContent = state.teams.length;
    
    liveTeamList.innerHTML = '';
    state.teams.forEach(t => {
        const span = document.createElement('span');
        span.className = 'hidden-word';
        span.textContent = t.name;
        liveTeamList.appendChild(span);
    });
    
    playBeep(600, 'triangle', 0.1);
});

socket.on('newWord', (data) => {
    liveWordCount.textContent = data.wordCount;
    state.allWords = data.allWords;
    
    playBeep(800 + (data.wordCount % 5) * 100, 'sine', 0.05);
    
    liveWordCount.classList.remove('pulse');
    void liveWordCount.offsetWidth; // reflow
    liveWordCount.classList.add('pulse');
});

document.getElementById('btn-close-submit').addEventListener('click', () => {
    if (state.teams.length < 2) {
        alert("Please wait for at least two teams to join!");
        return;
    }
    
    if (state.allWords.length === 0) {
        // Since we have auto-fill, this is technically never a fatal error anymore,
        // but it's good to ensure students tried at least a little bit.
        alert("Please wait for at least one word to be submitted!");
        return;
    }
    
    // AUTO-FILL B2 VOCABULARY LOGIC
    const B2_VOCABULARY = [
        "Achieve", "Analyze", "Benefit", "Campaign", "Challenge", "Circumstance", 
        "Collapse", "Debate", "Economy", "Factor", "Generate", "Hypothesis", 
        "Impact", "Justify", "Knowledge", "Logical", "Maintain", "Network", 
        "Objective", "Perspective", "Quote", "Relevant", "Sequence", "Theory", 
        "Unique", "Variable", "Acquire", "Adjust", "Alternative", "Approach", 
        "Assume", "Category", "Community", "Complex", "Conclude", "Conduct", 
        "Consequence", "Construct", "Consumer", "Context", "Contrast", "Create", 
        "Cultural", "Decline", "Define", "Demonstrate", "Design", "Distinction", 
        "Elements", "Emphasize", "Environment", "Estimate", "Evaluate", "Evidence", 
        "Examine", "Expand", "Feature", "Financial", "Focus", "Function", 
        "Global", "Identify", "Illustrate", "Imply", "Indicate", "Individual", 
        "Initial", "Innovation", "Instance", "Institute", "Internal", "Investigate", 
        "Journal", "Legislation", "Major", "Maximum", "Mechanism", "Method", 
        "Minor", "Modify", "Negative", "Normal", "Obtain", "Occur", "Outcome", 
        "Participate", "Partner", "Perceive", "Period", "Physical", "Policy", 
        "Positive", "Potential", "Previous", "Primary", "Principle", "Process", 
        "Professional", "Project", "Proportion", "Publish", "Purchase", "Range", 
        "Region", "Regulate", "Require", "Research", "Resident", "Resource", 
        "Respond", "Restrict", "Role", "Section", "Secure", "Select", "Shift", 
        "Significant", "Similar", "Simulate", "Source", "Specific", "Strategy", 
        "Structure", "Subsequent", "Survey", "Survive", "Target", "Task", 
        "Technique", "Technology", "Temporary", "Tradition", "Transfer", "Trend", 
        "Valid", "Vary", "Vehicle", "Version", "Volume", "Volunteer"
    ];

    if (state.allWords.length < 100) {
        console.log(`Only ${state.allWords.length} words submitted. Auto-filling to 100...`);
        let currentWordsLower = state.allWords.map(w => w.toLowerCase());
        
        // Shuffle the backup list
        let backupList = [...B2_VOCABULARY];
        shuffleArray(backupList);
        
        for (let word of backupList) {
            if (state.allWords.length >= 100) break;
            
            if (!currentWordsLower.includes(word.toLowerCase())) {
                state.allWords.push(word);
                currentWordsLower.push(word.toLowerCase());
            }
        }
        console.log(`Auto-fill complete. Deck size: ${state.allWords.length}`);
    }
    
    socket.emit('startGame', state.roomId);
    startGame();
});


// --- GAMEPLAY PHASE ---

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function startGame() {
    state.deck = [...state.allWords];
    shuffleArray(state.deck);
    
    state.teams.forEach(t => t.score = 0);
    state.currentTeamIndex = 0;
    
    showScreen('roundIntro');
    syncToProjector();
}

document.getElementById('btn-start-round').addEventListener('click', () => {
    startTurnSetup();
});

function startTurnSetup() {
    showScreen('gameplay');
    document.getElementById('game-controls-pre').classList.remove('hidden');
    document.getElementById('game-controls-active').classList.add('hidden');
    
    const team = state.teams[state.currentTeamIndex];
    document.getElementById('game-current-team').textContent = team.name;
    document.getElementById('game-words-remaining').textContent = state.deck.length;
    
    document.getElementById('current-word').textContent = "READY?";
    document.getElementById('current-word').classList.remove('gradient-text');
    
    state.timeLeft = state.turnDuration;
    updateTimerVisuals();
    syncToProjector();
}

document.getElementById('btn-start-turn').addEventListener('click', () => {
    document.getElementById('game-controls-pre').classList.add('hidden');
    document.getElementById('game-controls-active').classList.remove('hidden');
    state.turnScore = 0;
    
    drawCard();
    
    state.timer = setInterval(tickTimer, 1000);
    syncToProjector();
});

function drawCard() {
    if (state.deck.length === 0) {
        endTurn(false);
        return;
    }
    
    state.currentWordIndex = Math.floor(Math.random() * state.deck.length);
    const cardEl = document.getElementById('word-card');
    
    cardEl.classList.remove('anim-pop');
    void cardEl.offsetWidth; 
    cardEl.classList.add('anim-pop');
    
    document.getElementById('current-word').textContent = state.deck[state.currentWordIndex];
    document.getElementById('current-word').classList.add('gradient-text');
}

function tickTimer() {
    state.timeLeft--;
    updateTimerVisuals();
    syncToProjector();
    
    if (state.timeLeft <= 3 && state.timeLeft > 0) {
        playBeep(400, 'square', 0.1);
    }
    
    if (state.timeLeft <= 0) {
        endTurn(false);
    }
}

function updateTimerVisuals() {
    const timerText = document.getElementById('timer-text');
    const timerPath = document.getElementById('timer-path');
    const timerContainer = document.querySelector('.timer-container');
    
    // Format mm:ss
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    timerText.textContent = m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : s;
    
    // Scale timer text size dynamically based on length
    if (timerText.textContent.length > 2) {
        timerText.style.fontSize = '1.8rem';
    } else {
        timerText.style.fontSize = '2.5rem';
    }
    
    const dashoffset = 283 - (state.timeLeft / state.turnDuration) * 283;
    timerPath.style.strokeDashoffset = dashoffset;
    
    timerContainer.className = 'timer-container';
    if (state.timeLeft <= 10) timerContainer.classList.add('timer-warning');
    if (state.timeLeft <= 3) timerContainer.classList.add('timer-danger');
}

document.getElementById('btn-got-it').addEventListener('click', () => {
    if (state.currentWordIndex === -1) return;
    
    state.turnScore++;
    state.teams[state.currentTeamIndex].score++;
    
    state.deck.splice(state.currentWordIndex, 1);
    playBeep(800, 'sine', 0.1);
    
    syncToProjector('gotIt');
    
    if (state.deck.length === 0) {
        endTurn(false);
    } else {
        drawCard();
    }
});

document.getElementById('btn-pass').addEventListener('click', () => {
    playBeep(300, 'triangle', 0.1);
    drawCard();
    syncToProjector('pass');
});

document.getElementById('btn-foul').addEventListener('click', () => {
    playBeep(200, 'sawtooth', 0.5);
    endTurn(true);
    syncToProjector('foul');
});

function endTurn(wasFoul) {
    clearInterval(state.timer);
    
    showScreen('turnSummary');
    
    const team = state.teams[state.currentTeamIndex];
    document.getElementById('turn-summary-title').textContent = wasFoul ? "FOUL! Turn Over" : "Time's Up!";
    if (wasFoul) {
        document.getElementById('turn-summary-title').style.color = 'var(--danger)';
    } else {
        document.getElementById('turn-summary-title').style.color = 'var(--text-light)';
    }
    
    document.getElementById('summary-team-name').textContent = team.name;
    document.getElementById('summary-score-earned').textContent = state.turnScore;
    document.getElementById('summary-words-left').textContent = state.deck.length;
    
    state.currentTeamIndex = (state.currentTeamIndex + 1) % state.teams.length;
    document.getElementById('summary-next-team').textContent = state.teams[state.currentTeamIndex].name;
    syncToProjector();
}

document.getElementById('btn-next-turn').addEventListener('click', () => {
    if (state.deck.length === 0) {
        endGame();
    } else {
        startTurnSetup();
    }
});

// --- PROJECTOR SYNC ---
function syncToProjector(eventName = null) {
    if (!state.roomId) return;
    
    let phase = 'waiting';
    if (screens.roundIntro.classList.contains('active')) phase = 'round-intro';
    else if (screens.gameplay.classList.contains('active')) phase = 'playing';
    else if (screens.turnSummary.classList.contains('active')) phase = 'turn-summary';
    else if (screens.gameOver.classList.contains('active')) phase = 'game-over';
    
    socket.emit('hostUpdate', {
        roomId: state.roomId,
        phase: phase,
        currentTeam: state.teams[state.currentTeamIndex] || null,
        timeLeft: state.timeLeft,
        event: eventName
    });
}

// --- GAME OVER PHASE ---

function endGame() {
    showScreen('gameOver');
    
    const sortedTeams = [...state.teams].sort((a, b) => b.score - a.score);
    
    const board = document.getElementById('final-scoreboard');
    board.innerHTML = '';
    
    sortedTeams.forEach((team, index) => {
        const row = document.createElement('div');
        row.className = `score-row ${index === 0 ? 'winner' : ''}`;
        
        row.innerHTML = `
            <div class="team-name-disp">
                ${index === 0 ? '🏆 ' : ''}${index + 1}. ${team.name}
            </div>
            <div class="team-score-disp">${team.score} pts</div>
        `;
        board.appendChild(row);
    });
    
    playBeep(600, 'sine', 0.1);
    setTimeout(() => playBeep(800, 'sine', 0.1), 150);
    setTimeout(() => playBeep(1000, 'sine', 0.3), 300);
    
    syncToProjector();
    fireConfetti();
}

document.getElementById('btn-play-again').addEventListener('click', () => {
    socket.emit('resetGame', state.roomId);
    showScreen('setup');
});

// --- Confetti Effect ---
function fireConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const pieces = [];
    const colors = ['#8b5cf6', '#3b82f6', '#ec4899', '#10b981', '#fcd34d'];
    
    for (let i = 0; i < 150; i++) {
        pieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            w: Math.random() * 10 + 5,
            h: Math.random() * 10 + 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            vy: Math.random() * 3 + 2,
            vx: Math.random() * 2 - 1,
            rot: Math.random() * 360,
            rotSpeed: Math.random() * 5 - 2.5
        });
    }
    
    let isAnimating = true;
    setTimeout(() => isAnimating = false, 5000); 
    
    function animate() {
        if (!isAnimating) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach(p => {
            p.y += p.vy;
            p.x += p.vx;
            p.rot += p.rotSpeed;
            
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
            ctx.restore();
            
            if (p.y > canvas.height) {
                p.y = -20;
                p.x = Math.random() * canvas.width;
            }
        });
        
        requestAnimationFrame(animate);
    }
    animate();
}


