const audio = new Audio();
let playlist = [];
let currentTrack = 0;
let isPlaying = false;
let isShuffle = false;
let isRepeat = false; // false = none, true = all (can expand to 'one')
let audioContext;
let analyser;
let source;
let dataArray;
let animationId;

// DOM Elements
const playBtn = document.getElementById("play-btn");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const repeatBtn = document.getElementById("repeat-btn");
const progressBar = document.getElementById("progress-bar");
const progressContainer = document.getElementById("progress-container");
const currentTimeEl = document.getElementById("current-time");
const durationEl = document.getElementById("duration");
const songTitleEl = document.getElementById("song-title");
const songArtistEl = document.getElementById("song-artist");
const playlistEl = document.getElementById("playlist");
const playlistPanel = document.getElementById("playlist-panel");
const playlistToggleBtn = document.getElementById("playlist-toggle-btn");
const albumArt = document.getElementById("album-art");
const fileInput = document.getElementById("file-input");
const searchInput = document.getElementById("search-input");
const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");

// Event Listeners
playBtn.addEventListener("click", togglePlay);
prevBtn.addEventListener("click", prevTrack);
nextBtn.addEventListener("click", nextTrack);
shuffleBtn.addEventListener("click", toggleShuffle);
repeatBtn.addEventListener("click", toggleRepeat);
progressContainer.addEventListener("click", setProgress);
fileInput.addEventListener("change", handleFiles);
searchInput.addEventListener("input", (e) => {
  updatePlaylistUI(e.target.value.toLowerCase());
});
playlistToggleBtn.addEventListener("click", () => {
  playlistPanel.classList.toggle("hidden");
});

audio.addEventListener("timeupdate", updateProgress);
audio.addEventListener("ended", onTrackEnded);
audio.addEventListener("loadedmetadata", updateSongInfo);
audio.addEventListener("play", () => startVisualizer());
audio.addEventListener("pause", () => cancelAnimationFrame(animationId));

// Drag & Drop
document.body.addEventListener("dragover", (e) => {
  e.preventDefault();
  document.body.classList.add("drag-over");
});

document.body.addEventListener("dragleave", () => {
  document.body.classList.remove("drag-over");
});

document.body.addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("drag-over");

  const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('audio/'));
  if (files.length > 0) {
    handlePlaylistUpdate(files);
  }
});

// IndexedDB Setup
const DB_NAME = 'MusicAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'songs';
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

function saveSongToDB(file) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(file);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

function getAllSongsFromDB() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Fetch songs from IndexedDB
async function fetchSongs() {
  try {
    if (!db) await openDB();
    const songs = await getAllSongsFromDB();

    if (songs && songs.length > 0) {
      // Preserve current track if playing
      let currentSongName = null;
      if (playlist.length > 0 && playlist[currentTrack]) {
        currentSongName = playlist[currentTrack].name;
      }

      // Update playlist source of truth
      playlist = songs;

      // Restore current track index
      if (currentSongName) {
        const newIndex = playlist.findIndex(s => s.name === currentSongName);
        if (newIndex !== -1) {
          currentTrack = newIndex;
        } else {
          currentTrack = 0;
        }
      }

      updatePlaylistUI();

      // Auto-load if this is the first load
      if (!isPlaying && !currentSongName && playlist.length > 0) {
        loadTrack(0, false);
      }
    }
  } catch (error) {
    console.error('Error fetching songs from DB:', error);
  }
}

// Functions
function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function startVisualizer() {
  if (!analyser) return;

  function renderFrame() {
    animationId = requestAnimationFrame(renderFrame);

    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / dataArray.length) * 2.5;
    let barHeight;
    let x = 0;

    // Cyber-Glass Visualizer Style
    for (let i = 0; i < dataArray.length; i++) {
      barHeight = dataArray[i] * 1.5;

      // Dynamic Gradient based on frequency
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
      gradient.addColorStop(0, 'rgba(0, 242, 234, 0.1)'); // Cyan low
      gradient.addColorStop(0.5, 'rgba(0, 242, 234, 0.5)'); // Cyan mid
      gradient.addColorStop(1, 'rgba(255, 0, 85, 0.6)'); // Pink high

      ctx.fillStyle = gradient;

      // Draw rounded bars
      ctx.beginPath();
      ctx.roundRect(x, canvas.height - barHeight, barWidth, barHeight, 5);
      ctx.fill();

      // Reflection/Mirror effect
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.roundRect(x, canvas.height - barHeight - 10, barWidth, 5, 2);
      ctx.fill();

      x += barWidth + 1;
    }

    // Beat detection for Album Art Pulse
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const scale = 1 + (average / 256) * 0.1;
    albumArt.style.transform = `scale(${scale})`;
  }

  renderFrame();
}


