// AR PongBall 

// Global game state
let gameState = {
    mode: null,
    isConnected: false,
    playerScore: 0,
    opponentScore: 0,
    roomId: null,
    isPlaying: false,
    isCalibrated: false,
    isPaused: false,
    hasScored: false,
    
    // Room measurements in meters
    roomDimensions: {
        width: 4.0,
        depth: 6.0,
        height: 3.0
    },
    
    // Game objects
    ball: { 
        position: { x: 0, y: 1, z: 0 },
        velocity: { x: 0, y: 0, z: 0.03 },
        size: 0.1,
        lastHit: 0,
        hitCount: 0
    },
    
    // Player tracking
    player: {
        position: { x: 0, y: 1.6, z: 2.5 },
        looking: false,
        lookDuration: 0,
        hitRadius: 1.0
    },
    
    opponent: {
        position: { x: 0, y: 1.6, z: -2.5 },
        isVisible: false,
        avatar: null,
        lastSeen: 0
    },
    
    // AR tracking
    arTracking: {
        isTracking: false,
        calibrationPoints: [],
        worldMatrix: null,
        floorLevel: 0
    },
    
    // Game settings
    settings: {
        maxScore: 5,
        ballSpeed: 0.03,
        hitCooldown: 1000,
        gazeHitDuration: 300
    }
};

// Three.js objects
let scene, camera, renderer;
let ballMesh, arenaMesh, opponentMesh, gridMesh, netMesh;
let video, animationId;

// WebRTC for multiplayer
let localConnection, remoteConnection, dataChannel;
let signalingSocket = null;
const rtcConfiguration = { 
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ] 
};

// Gaze tracking
let gazeTracker = {
    isInitialized: false,
    calibrationData: [],
    currentGaze: { x: 0, y: 0 },
    isLookingAtBall: false,
    lookStartTime: 0
};

// Device orientation and motion
let deviceOrientation = {
    alpha: 0, // Z-axis rotation
    beta: 0,  // X-axis rotation
    gamma: 0  // Y-axis rotation
};

// =============================================================================
// INITIALIZATION AND SETUP
// =============================================================================

window.addEventListener('load', () => {
    hideLoadingScreen();
    setupEventListeners();
    requestPermissions();
});

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    setTimeout(() => {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }, 1500);
}

function setupEventListeners() {
    // Device orientation for AR tracking
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    window.addEventListener('devicemotion', handleDeviceMotion);
    
    // Window resize
    window.addEventListener('resize', handleResize);
    
    // Visibility change (pause when tab hidden)
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Touch/click events for interaction
    document.addEventListener('touchstart', handleTouch, { passive: true });
    document.addEventListener('click', handleClick);
    
    // Prevent context menu on long press
    document.addEventListener('contextmenu', e => e.preventDefault());

}

async function requestPermissions() {
    try {
        // Request device orientation permission (iOS 13+)
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission !== 'granted') {
                console.warn('Device orientation permission denied');
            }
        }
        
        // Request wake lock to prevent screen sleep
        if ('wakeLock' in navigator) {
            await navigator.wakeLock.request('screen');
        }
    } catch (error) {
        console.log('Permission requests not supported or denied');
    }
}

// =============================================================================
// MENU NAVIGATION
// =============================================================================

function startSoloMode() {
    gameState.mode = 'solo';
    gameState.roomId = 'SOLO-' + generateRoomCode();
    showGame();
}

function showMultiplayerOptions() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('multiplayerMenu').style.display = 'block';
}

async function createRoom() {
  gameState.mode = 'multiplayer';

  try {
    const response = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
      // You can add body here if needed
    });
    const data = await response.json();

    if (data.success && data.roomId) {
      gameState.roomId = data.roomId;
      document.getElementById('roomCode').textContent = gameState.roomId;
      showGame();
    } else {
      alert('Failed to create room on server');
    }
  } catch (err) {
    console.error('Error creating room:', err);
    alert('Network error while creating room');
  }
}


function showJoinRoom() {
    document.getElementById('joinRoomSection').style.display = 'block';
    document.getElementById('roomCodeInput').focus();
}

function joinRoom() {
    const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if (roomCode.length >= 4) {
        gameState.mode = 'multiplayer';
        gameState.roomId = roomCode;
        document.getElementById('roomCode').textContent = roomCode;
        showGame();
    } else {
        alert('Please enter a valid room code');
    }
}

function showRoomSetup() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('roomSetup').style.display = 'block';
}

