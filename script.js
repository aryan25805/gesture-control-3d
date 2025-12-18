// --- Mobile Optimization ---
const isMobile = window.innerWidth < 768;
const particleCount = isMobile ? 3500 : 8000; // Less particles on phone
const connectionDensity = 30; // How "thick" the hand looks

// --- Three.js Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 30; // Default Zoom

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Particle System ---
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const targetPositions = new Float32Array(particleCount * 3);
const colors = new Float32Array(particleCount * 3);

for (let i = 0; i < particleCount * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 50; // Start Randomly
    targetPositions[i] = positions[i];
    colors[i] = 1.0; 
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const material = new THREE.PointsMaterial({
    size: isMobile ? 0.4 : 0.2, // Bigger dots on mobile to see better
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.9
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);

// --- Hand Logic (The "Bones" of the hand) ---
// These pairs represent connections (e.g., Wrist to Thumb Base)
const handConnections = [
    [0,1], [1,2], [2,3], [3,4],       // Thumb
    [0,5], [5,6], [6,7], [7,8],       // Index
    [0,9], [9,10], [10,11], [11,12],  // Middle
    [0,13], [13,14], [14,15], [15,16],// Ring
    [0,17], [17,18], [18,19], [19,20] // Pinky
];

let handDetected = false;

// --- MediaPipe Handling ---
const videoElement = document.getElementsByClassName('input_video')[0];

function onResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handDetected = true;
        const landmarks = results.multiHandLandmarks[0];

        // 1. Calculate Pinch for Zoom
        const thumb = landmarks[4];
        const index = landmarks[8];
        const pinchDist = Math.sqrt(
            Math.pow(thumb.x - index.x, 2) + Math.pow(thumb.y - index.y, 2)
        );
        
        // Map pinch distance to Camera Z (Zoom)
        // Closer pinch = Zoom In (Camera moves closer)
        const targetZoom = 10 + (pinchDist * 80); 
        camera.position.z += (targetZoom - camera.position.z) * 0.1; // Smooth lerp

        // 2. Map Particles to Hand Shape
        let pIndex = 0;
        
        // Loop through the "bones" of the hand
        handConnections.forEach(pair => {
            const p1 = landmarks[pair[0]];
            const p2 = landmarks[pair[1]];

            // Convert normalized coordinates (0-1) to Three.js World Coordinates
            // We flip Y and scale X/Y to fill screen
            const v1 = new THREE.Vector3((0.5 - p1.x) * 40, (0.5 - p1.y) * 30, 0);
            const v2 = new THREE.Vector3((0.5 - p2.x) * 40, (0.5 - p2.y) * 30, 0);

            // Distribute particles along this bone
            const particlesPerBone = Math.floor(particleCount / handConnections.length);

            for (let j = 0; j < particlesPerBone; j++) {
                if (pIndex >= particleCount * 3) break;

                const t = Math.random(); // Random point between joint 1 and 2
                // Interpolate
                const x = v1.x + (v2.x - v1.x) * t;
                const y = v1.y + (v2.y - v1.y) * t;
                
                // Add some "thickness" (random scatter)
                const jitter = 0.8; 
                targetPositions[pIndex] = x + (Math.random() - 0.5) * jitter;
                targetPositions[pIndex+1] = y + (Math.random() - 0.5) * jitter;
                targetPositions[pIndex+2] = (Math.random() - 0.5) * jitter; // Z depth

                pIndex += 3;
            }
        });

    } else {
        handDetected = false;
        // Idle animation: Floating Cloud
        camera.position.z += (30 - camera.position.z) * 0.05; // Reset zoom
        
        for (let i = 0; i < particleCount * 3; i+=3) {
            targetPositions[i] += (Math.random() - 0.5) * 0.1;
            targetPositions[i+1] += (Math.random() - 0.5) * 0.1;
            // Gently pull back to center if too far
            if(targetPositions[i] > 20) targetPositions[i] -= 0.5;
            if(targetPositions[i] < -20) targetPositions[i] += 0.5;
        }
    }
}

// --- Initialize MediaPipe ---
const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

const cameraUtils = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 640,
    height: 480,
    facingMode: "user" // Ensures Front Camera on Mobile
});
cameraUtils.start();

// --- UI Logic ---
function toggleModal() {
    const modal = document.getElementById('modal');
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    const positionsArray = geometry.attributes.position.array;
    const colorsArray = geometry.attributes.color.array;

    for (let i = 0; i < particleCount * 3; i += 3) {
        // Smoothly move current position to target position
        positionsArray[i] += (targetPositions[i] - positionsArray[i]) * 0.15;
        positionsArray[i+1] += (targetPositions[i+1] - positionsArray[i+1]) * 0.15;
        positionsArray[i+2] += (targetPositions[i+2] - positionsArray[i+2]) * 0.15;

        // Color Logic: Blue when idle, Green/Cyan when active
        if (handDetected) {
            colorsArray[i] = 0.0; // R
            colorsArray[i+1] = 1.0; // G
            colorsArray[i+2] = 0.8; // B
        } else {
            colorsArray[i] = 0.2; // R
            colorsArray[i+1] = 0.5; // G
            colorsArray[i+2] = 1.0; // B
        }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    
    renderer.render(scene, camera);
}

// Resize Handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();