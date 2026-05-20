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
        projScore.textContent = data.currentTeam.score;
        
        // Play sounds if score changed positively or if event passed
        if (data.event === 'gotIt' && data.currentTeam.score > lastScore) {
            playAudio(sfxSuccess);
        } else if (data.event === 'pass') {
            playAudio(sfxPass);
        } else if (data.event === 'timesUp') {
            playAudio(sfxTimesup);
        }
        
        lastScore = data.currentTeam.score;
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
});

function playAudio(audioElement) {
    if(!audioElement) return;
    audioElement.currentTime = 0;
    audioElement.play().catch(err => console.log('Audio blocked by browser:', err));
}
