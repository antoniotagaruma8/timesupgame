/**
 * Puppeteer visual game simulation
 * Opens Chrome and plays through a full game with 2 teams, visible on screen.
 */

const SERVER = 'http://localhost:3000';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    const puppeteer = await import('puppeteer');

    console.log('\n🎮 Launching Chrome for visual game demo...\n');

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    // === HOST TAB ===
    const hostPage = (await browser.pages())[0];
    await hostPage.goto(SERVER);
    console.log('✅ Host page loaded');
    await wait(1500);

    // Click through onboarding
    await hostPage.click('#btn-start-onboarding');
    await wait(1000);
    await hostPage.click('#btn-next-rules');
    await wait(1000);
    await hostPage.click('#btn-next-setup');
    await wait(1000);

    // Set timer to 15 seconds for quick demo
    await hostPage.evaluate(() => {
        document.getElementById('timer-minutes').value = '0';
        document.getElementById('timer-seconds').value = '15';
    });
    await wait(500);

    // Create room
    await hostPage.click('#btn-open-submissions');
    await wait(2000);

    // Get the room code
    const roomCode = await hostPage.evaluate(() =>
        document.getElementById('room-code-display').textContent
    );
    console.log(`✅ Room created: ${roomCode}`);

    // === TEAM 1 TAB ===
    const team1Page = await browser.newPage();
    await team1Page.goto(`${SERVER}/submit.html?room=${roomCode}`);
    await wait(1500);
    console.log('✅ Team 1 tab opened');

    // The submit page with room code auto-joins, then shows register screen
    // Enter team name and click "Join Room" (btn-register)
    await team1Page.waitForSelector('#team-name-input', { visible: true, timeout: 5000 });
    await team1Page.type('#team-name-input', 'Red');
    await wait(300);
    await team1Page.click('#btn-register');
    await wait(1000);

    // Submit words using #word-input and #btn-submit
    const team1Words = ['apple', 'banana', 'cat'];
    for (const word of team1Words) {
        await team1Page.waitForSelector('#word-input', { visible: true, timeout: 5000 });
        await team1Page.type('#word-input', word);
        await wait(300);
        await team1Page.click('#btn-submit');
        await wait(800);
    }
    console.log('✅ Team 1 (Red) submitted 3 words');

    // === TEAM 2 TAB ===
    const team2Page = await browser.newPage();
    await team2Page.goto(`${SERVER}/submit.html?room=${roomCode}`);
    await wait(1500);
    console.log('✅ Team 2 tab opened');

    // Enter team name and join
    await team2Page.waitForSelector('#team-name-input', { visible: true, timeout: 5000 });
    await team2Page.type('#team-name-input', 'Blue');
    await wait(300);
    await team2Page.click('#btn-register');
    await wait(1000);

    // Submit words
    const team2Words = ['dog', 'eagle', 'fish'];
    for (const word of team2Words) {
        await team2Page.waitForSelector('#word-input', { visible: true, timeout: 5000 });
        await team2Page.type('#word-input', word);
        await wait(300);
        await team2Page.click('#btn-submit');
        await wait(800);
    }
    console.log('✅ Team 2 (Blue) submitted 3 words');

    // === BACK TO HOST - CLOSE SUBMISSIONS ===
    await hostPage.bringToFront();
    await wait(1000);

    // Disable the auto-fill in-page so the game finishes with just 6 words
    await hostPage.evaluate(() => {
        // Override state.allWords length check threshold at runtime
        // The btn-close-submit handler checks if allWords.length < 200
        // We'll monkey-patch by replacing the constant inline
        const origHandler = document.getElementById('btn-close-submit');
        // Instead, let's just directly manipulate the state after click
    });

    // Click close submissions
    await hostPage.click('#btn-close-submit');
    await wait(2000);

    // The auto-fill will pad to 200 words. That's fine, we just keep clicking Got It.
    console.log('✅ Submissions closed, game starting (with auto-filled words)');

    // === START ROUND ===
    await hostPage.click('#btn-start-round');
    await wait(1500);
    console.log('✅ Round started');

    // === PLAY TURNS ===
    let gameOver = false;
    let turnCount = 0;

    while (!gameOver && turnCount < 100) {
        // Check current screen
        const currentScreen = await hostPage.evaluate(() => {
            if (document.getElementById('screen-game-over').classList.contains('active')) return 'game-over';
            if (document.getElementById('screen-turn-summary').classList.contains('active')) return 'turn-summary';
            if (document.getElementById('screen-gameplay').classList.contains('active')) return 'gameplay';
            if (document.getElementById('screen-round-intro').classList.contains('active')) return 'round-intro';
            return 'unknown';
        });

        if (currentScreen === 'game-over') {
            gameOver = true;
            console.log('\n🏆 GAME OVER!');
            break;
        }

        if (currentScreen === 'round-intro') {
            await hostPage.click('#btn-start-round');
            await wait(1000);
            continue;
        }

        if (currentScreen === 'gameplay') {
            // Check if pre-turn controls are visible (Start Turn button)
            const preVisible = await hostPage.evaluate(() =>
                !document.getElementById('game-controls-pre').classList.contains('hidden')
            );

            if (preVisible) {
                await hostPage.click('#btn-start-turn');
                turnCount++;
                const teamName = await hostPage.evaluate(() =>
                    document.getElementById('game-current-team').textContent
                );
                console.log(`\n🔄 Turn ${turnCount}: ${teamName}'s turn`);
                await wait(600);
                continue;
            }

            // Active turn — click "Got It!" 
            const activeVisible = await hostPage.evaluate(() =>
                !document.getElementById('game-controls-active').classList.contains('hidden')
            );

            if (activeVisible) {
                await hostPage.click('#btn-got-it');
                const info = await hostPage.evaluate(() => ({
                    word: document.getElementById('current-word').textContent,
                    score: document.getElementById('game-current-score').textContent,
                    left: document.getElementById('game-words-remaining').textContent
                }));
                console.log(`   ✓ Got it! (score: ${info.score}, ${info.left} left)`);
                await wait(400);
                continue;
            }
        }

        if (currentScreen === 'turn-summary') {
            const summaryInfo = await hostPage.evaluate(() => ({
                team: document.getElementById('summary-team-name').textContent,
                score: document.getElementById('summary-score-earned').textContent,
                wordsLeft: document.getElementById('summary-words-left').textContent
            }));
            console.log(`   📊 ${summaryInfo.team} scored ${summaryInfo.score} (${summaryInfo.wordsLeft} words left)`);
            await wait(2000);
            await hostPage.click('#btn-next-turn');
            await wait(1000);
            continue;
        }

        await wait(500);
    }

    // Show final scores
    await wait(2000);
    try {
        const finalScores = await hostPage.evaluate(() => {
            const rows = document.querySelectorAll('#final-scoreboard .score-row');
            return Array.from(rows).map(row => ({
                name: row.querySelector('.team-name-disp').textContent.trim(),
                score: row.querySelector('.team-score-disp').textContent.trim()
            }));
        });

        console.log('\n📋 FINAL SCOREBOARD:');
        console.log('─'.repeat(30));
        finalScores.forEach(t => {
            console.log(`   ${t.name} — ${t.score}`);
        });
        console.log('─'.repeat(30));
    } catch(e) {
        console.log('(Could not read final scoreboard)');
    }

    // Keep browser open for 10 seconds so user can see the result
    console.log('\n👀 Keeping browser open for 10 seconds so you can see the results...');
    await wait(10000);

    await browser.close();
    console.log('✅ Done!\n');
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