function hideRoomSetup() {
    document.getElementById('roomSetup').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

function backToMainMenu() {
    document.getElementById('multiplayerMenu').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
}

function showInstructions() {
    const instructions = `🏓 AR PongBall - How to Play

🎯 OBJECTIVE:
Score points by making your opponent miss the ball!

🎮 CONTROLS:
• 👀 Look directly at the ball to hit it
• 🚶 Move around your room to position yourself
• 📱 Keep your phone pointed at the play area

🏠 ROOM SETUP:
• Calibrate your room dimensions first
• Ensure good lighting for AR tracking
• Clear a space of at least 3x4 meters
• Stand about 2-3 meters from your phone

👥 MULTIPLAYER:
• Create or join a room with a friend
• Share the room code
• You'll see your opponent as a virtual player
• Real-time synchronized gameplay

🎯 TIPS:
• Look at the ball for ${gameState.settings.gazeHitDuration}ms to hit
• Move laterally to improve your angle
• The ball speeds up with each hit
• First to ${gameState.settings.maxScore} points wins!

📱 DEVICE REQUIREMENTS:
• Camera access for AR
• Device orientation sensors
• Stable internet for multiplayer`;
    
    alert(instructions);
}

function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// =============================================================================
// ROOM CALIBRATION
// =============================================================================

function updateRoomDimensions() {
    const width = parseFloat(document.getElementById('roomWidth').value);
    const depth = parseFloat(document.getElementById('roomDepth').value);
    const height = parseFloat(document.getElementById('roomHeight').value);
    
    gameState.roomDimensions.width = width;
    gameState.roomDimensions.depth = depth;
    gameState.roomDimensions.height = height;
    
    document.getElementById('widthDisplay').textContent = width.toFixed(1) + 'm';
    document.getElementById('depthDisplay').textContent = depth.toFixed(1) + 'm';
    document.getElementById('heightDisplay').textContent = height.toFixed(1) + 'm';
    
    // Update measurement overlay if visible
    document.getElementById('measuredWidth').textContent = width.toFixed(1) + 'm';
    document.getElementById('measuredDepth').textContent = depth.toFixed(1) + 'm';
    document.getElementById('measuredHeight').textContent = height.toFixed(1) + 'm';
}

async function startRoomCalibration() {
    gameState.mode = 'calibration';
    hideRoomSetup();
    showGame();
    
    // Start calibration process
    setTimeout(() => {
        document.getElementById('calibrationOverlay').style.display = 'flex';
        performRoomCalibration();
    }, 1000);
}

async function performRoomCalibration() {
    const steps = [
        'Point device at floor center',
        'Slowly pan left and right',
        'Point at room corners',
        'Measuring room dimensions...',
        'Calibration complete!'
    ];
    
    for (let i = 0; i < steps.length; i++) {
        document.getElementById('calibrationStep').textContent = `Step ${i + 1}: ${steps[i]}`;
        document.getElementById('progressBar').style.width = `${(i + 1) / steps.length * 100}%`;
        
        if (i === 0) {
            // Show center calibration point
            showCalibrationPoint(50, 70);
        } else if (i === 2) {
            // Show corner points
            showCornerCalibrationPoints();
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Complete calibration
    gameState.isCalibrated = true;
    gameState.arTracking.isTracking = true;
    document.getElementById('calibrationOverlay').style.display = 'none';
    document.getElementById('measurementOverlay').style.display = 'block';
    
    updateStatus('✅ Room calibration complete!', 'success');
    
    if (gameState.mode === 'calibration') {
        // Return to menu after calibration
        setTimeout(() => {
            exitGame();
        }, 3000);
    }
}

function showCalibrationPoint(x, y) {
    const point = document.createElement('div');
    point.className = 'calibration-point';
    point.style.left = x + '%';
    point.style.top = y + '%';
    document.body.appendChild(point);
    
    setTimeout(() => {
        point.remove();
    }, 2000);
}

function showCornerCalibrationPoints() {
    const corners = [
        { x: 20, y: 80 },
        { x: 80, y: 80 },
        { x: 20, y: 40 },
        { x: 80, y: 40 }
    ];
    
    corners.forEach((corner, index) => {
        setTimeout(() => {
            showCalibrationPoint(corner.x, corner.y);
        }, index * 500);
    });
}

function skipCalibration() {
    gameState.isCalibrated = true;
    document.getElementById('calibrationOverlay').style.display = 'none';
    updateStatus('⚠️ Calibration skipped - using default settings', 'warning');
}

function recalibrate() {
    document.getElementById('calibrationOverlay').style.display = 'flex';
    gameState.isCalibrated = false;
    gameState.isPlaying = false;
    performRoomCalibration();
}

function toggleGrid() {
    if (gridMesh) {
        gridMesh.visible = !gridMesh.visible;
        updateStatus(gridMesh.visible ? '📐 Grid enabled' : '📐 Grid disabled', 'info');
    }
}

// =============================================================================
// AR SYSTEM INITIALIZATION
// =============================================================================

function showGame() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('multiplayerMenu').style.display = 'none';
    document.getElementById('roomSetup').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';
    
    initARSystem();
}

async function initARSystem() {
    updateStatus('📱 Requesting camera access...', 'connecting');
    
    try {
        // Get camera stream
        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
                frameRate: { ideal: 30, min: 24 }
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video = document.getElementById('videoElement');
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
            updateStatus('📹 Camera initialized', 'success');
            setupThreeJS();
            setupGazeTracking();
            
            if (gameState.mode === 'multiplayer') {
                initMultiplayer();
            } else {
                startSoloGame();
            }
        };
        
        video.onerror = (error) => {
            throw new Error('Video playback failed: ' + error);
        };
        
    } catch (error) {
        updateStatus('❌ Camera access required for AR', 'error');
        console.error('Camera initialization error:', error);
        
        // Fallback to demo mode
        setTimeout(() => {
            updateStatus('🎮 Running in demo mode', 'warning');
            setupThreeJS();
            if (gameState.mode === 'multiplayer') {
                initMultiplayer();
            } else {
                startSoloGame();
            }
        }, 2000);
    }
}

function setupThreeJS() {
    updateStatus('🎨 Initializing 3D graphics...', 'connecting');
    
    // Scene setup
    scene = new THREE.Scene();
    
    // Camera setup with AR perspective
    camera = new THREE.PerspectiveCamera(
        75, // FOV
        window.innerWidth / window.innerHeight,
        0.01, // Near clipping
        1000  // Far clipping
    );
    camera.position.set(0, gameState.player.position.y, gameState.player.position.z);
    
    // Renderer setup
    const canvas = document.getElementById('threeCanvas');
    renderer = new THREE.WebGLRenderer({ 
        canvas: canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
    });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // Transparent for AR
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    
    // Lighting setup
    setupLighting();
    
    // Create game objects
    createGameObjects();
    
    // Start render loop
    startRenderLoop();
    
    updateStatus('✅ 3D graphics ready', 'success');
}

function setupLighting() {
    // Ambient light for general illumination
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    
    // Main directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 8, 2);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 20;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    scene.add(directionalLight);
    
    // Point light for ball illumination
    const ballLight = new THREE.PointLight(0xff6b6b, 1, 3);
    ballLight.position.set(0, 2, 0);
    scene.add(ballLight);
    
    // Hemisphere light for realistic outdoor lighting
    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x98FB98, 0.3);
    scene.add(hemisphereLight);
}

function createGameObjects() {
    const room = gameState.roomDimensions;
    
    // Create arena floor
    const floorGeometry = new THREE.PlaneGeometry(room.width, room.depth);
    const floorMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x2a2a2a,
        transparent: true,
        opacity: 0.3
    });
    arenaMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    arenaMesh.rotation.x = -Math.PI / 2;
    arenaMesh.position.y = 0;
    arenaMesh.receiveShadow = true;
    scene.add(arenaMesh);
    
    // Arena boundaries (wireframe)
    const arenaGeometry = new THREE.BoxGeometry(room.width, 0.1, room.depth);
    const arenaWireframe = new THREE.EdgesGeometry(arenaGeometry);
    const wireframeMaterial = new THREE.LineBasicMaterial({ 
        color: 0x4ecdc4,
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });
    const arenaLines = new THREE.LineSegments(arenaWireframe, wireframeMaterial);
    arenaLines.position.y = 0.05;
    scene.add(arenaLines);
    
    // Center net
    const netGeometry = new THREE.PlaneGeometry(room.width, 1.5);
    const netMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
    });
    netMesh = new THREE.Mesh(netGeometry, netMaterial);
    netMesh.position.set(0, 0.75, 0);
    netMesh.receiveShadow = true;
    scene.add(netMesh);
    
    // Create ball
    createBall();
    
    // Create opponent avatar
    createOpponentAvatar();
    
    // Create measurement grid
    createMeasurementGrid();
    
    // Create particle systems for effects
    createParticleEffects();
}

function createBall() {
    const ballGeometry = new THREE.SphereGeometry(gameState.ball.size, 32, 32);
    const ballMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xff6b6b,
        emissive: 0x331111,
        shininess: 100,
        specular: 0x444444
    });
    
    ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
    ballMesh.castShadow = true;
    ballMesh.receiveShadow = true;
    
    // Add ball trail effect
    const trailGeometry = new THREE.SphereGeometry(gameState.ball.size * 0.8, 16, 16);
    const trailMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6b6b,
        transparent: true,
        opacity: 0.3
    });
    
    const trailMesh = new THREE.Mesh(trailGeometry, trailMaterial);
    ballMesh.add(trailMesh);
    
    scene.add(ballMesh);
    resetBallPosition();
}

