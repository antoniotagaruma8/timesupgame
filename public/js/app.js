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
    isPaused: false,
    currentWordIndex: -1,
    turnScore: 0,

    // Global timer
    totalGameDuration: 0,
    totalGameTimeLeft: 0,
    globalTimerInterval: null,

    roomId: null,
    isTurnActive: false,
    selectedLevels: ['B1+', 'B2', 'B2+', 'C1', 'C2'],
    turnLevelCycle: ['B1+', 'B1+', 'B2', 'B2+']
};

let guessedWordsChart = null;

function generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code
}

// Initialize Room ID immediately
state.roomId = generateRoomId();
socket.emit('createRoom', state.roomId);

// Pre-compute Projector URL
let currentHost = window.location.host;
let currentPath = window.location.pathname.replace('index.html', '');
if(!currentPath.endsWith('/')) currentPath += '/';
const projUrl = window.location.protocol + '//' + currentHost + currentPath + `projector.html?room=${state.roomId}`;

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
    syncToProjector();
}

// --- ONBOARDING PHASE ---
document.getElementById('btn-start-onboarding').addEventListener('click', () => {
    playBeep(600, 'sine', 0.1);
    showScreen('howToPlay');
});

document.getElementById('btn-back-welcome').addEventListener('click', () => {
    playBeep(400, 'sine', 0.1);
    showScreen('welcome');
});

document.getElementById('btn-next-rules').addEventListener('click', () => {
    playBeep(600, 'sine', 0.1);
    showScreen('rules');
});

document.getElementById('btn-back-how-to-play').addEventListener('click', () => {
    playBeep(400, 'sine', 0.1);
    showScreen('howToPlay');
});

document.getElementById('btn-next-setup').addEventListener('click', () => {
    playBeep(800, 'sine', 0.1);
    showScreen('setup');
});

document.getElementById('btn-back-rules').addEventListener('click', () => {
    playBeep(400, 'sine', 0.1);
    showScreen('rules');
});

// Setup copy projector link
function copyProjectorLink(btnElement, origText, successText) {
    const showSuccess = () => {
        btnElement.textContent = successText;
        setTimeout(() => btnElement.textContent = origText, 2000);
    };

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(projUrl).then(showSuccess).catch(err => {
            alert('Failed to copy: ' + err);
        });
    } else {
        // Fallback for non-HTTPS or older browsers
        const textArea = document.createElement("textarea");
        textArea.value = projUrl;
        textArea.style.position = "absolute";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showSuccess();
        } catch (err) {
            alert('Failed to copy. Please manually copy this link: ' + projUrl);
        }
        textArea.remove();
    }
}



document.getElementById('btn-global-copy-projector').addEventListener('click', function() {
    window.open(projUrl, '_blank');
});

// --- SETUP PHASE ---

const inputMinutes = document.getElementById('timer-minutes');
const inputSeconds = document.getElementById('timer-seconds');

