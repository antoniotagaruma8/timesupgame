const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store for rooms
// Structure: { '123456': { words: ['apple', 'banana'], status: 'waiting' } }
const rooms = {};

// Setup filters
let filter = null;
let spellchecker = null;

// Dynamic import for ES Module bad-words
import('bad-words').then((module) => {
    const Filter = module.default || module.Filter;
    filter = new Filter();
    console.log("Profanity filter loaded successfully.");
}).catch(err => console.error("Failed to load bad-words", err));

// Dynamic import for ES Modules nspell and dictionary-en
import('nspell').then(nspellModule => {
    const nspell = nspellModule.default || nspellModule;
    import('dictionary-en').then(dictModule => {
        const dictionary = dictModule.default || dictModule;
        spellchecker = nspell(dictionary);
        console.log("Spellchecker loaded successfully.");
    }).catch(err => console.error("Failed to load dictionary-en", err));
}).catch(err => console.error("Failed to load nspell", err));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // --- Host (Teacher) events ---
    socket.on('createRoom', (roomId) => {
        rooms[roomId] = { words: [], teams: [], status: 'waiting' };
        socket.join(roomId);
        console.log(`Room created: ${roomId}`);
    });

    socket.on('startGame', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].status = 'started';
            io.to(roomId).emit('gameStarted');
        }
    });

    socket.on('resetGame', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId] = { words: [], teams: [], status: 'waiting' };
            io.to(roomId).emit('stateUpdate', { wordCount: 0 });
        }
    });

    socket.on('hostUpdate', (data) => {
        // Relay the host's exact state (timer, score, current team) to the projector
        if (data.roomId) {
            io.to(data.roomId).emit('projectorSync', data);
        }
    });

    // --- Client (Student) events ---
    socket.on('joinRoom', (roomId, callback) => {
        if (rooms[roomId]) {
            socket.join(roomId);
            callback({ success: true, status: rooms[roomId].status });
        } else {
            callback({ success: false });
        }
    });

    socket.on('registerTeam', ({ roomId, teamName }) => {
        if (rooms[roomId] && teamName && teamName.trim()) {
            const name = teamName.trim();
            // Store the socket id with the team so we can target them for kicks
            rooms[roomId].teams.push({ name: name, score: 0, turnsPlayed: 0, socketId: socket.id });
            
            io.to(roomId).emit('newTeam', {
                teams: rooms[roomId].teams
            });
        }
    });

    socket.on('kickTeam', ({ roomId, teamName }) => {
        if (rooms[roomId]) {
            const teamIndex = rooms[roomId].teams.findIndex(t => t.name === teamName);
            if (teamIndex !== -1) {
                const kicked = rooms[roomId].teams.splice(teamIndex, 1)[0];
                console.log(`Kicked team "${teamName}" from room ${roomId}`);
                
                // Notify the kicked player's socket
                if (kicked.socketId) {
                    io.to(kicked.socketId).emit('kicked', { reason: 'You have been removed by the host.' });
                }

                // Broadcast updated team list to everyone
                io.to(roomId).emit('newTeam', {
                    teams: rooms[roomId].teams
                });
            }
        }
    });

    socket.on('submitWord', ({ roomId, word }, callback) => {
        if (rooms[roomId] && word && word.trim()) {
            const cleanWord = word.trim();
            
            // Strip emojis and punctuation for the checks, but keep the original for saving
            const checkWord = cleanWord.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]|[^\w\s])/g, '').trim();
            
            // 1. Check Profanity
            if (filter && filter.isProfane(checkWord || cleanWord)) {
                if (callback) callback({ success: false, error: 'Inappropriate language is not allowed.' });
                return;
            }
            
            // 2. Check Spelling (only if there are actually letters to check)
            if (checkWord.length > 0 && spellchecker && !spellchecker.correct(checkWord)) {
                if (callback) callback({ success: false, error: 'Invalid word or misspelled. English words only.' });
                return;
            }
            
            // Look up which team submitted this word
            const submittingTeam = rooms[roomId].teams.find(t => t.socketId === socket.id);
            const teamName = submittingTeam ? submittingTeam.name : 'Unknown';
            
            rooms[roomId].words.push({ word: cleanWord, team: teamName });
            
            // Broadcast to everyone in the room (including the teacher)
            io.to(roomId).emit('newWord', {
                wordCount: rooms[roomId].words.length,
                allWords: rooms[roomId].words
            });
            
            if (callback) callback({ success: true });
        } else {
            if (callback) callback({ success: false, error: 'Invalid submission.' });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎮 Time's Up Server Running on port ${PORT}`);
});