function createOpponentAvatar() {
    const opponentGroup = new THREE.Group();
    
    // Body (cylinder)
    const bodyGeometry = new THREE.CylinderGeometry(0.25, 0.3, 1.6, 12);
    const bodyMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x667eea,
        transparent: true,
        opacity: 0.8
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.position.y = 0.8;
    bodyMesh.castShadow = true;
    opponentGroup.add(bodyMesh);
    
    // Head
    const headGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const headMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xffdbac,
        transparent: true,
        opacity: 0.9
    });
    const headMesh = new THREE.Mesh(headGeometry, headMaterial);
    headMesh.position.set(0, 1.75, 0);
    headMesh.castShadow = true;
    opponentGroup.add(headMesh);
    
    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.02, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.05, 1.78, 0.12);
    opponentGroup.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.05, 1.78, 0.12);
    opponentGroup.add(rightEye);
    
    // Name tag
    createNameTag(opponentGroup, 'Player 2');
    
    // Glow effect
    const glowGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x667eea,
        transparent: true,
        opacity: 0.1
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.position.y = 1.2;
    opponentGroup.add(glowMesh);
    
    opponentMesh = opponentGroup;
    opponentMesh.position.set(
        gameState.opponent.position.x,
        gameState.opponent.position.y - 1.6,
        gameState.opponent.position.z
    );
    
    scene.add(opponentMesh);
    opponentMesh.visible = false; // Hidden until opponent connects
}

function createNameTag(parent, name) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    
    // Background
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.roundRect(0, 0, 512, 128, 20);
    context.fill();
    
    // Border
    context.strokeStyle = '#4ecdc4';
    context.lineWidth = 4;
    context.roundRect(0, 0, 512, 128, 20);
    context.stroke();
    
    // Text
    context.fillStyle = 'white';
    context.font = 'bold 48px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name, 256, 64);
    
    const nameTexture = new THREE.CanvasTexture(canvas);
    const nameMaterial = new THREE.MeshBasicMaterial({ 
        map: nameTexture,
        transparent: true
    });
    
    const nameGeometry = new THREE.PlaneGeometry(1.5, 0.375);
    const nameMesh = new THREE.Mesh(nameGeometry, nameMaterial);
    nameMesh.position.set(0, 2.2, 0);
    nameMesh.lookAt(camera.position);
    
    parent.add(nameMesh);
}

function createMeasurementGrid() {
    const gridGroup = new THREE.Group();
    const room = gameState.roomDimensions;
    
    // Floor grid lines (1m intervals)
    const gridHelper = new THREE.GridHelper(
        Math.max(room.width, room.depth), 
        Math.max(room.width, room.depth),
        0x4ecdc4,
        0x4ecdc4
    );
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3;
    gridGroup.add(gridHelper);
    
    // Measurement markers every 50cm
    for (let x = -room.width/2; x <= room.width/2; x += 0.5) {
        for (let z = -room.depth/2; z <= room.depth/2; z += 0.5) {
            const markerGeometry = new THREE.SphereGeometry(0.02, 8, 8);
            const markerMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xffff00,
                transparent: true,
                opacity: 0.6
            });
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.set(x, 0.02, z);
            gridGroup.add(marker);
        }
    }
    
    // Corner markers
    const corners = [
        [-room.width/2, 0, -room.depth/2],
        [room.width/2, 0, -room.depth/2],
        [-room.width/2, 0, room.depth/2],
        [room.width/2, 0, room.depth/2]
    ];
    
    corners.forEach(([x, y, z]) => {
        const cornerGeometry = new THREE.ConeGeometry(0.05, 0.2, 8);
        const cornerMaterial = new THREE.MeshBasicMaterial({ color: 0xff6b6b });
        const cornerMesh = new THREE.Mesh(cornerGeometry, cornerMaterial);
        cornerMesh.position.set(x, y + 0.1, z);
        gridGroup.add(cornerMesh);
    });
    
    gridMesh = gridGroup;
    scene.add(gridMesh);
    gridMesh.visible = false; // Hidden by default
}

function createParticleEffects() {
    // Ball trail particles
    const particleCount = 50;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount * 3; i += 3) {
        positions[i] = 0;     // x
        positions[i + 1] = 0; // y
        positions[i + 2] = 0; // z
        
        velocities[i] = (Math.random() - 0.5) * 0.02;
        velocities[i + 1] = (Math.random() - 0.5) * 0.02;
        velocities[i + 2] = (Math.random() - 0.5) * 0.02;
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particles.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xff6b6b,
        size: 0.05,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    
    const particleSystem = new THREE.Points(particles, particleMaterial);
    scene.add(particleSystem);
    
    gameState.particleSystem = particleSystem;
}

// =============================================================================
// GAZE TRACKING SYSTEM
// =============================================================================

async function setupGazeTracking() {
    updateStatus('👀 Initializing gaze tracking...', 'connecting');
    
    try {
        // In a real implementation, you would use:
        // - MediaPipe Face Mesh for face detection
        // - WebGazer.js for eye tracking
        // - TensorFlow.js for machine learning models
        
        // Simulated gaze tracking initialization
        await initializeGazeDetection();
        
        gazeTracker.isInitialized = true;
        updateStatus('✅ Gaze tracking ready', 'success');
        
        // Start gaze calibration
        setTimeout(() => {
            if (!gameState.isCalibrated) {
                startGazeCalibration();
            }
        }, 1000);
        
    } catch (error) {
        updateStatus('⚠️ Gaze tracking unavailable - using touch controls', 'warning');
        console.error('Gaze tracking error:', error);
    }
}

async function initializeGazeDetection() {
    // Simulated initialization delay
    return new Promise((resolve) => {
        setTimeout(() => {
            // Initialize face detection simulation
            startGazeSimulation();
            resolve();
        }, 2000);
    });
}

function startGazeSimulation() {
    // Simulated gaze detection - replace with real implementation
    setInterval(() => {
        if (!gameState.isPlaying) return;
        
        // Simulate gaze direction based on device orientation and touch
        updateGazeDirection();
        
        // Check if looking at ball
        checkBallGaze();
        
    }, 33); // ~30 FPS
}

function updateGazeDirection() {
    // Simulate gaze based on device orientation
    const { beta, gamma } = deviceOrientation;
    
    // Convert device orientation to gaze coordinates
    gazeTracker.currentGaze.x = gamma / 90; // Normalize to -1 to 1
    gazeTracker.currentGaze.y = (beta - 45) / 90; // Normalize assuming 45° forward
    
    // Add some randomness for simulation
    gazeTracker.currentGaze.x += (Math.random() - 0.5) * 0.2;
    gazeTracker.currentGaze.y += (Math.random() - 0.5) * 0.2;
    
    // Update gaze indicator
    updateGazeIndicator();
}

function checkBallGaze() {
    if (!ballMesh) return;
    
    // Project ball position to screen coordinates
    const ballScreenPos = getBallScreenPosition();
    const gazeScreenPos = {
        x: (gazeTracker.currentGaze.x + 1) * 0.5 * window.innerWidth,
        y: (1 - gazeTracker.currentGaze.y) * 0.5 * window.innerHeight
    };
    
    // Calculate distance between gaze and ball
    const distance = Math.sqrt(
        Math.pow(ballScreenPos.x - gazeScreenPos.x, 2) + 
        Math.pow(ballScreenPos.y - gazeScreenPos.y, 2)
    );
    
    const lookThreshold = 100; // pixels
    const isLooking = distance < lookThreshold;
    
    if (isLooking && !gazeTracker.isLookingAtBall) {
        gazeTracker.isLookingAtBall = true;
        gazeTracker.lookStartTime = Date.now();
        gameState.player.looking = true;
    } else if (!isLooking && gazeTracker.isLookingAtBall) {
        gazeTracker.isLookingAtBall = false;
        gameState.player.looking = false;
    }
    
    // Update look duration
    if (gazeTracker.isLookingAtBall) {
        gameState.player.lookDuration = Date.now() - gazeTracker.lookStartTime;
    } else {
        gameState.player.lookDuration = 0;
    }
}

