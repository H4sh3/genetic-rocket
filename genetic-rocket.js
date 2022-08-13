state = {}

const THRUST_CHANGE = "thrust change"
const ROTATION_CHANGE = "rotation change"

function setup() {
  const canvas = createCanvas(700, 700)
  canvas.parent("p5Div")
  angleMode(DEGREES)
  frameRate(60)
  state.settings = {
    thrustRange: 1, // range a thrust action can change the current thrust
    rotationRange: 15, // range a rotation action can change the rockets rotation
    mutationRate: 0.9, // how likely it is to change a action or a actions value, see mutateActions function
    gravitation: 0.3, // gravitational constant
    pretrainGenerations: 33, // first n training generations that are not rendered: much faster training
    fleetSize: 1000, // number of mutated ships
    initialBlock: 25 // number of iterations till the rocket can perform actions
  }
  reset()
  state.ground = new Ground()
  state.center = createVector(width / 2, state.ground.pos.y)
  state.landingSpot = createVector(width / 2, height - 50)
  state.thrustActionSpace = []
  state.bestScore = 0
  state.rotationActionSpace = []

  const numActions = 50
  for (let i = 0; i < numActions; i++) {
    state.thrustActionSpace.push(map(i, 0, numActions, -0.1, 0.1))
    state.rotationActionSpace.push(map(i, 0, numActions, -15, 15))
  }
  renderEnvironment()
}

function reset() {
  state.fleet = new Fleet()
  state.fleet.initFleet()
  state.logs = []
  state.generation = 0
  changeDivStatus("training", false)
  changeDivStatus("trained", false)
  changeDivStatus("untrained", true)
}

function changeDivStatus(name, active) {
  var element = document.getElementById(name);
  if (active) {
    element.classList.add("active");
    element.classList.remove("inactive");
  } else {
    element.classList.add("inactive");
    element.classList.remove("active");
  }
}

function preTraining() {
  return (state.generation >= 1 && state.bestScore < 0.8) || state.pretrainGenerations > 0
}

function draw() {
  if (preTraining()) { // Run a complete iteration in one draw cycle
    changeDivStatus("training", true)
    changeDivStatus("trained", false)
    changeDivStatus("untrained", false)
    while (!state.fleet.done()) {
      state.fleet.update()
    }
    evaluate()
    renderLogs()
    state.pretrainGenerations--
  } else { // Visualize environment
    if (!state.fleet.done()) {
      if (state.generation >= 3 && !preTraining()) {
        changeDivStatus("untrained", false)
        changeDivStatus("training", false)
        changeDivStatus("trained", true)
        renderLogs()
      }
      state.fleet.update()
      renderEnvironment()
      renderFleet()
      renderLogs()
    } else {
      evaluate()
    }
  }
}


function trainMore() {
  state.pretrainGenerations = 100
}

function evaluate() {
  const ships = state.fleet.ships.filter(s => s.landed)

  if (ships.length > 0) { // some ships didn't crashed, used them for next generation
    const bestActions = getBestActions(ships)
    state.fleet = new Fleet()
    state.fleet.createNextGeneration(bestActions)
  } else { // all ships crashed; generate new batch
    state.fleet = new Fleet()
    state.fleet.initFleet()
  }
  state.generation += 1
}

function getBestActions(ships) {
  let bestShip = ships[0]
  let bestScore = -Infinity

  for (let i = 0; i < ships.length; i++) {
    const ship = ships[i]
    let lastVel = ship.velHistory.slice(ship.velHistory.length - 120, ship.velHistory.length)
    let avgVel = lastVel.reduce((acc, v) => {
      acc += v
      acc /= 2
      return acc
    }, 0)

    const distScore = ship.distToCenter
    const velScore = avgVel
    const score = 1 / (distScore + velScore)
    if (score > bestScore) {
      bestScore = score
      bestShip = ship
    }
  }

  if (bestScore > state.bestScore) {
    state.bestScore = bestScore
  }

  state.logs.push(bestScore)

  return bestShip.actions
}

function rotationAction() {
  return { actionType: ROTATION_CHANGE, value: random(state.rotationActionSpace) }
}

