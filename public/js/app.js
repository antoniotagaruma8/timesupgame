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

    roomId: null
};

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
    copyProjectorLink(this, "🔗", "✓");
});

// --- SETUP PHASE ---

const inputMinutes = document.getElementById('timer-minutes');
const inputSeconds = document.getElementById('timer-seconds');

document.getElementById('btn-open-submissions').addEventListener('click', () => {
    state.teams = []; // Reset teams on new room creation
    
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

document.getElementById('btn-close-submit').addEventListener('click', () => {
    if (state.teams.length < 2) {
        alert("Please wait for at least two teams to join!");
        return;
    }
    
    // Allowing 0 words since auto-fill will populate the bank with 500 words anyway.

    const B1_WORDS = [
        "Destination 📍","Celebration 🎉","Competition 🏆","Pollution 🏭","Environment 🌳",
        "Atmosphere ☁️","Temperature 🌡️","Advertisement 📺","Ingredient 🧂","Signature ✍️",
        "Neighborhood 🏘️","Tradition 🏮","Ceremony 🎖️","Personality 🧠","Friendship 👫",
        "Argument 🗣️","Discussion 💬","Vocabulary 📖","Dictionary 📚","Password 🔑",
        "Keyboard ⌨️","Screen 🖥️","Document 📄","Message ✉️","Audience 👥",
        "Performance 🎭","Character 🦸","Director 🎬","Musician 🎸","Instrument 🎺",
        "Concert 🎫","Stadium 🏟️","Champion 🥇","Referee 🦓","Tournament 🏆",
        "Backpack 🎒","Suitcase 🧳","Passenger 🧍","Flight ✈️","Pilot 🧑‍✈️",
        "Airport 🛬","Platform 🚉","Ticket 🎟️","Receipt 🧾","Discount 🏷️",
        "Customer 🛒","Manager 👔","Employee 👷","Interview 🎤","Salary 💰",
        "Company 🏢","Bicycle 🚲","Motorcycle 🏍️","Subway 🚇","Skateboard 🛹",
        "Umbrella ☂️","Jacket 🧥","Sweater 🧶","Scarf 🧣","Gloves 🧤",
        "Boots 👢","Sneakers 👟","Sandals 🩴","Pajamas 🛌","Swimsuit 🩱",
        "Towel 🧖","Blanket 🛏️","Pillow 😴","Furniture 🛋️","Bookshelf 📚",
        "Wardrobe 🚪","Mirror 🪞","Curtain 🪟","Garden 🪴","Garage 🚘",
        "Fireplace 🔥","Kitchen 🍳","Bathroom 🛁","Bedroom 🛏️","Restaurant 🍽️",
        "Bakery 🥐","Supermarket 🛒","Pharmacy 💊","Hospital 🏥","Dentist 🦷",
        "Doctor 👨‍⚕️","Nurse 👩‍⚕️","Ambulance 🚑","Emergency 🚨","Accident 💥",
        "Traffic 🚦","Vehicle 🚗","Engine ⚙️","Police 👮","Firefighter 👨‍🚒",
        "Alarm 🔔","Planet 🪐","Rocket 🚀","Ocean 🌊","River 🏞️",
        "Mountain ⛰️","Forest 🌲","Desert 🐪","Island 🏝️","Beach 🏖️",
        "Dolphin 🐬","Penguin 🐧","Elephant 🐘","Giraffe 🦒","Butterfly 🦋",
        "Crocodile 🐊","Kangaroo 🦘","Octopus 🐙","Volcano 🌋","Earthquake 🫨",
        "Hurricane 🌀","Flood 🌊","Medicine 💊","Compass 🧭","Lighthouse 🏠",
        "Treasure 💎","Sandwich 🥪","Pineapple 🍍","Mushroom 🍄","Strawberry 🍓",
        "Watermelon 🍉","Chocolate 🍫","Hamburger 🍔","Pancake 🥞","Lemonade 🍋",
        "Broccoli 🥦","Avocado 🥑","Cinnamon 🫚","Popcorn 🍿","Calendar 📅",
        "Envelope ✉️","Newspaper 📰","Magazine 📖","Notebook 📓","Scissors ✂️",
        "Staircase 🪜","Candle 🕯️","Battery 🔋","Microwave 📡","Refrigerator 🧊",
        "Washing Machine 🫧","Camera 📷","Headphones 🎧","Sunglasses 🕶️",
        "Necklace 📿","Bracelet 💍","Toothbrush 🪥","Wheelchair 🦽","Parachute 🪂",
        "Laptop 💻","Backyard 🏡",
        "Library 📚", "Television 📺", "Telephone ☎️", "Elevator 🛗", "Escalator 🎢", "Tractor 🚜", "Truck 🛻", "Bus 🚌", "Train 🚆", "Piano 🎹", "Violin 🎻", "Drums 🥁", "Singer 🎤", "Actor 🎭", "Painter 🎨", "Chef 🧑‍🍳", "Waiter 🍽️", "Mechanic 🔧", "Farmer 🌾", "Scientist 🔬", "Teacher 👩‍🏫", "Student 🎒", "Classroom 🏫", "Computer 💻", "Mouse 🖱️", "Printer 🖨️", "Smartphone 📱", "Tablet 📱", "Charger 🔌", "Wallet 👛", "Purse 👜", "Coins 🪙", "Credit Card 💳", "Cash 💵", "Market 🍎", "Butcher 🥩", "Cafe ☕", "Menu 📋", "Recipe 🍳", "Breakfast 🥞", "Lunch 🥗", "Dinner 🍲", "Dessert 🍰", "Ice Cream 🍦", "Cake 🎂", "Cookie 🍪", "Apple 🍎", "Banana 🍌", "Orange 🍊", "Grapes 🍇", "Cherry 🍒", "Peach 🍑", "Pear 🍐", "Lemon 🍋", "Tomato 🍅", "Potato 🥔", "Carrot 🥕", "Onion 🧅", "Garlic 🧄", "Cheese 🧀", "Butter 🧈", "Bread 🍞", "Egg 🥚", "Chicken 🍗", "Fish 🐟", "Beef 🥩", "Salad 🥗", "Soup 🥣", "Rice 🍚", "Pasta 🍝", "Pizza 🍕", "Juice 🧃", "Coffee ☕"
    ];
    const B2_WORDS = [
        "Submarine 🚢","Binoculars 🔭","Handcuffs 🔗","Helicopter 🚁","Microscope 🔬",
        "Avalanche 🏔️","Skeleton 💀","Sculpture 🗿","Orchestra 🎻","Architecture 🏛️",
        "Laboratory 🧪","Thermometer 🌡️","Baggage 🧳","Symphony 🎼","Choreography 💃",
        "Camouflage 🦎","Catastrophe 💥","Negotiation 🤝","Fossil 🦕","Monument 🗽",
        "Exhibition 🖼️","Gallery 🎨","Masterpiece 🖌️","Canvas 🎨","Portrait 🖼️",
        "Landscape 🏞️","Tapestry 🧵","Ballet 🩰","Opera 🎭","Composer 🎼",
        "Conductor 🪗","Applause 👏","Encore 🎬","Microphone 🎤","Amphitheater 🏟️",
        "Harmony 🎶","Rhythm 🥁","Melody 🎵","Stethoscope 🩺","Prescription 📜",
        "Surgeon 😷","Diagnosis 🔍","Quarantine 🏥","Vaccination 💉","Antibiotic 💊",
        "Adrenaline ⚡","Metabolism 🔄","Chromosome 🧬","Ecosystem 🌿","Photosynthesis 🌱",
        "Constellation 🌟","Astronaut 👨‍🚀","Satellite 🛰️","Orbit 🔄","Spacecraft 🛸",
        "Meteorite ☄️","Observatory 🏛️","Gravity ⬇️","Hemisphere 🌍",
        "Peninsula 🗺️","Archipelago 🏝️","Glacier 🧊","Tsunami 🌊","Tornado 🌪️",
        "Drought 🏜️","Monsoon 🌧️","Blizzard ❄️","Quicksand ⏳","Whirlpool 🌀",
        "Silhouette 🌑","Kaleidoscope 🔮","Chandelier 💡","Pendulum ⏱️","Periscope 🔭",
        "Tightrope 🎪","Trampoline 🤸","Catapult 🏰","Boomerang 🪃","Guillotine ⚔️",
        "Typewriter ⌨️","Gramophone 🎵","Stagecoach 🐎","Drawbridge 🏰","Portcullis 🏰",
        "Aquarium 🐠","Terrarium 🦎","Greenhouse 🌱","Windmill 🌬️","Waterfall 💧",
        "Thunderstorm ⛈️","Labyrinth 🏛️","Souvenir 🎁","Fireworks 🎆",
        "Trident 🔱","Hammock 🏝️","Canopy 🌳","Propeller ✈️","Perimeter 📐",
        "Barometer 🌡️","Thermostat 🌡️","Speedometer 🏎️","Odometer 🚗",
        "Altimeter ⛰️","Hourglass ⏳","Sundial ☀️","Metronome 🎵",
        "Xylophone 🎶","Saxophone 🎷","Accordion 🪗","Tambourine 🥁","Harmonica 🎵",
        "Clarinet 🎵","Trombone 🎺","Banjo 🪕","Ukulele 🎸","Harpoon 🎣",
        "Anchor ⚓","Rudder 🚢","Lifeboat 🛟","Flagship 🚢",
        "Caravan 🐫","Gondola 🛶","Toboggan 🛷","Rickshaw 🛺","Chariot 🏇",
        "Monocle 🧐","Turban 🧕","Tiara 👑","Gauntlet 🧤","Medallion 🏅",
        "Goblet 🏆","Chalice 🍷","Cauldron 🫕","Scepter 👑","Horoscope ♈",
        "Mascot 🐶","Talisman 🧿","Pharaoh 🐫","Pyramid 🔺","Obelisk 🏛️",
        "Gargoyle 🐉","Sphinx 🦁","Centaur 🐎","Pegasus 🦄","Griffin 🦅",
        "Dragon 🐲","Phoenix 🔥",
        "Speaker 🔊", "Projector 📽️", "Whiteboard 🖍️", "Calculator 🧮", "Generator ⚡", "Motor 🚤", "Wheel 🛞", "Tire 🛞", "Brake 🛑", "Gear ⚙️", "Seatbelt 💺", "Airbag 🎈", "Windshield 🚙", "Headlight 💡", "Exhaust 💨", "Paint 🎨", "Polish ✨", "Wax 🕯️", "Soap 🧼", "Sponge 🧽", "Bucket 🪣", "Hose 🚿", "Vacuum 🌪️", "Brush 🖌️", "Comb 梳", "Razor 🪒", "Deodorant 🧴", "Perfume 🧴", "Lotion 🧴", "Sunscreen 🧴", "Toothpaste 🧴", "Floss 🧵", "Mouthwash 🧴", "Shampoo 🧴", "Conditioner 🧴", "Bathrobe 🥋", "Slippers 🥿", "Underwear 🩲", "Socks 🧦", "Leggings 👖", "Pants 👖", "Jeans 👖", "Shorts 👖", "Skirt 👗", "Dress 👗", "Shirt 👕", "Blouse 👚", "Cardigan 🧥", "Collar 👔", "Sleeve 👕", "Pocket 👖", "Zipper 🤐", "Button 🔘", "Thread 🧵", "Needle 🪡", "Thimble 🧵", "Fabric 🧶", "Silk 🐛", "Cotton ☁️", "Wool 🐑", "Leather 👞", "Denim 👖", "Velvet 🧣", "Lace 🎀", "Ribbon 🎀", "Helmet ⛑️"
    ];
    const C1_WORDS = [
        "Philanthropy 🤲","Bureaucracy 🏛️","Sovereignty 👑","Jurisdiction ⚖️","Legislature 📜",
        "Diplomacy 🕊️","Propaganda 📢","Censorship ✂️","Referendum 🗳️","Amnesty 🕊️",
        "Paradox 🔄","Hypothesis 🧪","Phenomenon 🌟","Algorithm 💻","Encryption 🔐",
        "Cybersecurity 🛡️","Infrastructure 🏗️","Sustainability 🌿","Biodiversity 🦜","Deforestation 🪵",
        "Gentrification 🏘️","Globalization 🌐","Immigration 🛂","Assimilation 🤝","Emancipation ⛓️",
        "Renaissance 🎨","Enlightenment 💡","Revolution 🔄","Colonialism 🗺️","Imperialism 👑",
        "Aristocracy 🏰","Oligarchy 💰","Dictatorship ⚔️","Anarchy 🏴","Democracy 🗳️",
        "Capitalism 💵","Socialism 🤝","Communism ☭","Meritocracy 🏅","Theocracy ⛪",
        "Eloquence 🎤","Rhetoric 📣","Metaphor 🌀","Allegory 📖","Satire 🎭",
        "Plagiarism 📝","Manuscript 📜","Anthology 📚","Autobiography 📖","Monologue 🎭",
        "Soliloquy 🎭","Protagonist 🦸","Antagonist 🦹","Cliffhanger 🧗","Epilogue 📖",
        "Reconnaissance 🔭","Espionage 🕵️","Sabotage 💣","Subterfuge 🎭","Ambush ⚔️",
        "Barricade 🚧","Fortification 🏰","Ammunition 🎯","Artillery 💥","Surveillance 📹",
        "Interrogation ❓","Prosecution ⚖️","Acquittal ✅","Extradition 🛫",
        "Bankruptcy 📉","Monopoly 🎩","Conglomerate 🏢","Embezzlement 💸","Litigation ⚖️",
        "Arbitration ⚖️","Jurisprudence 📚","Precedent 📜","Amendment 📝","Constitution 📜",
        "Pandemonium 😱","Calamity 💥","Turbulence ✈️","Upheaval 🌊",
        "Resurgence 📈","Deterioration 📉","Stagnation 🔄","Proliferation 📊","Culmination 🏔️",
        "Juxtaposition 🔀","Conundrum 🤔","Quandary ❓","Predicament 😰","Dilemma ⚖️",
        "Epiphany 💡","Revelation 🌟","Premonition 🔮","Intuition 🧠","Perception 👁️",
        "Consciousness 🧠","Subconscious 💭","Hallucination 🌀","Meditation 🧘","Tranquility 🕊️",
        "Melancholy 🌧️","Nostalgia 📷","Serendipity ✨","Euphoria 🎆","Wanderlust 🌍",
        "Sarcasm 😏","Irony 🎭","Hypocrisy 🎭","Altruism 💝","Narcissism 🪞",
        "Charisma ✨","Resilience 💪","Perseverance 🏃","Tenacity 🦾","Ambiguity 🔮",
        "Anonymity 🎭","Authenticity ✅","Vulnerability 💔","Solidarity 🤝","Unanimity ✊",
        "Exaggeration 📢","Understatement 🤏","Contradiction 🔄","Coincidence 🎯","Consequence ⚡",
        "Procrastination ⏰","Claustrophobia 😨","Vertigo 🌀","Insomnia 😵","Amnesia 🧠",
        "Catacombs 💀","Colosseum 🏟️","Acropolis 🏛️","Parthenon 🏛️",
        "Hieroglyphics 📜","Papyrus 📃","Archaeology 🦴","Anthropology 🧬","Etymology 📖",
        "Calligraphy ✒️","Origami 🦢","Ventriloquism 🎭","Pantomime 🤡","Puppeteer 🎭",
        "Mosaic 🎨","Fresco 🖼️","Terracotta 🏺","Porcelain 🍶",
        "Marionette 🎭","Xenophobia 🚫","Agoraphobia 🏃","Kleptomania 💎","Megalomania 👑",
        "Omnipresence 🌌","Omniscience 🧠","Omnipotence 💪",
        "Philosopher 🤔", "Metaphysics 🌌", "Aesthetics 🎨", "Ethics ⚖️", "Syntax 📝", "Semantics 🧠", "Bilingualism 🗣️", "Multilingualism 🌍", "Inflation 📈", "Deflation 📉", "Recession 📉", "Depression 😔", "Oligopoly 🏢", "Cartel 💰", "Tariff 📜", "Quota 📊", "Embargo 🚫", "Sanction ⚖️", "Treaty 🤝", "Alliance 🤝", "Coalition 🤝", "Federation 🏛️", "Confederation 🏛️", "Republic 🏛️", "Monarchy 👑", "Empire 🌍", "Colony 🗺️", "Protectorate 🛡️", "Dominion 🌍", "Mandate 📜", "Territory 🗺️", "Province 🗺️", "State 🏛️", "County 🗺️", "Municipality 🏙️", "District 🗺️", "Borough 🏙️", "Parish ⛪", "Ward 🗺️", "Precinct 🗺️", "Community 👥", "Society 👥", "Culture 🎭", "Civilization 🏛️", "Custom 🏮", "Habit 🔄", "Ritual 🕯️", "Festival 🎉", "Holiday 🏖️", "Vacation 🏖️", "Journey 🌍", "Voyage 🚢", "Expedition 🧗", "Pilgrimage ⛪", "Crusade ⚔️", "Ideology 🧠", "Theology ⛪", "Heresy 🕯️", "Orthodoxy 📜", "Paradigm 🔄", "Dogma 📜"
    ];

    // Combine into level-tagged objects — used for auto-fill AND level badge display
    const FALLBACK_VOCABULARY = [
        ...B1_WORDS.map(w => ({ word: w, level: 'B1+' })),
        ...B2_WORDS.map(w => ({ word: w, level: 'B2'  })),
        ...C1_WORDS.map(w => ({ word: w, level: 'C1'  }))
    ];

    // Auto-fill up to 500 words using the full vocabulary pool
    if (state.allWords.length < 500) {
        console.log(`Only ${state.allWords.length} words submitted. Auto-filling to 500...`);
        let currentWordsLower = state.allWords.map(w => (w.word || w).toLowerCase());
        let backupList = [...FALLBACK_VOCABULARY];
        shuffleArray(backupList);
        for (let item of backupList) {
            if (state.allWords.length >= 500) break;
            if (!currentWordsLower.includes(item.word.toLowerCase())) {
                state.allWords.push({ word: item.word, team: '🤖 Auto', level: item.level });
                currentWordsLower.push(item.word.toLowerCase());
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
    if (state.totalGameDuration > 0 && !state.globalTimerInterval) {
        state.globalTimerInterval = setInterval(tickGlobalTimer, 1000);
        document.getElementById('global-timer-container').style.display = 'flex';
        updateGlobalTimerVisuals();
    }
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
    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) {
        pauseBtn.textContent = '⏸ Pause';
        pauseBtn.classList.remove('btn-primary');
        pauseBtn.classList.add('btn-secondary');
    }
    updateTimerVisuals();
    syncToProjector();
}

document.getElementById('btn-start-turn').addEventListener('click', () => {
    document.getElementById('game-controls-pre').classList.add('hidden');
    document.getElementById('game-controls-active').classList.remove('hidden');
    state.turnScore = 0;
    state.lastGuessedCards = [];
    state.turnLevelCycle = ['B1+', 'B2', 'C1'];
    state.currentCycleIndex = 0;
    
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
    animEl.className = `time-float-anim ${colorClass}`;
    animEl.style.fontSize = '1.8rem';
    animEl.style.left = '80%'; // Offset a bit to the right of the score
    animEl.textContent = text;
    
    scoreContainer.appendChild(animEl);
    
    setTimeout(() => {
        animEl.remove();
    }, 1000);
}

document.getElementById('btn-got-it').addEventListener('click', () => {
    if (state.currentWordIndex === -1) return;
    
    const scoredCard = state.deck.splice(state.currentWordIndex, 1)[0];
    
    let points = 1;
    if (scoredCard.level === 'B2') points = 2;
    if (scoredCard.level === 'C1') points = 3;
    
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
    if (cardToReturn.level === 'C1') points = 3;
    
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
    
    const btnNext = document.getElementById('btn-next-turn');
    if (state.totalGameDuration > 0 && state.totalGameTimeLeft <= 0) {
        if (state.currentTeamIndex === 0) {
            document.getElementById('summary-next-team').innerHTML = "<span class='text-danger'>Game Over - Time's Up!</span>";
            btnNext.textContent = "End Game";
            btnNext.className = "btn-primary mt-4 btn-large pulse";
            btnNext.style.background = "var(--danger)";
        } else {
            document.getElementById('summary-next-team').innerHTML = `${state.teams[state.currentTeamIndex].name} <span style="font-size: 0.8rem; color: #f59e0b; display: block; margin-top: 0.5rem;">(Final turns to balance the round!)</span>`;
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
    if (state.deck.length === 0) {
        endGame();
    } else if (state.totalGameDuration > 0 && state.totalGameTimeLeft <= 0 && state.currentTeamIndex === 0) {
        endGame();
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
    
    socket.emit('hostUpdate', {
        roomId: state.roomId,
        phase: phase,
        teams: state.teams,
        currentTeam: state.teams[state.currentTeamIndex] || null,
        turnScore: state.turnScore,
        timeLeft: state.timeLeft,
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