function getBallScreenPosition() {
    if (!ballMesh) return { x: 0, y: 0 };
    
    const vector = new THREE.Vector3();
    ballMesh.getWorldPosition(vector);
    vector.project(camera);
    
    return {
        x: (vector.x + 1) * 0.5 * window.innerWidth,
        y: (1 - vector.y) * 0.5 * window.innerHeight
    };
}

function updateGazeIndicator() {
    const indicator = document.getElementById('gazeIndicator');
    
    if (gameState.player.looking) {
        indicator.classList.add('gaze-active');
        
        if (gameState.player.lookDuration > gameState.settings.gazeHitDuration) {
            indicator.classList.add('gaze-locked');
        } else {
            indicator.classList.remove('gaze-locked');
        }
    } else {
        indicator.classList.remove('gaze-active', 'gaze-locked');
    }
}

async function startGazeCalibration() {
    updateStatus('🎯 Gaze calibration starting...', 'info');
    
    const calibrationPoints = [
        { x: 25, y: 25, name: 'Top Left' },
        { x: 75, y: 25, name: 'Top Right' },
        { x: 50, y: 50, name: 'Center' },
        { x: 25, y: 75, name: 'Bottom Left' },
        { x: 75, y: 75, name: 'Bottom Right' }
    ];
    
    for (let i = 0; i < calibrationPoints.length; i++) {
        const point = calibrationPoints[i];
        updateStatus(`🎯 Look at: ${point.name}`, 'info');
        
        await showCalibrationPoint(point.x, point.y);
        
        // Store calibration data
        gazeTracker.calibrationData.push({
            screen: { x: point.x, y: point.y },
            gaze: { ...gazeTracker.currentGaze },
            timestamp: Date.now()
        });
    }
    
    updateStatus('✅ Gaze calibration complete!', 'success');
    gameState.isCalibrated = true;
}

function showCalibrationPoint(x, y) {
    return new Promise((resolve) => {
        const point = document.createElement('div');
        point.className = 'calibration-point';
        point.style.left = x + '%';
        point.style.top = y + '%';
        document.body.appendChild(point);
        
        setTimeout(() => {
            point.remove();
            resolve();
        }, 2500);
    });
}

// =============================================================================
// MULTIPLAYER NETWORKING WITH playerId via localStorage
// =============================================================================

// Generate or retrieve persistent player ID
let playerId = localStorage.getItem('arpong-player-id');
if (!playerId) {
    playerId = 'player_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('arpong-player-id', playerId);
}

async function initMultiplayer() {
    updateStatus('🌐 Initializing multiplayer...', 'connecting');
    document.getElementById('yourPlayerId').textContent = playerId;

    try {
        // In production, connect to your signaling server
        await connectToSignalingServer();

        // Simulate multiplayer connection for demo
        //simulateMultiplayerConnection();

        document.getElementById('connectionInfo').style.display = 'block';
    } catch (error) {
        updateStatus('❌ Multiplayer connection failed', 'error');
        console.error('Multiplayer error:', error);
    }
}

function simulateMultiplayerConnection() {
    // Simulate finding opponent
    setTimeout(() => {
        updateStatus('🔍 Looking for opponent...', 'connecting');

        setTimeout(() => {
            updateStatus('👥 Opponent found! Connecting...', 'connecting');
            addPlayerToList('Opponent', false);

            setTimeout(() => {
                gameState.isConnected = true;
                gameState.opponent.isVisible = true;
                opponentMesh.visible = true;

                updateStatus('✅ Connected! Game ready!', 'success');
                addPlayerToList('Opponent', true);

                startMultiplayerGame();
            }, 2000);
        }, 1500);
    }, 1000);
}

async function connectToSignalingServer() {
    const signalingUrl = 'wss://udhws-2804-214-4010-1f52-f815-943d-2026-b5bd.a.free.pinggy.link/';

    return new Promise((resolve, reject) => {
        signalingSocket = new WebSocket(signalingUrl);

        signalingSocket.onopen = () => {
            signalingSocket.send(JSON.stringify({
                type: 'join-room',
                roomId: gameState.roomId,
                playerId: playerId // Send persistent player ID
            }));

            setupWebRTC();
            resolve();
        };

        signalingSocket.onmessage = handleSignalingMessage;
        signalingSocket.onerror = reject;
    });
}

function setupWebRTC() {
    localConnection = new RTCPeerConnection(rtcConfiguration);

    dataChannel = localConnection.createDataChannel('gameData', {
        ordered: true
    });

    dataChannel.onopen = () => {
        updateStatus('🔗 Real-time connection established!', 'success');
        gameState.isConnected = true;
    };

    dataChannel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleOpponentData(data);
    };

    dataChannel.onerror = (error) => {
        updateStatus('❌ Connection error', 'error');
        console.error('Data channel error:', error);
    };

    localConnection.onicecandidate = (event) => {
        if (event.candidate && signalingSocket) {
            signalingSocket.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate,
                roomId: gameState.roomId,
                playerId: playerId // Send player ID with ICE if needed
            }));
        }
    };
}

function handleSignalingMessage(event) {
    const message = JSON.parse(event.data);

    switch (message.type) {
        case 'room-joined':
            updateStatus('🏠 Joined room successfully', 'success');
            break;

        case 'opponent-joined':
            updateStatus('👥 Opponent joined!', 'success');
            createWebRTCOffer();
            break;

        case 'offer':
            handleWebRTCOffer(message.offer);
            break;

        case 'answer':
            handleWebRTCAnswer(message.answer);
            break;

        case 'ice-candidate':
            handleICECandidate(message.candidate);
            break;

        case 'opponent-left':
            handleOpponentDisconnect();
            break;
    }
}

async function createWebRTCOffer() {
    const offer = await localConnection.createOffer();
    await localConnection.setLocalDescription(offer);

    signalingSocket.send(JSON.stringify({
        type: 'offer',
        offer: offer,
        roomId: gameState.roomId,
        playerId: playerId
    }));
}

async function handleWebRTCOffer(offer) {
    await localConnection.setRemoteDescription(offer);
    const answer = await localConnection.createAnswer();
    await localConnection.setLocalDescription(answer);

    signalingSocket.send(JSON.stringify({
        type: 'answer',
        answer: answer,
        roomId: gameState.roomId,
        playerId: playerId
    }));
}

async function handleWebRTCAnswer(answer) {
    await localConnection.setRemoteDescription(answer);
}

async function handleICECandidate(candidate) {
    await localConnection.addIceCandidate(candidate);
}

function handleOpponentDisconnect() {
    updateStatus('😞 Opponent disconnected', 'warning');
    gameState.isConnected = false;
    gameState.opponent.isVisible = false;
    opponentMesh.visible = false;
    removePlayerFromList('Opponent');
}

function sendGameData(data) {
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({
            ...data,
            timestamp: Date.now(),
            playerId: playerId // Send your unique player ID
        }));
    }
}

