// Service Worker for AR PongBall PWA
const CACHE_NAME = 'ar-pongball-v1.0.0';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/game.js',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching files');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('Service Worker: Installation complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Installation failed', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activation complete');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip external APIs and WebSocket connections
    if (event.request.url.includes('websocket') || 
        event.request.url.includes('/api/') ||
        event.request.url.includes('stun:') ||
        event.request.url.includes('turn:')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version if available
                if (response) {
                    console.log('Service Worker: Serving from cache', event.request.url);
                    return response;
                }
                
                // Otherwise fetch from network
                console.log('Service Worker: Fetching from network', event.request.url);
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache if response is not ok
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clone response before caching
                        const responseToCache = response.clone();
                        
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return response;
                    })
                    .catch((error) => {
                        console.error('Service Worker: Fetch failed', error);
                        
                        // Return offline page for navigation requests
                        if (event.request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                        
                        // Return empty response for other requests
                        return new Response('', {
                            status: 408,
                            statusText: 'Network timeout'
                        });
                    });
            })
    );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
    if (event.tag === 'game-data-sync') {
        event.waitUntil(syncGameData());
    }
});

async function syncGameData() {
    try {
        // Sync any pending game data when back online
        const gameData = await getStoredGameData();
        if (gameData && gameData.length > 0) {
            await uploadGameData(gameData);
            await clearStoredGameData();
        }
    } catch (error) {
        console.error('Background sync failed:', error);
    }
}

// Push notifications for multiplayer invites
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    const data = event.data.json();
    const options = {
        body: data.body || 'You have a new game invitation!',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200],
        data: {
            roomId: data.roomId,
            action: 'join-game'
        },
        actions: [
            {
                action: 'join',
                title: 'Join Game',
                icon: '/join-icon.png'
            },
            {
                action: 'decline',
                title: 'Decline',
                icon: '/decline-icon.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('AR PongBall Invite', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const { action, data } = event;
    
    if (action === 'join' && data.roomId) {
        // Open app and join room
        event.waitUntil(
            clients.openWindow(`/?room=${data.roomId}`)
        );
    } else if (action === 'decline') {
        // Send decline message to server
        fetch('/api/decline-invite', {
            method: 'POST',
            body: JSON.stringify({ roomId: data.roomId })
        });
    }
});

// Message handling from main thread
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'store-game-data':
            storeGameData(data);
            break;
            
        case 'get-cache-size':
            getCacheSize().then(size => {
                event.ports[0].postMessage({ cacheSize: size });
            });
            break;
            
        case 'clear-cache':
            clearAllCaches().then(() => {
                event.ports[0].postMessage({ success: true });
            });
            break;
    }
});

// Cache management utilities
async function getCacheSize() {
    const cacheNames = await caches.keys();
    let totalSize = 0;
    
    for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        
        for (const request of requests) {
            const response = await cache.match(request);
            if (response) {
                const blob = await response.blob();
                totalSize += blob.size;
            }
        }
    }
    
    return totalSize;
}

async function clearAllCaches() {
    const cacheNames = await caches.keys();
    return Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
    );
}

// IndexedDB utilities for offline game data
async function storeGameData(data) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ARPongBallDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['gameData'], 'readwrite');
            const store = transaction.objectStore('gameData');
            
            store.add({
                ...data,
                timestamp: Date.now(),
                synced: false
            });
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const store = db.createObjectStore('gameData', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('synced', 'synced', { unique: false });
        };
    });
}

async function getStoredGameData() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ARPongBallDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['gameData'], 'readonly');
            const store = transaction.objectStore('gameData');
            const index = store.index('synced');
            
            const getAllRequest = index.getAll(false); // Get unsynced data
            
            getAllRequest.onsuccess = () => resolve(getAllRequest.result);
            getAllRequest.onerror = () => reject(getAllRequest.error);
        };
    });
}

async function clearStoredGameData() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ARPongBallDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['gameData'], 'readwrite');
            const store = transaction.objectStore('gameData');
            
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => resolve();
            clearRequest.onerror = () => reject(clearRequest.error);
        };
    });
}

async function uploadGameData(gameDataArray) {
    // Upload game statistics to server
    try {
        const response = await fetch('/api/sync-game-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(gameDataArray)
        });
        
        return response.ok;
    } catch (error) {
        console.error('Failed to upload game data:', error);
        return false;
    }
}

// Performance monitoring
self.addEventListener('message', (event) => {
    if (event.data.type === 'performance-report') {
        console.log('Performance Report:', event.data.metrics);
        
        // Store performance data for analytics
        storeGameData({
            type: 'performance',
            metrics: event.data.metrics,
            userAgent: navigator.userAgent,
            timestamp: Date.now()
        });
    }
});

console.log('Service Worker: Loaded successfully');