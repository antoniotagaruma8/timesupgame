/**
 * End-to-end game simulation script
 * Simulates: 5 teams joining, 10 words submitted, full gameplay to Game Over
 */
const { io } = require('socket.io-client');

const SERVER = 'http://localhost:3000';
const TEAM_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple'];
const WORDS = [
    ['apple', 'banana'],
    ['cat', 'dog'],
    ['eagle', 'fish'],
    ['goat', 'hat'],
    ['ice', 'juice']
];

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    console.log('\n🎮 === TIME\'S UP GAME SIMULATION ===\n');

    // === PHASE 1: Host creates room ===
    const host = io(SERVER);
    await new Promise(r => host.on('connect', r));
    console.log('✅ Host connected');

    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    host.emit('createRoom', roomId);
    console.log(`✅ Room created: ${roomId}`);
    await wait(300);

    // Track state on host side
    let allWords = [];
    let teams = [];

    host.on('newTeam', (data) => {
        teams = data.teams;
        console.log(`   📋 Teams: [${teams.map(t => t.name).join(', ')}]`);
    });
    host.on('newWord', (data) => {
        allWords = data.allWords;
    });

    // === PHASE 2: 5 teams join and submit words ===
    console.log('\n--- SUBMISSION PHASE ---');
    const studentSockets = [];

    for (let i = 0; i < 5; i++) {
        const student = io(SERVER);
        await new Promise(r => student.on('connect', r));
        studentSockets.push(student);

        // Join room
        await new Promise((resolve, reject) => {
            student.emit('joinRoom', roomId, (response) => {
                if (response.success) resolve();
                else reject(new Error('Failed to join room'));
            });
        });

        // Register team
        student.emit('registerTeam', { roomId, teamName: TEAM_NAMES[i] });
        await wait(200);

        // Submit 2 words
        for (const word of WORDS[i]) {
            await new Promise((resolve) => {
                student.emit('submitWord', { roomId, word }, (resp) => {
                    if (resp.success) {
                        console.log(`   ✏️  ${TEAM_NAMES[i]} submitted: "${word}"`);
                    } else {
                        console.log(`   ❌ ${TEAM_NAMES[i]} failed to submit "${word}": ${resp.error}`);
                    }
                    resolve();
                });
            });
            await wait(100);
        }
    }

    await wait(500);
    console.log(`\n✅ ${teams.length} teams joined, ${allWords.length} words submitted`);
    console.log(`   Words: [${allWords.join(', ')}]`);

    // === PHASE 3: Start game ===
    console.log('\n--- GAME START ---');
    host.emit('startGame', roomId);
    await wait(300);

    // === PHASE 4: Simulate gameplay ===
    // Shuffle words into a deck
    let deck = [...allWords];
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Give each team a score of 0
    teams.forEach(t => t.score = 0);
    let currentTeamIndex = 0;
    let turnNumber = 0;
    const turnDuration = 30;

    // Set up projector listener to verify sync
    const projector = io(SERVER);
    await new Promise(r => projector.on('connect', r));
    await new Promise((resolve, reject) => {
        projector.emit('joinRoom', roomId, (response) => {
            if (response.success) resolve();
            else reject(new Error('Projector failed to join'));
        });
    });
    console.log('✅ Projector connected to room');

    let lastProjectorData = null;
    projector.on('projectorSync', (data) => {
        lastProjectorData = data;
    });

    console.log('\n--- GAMEPLAY ---');

    while (deck.length > 0) {
        turnNumber++;
        const team = teams[currentTeamIndex];
        let turnScore = 0;
        let timeLeft = turnDuration;

        console.log(`\n🔄 Turn ${turnNumber}: ${team.name}'s turn (${deck.length} words left)`);

        // Emit round-intro phase
        host.emit('hostUpdate', {
            roomId, phase: 'round-intro', teams, currentTeam: team,
            turnScore: 0, timeLeft, event: null
        });
        await wait(200);

        // Emit playing phase — simulate getting words right
        host.emit('hostUpdate', {
            roomId, phase: 'playing', teams, currentTeam: team,
            turnScore: 0, timeLeft, event: null
        });
        await wait(200);

        // Each turn: guess 2-3 words max, or until deck is empty or time runs out
        const wordsThisTurn = Math.min(deck.length, Math.floor(Math.random() * 3) + 1);

        for (let w = 0; w < wordsThisTurn; w++) {
            // Simulate time passing
            timeLeft -= Math.floor(Math.random() * 8) + 3;
            if (timeLeft <= 0) {
                console.log(`   ⏰ Time's up for ${team.name}!`);
                break;
            }

            const word = deck.splice(0, 1)[0];
            turnScore++;
            team.score++;

            console.log(`   ✓ ${team.name} guessed "${word}" (+1, total: ${team.score})`);

            // Sync to projector
            host.emit('hostUpdate', {
                roomId, phase: 'playing', teams, currentTeam: team,
                turnScore, timeLeft, event: 'gotIt'
            });
            await wait(150);
        }

        // Turn summary
        const nextTeamIndex = (currentTeamIndex + 1) % teams.length;
        console.log(`   📊 ${team.name} scored ${turnScore} this turn (total: ${team.score})`);

        host.emit('hostUpdate', {
            roomId, phase: 'turn-summary', teams, currentTeam: teams[nextTeamIndex],
            turnScore, timeLeft: 0, event: 'timesUp'
        });
        await wait(300);

        currentTeamIndex = nextTeamIndex;
    }

    // === PHASE 5: Game Over ===
    console.log('\n--- 🏆 GAME OVER ---');

    host.emit('hostUpdate', {
        roomId, phase: 'game-over', teams, currentTeam: null,
        turnScore: 0, timeLeft: 0, event: null
    });
    await wait(500);

    // Sort and display final scores
    const sorted = [...teams].sort((a, b) => b.score - a.score);
    console.log('\n📋 FINAL SCOREBOARD:');
    console.log('─'.repeat(30));
    sorted.forEach((t, i) => {
        const medal = i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
        console.log(`   ${medal} ${i + 1}. ${t.name.padEnd(10)} ${t.score} pts`);
    });
    console.log('─'.repeat(30));

    // Verify projector received data
    if (lastProjectorData) {
        console.log('\n✅ Projector sync verified — last phase:', lastProjectorData.phase);
        console.log('   Projector received teams:', lastProjectorData.teams.map(t => `${t.name}(${t.score})`).join(', '));
    } else {
        console.log('\n⚠️  No projector sync data received');
    }

    // Cleanup
    console.log('\n🧹 Cleaning up connections...');
    studentSockets.forEach(s => s.disconnect());
    projector.disconnect();
    host.disconnect();

    console.log('✅ Simulation complete!\n');
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Simulation error:', err);
    process.exit(1);
});
