# 🕷️ Spidey Player 2.0

A premium, cyber-glass themed music player for the web. Built with raw JavaScript, optimized for performance, and designed with a stunning visual aesthetic.

![Spidey Player Demo](image/862eb376cc18fd124f045f6b31b0dc4b.jpg)

## 🔥 Features

### 🎧 Core Experience
- **Cyber-Glass Aesthetics**: Frosted glass UI (Glassmorphism) with dynamic background animations.
- **Audio Visualizer**: Real-time frequency bars that react to the beat using the Web Audio API.
- **Pulsing Album Art**: Album cover reacts to bass frequencies.

### 💾 Smart Library
- **Persistent Storage**: Songs are saved directly in your **Browser Database** (IndexedDB). Your library survives refreshes and restarts!
- **Drag & Drop**: Simply drag your folder or audio files onto the screen to import them.
- **Auto-Cleanup**: Automatically detects and removes duplicate songs to keep your library clean.
- **Smart Titles**: Automatically strips messy prefixes (e.g., "01 - ", "MySong.mp3") for a clean look.

### 🎮 Controls
- **Keyboard Shortcuts**:
    - `Space`: Play / Pause
    - `Left Arrow`: Rewind 5s
    - `Right Arrow`: Forward 5s
- **Playlist Management**:
    - Search bar to instantly filter songs.
    - Toggleable popup playlist.
    - Shuffle & Repeat modes.

## 🛠️ Tech Stack
- **Frontend**: HTML5, Vanilla JavaScript (ES6+)
- **Styling**: Tailwind CSS (CDN) + Custom CSS Animations
- **Audio**: Web Audio API + HTML5 Audio
- **Storage**: IndexedDB (Client-side database)

## 🚀 How to Use

### Run Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/subahdeepmistri/Spidey-Player.git
   ```
2. Open `index.html` in your browser.
3. **OR** run with a local server (recommended for Drag & Drop persistence testing):
   ```bash
   npx serve .
   ```

### Add Music
1. Open the player.
2. Drag and drop your `.mp3`, `.flac`, or `.wav` files anywhere on the screen.
3. Confirm the upload.
4. Enjoy!

## 🌐 Deployment
This project is **Static-Site Ready**. You can deploy it for free on:
- **GitHub Pages**: Go to Settings > Pages > Source: `main`.
- **Netlify**: Drag the project folder to Netlify Drop.

## 👨‍💻 Developer
Developed by **Subhadeep Mistri**.
*A passion project exploring advanced DOM manipulation and Web Audio API.*
