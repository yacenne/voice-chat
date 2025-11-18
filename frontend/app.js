// ===== Configuration =====
const WS_URL = 'ws://localhost:8000/ws/';
const STUN_SERVER = 'stun:stun.l.google.com:19302';

// ===== DOM Elements =====
const userIdInput = document.getElementById('user-id');
const targetIdInput = document.getElementById('target-id');
const connectBtn = document.getElementById('connect-btn');
const callBtn = document.getElementById('call-btn');
const hangupBtn = document.getElementById('hangup-btn');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const setupPanel = document.getElementById('setup-panel');
const callPanel = document.getElementById('call-panel');
const remoteAudio = document.getElementById('remote-audio');
const muteToggle = document.getElementById('mute-toggle');
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');

// ===== State =====
let websocket = null;
let peerConnection = null;
let localStream = null;
let userId = null;
let targetId = null;

// ===== Events =====
connectBtn.addEventListener('click', connectToServer);
callBtn.addEventListener('click', initiateCall);
hangupBtn.addEventListener('click', hangUp);
muteToggle.addEventListener('change', toggleMute);
volumeSlider.addEventListener('input', () => {
    adjustVolume();
    volumeValue.textContent = volumeSlider.value + '%';
});

// ===== Connect =====
async function connectToServer() {
    userId = userIdInput.value.trim();
    targetId = targetIdInput.value.trim();
    
    if (!userId || !targetId) {
        alert('⚠️ Enter both names!');
        return;
    }
    
    if (userId === targetId) {
        alert('⚠️ Names must be DIFFERENT!\n\nExample:\nYour Name: alice\nFriend\'s Name: bob');
        return;
    }
    
    console.log('═══════════════════════════════════════');
    console.log('🔗 CONNECTING');
    console.log('My ID:', userId);
    console.log('Target:', targetId);
    console.log('═══════════════════════════════════════');
    
    websocket = new WebSocket(WS_URL + userId);
    
    websocket.onopen = () => {
        console.log('✅✅✅ CONNECTED TO SERVER ✅✅✅');
        statusText.textContent = '✅ Connected';
        statusDot.classList.add('connected');
        setupPanel.style.display = 'none';
        callPanel.style.display = 'block';
        document.getElementById('display-user-id').textContent = userId;
        document.getElementById('connection-status').textContent = 'Connected';
    };
    
    websocket.onmessage = handleMessage;
    
    websocket.onerror = () => {
        console.error('❌ WebSocket ERROR');
        alert('Connection failed! Is backend running?');
    };
    
    websocket.onclose = () => {
        console.log('❌ Disconnected');
        statusText.textContent = 'Disconnected';
        statusDot.classList.remove('connected');
        document.getElementById('connection-status').textContent = 'Disconnected';
    };
}

// ===== Handle Messages =====
async function handleMessage(event) {
    const msg = JSON.parse(event.data);
    console.log('📨 Received:', msg.type, 'from:', msg.from);
    
    switch (msg.type) {
        case 'welcome':
            console.log('👋', msg.message);
            console.log('📋 Online users:', msg.online_users);
            break;
            
        case 'offer':
            console.log('📞 INCOMING CALL from', msg.from);
            await handleOffer(msg);
            break;
            
        case 'answer':
            console.log('✅ CALL ANSWERED by', msg.from);
            await handleAnswer(msg);
            break;
            
        case 'ice-candidate':
            console.log('📡 ICE candidate from', msg.from);
            await handleIceCandidate(msg);
            break;
            
        case 'error':
            console.error('❌', msg.message);
            alert('❌ ' + msg.message);
            break;
    }
}