function handleOpponentData(data) {
    console.log(`[Multiplayer] Message from ${data.playerId}:`, data);

    switch (data.type) {
        case 'ball-hit':
            handleOpponentBallHit(data);
            break;

        case 'player-position':
            updateOpponentPosition(data.position);
            break;

        case 'game-state':
            syncGameState(data.gameState);
            break;

        case 'score-update':
            updateScoreFromOpponent(data.scores);
            break;
    }
}

function handleOpponentBallHit(data) {
    gameState.ball.position = data.ballPosition;
    gameState.ball.velocity = data.ballVelocity;
    gameState.ball.lastHit = data.timestamp;

    createHitEffect(data.ballPosition);
    updateStatus('💥 Opponent hit!', 'info');
}

function updateOpponentPosition(position) {
    gameState.opponent.position = position;
    gameState.opponent.lastSeen = Date.now();

    if (opponentMesh) {
        opponentMesh.position.set(
            position.x,
            position.y - 1.6,
            position.z
        );
    }
}

function addPlayerToList(name, isOnline) {
    const playerList = document.getElementById('playerList');
    const existingPlayer = playerList.querySelector(`[data-player="${name}"]`);

    if (!existingPlayer) {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        playerItem.setAttribute('data-player', name);
        playerItem.innerHTML = `
            <span class="player-status ${isOnline ? 'online' : 'offline'}">●</span>
            <span>${name === 'You' ? `You (${playerId})` : name}</span>
        `;
        playerList.appendChild(playerItem);
    } else {
        const statusSpan = existingPlayer.querySelector('.player-status');
        statusSpan.className = `player-status ${isOnline ? 'online' : 'offline'}`;
    }
}

function removePlayerFromList(name) {
    const playerList = document.getElementById('playerList');
    const playerItem = playerList.querySelector(`[data-player="${name}"]`);
    if (playerItem) {
        playerItem.remove();
    }
}


// =============================================================================
// GAME LOGIC
// =============================================================================

function startSoloGame() {
    updateStatus('🤖 Solo mode initialized', 'success');
    gameState.isConnected = true;
    gameState.opponent.isVisible = true;
    opponentMesh.visible = true;
    
    resetBallPosition();
    gameState.isPlaying = true;
    
    // Start AI opponent
    startAIOpponent();
}

function startMultiplayerGame() {
    updateStatus('🎮 Multiplayer game starting!', 'success');
    resetBallPosition();
    gameState.isPlaying = true;
    
    // Sync initial game state
    sendGameData({
        type: 'game-state',
        gameState: {
            ball: gameState.ball,
            scores: {
                player: gameState.playerScore,
                opponent: gameState.opponentScore
            }
        }
    });
}

function startAIOpponent() {
    // AI opponent behavior
    setInterval(() => {
        if (!gameState.isPlaying || gameState.mode !== 'solo') return;
        
        const ball = gameState.ball;
        
        // AI tries to hit ball when it's on their side
        if (gameState.ball.position.z < -1 && gameState.ball.velocity.z < 0) {
            // Calculate AI hit probability based on ball position
            const distanceFromCenter = Math.abs(gameState.ball.position.x);
            const hitProbability = Math.max(0.3, 0.9 - distanceFromCenter * 0.3);
            
            if (Math.random() < hitProbability) {
                aiHitBall();
            }
        }
        
        // Update AI opponent position (simulate movement)
        if (Math.random() < 0.1) { // 10% chance to move each frame
            gameState.opponent.position.x += (Math.random() - 0.5) * 0.1;
            gameState.opponent.position.x = Math.max(-1, Math.min(1, gameState.opponent.position.x));
            
            updateOpponentPosition(gameState.opponent.position);
        }
        
    }, 100);
}

function resetBallPosition() {
    gameState.ball.position = { x: 0, y: 1, z: 0 };
    gameState.ball.velocity = {
        x: (Math.random() - 0.5) * 0.02,
        y: 0,
        z: Math.random() > 0.5 ? gameState.settings.ballSpeed : -gameState.settings.ballSpeed
    };
    gameState.ball.lastHit = Date.now();
    
    updateBallPosition();
}

function createBounceEffect(position) {
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
        positions[i] = position.x;
        positions[i + 1] = position.y;
        positions[i + 2] = position.z;

        velocities[i] = (Math.random() - 0.5) * 0.1;
        velocities[i + 1] = (Math.random()) * 0.1;
        velocities[i + 2] = (Math.random() - 0.5) * 0.1;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.05,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Animate and fade out particles
    const lifetime = 30; // frames
    let frame = 0;

    function animateParticles() {
        frame++;
        const posAttr = geometry.getAttribute('position');
        const velAttr = geometry.getAttribute('velocity');

        for (let i = 0; i < particleCount * 3; i++) {
            posAttr.array[i] += velAttr.array[i];
        }

        posAttr.needsUpdate = true;

        if (frame < lifetime) {
            requestAnimationFrame(animateParticles);
        } else {
            scene.remove(particles);
        }
    }

    animateParticles();
}


function updateBallPhysics() {
    if (!gameState.isPlaying || gameState.isPaused) return;
    
    const ball = gameState.ball;
    const room = gameState.roomDimensions;
    const deltaTime = 0.016; // Assuming 60 FPS
    
    // Update position
    gameState.ball.position.x += gameState.ball.velocity.x;
    gameState.ball.position.y += gameState.ball.velocity.y;
    gameState.ball.position.z += gameState.ball.velocity.z;
    
    // Apply gravity
    gameState.ball.velocity.y -= 0.001;
    
    // Bounce off walls
    if (Math.abs(gameState.ball.position.x) > room.width / 2 - gameState.ball.size) {
        gameState.ball.velocity.x *= -0.8;
        gameState.ball.position.x = Math.sign(gameState.ball.position.x) * (room.width / 2 - gameState.ball.size);
        createBounceEffect(gameState.ball.position);
    }
    
    // Bounce off floor and ceiling
    if (gameState.ball.position.y < gameState.ball.size) {
        gameState.ball.velocity.y = Math.abs(gameState.ball.velocity.y) * 0.8;
        gameState.ball.position.y = gameState.ball.size;
        createBounceEffect(gameState.ball.position);
    } else if (gameState.ball.position.y > room.height - gameState.ball.size) {
        gameState.ball.velocity.y = -Math.abs(gameState.ball.velocity.y) * 0.8;
        gameState.ball.position.y = room.height - gameState.ball.size;
    }
    
    // Check for scoring
    checkScoring();
    
    // Update ball visual position
    updateBallPosition();
    
    // Update particle trail
    updateParticleTrail();
}

function checkScoring() {
    const ball = gameState.ball;
    const room = gameState.roomDimensions;
    
    if (gameState.ball.position.z > room.depth / 2) {
        // Ball reached player's end
        if (isPlayerInHitRange() && gameState.player.looking && 
            gameState.player.lookDuration >= gameState.settings.gazeHitDuration &&
            Date.now() - gameState.ball.lastHit > gameState.settings.hitCooldown) {
            
            playerHitBall();
        } else {
            opponentScores();
        }
    } else if (gameState.ball.position.z < -room.depth / 2) {
        // Ball reached opponent's end
        if (gameState.mode === 'solo') {
            // AI opponent area
            aiHitBall();
        } else {
            // Waiting for opponent action
            playerScores();
        }
    }
}

