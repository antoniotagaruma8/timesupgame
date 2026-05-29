const fs = require('fs');
const content = fs.readFileSync('public/js/app.js', 'utf8');

// Extract existing
const b1Match = content.match(/const B1_WORDS = \[([\s\S]*?)\];/);
const b2Match = content.match(/const B2_WORDS = \[([\s\S]*?)\];/);
const b2PlusMatch = content.match(/const B2_PLUS_WORDS = \[([\s\S]*?)\];/);

let b1 = b1Match[1].split(',').map(s => s.trim().replace(/^\"|\"$/g, '')).filter(Boolean);
let b2 = b2Match[1].split(',').map(s => s.trim().replace(/^\"|\"$/g, '')).filter(Boolean);
let b2p = b2PlusMatch[1].split(',').map(s => s.trim().replace(/^\"|\"$/g, '')).filter(Boolean);

const newB1 = [
    'Message 💬', 'Follower 📱', 'Hashtag #️⃣', 'Profile 👤', 'Notification 🔔', 
    'Download ⬇️', 'Upload ⬆️', 'Password 🔑', 'WiFi 📶', 'Screen Time ⏳', 
    'Vlog 📹', 'Camera 📷', 'Filter 📸', 'Comments 💬', 'Group Chat 📱', 
    'Emoji 😂', 'App 📱', 'Internet 🌐', 'Website 💻', 'Link 🔗', 
    'Viral Video 📹', 'Funny 🤣', 'Laugh 😂', 'Smile 😁', 'Bored 🥱', 
    'Tired 😴', 'Angry 😠', 'Surprise 😲', 'Fear 😨', 'Love ❤️', 
    'Hate 💔', 'Cry 😢', 'Party 🎉', 'Birthday 🎂', 'Gift 🎁', 
    'Cake 🍰', 'Dance 💃', 'Music 🎵', 'Band 🎸', 'Guitar 🎸', 
    'Piano 🎹', 'Drums 🥁', 'Song 🎵', 'Pop Music 🎵', 'Rock Music 🎸', 
    'Rap 🎤', 'K-Pop 🇰🇷', 'Movie Theater 🍿', 'Popcorn 🍿', 'Television 📺', 
    'Netflix 🍿', 'YouTube 📹', 'TikTok 📱', 'Instagram 📸', 'Snapchat 👻', 
    'Discord 🎮', 'Twitch 🎮', 'Gaming 🎮', 'Controller 🎮', 'Mouse 🖱️', 
    'Headset 🎧', 'Level Up ⬆️', 'Boss Fight 👾', 'Noob 👶', 'Pro Player 🎮', 
    'Cheat Code ⌨️', 'High Score 💯', 'Victory 🏆', 'Defeat 💔', 'School 🏫', 
    'Classroom 🏫', 'Student 🎒', 'Backpack 🎒', 'Notebook 📓', 'Pen 🖊️', 
    'Pencil ✏️', 'Eraser 🧽', 'Calculator 🧮', 'Whiteboard 🖍️', 'Recess ⚽', 
    'Cafeteria 🍕', 'Lunch 🥪', 'Library 📚', 'Book 📖', 'Dictionary 📖', 
    'Science 🔬', 'Math 🧮', 'History 🌍', 'Geography 🗺️', 'Art 🎨', 
    'Gym Class ⚽', 'Bus 🚌', 'Bicycle 🚲', 'Skateboard 🛹', 'Car 🚗', 
    'Driving 🚗', 'Traffic 🚦', 'Mall 🛍️', 'Clothes 👕', 'Shoes 👟', 
    'Jacket 🧥', 'Jeans 👖', 'T-shirt 👕', 'Dress 👗', 'Sunglasses 🕶️', 
    'Hat 🧢', 'Watch ⌚', 'Money 💵', 'Wallet 👛', 'Price 🏷️', 
    'Cheap 📉', 'Expensive 📈', 'Sale 🏷️', 'Cash 💵', 'Credit Card 💳', 
    'Supermarket 🛒', 'Restaurant 🍽️', 'Menu 📖', 'Waiter 💁', 'Tip 💵', 
    'Bill 🧾', 'Food 🍔', 'Drink 🥤', 'Water 💧', 'Juice 🧃', 
    'Soda 🥤', 'Coffee ☕', 'Tea 🍵', 'Milk 🥛', 'Breakfast 🍳', 
    'Dinner 🍝', 'Dessert 🍰', 'Ice Cream 🍦', 'Chocolate 🍫', 'Candy 🍬', 
    'Fruit 🍎', 'Vegetable 🥦', 'Meat 🥩', 'Fish 🐟', 'Chicken 🍗', 
    'Bread 🍞', 'Cheese 🧀', 'Egg 🥚', 'Sneakers 👟', 'Hoodie 🧥', 'Outfit 👗', 
    'Vibe 🌊', 'Aesthetic ✨', 'Cringe 😬'
];

const newB2 = [
    'Overwhelmed 😵', 'Fascinated 🤩', 'Frustrated 😤', 'Disappointed 😞', 'Inspired 💡',
    'Creative 🎨', 'Ambitious 🚀', 'Confident 😎', 'Awkward 😬', 'Embarrassing 😳',
    'Hilarious 😂', 'Ridiculous 🤡', 'Fictional 🐉', 'Legendary 👑', 'Epic ⚔️',
    'Tragic 🎭', 'Mysterious 🕵️', 'Haunted 👻', 'Creepy 🕷️', 'Disgusting 🤢',
    'Delicious 😋', 'Spicy 🌶️', 'Healthy 🥗', 'Unhealthy 🍔', 'Allergic 🤧',
    'Addictive 📱', 'Productive 📈', 'Lazy 🦥', 'Energetic ⚡', 'Exhausted 😫',
    'Atmosphere ☁️', 'Temperature 🌡️', 'Forecast 🌦️', 'Storm ⛈️', 'Hurricane 🌪️',
    'Earthquake 🌍', 'Disaster 🌋', 'Emergency 🚨', 'Ambulance 🚑', 'Police 👮',
    'Firefighter 🧑‍🚒', 'Hospital 🏥', 'Surgery 🩺', 'Medicine 💊', 'Recovery ❤️‍🩹',
    'Infection 🦠', 'Immunity 🛡️', 'Fitness 💪', 'Muscles 💪', 'Stretching 🧘',
    'Yoga 🧘', 'Medal 🏅', 'Trophy 🏆', 'Competition 🏁', 'Strategy 🧠',
    'Tactics ♟️', 'Defense 🛡️', 'Offense ⚔️', 'Penalty 🟥', 'Foul 🚫',
    'Injury 🤕', 'Coach 🧢', 'Captain 👨‍✈️', 'Teammate 🤝', 'Opponent 🦹',
    'Rival ⚔️', 'Alliance 🤝', 'Betray 🗡️', 'Forgive 🕊️', 'Apologize 🙇',
    'Regret 😔', 'Guilty 🥺', 'Innocent 😇', 'Suspect 🕵️', 'Detective 🕵️',
    'Mystery 🔍', 'Clue 🔎', 'Evidence 📁', 'Secret 🤫', 'Rumor 🗣️',
    'Gossip 🗣️', 'Scandal 📰', 'Headline 🗞️', 'Journalist 📝', 'Interview 🎤',
    'Review ⭐', 'Critic 📝', 'Rating ⭐', 'Recommendation 👍', 'Complaint 👎',
    'Feedback 💬', 'Survey 📋', 'Statistics 📊', 'Research 🔬', 'Experiment 🧪',
    'Discovery 🔭', 'Invention 💡', 'Technology 💻', 'Gadget 📱', 'Device 🖥️',
    'Software 💾', 'Hardware 🖥️', 'Network 🌐', 'Connection 📶', 'Signal 📡',
    'Update 🔄', 'Upgrade ⬆️', 'Install ⬇️', 'Delete 🗑️', 'Recycle ♻️',
    'Plastic 🥤', 'Global Warming 🌍', 'Greenhouse 🌱', 'Solar Power ☀️', 'Wind Energy 🌬️',
    'Subscribe 🔔', 'Algorithm 💻', 'Clickbait 🎣', 'Procrastinate ⏰'
];

const newB2p = [
    'Procrastination ⏰', 'Vulnerable 🥺', 'Validation ✅', 'Gaslight 🕯️', 'Toxic ☣️',
    'Boundary 🚧', 'Manipulation 🎭', 'Empowerment 💪', 'Resilience 💪', 'Advocate 📢',
    'Privilege 👑', 'Appropriation 🎭', 'Censorship ✂️', 'Polarization ↔️', 'Misinformation 📰',
    'Deepfake 🤖', 'Monetize 💰', 'Burnout 😫', 'Sustainability 🌿', 'Biodiversity 🦜',
    'Ecosystem 🌿', 'Deforestation 🪵', 'Extinction 🦖', 'Simulation 💻', 'Paradox 🔄',
    'Hypothesis 🧪', 'Bias ⚖️', 'Subjective 🧠', 'Objective 🎯', 'Ambiguous 🔮',
    'Nuance 🎨', 'Dilemma ⚖️', 'Metaphor 🌀', 'Satire 🎭', 'Parody 🤡',
    'Cynical 😒', 'Pessimistic 🌧️', 'Optimistic ☀️', 'Philosophical 🤔', 'Psychological 🧠',
    'Globalized 🌐', 'Propaganda 📢', 'Extremist ⚡', 'Whistleblower 📢', 'Philanthropist 🤲',
    'Micromanage 👔', 'Overthinking 🧠', 'Spontaneous ✨', 'Charismatic ✨', 'Prodigy 🌟',
    'Introverted 🤫', 'Extroverted 🥳', 'Ambivert ↔️', 'Hypocrite 🎭', 'Skeptical 🤨',
    'Tolerant 🤝', 'Inclusive 🌈', 'Exclusive 🚫', 'Anonymous 🎭', 'Controversial ⚡',
    'Boycott 🚫', 'Cancel Culture 🚫', 'Mainstream 🌊', 'Underground 🚇', 'Masterpiece 🎨',
    'Avant-garde 🎨', 'Binge-watching 📺', 'Cliffhanger 🧗', 'Plot Twist 🌪️', 'Protagonist 🦸',
    'Antagonist 🦹', 'Antihero 🦹', 'Flashback 🕰️', 'Foreshadowing 🔮', 'Genre 📚',
    'Cinematography 🎥', 'Choreography 💃', 'Improvise 🎭', 'Rehearse 🎬', 'Audition 🎤',
    'Premiere 🎬', 'Encore 👏', 'Ovation 👏', 'Debut 🌟', 'Legacy 🏛️',
    'Heritage 🌍', 'Tradition 🏮', 'Custom 🎎', 'Ritual 🕯️', 'Superstitious 🍀',
    'Destined ✨', 'Coincidental 🎯', 'Illusional 🌀', 'Hallucinate 🌀', 'Nightmarish 😱',
    'Phobic 😨', 'Traumatic 🤕', 'Therapeutic 🛋️', 'Mindful 🧘', 'Meditate 🧘'
];

function mergeAndFormat(oldArr, newArr) {
    let all = [...oldArr, ...newArr];
    // Deduplicate by base word
    let unique = [];
    let seen = new Set();
    for (let word of all) {
        let base = word.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim().toLowerCase();
        if (!seen.has(base)) {
            seen.add(base);
            unique.push(word);
        }
    }
    return unique.map(w => '\"' + w + '\"').join(', ');
}

const finalB1 = mergeAndFormat(b1, newB1);
const finalB2 = mergeAndFormat(b2, newB2);
const finalB2p = mergeAndFormat(b2p, newB2p);

let newContent = content.replace(b1Match[0], 'const B1_WORDS = [\n        ' + finalB1 + '\n    ];');
newContent = newContent.replace(b2Match[0], 'const B2_WORDS = [\n        ' + finalB2 + '\n    ];');
newContent = newContent.replace(b2PlusMatch[0], 'const B2_PLUS_WORDS = [\n        ' + finalB2p + '\n    ];');

fs.writeFileSync('public/js/app.js', newContent, 'utf8');

console.log('B1 Count:', finalB1.split(',').length);
console.log('B2 Count:', finalB2.split(',').length);
console.log('B2+ Count:', finalB2p.split(',').length);
console.log('Total:', finalB1.split(',').length + finalB2.split(',').length + finalB2p.split(',').length);
