const socket = io();

// Get room code from URL query params
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

// Elements
const projRoomCode = document.getElementById('proj-room-code');
const viewWaiting = document.getElementById('view-waiting');
const viewPlaying = document.getElementById('view-playing');

const projPhaseText = document.getElementById('proj-phase-text');
const projTeamName = document.getElementById('proj-team-name');
const projTimer = document.getElementById('proj-timer');
const projScore = document.getElementById('proj-score');

// Audio elements
const sfxSuccess = document.getElementById('sfx-success');
const sfxPass = document.getElementById('sfx-pass');
const sfxTimesup = document.getElementById('sfx-timesup');

if (roomId) {
    projRoomCode.textContent = roomId;
    socket.emit('joinRoom', roomId, (response) => {
        if (!response.success) {
            projRoomCode.textContent = "INVALID ROOM";
        }
    });
} else {
    projRoomCode.textContent = "MISSING ?room=CODE";
}

let lastScore = 0;

// Listen for syncing data from the Host
socket.on('projectorSync', (data) => {
    // data = { phase, currentTeam: {name, score}, timeLeft, event }
    
    // Switch views based on phase
    if (data.phase === 'playing' || data.phase === 'round-intro' || data.phase === 'turn-summary') {
        viewWaiting.classList.remove('active-view');
        viewPlaying.classList.add('active-view');
    } else {
        viewWaiting.classList.add('active-view');
        viewPlaying.classList.remove('active-view');
    }

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