function isPlayerInHitRange() {
    const ball = gameState.ball;
    const player = gameState.player;
    
    const distance = Math.sqrt(
        Math.pow(gameState.ball.position.x - player.position.x, 2) +
        Math.pow(gameState.ball.position.y - player.position.y, 2) +
        Math.pow(gameState.ball.position.z - player.position.z, 2)
    );
    
    return distance < player.hitRadius;
}

function playerHitBall() {
    const ball = gameState.ball;
    const room = gameState.roomDimensions;

    // Reverse ball direction with some randomness
    gameState.ball.velocity.z = -Math.abs(gameState.ball.velocity.z) * 1.1;
    gameState.ball.velocity.x += (Math.random() - 0.5) * 0.03;
    gameState.ball.velocity.y += Math.random() * 0.02;

    // Add spin based on hit position
    const hitOffset = ball.position.x - gameState.player.position.x;
    gameState.ball.velocity.x += hitOffset * 0.02;

    gameState.ball.lastHit = Date.now();
    gameState.ball.hitCount++;

    // ✅ Nudge ball back into play area
    gameState.ball.position.z = room.depth / 2 - ball.size - 1;

    // Visual and audio feedback
    createHitEffect(ball.position);
    updateStatus('💥 Great hit!', 'success');

    // Send to opponent
    if (gameState.mode === 'multiplayer' && gameState.isConnected) {
        sendGameData({
            type: 'ball-hit',
            ballPosition: ball.position,
            ballVelocity: ball.velocity,
            hitCount: ball.hitCount
        });
    }

    setTimeout(() => {
        if (gameState.isPlaying) {
            updateStatus('🎮 Game active', 'info');
        }
    }, 1500);
}


function aiHitBall() {
    const ball = gameState.ball;
    const room = gameState.roomDimensions;

    // AI hit with some imperfection
    const accuracy = 0.8 + Math.random() * 0.2;

    // Send ball toward player (negative Z)
    gameState.ball.velocity.z = -Math.abs(gameState.ball.velocity.z) * 1.05 * accuracy;
    gameState.ball.velocity.x += (Math.random() - 0.5) * 0.025;
    gameState.ball.velocity.y += Math.random() * 0.015;

    gameState.ball.lastHit = Date.now();
    gameState.ball.hitCount++;

    // Move the ball back into the field to prevent immediate scoring
    gameState.ball.position.z = -room.depth / 2 + gameState.ball.size + 1;

    createHitEffect(gameState.ball.position);
    updateStatus('🤖 AI hit!', 'info');
}


function playerScores() {
    if (gameState.hasScored || !gameState.isPlaying) return;
    gameState.hasScored = true;

    gameState.playerScore++;
    updateScoreDisplay();

    createScoreEffect(true);
    updateStatus('🎉 You scored!', 'success');

    if (gameState.playerScore >= gameState.settings.maxScore) {
        endGame(true);
    } else {
        setTimeout(() => {
            resetBallPosition();
            updateStatus('🎮 Next point!', 'info');
            gameState.hasScored = false; // ✅ Reset flag after point
        }, 2000);
    }

    if (gameState.mode === 'multiplayer' && gameState.isConnected) {
        sendGameData({
            type: 'score-update',
            scores: {
                player: gameState.opponentScore,
                opponent: gameState.playerScore
            }
        });
    }
}

function opponentScores() {
    if (gameState.hasScored || !gameState.isPlaying) return;
    gameState.hasScored = true;

    gameState.opponentScore++;
    updateScoreDisplay();
    
    createScoreEffect(false);
    updateStatus('😅 Opponent scored!', 'warning');
    
    if (gameState.opponentScore >= gameState.settings.maxScore) {
        endGame(false);
    } else {
        setTimeout(() => {
            resetBallPosition();
            updateStatus('🎮 Next point!', 'info');
            gameState.hasScored = false; // ✅ Reset flag after point
        }, 2000);
    }

    // Send score update
    if (gameState.mode === 'multiplayer' && gameState.isConnected) {
        sendGameData({
            type: 'score-update',
            scores: {
                player: gameState.opponentScore,
                opponent: gameState.playerScore
            }
        });
    }
}


function updateScoreDisplay() {
    document.getElementById('playerScore').textContent = gameState.playerScore;
    document.getElementById('opponentScore').textContent = gameState.opponentScore;
}

function endGame(playerWon) {
    gameState.isPlaying = false;
    
    const message = playerWon ? 
        '🏆 Congratulations! You won!' : 
        '💪 Good game! Try again?';
    
    updateStatus(message, playerWon ? 'success' : 'info');
    
    // Show final score and restart option
    setTimeout(() => {
        const playAgain = confirm(`Final Score: You ${gameState.playerScore} - ${gameState.opponentScore} Opponent\n\nPlay again?`);
        if (playAgain) {
            restartGame();
        } else {
            exitGame();
        }
    }, 3000);
}

function restartGame() {
    gameState.playerScore = 0;
    gameState.opponentScore = 0;
    gameState.ball.hitCount = 0;
    updateScoreDisplay();
    resetBallPosition();
    gameState.isPlaying = true;
    updateStatus('🆕 New game started!', 'success');
}

// =============================================================================
// VISUAL EFFECTS
// =============================================================================

function updateBallPosition() {
    if (ballMesh) {
        ballMesh.position.set(
            gameState.ball.position.x,
            gameState.ball.position.y,
            gameState.ball.position.z
        );
        
        // Update ball material based on player interaction
        const isInRange = isPlayerInHitRange();
        const isLooking = gameState.player.looking;
        
        if (isInRange && isLooking) {
            ballMesh.material.emissive.setHex(0x004400); // Green glow when hittable
        } else if (isInRange) {
            ballMesh.material.emissive.setHex(0x444400); // Yellow glow when in range
        } else {
            ballMesh.material.emissive.setHex(0x331111); // Default red glow
        }
        
        // Rotate ball based on velocity
        ballMesh.rotation.x += Math.abs(gameState.ball.velocity.z) * 10;
        ballMesh.rotation.z += gameState.ball.velocity.x * 10;
    }
}

function updateParticleTrail() {
    if (!gameState.particleSystem) return;
    
    const positions = gameState.particleSystem.geometry.attributes.position.array;
    const velocities = gameState.particleSystem.geometry.attributes.velocity.array;
    
    for (let i = 0; i < positions.length; i += 3) {
        // Update particle positions
        positions[i] += velocities[i];
        positions[i + 1] += velocities[i + 1];
        positions[i + 2] += velocities[i + 2];
        
        // Reset particles near ball position
        const distToBall = Math.sqrt(
            Math.pow(positions[i] - gameState.ball.position.x, 2) +
            Math.pow(positions[i + 1] - gameState.ball.position.y, 2) +
            Math.pow(positions[i + 2] - gameState.ball.position.z, 2)
        );
        
        if (distToBall > 2) {
            positions[i] = gameState.ball.position.x + (Math.random() - 0.5) * 0.2;
            positions[i + 1] = gameState.ball.position.y + (Math.random() - 0.5) * 0.2;
            positions[i + 2] = gameState.ball.position.z + (Math.random() - 0.5) * 0.2;
            
            velocities[i] = (Math.random() - 0.5) * 0.02;
            velocities[i + 1] = (Math.random() - 0.5) * 0.02;
            velocities[i + 2] = (Math.random() - 0.5) * 0.02;
        }
    }
    
    gameState.particleSystem.geometry.attributes.position.needsUpdate = true;
}

