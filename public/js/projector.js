const socket = io();

// Get room code from URL query params
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

// Elements
const projRoomCodeDisplays = document.querySelectorAll('.proj-room-code-display');

const views = {
    'welcome': document.getElementById('view-welcome'),
    'how-to-play': document.getElementById('view-how-to-play'),
    'rules': document.getElementById('view-rules'),
    'setup': document.getElementById('view-setup'),
    'submission': document.getElementById('view-submission'),
    'waiting': document.getElementById('view-waiting'),
    'playing': document.getElementById('view-playing')
};

const projPhaseText = document.getElementById('proj-phase-text');
const projTeamName = document.getElementById('proj-team-name');
const projTimer = document.getElementById('proj-timer');
const projScore = document.getElementById('proj-score');

// Audio elements
const sfxSuccess = document.getElementById('sfx-success');
const sfxPass = document.getElementById('sfx-pass');
const sfxTimesup = document.getElementById('sfx-timesup');

if (roomId) {
    projRoomCodeDisplays.forEach(el => el.textContent = roomId);
    socket.emit('joinRoom', roomId, (response) => {
        if (!response.success) {
            projRoomCodeDisplays.forEach(el => el.textContent = "INVALID ROOM");
        }
    });
} else {
    projRoomCodeDisplays.forEach(el => el.textContent = "MISSING CODE");
}

let lastScore = 0;