// ===== Initiate Call =====
async function initiateCall() {
    console.log('═══════════════════════════════════════');
    console.log('📞 CALLING', targetId);
    console.log('═══════════════════════════════════════');
    
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        alert('❌ Not connected! Click "Connect to Server" first.');
        return;
    }
    
    try {
        // Get mic
        console.log('🎤 Requesting microphone...');
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            }
        });
        console.log('✅ Microphone OK');
        
        // Create peer
        createPeerConnection();
        
        // Add tracks
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        console.log('✅ Tracks added');
        
        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log('✅ Offer created');
        
        // Send offer
        websocket.send(JSON.stringify({
            type: 'offer',
            target: targetId,
            offer: offer
        }));
        console.log('📤 Offer sent to', targetId);
        
        statusText.textContent = `Calling ${targetId}...`;
        callBtn.disabled = true;
        hangupBtn.disabled = false;
        
    } catch (error) {
        console.error('❌ Error:', error);
        if (error.name === 'NotAllowedError') {
            alert('⚠️ Allow microphone access!');
        } else {
            alert('❌ ' + error.message);
        }
    }
}

// ===== Create Peer =====
function createPeerConnection() {
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: STUN_SERVER }]
    });
    
    console.log('🔗 Peer connection created');
    
    peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            console.log('📡 Sending ICE');
            websocket.send(JSON.stringify({
                type: 'ice-candidate',
                target: targetId,
                candidate: e.candidate
            }));
        }
    };
    
    peerConnection.ontrack = (e) => {
        console.log('🎵 AUDIO RECEIVED!');
        remoteAudio.srcObject = e.streams[0];
        statusText.textContent = `📞 Connected to ${targetId}`;
        document.getElementById('connected-peer').textContent = targetId;
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('🔄 State:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            console.log('✅✅✅ CALL CONNECTED! ✅✅✅');
        }
        if (peerConnection.connectionState === 'failed') {
            console.log('❌ Connection FAILED');
            hangUp();
        }
    };
}

// ===== Handle Offer =====
async function handleOffer(msg) {
    console.log('📞 Answering call from', msg.from);
    targetId = msg.from;
    
    try {
        // Get mic
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            }
        });
        console.log('✅ Microphone OK');
        
        // Create peer
        createPeerConnection();
        
        // Add tracks
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Set remote
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.offer));
        console.log('✅ Remote description set');
        
        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        console.log('✅ Answer created');
        
        // Send answer
        websocket.send(JSON.stringify({
            type: 'answer',
            target: targetId,
            answer: answer
        }));
        console.log('📤 Answer sent to', targetId);
        
        statusText.textContent = `📞 Connected to ${targetId}`;
        callBtn.disabled = true;
        hangupBtn.disabled = false;
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// ===== Handle Answer =====
async function handleAnswer(msg) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.answer));
        console.log('✅ Answer processed');
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// ===== Handle ICE =====
async function handleIceCandidate(msg) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
        console.log('✅ ICE added');
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// ===== Hang Up =====
function hangUp() {
    console.log('📴 Hanging up');
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    
    statusText.textContent = 'Call ended';
    document.getElementById('connected-peer').textContent = '-';
    callBtn.disabled = false;
    hangupBtn.disabled = true;
}

// ===== Mute =====
function toggleMute() {
    if (localStream) {
        const track = localStream.getAudioTracks()[0];
        track.enabled = muteToggle.checked;
        muteToggle.nextElementSibling.textContent = 
            muteToggle.checked ? '🎤 Mic On' : '🔇 Mic Off';
    }
}

// ===== Volume =====
function adjustVolume() {
    remoteAudio.volume = volumeSlider.value / 100;
}

// ===== Init =====
console.log('═══════════════════════════════════════');
console.log('🎙️ VOICE CHAT LOADED');
console.log('═══════════════════════════════════════');
console.log('Backend: http://localhost:8000');
console.log('Frontend: http://localhost:3000');
console.log('═══════════════════════════════════════');
console.log('STEPS:');
console.log('1. Open TWO browser windows');
console.log('2. Use DIFFERENT names (alice & bob)');
console.log('3. Connect BOTH to server');
console.log('4. Click "Start Call" in one window');
console.log('═══════════════════════════════════════');