function createHitEffect(position) {
    // Create visual hit effect at ball position
    const effectDiv = document.createElement('div');
    effectDiv.className = 'hit-effect';
    
    // Convert 3D position to screen coordinates
    const screenPos = getBallScreenPosition();
    effectDiv.style.left = screenPos.x + 'px';
    effectDiv.style.top = screenPos.y + 'px';
    
    document.body.appendChild(effectDiv);
    
    setTimeout(() => {
        effectDiv.remove();
    }, 600);
    
    // Create 3D particle burst
    createParticleBurst(position);
}

function createParticleBurst(position) {
    const particleCount = 20;
    const particles = [];
    
    for (let i = 0; i < particleCount; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.01, 4, 4);
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(Math.random(), 1, 0.5),
            transparent: true,
            opacity: 1
        });
        
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.set(position.x, position.y, position.z);
        
        particle.velocity = {
            x: (Math.random() - 0.5) * 0.1,
            y: Math.random() * 0.05,
            z: (Math.random() - 0.5) * 0.1
        };
        
        scene.add(particle);
        particles.push(particle);
    }
    
    // Animate particles
    const animateParticles = () => {
        particles.forEach((particle, index) => {
            particle.position.x += particle.velocity.x;
            particle.position.y += particle.velocity.y;
            particle.position.z += particle.velocity.z;
            
            particle.velocity.y -= 0.002; // Gravity
            particle.material.opacity -= 0.02;
            
            if (particle.material.opacity <= 0) {
                scene.remove(particle);
                particles.splice(index, 1);
            }
        });
        
        if (particles.length > 0) {
            requestAnimationFrame(animateParticles);
        }
    };
    
    animateParticles();
}

function createScoreEffect(playerScored) {
    const color = playerScored ? '#4ecdc4' : '#ff6b6b';
    const emoji = playerScored ? '🎉' : '😅';
    
    // Create screen flash effect
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: ${color};
        opacity: 0.3;
        z-index: 50;
        pointer-events: none;
        animation: flashEffect 0.5s ease-out;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes flashEffect {
            0% { opacity: 0.5; }
            100% { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(flash);
    
    setTimeout(() => {
        flash.remove();
        style.remove();
    }, 500);
}

// =============================================================================
// DEVICE INTERACTION HANDLERS
// =============================================================================

function handleDeviceOrientation(event) {
    deviceOrientation.alpha = event.alpha || 0;
    deviceOrientation.beta = event.beta || 0;
    deviceOrientation.gamma = event.gamma || 0;
    
    // Update camera rotation based on device orientation
    if (camera && gameState.isPlaying) {
        const rotationX = (deviceOrientation.beta - 90) * Math.PI / 180;
        const rotationY = deviceOrientation.alpha * Math.PI / 180;
        const rotationZ = deviceOrientation.gamma * Math.PI / 180;
        
        camera.rotation.set(rotationX * 0.1, rotationY * 0.1, rotationZ * 0.05);
    }
}

function handleDeviceMotion(event) {
    if (!gameState.isPlaying) return;
    
    const acceleration = event.acceleration;
    if (acceleration) {
        // Update player position based on device movement
        gameState.player.position.x += acceleration.x * 0.001;
        gameState.player.position.y += acceleration.y * 0.001;
        
        // Clamp to room boundaries
        const room = gameState.roomDimensions;
        gameState.player.position.x = Math.max(-room.width/2 + 0.5, 
            Math.min(room.width/2 - 0.5, gameState.player.position.x));
        
        // Send position to opponent
        if (gameState.mode === 'multiplayer' && gameState.isConnected) {
            sendGameData({
                type: 'player-position',
                position: gameState.player.position
            });
        }
    }
}

function handleTouch(event) {

    if (gameState.isPlaying && !gameState.isPaused) {
        const touch = event.touches[0];
        const ballScreenPos = getBallScreenPosition();
        
        const distance = Math.sqrt(
            Math.pow(touch.clientX - ballScreenPos.x, 2) +
            Math.pow(touch.clientY - ballScreenPos.y, 2)
        );
        
        if (distance < 100 && isPlayerInHitRange() && 
            Date.now() - gameState.ball.lastHit > gameState.settings.hitCooldown) {
            playerHitBall();
        }
    }
}


function handleClick(event) {
    // Handle menu clicks and game interactions
    if (!gameState.isPlaying) return;
    
    // Alternative hit method for desktop testing
    const ballScreenPos = getBallScreenPosition();
    const distance = Math.sqrt(
        Math.pow(event.clientX - ballScreenPos.x, 2) +
        Math.pow(event.clientY - ballScreenPos.y, 2)
    );
    
    if (distance < 100 && isPlayerInHitRange()) {
        playerHitBall();
    }
}

function handleResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

function handleVisibilityChange() {
    if (document.hidden && gameState.isPlaying) {
        pauseGame();
    }
}

// =============================================================================
// GAME CONTROLS
// =============================================================================

function pauseGame() {
    gameState.isPaused = !gameState.isPaused;
    const pauseBtn = document.getElementById('pauseBtn');
    
    if (gameState.isPaused) {
        pauseBtn.textContent = '▶️ Resume';
        updateStatus('⏸️ Game paused', 'warning');
    } else {
        pauseBtn.textContent = '⏸️ Pause';
        updateStatus('▶️ Game resumed', 'success');
        setTimeout(() => {
            if (gameState.isPlaying) {
                updateStatus('🎮 Game active', 'info');
            }
        }, 1000);
    }
    
    // Send pause state to opponent
    if (gameState.mode === 'multiplayer' && gameState.isConnected) {
        sendGameData({
            type: 'game-pause',
            isPaused: gameState.isPaused
        });
    }
}

function exitGame() {
    // Stop render loop
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    
    // Stop camera
    if (video && video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    
    // Close connections
    if (dataChannel) {
        dataChannel.close();
    }
    if (localConnection) {
        localConnection.close();
    }
    if (signalingSocket) {
        signalingSocket.close();
    }
    
    // Reset UI
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
    document.getElementById('measurementOverlay').style.display = 'none';
    document.getElementById('connectionInfo').style.display = 'none';
    
    // Reset game state
    gameState = {
        mode: null,
        isConnected: false,
        playerScore: 0,
        opponentScore: 0,
        roomId: null,
        isPlaying: false,
        isCalibrated: false,
        isPaused: false,
        roomDimensions: { width: 4.0, depth: 6.0, height: 3.0 },
        ball: { 
            position: { x: 0, y: 1, z: 0 },
            velocity: { x: 0, y: 0, z: 0.03 },
            size: 0.1,
            lastHit: 0,
            hitCount: 0
        },
        player: {
            position: { x: 0, y: 1.6, z: 2.5 },
            looking: false,
            lookDuration: 0,
            hitRadius: 1.0
        },
        opponent: {
            position: { x: 0, y: 1.6, z: -2.5 },
            isVisible: false,
            avatar: null,
            lastSeen: 0
        },
        arTracking: {
            isTracking: false,
            calibrationPoints: [],
            worldMatrix: null,
            floorLevel: 0
        },
        settings: {
            maxScore: 5,
            ballSpeed: 0.03,
            hitCooldown: 1000,
            gazeHitDuration: 300
        }
    };
    
    // Clear Three.js scene
    if (scene) {
        while(scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }
    }
}

// =============================================================================
// RENDER LOOP
// =============================================================================

function startRenderLoop() {
    updateStatus('🎬 Starting render loop...', 'info');
    
    const animate = () => {
        animationId = requestAnimationFrame(animate);
        
        // Update game physics
        updateBallPhysics();
        
        // Update AR tracking
        updateARTracking();
        
        // Update opponent avatar
        updateOpponentAvatar();
        
        // Render scene
        renderer.render(scene, camera);
        
        // Update performance stats
        updatePerformanceStats();
    };
    
    animate();
    updateStatus('✅ Render loop active', 'success');
}

function updateARTracking() {
    if (!gameState.arTracking.isTracking) return;
    
    // Update camera position based on device movement
    // In real implementation, use ARCore/ARKit for accurate tracking
    
    // Simulate subtle camera shake for realism
    if (gameState.isPlaying) {
        camera.position.x += (Math.random() - 0.5) * 0.001;
        camera.position.y += (Math.random() - 0.5) * 0.001;
        camera.position.z += (Math.random() - 0.5) * 0.001;
    }
}

function updateOpponentAvatar() {
    if (!opponentMesh || !gameState.opponent.isVisible) return;
    
    // Animate opponent based on ball position (in solo mode)
    if (gameState.mode === 'solo') {
        const ball = gameState.ball;
        const targetX = gameState.ball.position.x * 0.3; // Follow ball horizontally
        
        opponentMesh.position.x += (targetX - opponentMesh.position.x) * 0.05;
        
        // Animate hit gesture
        if (gameState.ball.position.z < -2 && Math.abs(gameState.ball.velocity.z) > 0.01) {
            opponentMesh.rotation.z = Math.sin(Date.now() * 0.01) * 0.2;
        } else {
            opponentMesh.rotation.z *= 0.9;
        }
    }
    
    // Make name tag always face camera
    const nameTag = opponentMesh.children.find(child => 
        child.geometry instanceof THREE.PlaneGeometry && 
        child.position.y > 2
    );
    if (nameTag) {
        nameTag.lookAt(camera.position);
    }
}

let performanceStats = {
    frameCount: 0,
    lastTime: Date.now(),
    fps: 0
};

function updatePerformanceStats() {
    performanceStats.frameCount++;
    const currentTime = Date.now();
    
    if (currentTime - performanceStats.lastTime >= 1000) {
        performanceStats.fps = performanceStats.frameCount;
        performanceStats.frameCount = 0;
        performanceStats.lastTime = currentTime;
        
        // Update performance indicator if needed
        if (performanceStats.fps < 20) {
            updateStatus('⚠️ Low performance detected', 'warning');
        }
    }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function updateStatus(message, type = 'info') {
    const statusElement = document.getElementById('connectionStatus');
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    
    // Auto-clear temporary messages
    if (type === 'success' || type === 'warning') {
        setTimeout(() => {
            if (statusElement.textContent === message) {
                statusElement.textContent = '🎮 Game active';
                statusElement.className = 'status info';
            }
        }, 3000);
    }
}

function updateGameStatus(message) {
    const gameStatusElement = document.getElementById('gameStatus');
    if (gameStatusElement) {
        gameStatusElement.textContent = message;
    }
}

// Canvas context roundRect polyfill for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        this.beginPath();
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
        this.closePath();
    };
}

// =============================================================================
// ERROR HANDLING AND RECOVERY
// =============================================================================

window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    updateStatus('❌ An error occurred', 'error');
    
    // Attempt to recover
    setTimeout(() => {
        if (!gameState.isPlaying) {
            updateStatus('🔄 Attempting recovery...', 'connecting');
            // Reset critical systems
            if (scene && renderer) {
                try {
                    renderer.render(scene, camera);
                    updateStatus('✅ Recovery successful', 'success');
                } catch (e) {
                    updateStatus('❌ Recovery failed - please restart', 'error');
                }
            }
        }
    }, 2000);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});

