// neuralBackground.js
const canvas = document.getElementById('neural-bg');
const ctx = canvas.getContext('2d');
let width, height;
let nodes = [];

function resize() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

class Node {
  constructor(index) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = (Math.random() - 0.5) * 0.5;
    this.label = `Node ${index}`;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    if (this.x < 0 || this.x > width) this.vx *= -1;
    if (this.y < 0 || this.y > height) this.vy *= -1;
  }

  draw() {
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 8);
    gradient.addColorStop(0, '#0ff');
    gradient.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.arc(this.x, this.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  isHovered(mx, my) {
    const dx = this.x - mx;
    const dy = this.y - my;
    return dx * dx + dy * dy < 9 ** 2;
  }
}

function connectNodes() {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      let dx = nodes[i].x - nodes[j].x;
      let dy = nodes[i].y - nodes[j].y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 100) {
        ctx.strokeStyle = `rgba(0, 255, 255, ${1 - dist / 100})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
  }
}

function drawTooltip(text, x, y) {
  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(x + 10, y - 20, ctx.measureText(text).width + 10, 20);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x + 15, y - 5);
}

let mouseX = -1, mouseY = -1;
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});

function animate() {
  ctx.clearRect(0, 0, width, height);
  nodes.forEach(n => n.update());
  connectNodes();
  nodes.forEach(n => n.draw());

  // Hover logic
  for (let node of nodes) {
    if (node.isHovered(mouseX, mouseY)) {
      drawTooltip(node.label, node.x, node.y);
      break;
    }
  }

  requestAnimationFrame(animate);
}

// Initialize nodes and start animation
for (let i = 0; i < 80; i++) nodes.push(new Node(i + 1));
animate();
