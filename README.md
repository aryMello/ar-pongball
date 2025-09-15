# 🏓 AR PongBall - Multiplayer AR Game

A next-generation Augmented Reality Pong game that combines real-world movement with virtual gameplay. Players use gaze controls and room-scale tracking to play volleyball-style Pong in AR.

## ✨ Features

### Core Gameplay
- **AR Integration**: Real-world room overlay with virtual game elements
- **Gaze Controls**: Look at the ball to hit it back to your opponent
- **Room-Scale Tracking**: Move around your physical space to position yourself
- **Multiplayer Support**: Real-time multiplayer via WebRTC
- **Solo Practice**: AI opponent for solo gameplay

### Advanced Features
- **Room Calibration**: Precise room measurement and boundary detection
- **3D Physics**: Realistic ball physics with gravity and bouncing
- **Visual Effects**: Particle systems, hit effects, and AR overlays
- **Cross-Platform**: Works on mobile, tablet, and desktop browsers
- **PWA Support**: Installable Progressive Web App
- **Offline Mode**: Play solo even without internet connection

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm 8+
- Modern browser with camera access
- HTTPS (required for camera API)
- Mobile device recommended for best AR experience

### Installation

1. **Clone the repository**
```
git clone https://github.com/your-username/ar-pongball.git
cd ar-pongball
```

2. **Install dependencies**
```
npm install
```

3. **Configure environment**
```
cp .env.example .env
# Edit .env with your configuration
```

4. **Start the server**
```
npm start
# For development with auto-reload:
npm run dev
```

5. **Access the game**
- Local: `http://localhost:3000`
- Mobile: `http://[your-ip]:3000`
- HTTPS required for camera access in production

## 📱 Usage Instructions

### Room Setup
1. **Calibrate Your Room**
   - Go to "Room Calibration" in the main menu
   - Set your room dimensions (width, depth, height)
   - Follow the calibration process to map boundaries
   - Ensure good lighting for AR tracking

2. **Multiplayer Setup**
   - Create a room and share the code with a friend
   - Both players complete room calibration
   - Wait for connection establishment
   - Game starts automatically when both players are ready

3. **Gameplay**
   - Point your device camera at your play area
   - Look directly at the ball for 300ms to hit it
   - Move around your room to position yourself
   - Score points by making your opponent miss

### Controls
- **Gaze Control**: Primary method - look at ball to hit
- **Touch Control**: Alternative - tap near ball to hit
- **Movement**: Walk around your room for positioning
- **⏸Pause**: Tap pause button in game UI

## 🛠️ Technical Architecture

### Frontend Stack
- **HTML5**: Semantic markup and AR video overlay
- **CSS3**: Modern styling with animations and effects  
- **Three.js**: 3D graphics and AR rendering
- **WebRTC**: Peer-to-peer multiplayer communication
- **MediaDevices API**: Camera access for AR
- **Device Orientation**: Motion tracking for AR positioning

### Backend Stack
- **Node.js**: Server runtime
- **Express.js**: Web framework and API
- **Socket.IO**: Real-time communication
- **WebRTC Signaling**: Peer connection establishment
- **Rate Limiting**: DDoS protection
- **CORS**: Cross-origin resource sharing

### AR Technologies
- **Camera API**: Real-world video feed
- **Device Sensors**: Accelerometer, gyroscope for tracking
- **Gaze Detection**: Eye tracking simulation (extensible to real ML)
- **3D Projection**: World-to-screen coordinate mapping
- **Room Mapping**: Spatial boundary detection

## API Documentation

### WebSocket Events

#### Client → Server
- `join-room`: Join or create a game room
- `player-ready`: Signal player is ready to start
- `game-update`: Send game state updates
- `ping`: Latency measurement

#### Server → Client  
- `room-joined`: Confirm room join success
- `player-joined`: New player joined room
- `game-started`: Game session began
- `ball-update`: Ball position/velocity update
- `score-update`: Score changed
- `player-left`: Player disconnected

### REST API Endpoints

#### Game Management
- `GET /api/health` - Server health check
- `GET /api/rooms` - List available rooms
- `POST /api/create-room` - Create new room
- `GET /api/room/:id` - Get room details

### Browser Compatibility
- **Chrome**: Full support (recommended)
- **Safari**: Requires iOS 13+ for full AR features
- **Firefox**: Limited WebRTC support
- **Edge**: Good support on Windows

### Device Requirements
- **Mobile**: iOS 12+ or Android 8+ recommended
- **Camera**: Rear-facing camera preferred for AR
- **Sensors**: Gyroscope and accelerometer required
- **Network**: Stable connection for multiplayer

## Future Enhancements

### Planned Features
- **Real ML Gaze Detection**: MediaPipe/TensorFlow integration
- **Advanced AR**: WebXR API support
- **Tournament Mode**: Bracket-style competitions
- **Customization**: Ball skins, arena themes
- **Voice Chat**: Integrated communication
- **Spectator Mode**: Watch games in progress

## License

MIT License