function togglePlay() {
  if (playlist.length === 0) return;

  // Initialize AudioContext on first user interaction
  initAudioContext();

  isPlaying = !isPlaying;
  isPlaying ? audio.play() : audio.pause();
  updatePlayBtnUI();
}

function updatePlayBtnUI() {
  playBtn.innerHTML = isPlaying
    ? '<i class="fas fa-pause ml-0"></i>' // Adjust icon centering
    : '<i class="fas fa-play ml-1"></i>';
}

function loadTrack(trackIndex, autoPlay = true) {
  if (playlist.length === 0) return;

  currentTrack = trackIndex;
  const track = playlist[trackIndex];

  // Clean up old object URL if it was a blob
  // if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src); 

  if (track instanceof File || track instanceof Blob) {
    // Revoke old URL to save memory? We need to keep a reference to currentObjectURL globally if we do this
    // For now, rely on browser GC or small number of blobs
    const objectURL = URL.createObjectURL(track);
    audio.src = objectURL;
  } else if (track.url) {
    // Fallback if we still have server objects, though we shouldn't
    audio.src = track.url;
  } else {
    // Should not happen with IDB flow which stores Files
    console.error("Unknown track format:", track);
    return;
  }

  // Ensure visualizer is ready
  initAudioContext();

  if (autoPlay) {
    audio.play().catch(e => console.log("Playback prevented:", e));
    isPlaying = true;
    updatePlayBtnUI();
  }

  updateSongInfo();
  highlightCurrentTrack();
}

function updateSongInfo() {
  const file = playlist[currentTrack];
  if (!file) return;

  let displayName = file.name.replace(/\.[^/.]+$/, "");
  displayName = displayName.replace(/^(\d+[\s.-]+)+/, "").trim();
  songTitleEl.textContent = displayName;
  songArtistEl.textContent = "Spidey Player"; // Or extract metadata if possible
  durationEl.textContent = formatTime(audio.duration);
}

function updateProgress() {
  const { currentTime, duration } = audio;
  if (isNaN(duration)) return;
  const progressPercent = (currentTime / duration) * 100;
  progressBar.style.width = `${progressPercent}%`;
  currentTimeEl.textContent = formatTime(currentTime);
}

function setProgress(e) {
  const width = this.clientWidth;
  const clickX = e.offsetX;
  const duration = audio.duration;

  audio.currentTime = (clickX / width) * duration;
}



function prevTrack() {
  if (playlist.length === 0) return;

  if (audio.currentTime > 5) {
    audio.currentTime = 0;
    return;
  }

  let newIndex;
  if (isShuffle) {
    newIndex = Math.floor(Math.random() * playlist.length);
  } else {
    newIndex = (currentTrack - 1 + playlist.length) % playlist.length;
  }
  loadTrack(newIndex);
}

function nextTrack() {
  if (playlist.length === 0) return;

  let newIndex;
  if (isShuffle) {
    newIndex = Math.floor(Math.random() * playlist.length);
    // Avoid repeating same song in shuffle if possible, but for simple shuffle random is fine
  } else {
    newIndex = (currentTrack + 1) % playlist.length;
  }
  loadTrack(newIndex);
}

function onTrackEnded() {
  if (isRepeat) {
    audio.currentTime = 0;
    audio.play();
  } else {
    nextTrack();
  }
}

function toggleShuffle() {
  isShuffle = !isShuffle;
  shuffleBtn.classList.toggle("text-white");
  shuffleBtn.classList.toggle("text-cyan-400"); // Active color
  shuffleBtn.title = isShuffle ? "Shuffle On" : "Shuffle Off";
}

function toggleRepeat() {
  isRepeat = !isRepeat;
  repeatBtn.classList.toggle("text-white");
  repeatBtn.classList.toggle("text-cyan-400");
  repeatBtn.title = isRepeat ? "Repeat One" : "Repeat Off";
  // Could implement Repeat All vs One logic here
}

