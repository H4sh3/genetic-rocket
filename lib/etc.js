
function renderEnvironment() {
  b1 = color(52, 168, 235)
  b2 = color(3, 63, 161)
  setGradient(0, 0, width, height, b2, b1, 1);
  stroke(0)
  renderGround(state.ground)
  renderLandingSpot(state.landingSpot)
}

function renderFleet() {
  state.fleet.ships.forEach((s, i) => renderShip(s, i))
}

class Ground {
  constructor() {
    this.pos = createVector(0, height - 50)
    this.size = createVector(width, 50)
  }
}

function renderGround(ground) {
  push()
  translate(ground.pos.x, ground.pos.y)
  fill(0, 191, 41)
  rect(0, 0, ground.size.x, ground.size.y)
  pop()
}

function renderLandingSpot(spot) {
  push()
  translate(spot.x, spot.y)
  fill(160, 160, 160)
  ellipse(0, 10, 150, 10)
  pop()
}

function renderShip(ship, i) {
  if (i == 0) {
    ship.particles.forEach(p => {
      noStroke()
      fill(120, 120, 120, 10)
      ellipse(p.pos.x, p.pos.y, p.size, p.size)
    })
  }
  push()
  translate(ship.pos.x, ship.pos.y)
  rotate(degrees(ship.rotation.heading()))
  if (i != 0) {
    if (state.showAll) {
      noStroke()
      fill(0, 255, 0, 50)
      rect(0, 0, ship.size.x, ship.size.y)
    }
  } else {
    stroke(0)
    fill(170, 170, 170)
    rect(0, 0, ship.size.x, ship.size.y)
    fill(255, 0, 0)
    rect(0, 0, ship.size.x, -ship.thrust * 15)
    beginShape();
    fill(0)
    vertex(-1, ship.size.y);
    vertex(ship.size.x / 2, 35);
    vertex(ship.size.x + 1.5, ship.size.y);
    endShape(CLOSE);
  }
  pop()


}

function renderLogs() {
  if (state.logs.length >= 2) {

    const max = state.logs.reduce(function (a, b) {
      return Math.max(a, b);
    });
    const logWindowHeight = 100;
    const logWindowWidth = 150;
    fill(255)
    rect(2, 2, logWindowWidth, logWindowHeight)
    stroke(255)
    fill(0)
    text("Fitness:", 4, 12)
    for (let i = 0; i < state.logs.length - 1; i++) {
      p1 = state.logs[i]
      p2 = state.logs[i + 1]
      if (p1 && p2) {
        const x1 = map(i, 0, state.logs.length, 0, logWindowWidth)
        const y1 = map(p1, 0, max, 0, logWindowHeight - 20)
        const x2 = map(i + 1, 0, state.logs.length, 0, logWindowWidth)
        const y2 = map(p2, 0, max, 0, logWindowHeight - 20)
        stroke(0)
        strokeWeight(1)
        line(x1, logWindowHeight - y1, x2, logWindowHeight - y2)
      }
    }

    if (state.logs.length > logWindowWidth) {
      state.logs.shift()
    }
  }
}