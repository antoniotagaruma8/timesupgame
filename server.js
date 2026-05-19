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
            rooms[roomId].teams.push({ name: name, score: 0 });
            
            io.to(roomId).emit('newTeam', {
                teams: rooms[roomId].teams
            });
        }
    });

    socket.on('submitWord', ({ roomId, word }, callback) => {
        if (rooms[roomId] && word && word.trim()) {
            const cleanWord = word.trim();
            
            // 1. Check Profanity
            if (filter && filter.isProfane(cleanWord)) {
                if (callback) callback({ success: false, error: 'Inappropriate language is not allowed.' });
                return;
            }
            
            // 2. Check Spelling
            if (spellchecker && !spellchecker.correct(cleanWord)) {
                if (callback) callback({ success: false, error: 'Invalid word or misspelled. English words only.' });
                return;
            }
            
            rooms[roomId].words.push(cleanWord);
            
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