// Listen for syncing data from the Host
socket.on('projectorSync', (data) => {
    // data = { phase, currentTeam: {name, score}, timeLeft, event }
    
    // Switch views based on phase
    Object.values(views).forEach(v => { if(v) v.classList.remove('active-view'); });
    
    let targetView = views[data.phase];
    
    if (data.phase === 'playing' || data.phase === 'round-intro' || data.phase === 'turn-summary') {
        targetView = views['playing'];
    } else if (data.phase === 'game-over') {
        targetView = views['welcome']; // Just fallback to welcome for now, or keep playing
    }
    
    if (targetView) targetView.classList.add('active-view');

    // Update text
    if (data.phase === 'round-intro') projPhaseText.textContent = 'GET READY';
    else if (data.phase === 'playing') projPhaseText.textContent = 'LIVE TURN';
    else if (data.phase === 'turn-summary') projPhaseText.textContent = "TIME'S UP!";
    
    if (data.currentTeam) {
        projTeamName.textContent = data.currentTeam.name;
        
        let displayScore = data.turnScore !== undefined ? data.turnScore : data.currentTeam.score;
        projScore.textContent = displayScore;
        
        // Play sounds if score changed positively or if event passed
        if (data.event === 'gotIt' && displayScore > lastScore) {
            playAudio(sfxSuccess);
            fireProjectorConfetti();
        } else if (data.event === 'pass') {
            playAudio(sfxPass);
        } else if (data.event === 'timesUp') {
            playAudio(sfxTimesup);
        }
        
        lastScore = displayScore;
    }

    // Update Timer
    if (data.timeLeft !== undefined) {
        const m = Math.floor(data.timeLeft / 60);
        const s = data.timeLeft % 60;
        projTimer.textContent = m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : s;
        
        if (data.timeLeft <= 10 && data.timeLeft > 0) {
            projTimer.classList.add('timer-warning');
        } else {
            projTimer.classList.remove('timer-warning');
        }
    }
    
    // Update Teams Count
    if (data.teams !== undefined) {
        const welcomeTeams = document.getElementById('proj-welcome-teams');
        const subTeams = document.getElementById('proj-sub-teams');
        if (welcomeTeams) welcomeTeams.textContent = data.teams.length;
        if (subTeams) subTeams.textContent = data.teams.length;
    }
    
    // Update Word Bank count
    if (data.wordCount !== undefined) {
        // Update big displays on submission and welcome screens
        const wordCountDisplay = document.getElementById('proj-word-count-display');
        const welcomeWordsDisplay = document.getElementById('proj-welcome-words');
        
        if (wordCountDisplay) {
            wordCountDisplay.textContent = data.wordCount;
            if (data.event === 'wordSubmitted') {
                wordCountDisplay.style.animation = 'none';
                void wordCountDisplay.offsetWidth; // trigger reflow
                wordCountDisplay.style.animation = 'pulseTimer 0.3s ease';
            }
        }
        
        if (welcomeWordsDisplay) {
            welcomeWordsDisplay.textContent = data.wordCount;
            if (data.event === 'wordSubmitted') {
                welcomeWordsDisplay.style.animation = 'none';
                void welcomeWordsDisplay.offsetWidth;
                welcomeWordsDisplay.style.animation = 'pulseTimer 0.3s ease';
            }
        }
        
        // Update small display on live playing screen
        const wordsRemainingDisplay = document.getElementById('proj-words-remaining');
        if (wordsRemainingDisplay) {
            wordsRemainingDisplay.textContent = data.wordCount;
        }
    }
    
    // Update Guessed Words Banner
    const guessedWordsBanner = document.getElementById('proj-guessed-words-banner');
    if (data.lastGuessedCards !== undefined && data.lastGuessedCards.length > 0 && (data.phase === 'playing' || data.phase === 'turn-summary')) {
        if (guessedWordsBanner) guessedWordsBanner.style.transform = 'translateY(0)'; // Show banner
        
        const guessedWordsContainer = document.getElementById('proj-guessed-words');
        if (guessedWordsContainer) {
            guessedWordsContainer.innerHTML = '';
            // Show all guessed words for this turn in a horizontally scrolling list
            data.lastGuessedCards.forEach((card, idx) => {
                const wordText = card.word || card;
                const pill = document.createElement('div');
                pill.style.background = 'rgba(16, 185, 129, 0.2)';
                pill.style.border = '1px solid rgba(16, 185, 129, 0.4)';
                pill.style.color = 'white';
                pill.style.padding = '0.4rem 1.2rem';
                pill.style.borderRadius = '999px';
                pill.style.fontSize = '1.3rem';
                pill.style.fontWeight = 'bold';
                pill.style.whiteSpace = 'nowrap';
                pill.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                
                // Add pop animation only to the newest word if event is gotIt
                if (idx === data.lastGuessedCards.length - 1 && data.event === 'gotIt') {
                    pill.style.animation = 'pulseTimer 0.4s ease-out';
                }
                
                pill.textContent = wordText;
                guessedWordsContainer.appendChild(pill);
            });
            
            // Auto-scroll to the end so the newest word is visible
            guessedWordsContainer.scrollLeft = guessedWordsContainer.scrollWidth;
        }
    } else {
        if (guessedWordsBanner) guessedWordsBanner.style.transform = 'translateY(100%)'; // Hide banner
    }
    
    // Update Live Scoreboard
    if (data.teams && data.teams.length > 0) {
        const scoreboardContainer = document.getElementById('proj-live-scoreboard');
        if (scoreboardContainer) {
            scoreboardContainer.innerHTML = '';
            
            // Sort teams by score descending for the live board
            const sortedTeams = [...data.teams].sort((a, b) => b.score - a.score);
            
            sortedTeams.forEach((t, i) => {
                const isCurrent = data.currentTeam && t.name === data.currentTeam.name;
                
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.padding = '0.4rem 0.6rem';
                row.style.background = isCurrent ? 'rgba(139, 92, 246, 0.2)' : 'rgba(0,0,0,0.3)';
                row.style.border = isCurrent ? '1px solid var(--primary)' : '1px solid transparent';
                row.style.borderRadius = '10px';
                row.style.transition = 'all 0.3s ease';
                
                // Add a crown for 1st place if score > 0
                const crown = (i === 0 && t.score > 0) ? '👑 ' : '';
                const turnsCount = t.turnsPlayed || 0;
                
                row.innerHTML = `
                    <div style="flex: 1; min-width: 0; font-size: 0.85rem; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.1; padding-right: 5px; color: ${isCurrent ? 'white' : 'var(--text-light)'}; font-weight: ${isCurrent ? 'bold' : 'normal'};">
                        ${crown}${t.name}
                        <span style="font-size: 0.65rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.3rem; white-space: nowrap;">${turnsCount} ${turnsCount === 1 ? 'turn' : 'turns'}</span>
                    </div>
                    <div style="font-size: 1.1rem; color: var(--success); font-weight: bold; font-family: var(--font-heading); flex-shrink: 0; margin-left: 0.3rem;">
                        ${t.score}
                    </div>
                `;
                scoreboardContainer.appendChild(row);
            });
        }
    }
});

function playAudio(audioElement) {
    if(!audioElement) return;
    audioElement.currentTime = 0;
    audioElement.play().catch(err => console.log('Audio blocked by browser:', err));
}

// --- Quick Burst Confetti for Scoring ---
function fireProjectorConfetti() {
    const canvas = document.getElementById('proj-confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const pieces = [];
    const colors = ['#8b5cf6', '#3b82f6', '#ec4899', '#10b981', '#fcd34d'];
    
    // Create fewer pieces for a quick burst
    for (let i = 0; i < 60; i++) {
        pieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height * 0.5 - canvas.height * 0.5, // Start slightly higher
            w: Math.random() * 10 + 5,
            h: Math.random() * 10 + 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            vy: Math.random() * 5 + 3,
            vx: Math.random() * 4 - 2,
            rot: Math.random() * 360,
            rotSpeed: Math.random() * 5 - 2.5
        });
    }
    
    let isAnimating = true;
    setTimeout(() => isAnimating = false, 1500); // 1.5 seconds burst
    
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
            
            // Loop pieces to top occasionally if still animating
            if (p.y > canvas.height) {
                p.y = -20;
                p.x = Math.random() * canvas.width;
            }
        });
        
        requestAnimationFrame(animate);
    }
    animate();
}