function thrustAction() {
  return { actionType: THRUST_CHANGE, value: random(state.thrustActionSpace) }
}

function generateActions() {
  const actions = []
  while (actions.length < 150) {
    if (random() > 0.5) {
      actions.push(thrustAction())
    } else {
      actions.push(rotationAction())
    }
  }
  return actions
}

function mutateActions(actions) {
  const newActions = []
  actions.forEach(a => {
    if (random() > state.settings.mutationRate) { // should action be mutated
      if (random() > 0.5) { // 50% chance to change action type
        if (a.actionType === ROTATION_CHANGE) {
          newActions.push(thrustAction())
        } else {
          newActions.push(rotationAction())
        }
      } else { // 50% chance to change action value
        if (a.actionType === ROTATION_CHANGE) {
          newActions.push(rotationAction())
        } else {
          newActions.push(thrustAction())
        }
      }
    } else { // keep action unchanged
      newActions.push(a)
    }
  })
  return newActions
}

class Fleet {
  constructor() {
    this.ships = []
    this.fleetSize = state.settings.fleetSize
    this.actionIndex = 0
    this.iteration = 0
  }

  createNextGeneration(actions) {
    // keep one unmutaded
    this.ships.push(new Ship(actions))
    // always some new ships
    while (this.ships.length < 15) {
      this.ships.push(new Ship())
    }

    while (this.ships.length < this.fleetSize) {
      const newActions = mutateActions(actions)
      this.ships.push(new Ship(newActions))
    }
  }

  initFleet() {
    while (this.ships.length < this.fleetSize) {
      this.ships.push(new Ship())
    }
  }

  update() {
    this.ships.filter(s => !s.landed).forEach((s, i) => {
      s.update(this.iteration, i)
    })

    this.iteration += 1
  }

  done() {
    return this.allShipsCrashed() || this.iteration > 125
  }

  allShipsCrashed() {
    return this.ships.filter(s => s.landed).length == this.fleetSize
  }
}

class Ship {
  constructor(actions) {
    this.actions = actions ? actions : generateActions();
    this.pos = createVector(width / 2, 50)
    this.vel = createVector(0, 0);
    this.rotation = p5.Vector.fromAngle(radians(90), 1);
    this.size = createVector(10, 20);
    this.thrust = 0;
    this.landed = false;
    this.distToCenter = Infinity
    this.actionIndex = 0
    this.velHistory = []
    this.reward = 0
    this.sumDistCenter = 0
    this.particles = []
  }

  changeRotation(value) { // value in degrees
    this.rotation.normalize().rotate(radians(value))
  }

  changeThrust(value) {
    this.thrust += value
    this.thrust = this.thrust < 0 ? 0 : this.thrust
  }

  update(iteration, index) {
    const acc = createVector(0, state.settings.gravitation)
    if (this.pos.y >= state.ground.pos.y) {
      this.landed = true
      this.distToCenter = this.pos.dist(state.center)
    }

    if (iteration > state.settings.initialBlock) {
      const action = this.actions[this.actionIndex]

      if (action.actionType == THRUST_CHANGE) {
        this.changeThrust(action.value)
      } else if (action.actionType == ROTATION_CHANGE) {
        this.changeRotation(action.value)
      }

      acc.add(this.rotation.copy().mult(this.thrust).rotate(radians(90)))
      // acc.add(this.thrust)

      this.actionIndex++;
    }

    this.vel.add(acc)
    this.pos.add(this.vel)
    this.velHistory.push(this.vel.mag())
    this.sumDistCenter += this.pos.dist(state.center)

    // particles 
    if (index == 0) {
      const repeats = map(this.thrust, 0, 10, 1, 20)
      for (let i = 0; i < repeats; i++) {
        this.particles.push(new Particle(this.pos.copy(), 50 * this.thrust, this.rotation.copy().mult(-this.thrust)))
      }
    }

    this.particles.forEach(p => p.update())
    this.particles = this.particles.filter(p => p.size > 0)
  }
}

class Particle {
  constructor(pos, size, vel) {
    this.pos = pos
    this.size = size
    this.vel = vel.mult(2)
  }

  update() {
    this.pos.add(this.vel)
    this.size -= 0.5
  }
}