// =============================================================================
// ADVANCED AR FEATURES (for future enhancement)
// =============================================================================

class ARTracker {
    constructor() {
        this.isInitialized = false;
        this.markers = [];
        this.worldMatrix = new THREE.Matrix4();
    }
    
    async initialize() {
        // Initialize AR tracking system
        // In production, use WebXR or AR.js
        this.isInitialized = true;
        return true;
    }
    
    updateTracking() {
        // Update world tracking matrix
        // This would integrate with ARCore/ARKit
        return this.worldMatrix;
    }
    
    addMarker(position, type) {
        this.markers.push({ position, type, id: Date.now() });
    }
    
    removeMarker(id) {
        this.markers = this.markers.filter(marker => marker.id !== id);
    }
}

class GazeDetector {
    constructor() {
        this.isCalibrated = false;
        this.calibrationPoints = [];
        this.currentGaze = { x: 0, y: 0, confidence: 0 };
    }
    
    async initialize() {
        // Initialize MediaPipe Face Mesh or WebGazer
        // Real implementation would load ML models here
        this.isCalibrated = true;
        return true;
    }
    
    updateGaze(faceData) {
        // Process face landmarks to determine gaze direction
        // Real implementation would use eye landmark analysis
        return this.currentGaze;
    }
    
    calibrate(screenPoints, gazeData) {
        // Calibrate gaze tracking with known screen points
        this.calibrationPoints.push({ screenPoints, gazeData });
        return this.calibrationPoints.length >= 5;
    }
}

// =============================================================================
// MOBILE OPTIMIZATION
// =============================================================================

// Prevent zoom on mobile
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
});

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
});

// Battery optimization
if ('getBattery' in navigator) {
    navigator.getBattery().then((battery) => {
        if (battery.level < 0.2) {
            updateStatus('🔋 Low battery - consider reducing graphics', 'warning');
        }
        
        battery.addEventListener('levelchange', () => {
            if (battery.level < 0.15 && gameState.isPlaying) {
                // Reduce particle effects for battery saving
                if (gameState.particleSystem) {
                    gameState.particleSystem.visible = false;
                }
                updateStatus('🔋 Battery saver mode activated', 'warning');
            }
        });
    });
}

// Network quality monitoring
function monitorNetworkQuality() {
    if ('connection' in navigator) {
        const connection = navigator.connection;
        
        const updateNetworkStatus = () => {
            if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
                updateStatus('📶 Slow connection detected', 'warning');
            }
        };
        
        connection.addEventListener('change', updateNetworkStatus);
        updateNetworkStatus();
    }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

// Start network monitoring
monitorNetworkQuality();

// PWA Service Worker registration (for offline capability)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('ServiceWorker registered:', registration);
            })
            .catch((error) => {
                console.log('ServiceWorker registration failed:', error);
            });
    });
}

// Initialize wake lock
async function initWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            const wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                console.log('Wake lock released');
            });
        } catch (err) {
            console.log('Wake lock request failed:', err);
        }
    }
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        gameState,
        initARSystem,
        setupGazeTracking,
        updateBallPhysics,
        playerHitBall,
        aiHitBall
    };
}