function handleFiles(e) {
  const files = Array.from(e.target.files);
  handlePlaylistUpdate(files);
}

async function handlePlaylistUpdate(files) {
  if (files.length === 0) return;

  // Filter out duplicates
  const newFiles = [];
  const duplicates = [];

  // Need database open to check? Playlist is already loaded in memory so we can check against that.
  files.forEach(file => {
    const exists = playlist.some(p => p.name === file.name);
    if (exists) {
      duplicates.push(file.name);
    } else {
      newFiles.push(file);
    }
  });

  if (duplicates.length > 0) {
    if (newFiles.length === 0) {
      alert(`All selected songs are already in the playlist:\n${duplicates.join('\n')}`);
      return;
    } else {
      alert(`Skipping ${duplicates.length} duplicate songs:\n${duplicates.slice(0, 5).join('\n')}${duplicates.length > 5 ? '...' : ''}`);
    }
  }

  if (newFiles.length === 0) return;

  // Save each file to IndexedDB
  try {
    if (!db) await openDB();

    const savePromises = newFiles.map(file => saveSongToDB(file));
    await Promise.all(savePromises);

    console.log(`Saved ${newFiles.length} songs to IndexedDB`);
    alert(`Successfully saved ${newFiles.length} songs!`);

    // Refresh playlist from DB
    await fetchSongs();
  } catch (error) {
    console.error('Error saving to DB:', error);
    alert('Error saving songs.');
  }
}

function updatePlaylistUI(filter = "") {
  playlistEl.innerHTML = "";
  if (playlist.length === 0) {
    playlistEl.innerHTML = `
        <div class="text-center text-gray-500 mt-10 text-sm">
            <i class="fas fa-music mb-3 text-2xl opacity-50"></i>
            <p>Drag & Drop songs here</p>
            <p class="text-xs mt-1">or click Import</p>
        </div>`;
    return;
  }

  playlist.forEach((file, index) => {
    // Clean up song name: Remove extension
    let displayName = file.name.replace(/\.[^/.]+$/, "");

    // Aggressively remove leading numbers and separators
    // Matches: "01 ", "01 - ", "01. ", "01. - ", "1 ", etc.
    // Also handles cases where there might be multiple (though unlikely with regex replace unless global)
    // We use a pattern that looks for starting digits + optional separators
    displayName = displayName.replace(/^(\d+[\s.-]+)+/, "").trim();

    if (filter && !displayName.toLowerCase().includes(filter)) {
      return;
    }

    const li = document.createElement("li");
    li.className = "group flex items-center justify-between p-3 rounded-xl cursor-pointer hover:bg-white/10 transition-colors";

    // Highlight logic
    if (index === currentTrack) {
      li.classList.add("bg-white/10", "border-l-4", "border-cyan-400");
      li.classList.remove("hover:bg-white/10");
    } else {
      li.classList.add("hover:bg-white/10");
    }

    li.innerHTML = `
        <div class="flex items-center w-full overflow-hidden">
            <div class="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center mr-3 text-xs text-gray-400 group-hover:text-white group-hover:bg-cyan-500/20 font-mono">
                ${index + 1}
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-200 truncate group-hover:text-white">${displayName}</p>
            </div>
            ${index === currentTrack ? '<div class="playing-indicator flex h-3 ml-2"><span></span><span></span><span></span></div>' : ''}
        </div>
    `;

    // Important: Passed the ORIGINAL index
    li.addEventListener("click", () => loadTrack(index));
    playlistEl.appendChild(li);
  });
}

function highlightCurrentTrack() {
  // Re-run the update to refresh highlights (re-applying filters if needed needs internal state)
  // For simplicity, let's just re-render with the current search value
  const currentSearch = searchInput ? searchInput.value.toLowerCase() : "";
  updatePlaylistUI(currentSearch);
}

function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

// Keyboard Controls
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.code === 'ArrowRight') {
    audio.currentTime = Math.min(audio.currentTime + 5, audio.duration);
  } else if (e.code === 'ArrowLeft') {
    audio.currentTime = Math.max(audio.currentTime - 5, 0);
  }
});

// Initialize
// Initialize
fetchSongs();
updatePlaylistUI();