document.getElementById('btn-open-submissions').addEventListener('click', () => {
    state.teams = []; // Reset teams on new room creation
    
    state.selectedLevels = [];
    document.querySelectorAll('.vocab-level-cb:checked').forEach(cb => {
        state.selectedLevels.push(cb.value);
    });
    if (state.selectedLevels.length === 0) {
        state.selectedLevels = ['B1+']; // Fallback
    }
    
    const mins = parseInt(inputMinutes.value) || 0;
    const secs = parseInt(inputSeconds.value) || 0;
    state.turnDuration = (mins * 60) + secs;
    if (state.turnDuration <= 0) state.turnDuration = 30; // safety fallback
    
    const totalMins = parseInt(document.getElementById('total-game-minutes').value) || 0;
    state.totalGameDuration = totalMins * 60;
    state.totalGameTimeLeft = state.totalGameDuration;
    
    state.currentTeamIndex = 0;
    
    initAudio();
    
    document.getElementById('room-code-display').textContent = state.roomId;
    
    const btnProj = document.getElementById('btn-open-projector');
    if(btnProj) {
        btnProj.onclick = () => window.open(projUrl, '_blank');
        btnProj.style.display = 'inline-block';
    }
    
    // Make the QR code point to the current production URL dynamically
    const submitUrl = `${window.location.origin}/submit.html?room=${state.roomId}`;
    
    // Update the manual URL display dynamically
    const manualDisplay = document.getElementById('manual-url-display');
    if (manualDisplay) {
        manualDisplay.textContent = `${window.location.host}/submit.html`;
    }
    
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
        const wrapper = document.createElement('span');
        wrapper.className = 'hidden-word';
        wrapper.style.display = 'inline-flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '0.4rem';
        wrapper.style.paddingRight = '0.3rem';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = t.name;
        
        const kickBtn = document.createElement('button');
        kickBtn.textContent = '✕';
        kickBtn.title = `Kick ${t.name}`;
        kickBtn.style.cssText = 'background: rgba(239,68,68,0.3); color: #fca5a5; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1; transition: background 0.2s;';
        kickBtn.addEventListener('mouseenter', () => kickBtn.style.background = 'rgba(239,68,68,0.7)');
        kickBtn.addEventListener('mouseleave', () => kickBtn.style.background = 'rgba(239,68,68,0.3)');
        kickBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Kick "${t.name}" from the game?`)) {
                socket.emit('kickTeam', { roomId: state.roomId, teamName: t.name });
            }
        });
        
        wrapper.appendChild(nameSpan);
        wrapper.appendChild(kickBtn);
        liveTeamList.appendChild(wrapper);
    });
    
    playBeep(600, 'triangle', 0.1);
});

socket.on('newWord', (data) => {
    liveWordCount.textContent = data.wordCount;
    // Words are now {word, team} objects from the server
    state.allWords = data.allWords;
    
    playBeep(800 + (data.wordCount % 5) * 100, 'sine', 0.05);
    
    liveWordCount.classList.remove('pulse');
    void liveWordCount.offsetWidth; // reflow
    liveWordCount.classList.add('pulse');
    
    syncToProjector('wordSubmitted');
});

document.getElementById('btn-add-team').addEventListener('click', () => {
    const input = document.getElementById('manual-team-name');
    const teamName = input.value.trim();
    if (teamName) {
        socket.emit('registerTeam', { roomId: state.roomId, teamName: teamName });
        input.value = '';
    }
});

document.getElementById('manual-team-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('btn-add-team').click();
    }
});

document.getElementById('btn-toggle-join-info').addEventListener('click', function() {
    const qrCard = document.getElementById('join-qr-card');
    const urlCard = document.getElementById('join-url-card');
    const isHidden = qrCard.style.display === 'none';
    
    if (isHidden) {
        qrCard.style.display = 'flex';
        urlCard.style.display = 'flex';
        this.textContent = '👁️ Hide Join Info';
    } else {
        qrCard.style.display = 'none';
        urlCard.style.display = 'none';
        this.textContent = '👁️ Show Join Info';
    }
});

document.getElementById('btn-close-submit').addEventListener('click', () => {
    if (state.teams.length < 2) {
        alert("Please wait for at least two teams to join!");
        return;
    }
    
    // Allowing 0 words since auto-fill will populate the bank using the full vocabulary list.

    const B1_WORDS = [
        "Social Media 📱", "Influencer 📸", "Playlist 🎵", "Streaming 📺", "Podcast 🎧", "Selfie 🤳", "Video Game 🎮", "Console 🕹️", "Multiplayer 👥", "Laptop 💻", "Keyboard ⌨️", "Screen 🖥️", "Charger 🔌", "Battery 🔋", "Headphones 🎧", "Speaker 🔊", "Microphone 🎤", "Concert 🎫", "Festival 🎪", "Ticket 🎟️", "Crowd 👥", "Stage 🎤", "Audience 👏", "Singer 🎤", "Rapper 🎤", "Movie 🍿", "Cinema 🍿", "Actor 🎭", "Director 🎬", "Character 🦸", "Hero 🦸", "Villain 🦹", "Spoiler 🚫", "Series 📺", "Episode 📺", "Season 📺", "Anime 🌸", "Cartoon 📺", "Superhero 🦸", "Comic 📖", "Homework 📝", "Assignment 📝", "Project 📊", "Presentation 📊", "Exam 📝", "Teacher 👩‍🏫", "Classmate 🎒", "Crush ❤️", "Relationship 💑", "Breakup 💔", "Drama 🎭", "Gossip 🗣️", "Rumor 🗣️", "Secret 🤫", "Apology 🙇", "Trust 🤝", "Friendship 🤝", "Jealousy 😒", "Anxiety 😰", "Stress 😫", "Vacation 🏖️", "Adventure 🧗", "Destination 📍", "Beach 🏖️", "Alien 👽", "Ghost 👻", "Vampire 🧛", "Zombie 🧟", "Magic ✨", "Dragon 🐉", "Unicorn 🦄", "Pet 🐱", "Snack 🍟", "Fast Food 🍔", "Pizza 🍕", "Burger 🍔", "Fries 🍟", "Shopping 🛍️", "Discount 🏷️", "Brand 👕", "Sneakers 👟", "Hoodie 🧥", "Outfit 👗", "Style 😎", "Trend 📈", "Makeup 💄", "Skincare 🧴", "Haircut ✂️", "Tattoo 🖋️", "Piercing 🧷", "Gym 💪", "Workout 🏋️", "Sport ⚽", "Team 👥", "Tournament 🏆", "Champion 🥇", "Winner 🏆", "Loser 👎", "Score 💯", "Goal 🥅", "Referee 🦓", "Stadium 🏟️", "Fan 👏", "Mascot 🐶", "Message 💬", "Follower 📱", "Hashtag #️⃣", "Profile 👤", "Notification 🔔", "Download ⬇️", "Upload ⬆️", "Password 🔑", "WiFi 📶", "Screen Time ⏳", "Vlog 📹", "Camera 📷", "Filter 📸", "Comments 💬", "Group Chat 📱", "Emoji 😂", "App 📱", "Internet 🌐", "Website 💻", "Link 🔗", "Viral Video 📹", "Funny 🤣", "Laugh 😂", "Smile 😁", "Bored 🥱", "Tired 😴", "Angry 😠", "Surprise 😲", "Fear 😨", "Love ❤️", "Hate 💔", "Cry 😢", "Party 🎉", "Birthday 🎂", "Gift 🎁", "Cake 🍰", "Dance 💃", "Music 🎵", "Band 🎸", "Guitar 🎸", "Piano 🎹", "Drums 🥁", "Song 🎵", "Pop Music 🎵", "Rock Music 🎸", "Rap 🎤", "K-Pop 🇰🇷", "Movie Theater 🍿", "Popcorn 🍿", "Television 📺", "Netflix 🍿", "YouTube 📹", "TikTok 📱", "Instagram 📸", "Snapchat 👻", "Discord 🎮", "Twitch 🎮", "Gaming 🎮", "Controller 🎮", "Mouse 🖱️", "Headset 🎧", "Level Up ⬆️", "Boss Fight 👾", "Noob 👶", "Pro Player 🎮", "Cheat Code ⌨️", "High Score 💯", "Victory 🏆", "Defeat 💔", "School 🏫", "Classroom 🏫", "Student 🎒", "Backpack 🎒", "Notebook 📓", "Pen 🖊️", "Pencil ✏️", "Eraser 🧽", "Calculator 🧮", "Whiteboard 🖍️", "Recess ⚽", "Cafeteria 🍕", "Lunch 🥪", "Library 📚", "Book 📖", "Dictionary 📖", "Science 🔬", "Math 🧮", "History 🌍", "Geography 🗺️", "Art 🎨", "Gym Class ⚽", "Bus 🚌", "Bicycle 🚲", "Skateboard 🛹", "Car 🚗", "Driving 🚗", "Traffic 🚦", "Mall 🛍️", "Clothes 👕", "Shoes 👟", "Jacket 🧥", "Jeans 👖", "T-shirt 👕", "Dress 👗", "Sunglasses 🕶️", "Hat 🧢", "Watch ⌚", "Money 💵", "Wallet 👛", "Price 🏷️", "Cheap 📉", "Expensive 📈", "Sale 🏷️", "Cash 💵", "Credit Card 💳", "Supermarket 🛒", "Restaurant 🍽️", "Menu 📖", "Waiter 💁", "Tip 💵", "Bill 🧾", "Food 🍔", "Drink 🥤", "Water 💧", "Juice 🧃", "Soda 🥤", "Coffee ☕", "Tea 🍵", "Milk 🥛", "Breakfast 🍳", "Dinner 🍝", "Dessert 🍰", "Ice Cream 🍦", "Chocolate 🍫", "Candy 🍬", "Fruit 🍎", "Vegetable 🥦", "Meat 🥩", "Fish 🐟", "Chicken 🍗", "Bread 🍞", "Cheese 🧀", "Egg 🥚", "Vibe 🌊", "Aesthetic ✨", "Cringe 😬"
    ];
    const B2_WORDS = [
        "Algorithm 💻", "Cyberbullying 🚫", "Clickbait 🎣", "Viral 🦠", "Trendsetter ✨", "Subscribe 🔔", "Sponsorship 💰", "Verification ✅", "Cringe 😬", "Aesthetic ✨", "Vibe 🌊", "Nostalgia 📷", "Procrastinate ⏰", "Motivation 🎯", "Curriculum 📚", "Plagiarism 📝", "Scholarship 🎓", "Graduation 🎓", "Rebellion ✊", "Independence 🦅", "Identity 👤", "Stereotype 🎭", "Peer Pressure 👥", "Expectation 📈", "Reputation 🌟", "Betrayal 💔", "Loyalty 🤝", "Commitment 💍", "Compromise 🤝", "Sarcasm 😏", "Irony 🎭", "Empathy ❤️", "Sympathy 🥺", "Generation 👨‍👩‍👧", "Environment 🌳", "Pollution 🏭", "Climate Change 🌍", "Activism 📢", "Volunteer 🤲", "Charity 💝", "Donation 💰", "Community 🏘️", "Diversity 🌍", "Equality ⚖️", "Justice ⚖️", "Feminism 👩", "Racism 🚫", "Discrimination 🚫", "Prejudice 🚫", "Mental Health 🧠", "Therapy 🛋️", "Meditation 🧘", "Mindfulness 🧘", "Nutrition 🥗", "Diet 🥗", "Vegan 🌱", "Vegetarian 🥦", "Allergy 🤧", "Symptom 🤒", "Diagnosis 🩺", "Vaccine 💉", "Pandemic 🦠", "Quarantine 🏠", "Economy 💰", "Inflation 📈", "Investment 📈", "Cryptocurrency 🪙", "Entrepreneur 👔", "Startup 🚀", "Freelance 💻", "Remote Work 🏠", "Virtual Reality 🕶️", "Augmented Reality 📱", "Cybersecurity 🛡️", "Privacy 🔒", "Hacking 💻", "Encryption 🔐", "Biometrics 👁️", "Drone 🚁", "Space Exploration 🚀", "Astronomy 🔭", "Astrology ♈", "Horoscope ♈", "Zodiac ♈", "Superstition 🍀", "Karma 🔄", "Destiny ✨", "Coincidence 🎯", "Illusion 🌀", "Hallucination 🌀", "Nightmare 😱", "Phobia 😨", "Overwhelmed 😵", "Fascinated 🤩", "Frustrated 😤", "Disappointed 😞", "Inspired 💡", "Creative 🎨", "Ambitious 🚀", "Confident 😎", "Awkward 😬", "Embarrassing 😳", "Hilarious 😂", "Ridiculous 🤡", "Fictional 🐉", "Legendary 👑", "Epic ⚔️", "Tragic 🎭", "Mysterious 🕵️", "Haunted 👻", "Creepy 🕷️", "Disgusting 🤢", "Delicious 😋", "Spicy 🌶️", "Healthy 🥗", "Unhealthy 🍔", "Allergic 🤧", "Addictive 📱", "Productive 📈", "Lazy 🦥", "Energetic ⚡", "Exhausted 😫", "Atmosphere ☁️", "Temperature 🌡️", "Forecast 🌦️", "Storm ⛈️", "Hurricane 🌪️", "Earthquake 🌍", "Disaster 🌋", "Emergency 🚨", "Ambulance 🚑", "Police 👮", "Firefighter 🧑‍🚒", "Hospital 🏥", "Surgery 🩺", "Medicine 💊", "Recovery ❤️‍🩹", "Infection 🦠", "Immunity 🛡️", "Fitness 💪", "Muscles 💪", "Stretching 🧘", "Yoga 🧘", "Medal 🏅", "Trophy 🏆", "Competition 🏁", "Strategy 🧠", "Tactics ♟️", "Defense 🛡️", "Offense ⚔️", "Penalty 🟥", "Foul 🚫", "Injury 🤕", "Coach 🧢", "Captain 👨‍✈️", "Teammate 🤝", "Opponent 🦹", "Rival ⚔️", "Alliance 🤝", "Betray 🗡️", "Forgive 🕊️", "Apologize 🙇", "Regret 😔", "Guilty 🥺", "Innocent 😇", "Suspect 🕵️", "Detective 🕵️", "Mystery 🔍", "Clue 🔎", "Evidence 📁", "Secret 🤫", "Rumor 🗣️", "Gossip 🗣️", "Scandal 📰", "Headline 🗞️", "Journalist 📝", "Interview 🎤", "Review ⭐", "Critic 📝", "Rating ⭐", "Recommendation 👍", "Complaint 👎", "Feedback 💬", "Survey 📋", "Statistics 📊", "Research 🔬", "Experiment 🧪", "Discovery 🔭", "Invention 💡", "Technology 💻", "Gadget 📱", "Device 🖥️", "Software 💾", "Hardware 🖥️", "Network 🌐", "Connection 📶", "Signal 📡", "Update 🔄", "Upgrade ⬆️", "Install ⬇️", "Delete 🗑️", "Recycle ♻️", "Plastic 🥤", "Global Warming 🌍", "Greenhouse 🌱", "Solar Power ☀️", "Wind Energy 🌬️"
    ];
    const B2_PLUS_WORDS = [
        "Authenticity ✅", "Vulnerability 💔", "Gaslighting 🕯️", "Toxic ☣️", "Boundaries 🚧", "Manipulation 🎭", "Narcissist 🪞", "Validation ✅", "Insecurity 😰", "Empowerment 💪", "Resilience 💪", "Advocacy 📢", "Intersectionality 🌐", "Marginalized 👥", "Privilege 👑", "Appropriation 🎭", "Censorship ✂️", "Echo Chamber 🗣️", "Polarization ↔️", "Misinformation 📰", "Deepfake 🤖", "Monetization 💰", "Burnout 😫", "Hustle Culture 🏃", "Gentrification 🏘️", "Sustainability 🌿", "Carbon Footprint 👣", "Greenwashing 🧼", "Biodiversity 🦜", "Ecosystem 🌿", "Deforestation 🪵", "Extinction 🦖", "Genetic Engineering 🧬", "Simulation 💻", "Paradox 🔄", "Hypothesis 🧪", "Bias ⚖️", "Subjective 🧠", "Objective 🎯", "Ambiguity 🔮", "Nuance 🎨", "Dilemma ⚖️", "Conundrum 🤔", "Metaphor 🌀", "Satire 🎭", "Parody 🤡", "Cynicism 😒", "Pessimism 🌧️", "Optimism ☀️", "Philosophy 🤔", "Psychology 🧠", "Sociology 👥", "Globalization 🌐", "Propaganda 📢", "Radicalization ⚡", "Extremism ⚡", "Whistleblower 📢", "Philanthropy 🤲", "Micromanage 👔", "Overthink 🧠", "Spontaneous ✨", "Charisma ✨", "Prodigy 🌟", "Introvert 🤫", "Extrovert 🥳", "Ambivert ↔️", "Hypocrisy 🎭", "Skepticism 🤨", "Tolerance 🤝", "Inclusive 🌈", "Exclusive 🚫", "Anonymous 🎭", "Controversy ⚡", "Backlash 📉", "Boycott 🚫", "Cancel Culture 🚫", "Mainstream 🌊", "Underground 🚇", "Masterpiece 🎨", "Avant-garde 🎨", "Binge-watch 📺", "Cliffhanger 🧗", "Plot Twist 🌪️", "Protagonist 🦸", "Antagonist 🦹", "Antihero 🦹", "Flashback 🕰️", "Foreshadowing 🔮", "Genre 📚", "Cinematography 🎥", "Procrastination ⏰", "Vulnerable 🥺", "Gaslight 🕯️", "Boundary 🚧", "Advocate 📢", "Monetize 💰", "Ambiguous 🔮", "Cynical 😒", "Pessimistic 🌧️", "Optimistic ☀️", "Philosophical 🤔", "Psychological 🧠", "Globalized 🌐", "Extremist ⚡", "Philanthropist 🤲", "Overthinking 🧠", "Charismatic ✨", "Introverted 🤫", "Extroverted 🥳", "Hypocrite 🎭", "Skeptical 🤨", "Tolerant 🤝", "Controversial ⚡", "Binge-watching 📺", "Choreography 💃", "Improvise 🎭", "Rehearse 🎬", "Audition 🎤", "Premiere 🎬", "Encore 👏", "Ovation 👏", "Debut 🌟", "Legacy 🏛️", "Heritage 🌍", "Tradition 🏮", "Custom 🎎", "Ritual 🕯️", "Superstitious 🍀", "Destined ✨", "Coincidental 🎯", "Illusional 🌀", "Hallucinate 🌀", "Nightmarish 😱", "Phobic 😨", "Traumatic 🤕", "Therapeutic 🛋️", "Mindful 🧘", "Meditate 🧘"
    ];
    const C1_WORDS = [
        "Algorithm 🤖", "Authentication 🔐", "Cyberbullying 🚫", "Cryptocurrency 🪙", "Cybersecurity 🛡️", "Encryption 🔐", "Biometrics 👁️", "Virtual Reality 🕶️", "Augmented Reality 📱", "Simulation 💻", "Hologram 🟦", "Artificial Intelligence 🧠", "Extraterrestrial 👽", "Teleportation 🌀", "Telekinesis 🖐️", "Telepathy 🧠", "Apocalypse 🌋", "Dystopia 🏙️", "Utopia 🌈", "Cyberpunk 🦾", "Mutant 🧬", "Cyborg 🦾", "Cloning 🧬", "Supernatural 👻", "Paranormal 👻", "Exorcism ✝️", "Witchcraft 🧙‍♀️", "Sorcery 🧙‍♂️", "Alchemy ⚗️", "Prophecy 🔮", "Immortal 🧛", "Invincible 🛡️", "Levitate 🎈", "Mind Control 🧠", "Hypnosis 🌀", "Amnesia 🤯", "Insomnia 🦉", "Paranoia 👁️", "Schizophrenia 🧠", "Psychopath 🔪", "Sociopath 🎭", "Interrogate 🔦", "Confession 🗣️", "Alibi 🕰️", "Culprit 🦹", "Accomplice 🤝", "Testimony 🗣️", "Verdict ⚖️", "Fugitive 🏃", "Bounty Hunter 🤠", "Mercenary ⚔️", "Assassin 🥷", "Necromancer 💀", "Infiltrate 🥷", "Sabotage 💣", "Espionage 🕶️", "Treason 🗡️", "Mutiny 🏴‍☠️", "Dimension 🌀", "Portal 🚪", "Supernova 💥", "Asteroid ☄️", "Constellation 🌌", "Orbit 🔄", "Gravity 🍎", "Atmosphere ☁️", "Radiation ☢️", "Radioactive ☢️", "Quantum ⚛️", "Genetics 🧬", "Chromosome 🧬", "Bacteria 🦠", "Infection 🤒", "Vaccine 💉", "Paramedic 🚑", "Collision 💥", "Explosion 💥", "Eruption 🌋", "Magma 🌋", "Tsunami 🌊", "Cyclone 🌪️", "Monsoon 🌧️", "Drought 🏜️", "Avalanche 🏔️", "Landslide 🏔️", "Glacier 🧊", "Equator 🌍", "Hemisphere 🌍", "Latitude 🗺️", "Longitude 🗺️", "Compass 🧭", "Navigate 🧭", "Expedition 🧗", "Artifact 🏺", "Relic 🏺", "Ruins 🏛️", "Monument 🏛️", "Sphinx 🦁", "Pharaoh 👑", "Purgatory ⚖️", "Reincarnation 🔄", "Apparition 👻", "Haunted 👻", "Cursed 🤬", "Talisman 🧿", "Elixir 🧪", "Antidote 💉", "Toxic ☢️", "Hazard ⚠️", "Peril ⚠️", "Menace 🦹", "Intimidate 😠", "Harass 😠", "Torment 😈", "Brutal 🩸", "Vicious 🐺", "Fierce 🐯", "Savage 🦁", "Feral 🐺", "Rabid 🐺", "Mechanism ⚙️", "Gadget 📱", "Innovation 💡", "Malware 🦠", "Spyware 👁️", "Ransomware 💰", "Phishing 🎣", "Deception 🤥", "Illusion 🌀", "Mirage 🏜️", "Hallucination 🌀", "Delusion 🧠", "Matrix 🟩", "Avatar 👤", "Broadcast 📡", "Voltage ⚡", "Velocity 🏃", "Acceleration 🚀", "Momentum 🚂", "Friction 🛑", "Resistance 🛡️", "Aerodynamics ✈️", "Thermodynamics 🌡️", "Metabolism 🥗", "Ecosystem 🌿", "Biodiversity 🦜", "Evolution 🐒", "Fossil 🦖", "Dinosaur 🦖", "Predator 🦁", "Prey 🐰", "Carnivore 🦖", "Herbivore 🦕", "Omnivore 🐻", "Parasite 🦠", "Symbiosis 🤝", "Camouflage 🦎", "Hibernation 🐻", "Migration 🦆", "Extinction 🦖", "Endangered 🐼", "Conservation 🌳", "Pollution 🏭", "Deforestation 🪵", "Greenhouse 🌱", "Sustainability 🌿", "Renewable ☀️", "Solar Panel ☀️", "Wind Turbine 🌬️", "Geothermal 🌋", "Hydroelectric 🌊", "Biomass 🌱", "Biodegradable ♻️", "Recycling ♻️", "Upcycling 👕", "Compost 🍂", "Organic 🍎", "Pesticide 🧪", "Herbicide 🧪", "Fertilizer 🌱", "Agriculture 🚜", "Cultivate 🌾", "Harvest 🌾", "Irrigation 💧", "Livestock 🐄", "Poultry 🐔", "Dairy 🥛", "Bakery 🍞", "Butcher 🥩", "Grocery 🛒", "Supermarket 🛒", "Convenience 🏪", "Retail 🛍️", "Wholesale 📦", "Inventory 📦", "Logistics 🚚", "Supply Chain 🔗", "Export 🚢", "Import 🛬", "Tariff 💰"
    ];
    const C2_WORDS = [
        "Existential 🌌", "Nihilism ⬛", "Epiphany 💡", "Hypocrisy 🎭", "Narcissist 🪞", "Gaslight 🕯️", "Megalomania 👑", "Placebo 💊", "Conundrum 🤔", "Dilemma ⚖️", "Labyrinth 🌀", "Heuristic 🧠", "Metaverse 🌐", "Armageddon ☄️", "Extraterrestrial 👽", "Alien 👽", "UFO 🛸", "Galaxy 🌌", "Universe 🌌", "Black Hole 🕳️", "Mutation 🧬", "Epidemic 🦠", "Pandemic 🦠", "Quarantine 🏠", "Immunity 🛡️", "Diagnosis 🩺", "Symptom 🤒", "Therapy 🛋️", "Psychology 🧠", "Philosophy 🤔", "Sociology 👥", "Economics 💰", "Inflation 📈", "Recession 📉", "Blockchain ⛓️", "NFT 🖼️", "Entrepreneur 👔", "Startup 🚀", "Monopoly 🎩", "Capitalism 💰", "Communism ☭", "Democracy 🗳️", "Dictatorship 👑", "Oligarchy 👑", "Anarchy Ⓐ", "Revolution ✊", "Rebellion ✊", "Conspiracy 🕵️", "Theory 🧠", "Myth 🦄", "Legend 👑", "Folklore 📖", "Stereotype 🎭", "Cliché 🥱", "Trope 📚", "Archetype 🎭", "Protagonist 🦸", "Antagonist 🦹", "Antihero 🦹", "Cameo 🌟", "Crossover 🤝", "Spin-off 🔄", "Reboot 🔄", "Sequel 🎬", "Prequel 🎬", "Franchise 🍿", "Easter Egg 🥚", "Plot Twist 🌪️", "Cliffhanger 🧗", "Binge-watch 📺", "Spoiler 🚫", "Masterpiece 🎨", "Aesthetic ✨", "Nostalgia 📷", "Melancholy 🌧️", "Euphoria ✨", "Adrenaline ⚡", "Dopamine 🧠", "Serotonin 🧠", "Toxic ☢️", "Cringe 😬", "Viral 🦠", "Clickbait 🎣", "Influencer 📸", "Monetize 💰", "Sponsor 🤝", "Streaming 📺", "Playlist 🎵", "Podcast 🎧", "Vlog 📹", "NPC 🤖", "Respawn 🔄", "Checkpoint 🏁", "Glitch 👾", "Exploit 💻", "Speedrun 🏃", "Multiplayer 👥", "Co-op 🤝", "Loot 💎", "Inventory 🎒", "Crafting 🛠️", "Upgrade ⬆️", "Enchantment ✨", "Toxicity ☢️", "Meme 😂", "Troll 🧌", "Hater 😠", "Stan 🤩", "Fandom 👥", "Cosplay 🎭", "Convention 🎪", "Merch 👕", "Giveaway 🎁", "Unboxing 📦", "Tutorial 📚", "Lifehack 💡", "Prank 🤡", "Challenge 🏆", "Trendsetter ✨", "Icon 👑", "Idol 🎤", "Celebrity 🌟", "VIP 🎟️", "Paparazzi 📸", "Gossip 🗣️", "Rumor 🗣️", "Scandal 📰", "Drama 🎭", "Beef 🥩", "Collab 🤝", "Remix 🎵", "Acoustic 🎸", "Audiobook 📚", "E-book 📱", "Kindle 📱", "Tablet 📱", "Desktop 🖥️", "Monitor 🖥️", "Webcam 📹", "Power Bank 🔋", "Pixel 👾", "Resolution 📺", "OLED 📺", "Cinematic 🎥", "Perspective 👁️", "Phenomenon 🌠", "Controversial ⚡", "Unprecedented 🌟", "Mind-blowing 🤯", "Astonishing 😲", "Magnificent 🏰", "Spectacular ✨", "Breathtaking 😮", "Staggering 📈", "Astronomical 🔭", "Overwhelming 🌊", "Fascinating 🤩", "Captivating 🧲", "Mesmerizing 🌀", "Hypnotic 🌀", "Intoxicating 🍷", "Exhilarating 🎢", "Thrilling 🎢", "Terrifying 😱", "Horrifying 😱", "Petrifying 🪨", "Devastating 💔", "Heartbreaking 💔", "Tragic 🎭", "Catastrophic 🌋", "Disastrous 🌋", "Calamity 🌪️", "Doomsday ⏰", "Judgment ⚖️", "Reckoning ⚖️", "Redemption 🙏", "Salvation 🕊️", "Forgive 🕊️", "Vengeance 🗡️", "Revenge 🗡️", "Retribution ⚖️", "Karma 🔄", "Destiny ✨", "Fate 🔮", "Fortune 💰", "Luck 🍀", "Coincidence 🎯", "Serendipity ✨", "Miracle ✨", "Blessing 🙏", "Curse 🤬", "Hex 🔮", "Jinx 🐈‍⬛", "Superstition 🍀", "Omen 🔮", "Portent 🔮", "Premonition 🧠", "Deja Vu 🔄"
    ];

    // Combine into level-tagged objects — used for auto-fill AND level badge display
    let FALLBACK_VOCABULARY = [];
    if (state.selectedLevels.includes('B1+')) FALLBACK_VOCABULARY.push(...B1_WORDS.map(w => ({ word: w, level: 'B1+' })));
    if (state.selectedLevels.includes('B2')) FALLBACK_VOCABULARY.push(...B2_WORDS.map(w => ({ word: w, level: 'B2' })));
    if (state.selectedLevels.includes('B2+')) FALLBACK_VOCABULARY.push(...B2_PLUS_WORDS.map(w => ({ word: w, level: 'B2+' })));
    if (state.selectedLevels.includes('C1')) FALLBACK_VOCABULARY.push(...C1_WORDS.map(w => ({ word: w, level: 'C1' })));
    if (state.selectedLevels.includes('C2')) FALLBACK_VOCABULARY.push(...C2_WORDS.map(w => ({ word: w, level: 'C2' })));
    
    // Safety fallback in case they unchecked everything but we bypassed the check somehow
    if (FALLBACK_VOCABULARY.length === 0) {
        FALLBACK_VOCABULARY.push(...B1_WORDS.map(w => ({ word: w, level: 'B1+' })));
    }

    // Auto-fill using the full vocabulary pool for any remaining gaps
    if (state.allWords.length < FALLBACK_VOCABULARY.length) {
        console.log(`Only ${state.allWords.length} words submitted. Auto-filling from vocabulary list...`);
        let currentWordsLower = state.allWords.map(w => (w.word || w).toLowerCase());
        let backupList = [...FALLBACK_VOCABULARY];
        shuffleArray(backupList);
        for (let item of backupList) {
            if (!currentWordsLower.includes(item.word.toLowerCase())) {
                state.allWords.push({ word: item.word, team: '🤖 Auto', level: item.level });
                currentWordsLower.push(item.word.toLowerCase());
            }
        }
        console.log(`Auto-fill complete. Total Deck size: ${state.allWords.length}`);
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
    if (!state.globalTimerInterval) {
        state.globalTimerInterval = setInterval(tickGlobalTimer, 1000);
    }
    document.getElementById('global-timer-container').style.display = 'flex';
    updateGlobalTimerVisuals();
    startTurnSetup();
});

function tickGlobalTimer() {
    if (state.totalGameTimeLeft > 0) {
        state.totalGameTimeLeft--;
        updateGlobalTimerVisuals();
    }
}

function updateGlobalTimerVisuals() {
    const m = Math.floor(state.totalGameTimeLeft / 60);
    const s = state.totalGameTimeLeft % 60;
    const timeString = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    const el = document.getElementById('game-total-time');
    if (el) {
        el.textContent = timeString;
        if (state.totalGameTimeLeft <= 60 && state.totalGameTimeLeft > 0) {
            el.style.color = 'var(--danger)';
        } else if (state.totalGameTimeLeft <= 300 && state.totalGameTimeLeft > 0) {
            el.style.color = '#f59e0b'; // warning
        } else if (state.totalGameTimeLeft <= 0) {
            el.style.color = 'var(--danger)';
        } else {
            el.style.color = 'white';
        }
    }
}

document.getElementById('btn-inc-global-time').addEventListener('click', () => {
    state.totalGameTimeLeft += 60;
    state.totalGameDuration += 60; // Extend duration too
    updateGlobalTimerVisuals();
    playBeep(600, 'sine', 0.1);
});

document.getElementById('btn-dec-global-time').addEventListener('click', () => {
    state.totalGameTimeLeft = Math.max(0, state.totalGameTimeLeft - 60);
    updateGlobalTimerVisuals();
    playBeep(400, 'triangle', 0.1);
});

function startTurnSetup() {
    showScreen('gameplay');
    document.getElementById('game-controls-pre').classList.remove('hidden');
    document.getElementById('game-controls-active').classList.add('hidden');
    
    const team = state.teams[state.currentTeamIndex];
    document.getElementById('game-current-team').textContent = team.name;
    document.getElementById('game-words-remaining').textContent = state.deck.length;
    document.getElementById('game-current-score').textContent = '0';
    
    document.getElementById('current-word').textContent = "READY?";
    document.getElementById('current-word').classList.remove('gradient-text');
    document.getElementById('word-source').innerHTML = '';
    const levelBadge = document.getElementById('word-level-badge');
    if (levelBadge) {
        levelBadge.style.display = 'none';
        levelBadge.textContent = '';
    }
    
    document.getElementById('input-midgame-min').value = Math.floor(state.turnDuration / 60);
    document.getElementById('input-midgame-sec').value = state.turnDuration % 60;
    
    state.timeLeft = state.turnDuration;
    state.isPaused = false;
    state.isTurnActive = false;
    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) {
        pauseBtn.textContent = '⏸ Pause';
        pauseBtn.classList.remove('btn-primary');
        pauseBtn.classList.add('btn-secondary');
    }
    updateTimerVisuals();
    syncToProjector();
}

document.getElementById('btn-update-timer').addEventListener('click', () => {
    const min = parseInt(document.getElementById('input-midgame-min').value) || 0;
    const sec = parseInt(document.getElementById('input-midgame-sec').value) || 0;
    const newDuration = (min * 60) + sec;
    
    if (newDuration > 0) {
        state.turnDuration = newDuration;
        state.timeLeft = newDuration;
        updateTimerVisuals();
        syncToProjector();
        
        const btn = document.getElementById('btn-update-timer');
        const originalText = btn.textContent;
        btn.textContent = 'Updated!';
        btn.style.backgroundColor = 'var(--success)';
        btn.style.color = 'white';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.backgroundColor = '';
            btn.style.color = '';
        }, 1500);
    }
});

document.getElementById('btn-start-turn').addEventListener('click', () => {
    if (state.isTurnActive) return; // Prevent double clicks
    
    document.getElementById('game-controls-pre').classList.add('hidden');
    document.getElementById('game-controls-active').classList.remove('hidden');
    state.turnScore = 0;
    state.lastGuessedCards = [];
    state.turnLevelCycle = state.selectedLevels.length > 0 ? [...state.selectedLevels] : ['B1+'];
    state.currentCycleIndex = 0;
    state.isTurnActive = true;
    
    if (state.timer) clearInterval(state.timer);
    
    drawCard();
    
    state.timer = setInterval(tickTimer, 1000);
    syncToProjector();
});

function drawCard() {
    if (state.deck.length === 0) {
        endTurn(false);
        return;
    }
    
    let targetLevel = state.turnLevelCycle[state.currentCycleIndex];
    let validIndices = [];
    
    // Attempt to find cards for the target level
    for (let i = 0; i < state.deck.length; i++) {
        if (state.deck[i].level === targetLevel) {
            validIndices.push(i);
        }
    }
    
    // Fallback: If no cards of the target level are left, pick from whatever is available
    if (validIndices.length === 0) {
        validIndices = state.deck.map((_, i) => i);
    }
    
    const randomValidIdx = Math.floor(Math.random() * validIndices.length);
    state.currentWordIndex = validIndices[randomValidIdx];
    
    const cardEl = document.getElementById('word-card');
    
    cardEl.classList.remove('anim-pop');
    void cardEl.offsetWidth; 
    cardEl.classList.add('anim-pop');
    
    const card = state.deck[state.currentWordIndex];
    const wordText = card.word || card; // handle both object and string
    const teamText = card.team || '';
    const levelText = card.level || '';
    
    let displayHtml = `<span class="gradient-text">${wordText}</span>`;
    const parts = wordText.trim().split(' ');
    if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        // If the last part has no standard letters/numbers, assume it's an emoji/icon
        if (!/[a-zA-Z0-9]/.test(lastPart)) {
            parts.pop();
            const textPart = parts.join(' ');
            displayHtml = `<span class="gradient-text">${textPart}</span> <span>${lastPart}</span>`;
        }
    }
    
    document.getElementById('current-word').innerHTML = displayHtml;
    document.getElementById('current-word').classList.remove('gradient-text');
    
    const sourceEl = document.getElementById('word-source');
    if (teamText === '🤖 Auto') {
        sourceEl.innerHTML = `🤖 <span style="color: var(--text-muted); font-style: italic; opacity: 0.8;">Auto-filled</span>`;
    } else if (teamText) {
        sourceEl.innerHTML = `✏️ <span style="color: var(--text-muted); font-style: italic; opacity: 0.8;">by ${teamText}</span>`;
    } else {
        sourceEl.innerHTML = '';
    }

    const levelEl = document.getElementById('word-level-badge');
    if (levelEl) {
        if (levelText) {
            levelEl.textContent = levelText;
            levelEl.className = `level-badge level-${levelText.replace('+', 'plus').toLowerCase()}`;
            levelEl.style.display = 'inline-block';
        } else {
            levelEl.style.display = 'none';
        }
    }
}

function tickTimer() {
    if (state.isPaused) return;
    
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

function showTimeAnimation(text, colorClass) {
    const timerContainer = document.querySelector('.timer-container');
    if (!timerContainer) return;
    
    const animEl = document.createElement('div');
    animEl.className = `time-float-anim ${colorClass}`;
    animEl.textContent = text;
    
    timerContainer.appendChild(animEl);
    
    setTimeout(() => {
        animEl.remove();
    }, 1000);
}

function showScoreAnimation(text, colorClass) {
    const scoreContainer = document.querySelector('.round-score');
    if (!scoreContainer) return;
    
    const animEl = document.createElement('div');
    animEl.className = `score-float-anim ${colorClass}`;
    animEl.textContent = text;
    
    scoreContainer.appendChild(animEl);
    
    setTimeout(() => {
        animEl.remove();
    }, 1000);
}

document.getElementById('btn-inc-time').addEventListener('click', () => {
    state.timeLeft += 5;
    updateTimerVisuals();
    showTimeAnimation('+5s', 'text-success');
    syncToProjector();
});

document.getElementById('btn-dec-time').addEventListener('click', () => {
    state.timeLeft = Math.max(0, state.timeLeft - 5);
    updateTimerVisuals();
    showTimeAnimation('-5s', 'text-danger');
    syncToProjector();
});

document.getElementById('btn-got-it').addEventListener('click', () => {
    if (state.currentWordIndex === -1) return;
    
    const scoredCard = state.deck.splice(state.currentWordIndex, 1)[0];
    
    let points = 1;
    if (scoredCard.level === 'B2') points = 2;
    if (scoredCard.level === 'B2+') points = 3;
    if (scoredCard.level === 'C1') points = 4;
    if (scoredCard.level === 'C2') points = 5;
    
    state.turnScore += points;
    state.teams[state.currentTeamIndex].score += points;
    document.getElementById('game-current-score').textContent = state.turnScore;
    showScoreAnimation(`+${points}`, 'text-success');
    
    state.lastGuessedCards = state.lastGuessedCards || [];
    state.lastGuessedCards.push(scoredCard);
    document.getElementById('game-words-remaining').textContent = state.deck.length;
    
    // Advance difficulty cycle
    state.currentCycleIndex = (state.currentCycleIndex + 1) % state.turnLevelCycle.length;
    
    // Add +1 second bonus for correct guess
    state.timeLeft += 1;
    updateTimerVisuals();
    showTimeAnimation('+1s', 'text-success');
    
    playBeep(800, 'sine', 0.1);
    
    syncToProjector('gotIt');
    
    if (state.deck.length === 0) {
        endTurn(false);
    } else {
        drawCard();
    }
});

document.getElementById('btn-undo').addEventListener('click', () => {
    if (!state.lastGuessedCards || state.lastGuessedCards.length === 0) return;
    if (state.turnScore <= 0) return;
    
    const cardToReturn = state.lastGuessedCards.pop();
    
    let points = 1;
    if (cardToReturn.level === 'B2') points = 2;
    if (cardToReturn.level === 'B2+') points = 3;
    if (cardToReturn.level === 'C1') points = 4;
    if (cardToReturn.level === 'C2') points = 5;
    
    state.turnScore = Math.max(0, state.turnScore - points);
    state.teams[state.currentTeamIndex].score = Math.max(0, state.teams[state.currentTeamIndex].score - points);
    document.getElementById('game-current-score').textContent = state.turnScore;
    showScoreAnimation(`-${points}`, 'text-danger');
    state.deck.push(cardToReturn);
    document.getElementById('game-words-remaining').textContent = state.deck.length;
    
    // Revert difficulty cycle
    state.currentCycleIndex = (state.currentCycleIndex - 1 + state.turnLevelCycle.length) % state.turnLevelCycle.length;
    
    // Remove the +1 second bonus for the undone card
    state.timeLeft = Math.max(0, state.timeLeft - 1);
    updateTimerVisuals();
    showTimeAnimation('-1s', 'text-danger');
    
    playBeep(300, 'triangle', 0.1);
    syncToProjector();
});

document.getElementById('btn-pass').addEventListener('click', () => {
    playBeep(300, 'triangle', 0.1);
    
    // 2-second penalty for passing
    state.timeLeft = Math.max(0, state.timeLeft - 2);
    updateTimerVisuals();
    showTimeAnimation('-2s', 'text-warning');
    
    if (state.turnLevelCycle[state.currentCycleIndex] === 'B2+') {
        state.currentCycleIndex = 0;
    }
    
    drawCard();
    syncToProjector('pass');
    
    // End turn immediately if time is up after penalty
    if (state.timeLeft <= 0) {
        endTurn(false);
    }
});

document.getElementById('btn-foul').addEventListener('click', () => {
    playBeep(200, 'sawtooth', 0.5);
    endTurn(true);
    syncToProjector('foul');
});

document.getElementById('btn-pause').addEventListener('click', () => {
    state.isPaused = !state.isPaused;
    const btn = document.getElementById('btn-pause');
    if (state.isPaused) {
        btn.textContent = '▶ Resume';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        playBeep(400, 'sine', 0.1);
    } else {
        btn.textContent = '⏸ Pause';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        playBeep(600, 'sine', 0.1);
    }
    syncToProjector(state.isPaused ? 'paused' : 'resumed');
});



document.getElementById('btn-update-timer').addEventListener('click', () => {
    const minVal = parseInt(document.getElementById('input-midgame-min').value, 10) || 0;
    const secVal = parseInt(document.getElementById('input-midgame-sec').value, 10) || 0;
    
    const totalSeconds = (minVal * 60) + secVal;
    
    if (totalSeconds >= 10 && totalSeconds <= 600) {
        state.turnDuration = totalSeconds;
        state.timeLeft = totalSeconds;
        updateTimerVisuals();
        playBeep(600, 'sine', 0.1);
        syncToProjector('timer-adjusted');
    }
});


function endTurn(wasFoul) {
    if (!state.isTurnActive) return; // Prevent double firing
    state.isTurnActive = false;
    
    clearInterval(state.timer);
    state.timer = null;
    
    // Track how many turns this team has played
    if (state.teams[state.currentTeamIndex]) {
        state.teams[state.currentTeamIndex].turnsPlayed = (state.teams[state.currentTeamIndex].turnsPlayed || 0) + 1;
    }
    
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
    
    const selectEl = document.getElementById('select-next-team');
    const summaryNext = document.getElementById('summary-next-team');
    selectEl.innerHTML = '';
    
    let teamIndices = state.teams.map((t, i) => i);
    teamIndices.sort((a, b) => {
        const turnsA = state.teams[a].turnsPlayed || 0;
        const turnsB = state.teams[b].turnsPlayed || 0;
        if (turnsA !== turnsB) return turnsA - turnsB;
        
        // If tied, natural rotation from the team that just played
        let distA = a - state.currentTeamIndex;
        if (distA <= 0) distA += state.teams.length;
        let distB = b - state.currentTeamIndex;
        if (distB <= 0) distB += state.teams.length;
        
        return distA - distB;
    });

    const recommendedNextIndex = teamIndices[0];
    
    state.teams.forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        const turns = t.turnsPlayed || 0;
        opt.textContent = `${t.name} (${turns} turn${turns === 1 ? '' : 's'})`;
        selectEl.appendChild(opt);
    });
    
    selectEl.value = recommendedNextIndex;
    selectEl.style.display = 'inline-block';
    summaryNext.style.display = 'none';
    
    const btnNext = document.getElementById('btn-next-turn');
    if (state.totalGameDuration > 0 && state.totalGameTimeLeft <= 0) {
        const minTurns = state.teams[teamIndices[0]].turnsPlayed || 0;
        const maxTurns = state.teams[teamIndices[state.teams.length - 1]].turnsPlayed || 0;
        
        if (minTurns === maxTurns) {
            selectEl.style.display = 'none';
            summaryNext.style.display = 'block';
            summaryNext.innerHTML = "<span class='text-danger'>Game Over - Time's Up!</span>";
            btnNext.textContent = "End Game";
            btnNext.className = "btn-primary mt-4 btn-large pulse";
            btnNext.style.background = "var(--danger)";
        } else {
            selectEl.style.display = 'none';
            summaryNext.style.display = 'block';
            summaryNext.innerHTML = `${state.teams[recommendedNextIndex].name} <span style="font-size: 0.8rem; color: #f59e0b; display: block; margin-top: 0.5rem;">(Final turns to balance the round!)</span>`;
            state.currentTeamIndex = recommendedNextIndex; // Lock it in for the final balance turns
            btnNext.textContent = "Continue";
            btnNext.className = "btn-primary mt-4 btn-large";
            btnNext.style.background = "";
        }
    } else {
        btnNext.textContent = "Continue";
        btnNext.className = "btn-primary mt-4 btn-large";
        btnNext.style.background = "";
    }
    
    syncToProjector();
}

document.getElementById('btn-next-turn').addEventListener('click', () => {
    const selectEl = document.getElementById('select-next-team');
    if (selectEl.style.display !== 'none') {
        state.currentTeamIndex = parseInt(selectEl.value, 10);
    }

    if (state.deck.length === 0) {
        endGame();
    } else if (state.totalGameDuration > 0 && state.totalGameTimeLeft <= 0) {
        const turns = state.teams.map(t => t.turnsPlayed || 0);
        const minTurns = Math.min(...turns);
        const maxTurns = Math.max(...turns);
        if (minTurns === maxTurns) {
            endGame();
        } else {
            startTurnSetup();
        }
    } else {
        startTurnSetup();
    }
});

// --- PROJECTOR SYNC ---
function syncToProjector(eventName = null) {
    if (!state.roomId) return;
    
    let phase = 'waiting'; // default fallback
    
    if (screens.welcome.classList.contains('active')) phase = 'welcome';
    else if (screens.howToPlay.classList.contains('active')) phase = 'how-to-play';
    else if (screens.rules.classList.contains('active')) phase = 'rules';
    else if (screens.setup.classList.contains('active')) phase = 'setup';
    else if (screens.submission.classList.contains('active')) phase = 'submission';
    else if (screens.roundIntro.classList.contains('active')) phase = 'round-intro';
    else if (screens.gameplay.classList.contains('active')) phase = 'playing';
    else if (screens.turnSummary.classList.contains('active')) phase = 'turn-summary';
    else if (screens.gameOver.classList.contains('active')) phase = 'game-over';
    
    let currentWords = 0;
    if (phase === 'playing' || phase === 'turn-summary' || phase === 'round-intro') {
        currentWords = state.deck ? state.deck.length : 0;
    } else {
        currentWords = parseInt(document.getElementById('live-word-count').textContent) || state.allWords.length || 0;
    }
    
    socket.emit('hostUpdate', {
        roomId: state.roomId,
        phase: phase,
        teams: state.teams,
        currentTeam: state.teams[state.currentTeamIndex] || null,
        turnScore: state.turnScore,
        timeLeft: state.timeLeft,
        wordCount: currentWords,
        lastGuessedCards: state.lastGuessedCards || [],
        event: eventName
    });
}

// --- GAME OVER PHASE ---

function endGame() {
    if (state.globalTimerInterval) {
        clearInterval(state.globalTimerInterval);
        state.globalTimerInterval = null;
    }
    
    showScreen('gameOver');
    
    const sortedTeams = [...state.teams].sort((a, b) => b.score - a.score);
    
    const board = document.getElementById('final-scoreboard');
    board.innerHTML = '';
    
    sortedTeams.forEach((team, index) => {
        const row = document.createElement('div');
        row.className = `score-row ${index === 0 ? 'winner' : ''}`;
        
        const turnsCount = team.turnsPlayed || 0;
        
        row.innerHTML = `
            <div class="team-name-disp">
                ${index === 0 ? '🏆 ' : ''}${index + 1}. ${team.name}
                <span style="font-size: 0.7rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 0.2rem 0.5rem; border-radius: 6px; margin-left: 0.5rem; font-weight: normal;">${turnsCount} ${turnsCount === 1 ? 'turn' : 'turns'}</span>
            </div>
            <div class="team-score-disp">${team.score} pts</div>
        `;
        board.appendChild(row);
    });
    
    playBeep(600, 'sine', 0.1);
    setTimeout(() => playBeep(800, 'sine', 0.1), 150);
    setTimeout(() => playBeep(1000, 'sine', 0.3), 300);
    
    const counts = { 'B1+': 0, 'B2': 0, 'B2+': 0, 'C1': 0, 'C2': 0 };
    state.allWords.forEach(w => {
        const isInDeck = state.deck.some(d => d.word === w.word);
        if (!isInDeck && counts[w.level] !== undefined) {
            counts[w.level]++;
        }
    });
    
    const ctx = document.getElementById('guessed-words-chart').getContext('2d');
    if (guessedWordsChart) guessedWordsChart.destroy();
    guessedWordsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['B1+', 'B2', 'B2+', 'C1', 'C2'],
            datasets: [{
                label: 'Words Guessed',
                data: [counts['B1+'], counts['B2'], counts['B2+'], counts['C1'], counts['C2']],
                backgroundColor: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                x: { ticks: { color: '#fff', font: { family: 'Inter', weight: 'bold' } }, grid: { display: false } }
            },
            layout: { padding: 0 }
        }
    });
    
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


