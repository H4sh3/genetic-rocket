state = {}

const THRUST_CHANGE = "thrust change"
const ROTATION_CHANGE = "rotation change"

function setup() {
  createCanvas(700, 700)
  angleMode(DEGREES)
  frameRate(45)
  state.settings = {
    thrustRange: 1, // range a thrust action can change the current thrust
    rotationRange: 15, // range a rotation action can change the rockets rotation
    mutationRate: 0.9, // how likely it is to change a action or a actions value, see mutateActions function
    gravitation: 0.5, // gravitational constant
    pretrainGenerations: 1, // first n training generations that are not rendered: much faster training
    fleetSize: 1000, // number of mutated ships
    initialBlock: 25 // number of iterations till the rocket can perform actions
  }
  state.ground = new Ground()
  state.center = createVector(width / 2, state.ground.pos.y)
  state.landingSpot = createVector(width / 2, height - 50)
  state.fleet = new Fleet()
  state.fleet.initFleet()
  state.showAll = false
  state.logs = []
  state.generation = 0
  state.thrustActionSpace = []
  state.rotationActionSpace = []

  const numActions = 25
  for (let i = 0; i < numActions; i++) {
    state.thrustActionSpace.push(map(i, 0, numActions, -1, 1))
    state.rotationActionSpace.push(map(i, 0, numActions, -15, 15))
  }
  renderEnvironment()
}

function preTraining() {
  return state.generation < state.settings.pretrainGenerations
}

function draw() {
  if (preTraining()) { // Run a complete iteration in one draw cycle
    while (!state.fleet.done()) {
      state.fleet.update()
    }
    evaluate()
  } else { // Visualize environment
    if (!state.fleet.done()) {
      state.fleet.update()
      renderEnvironment()
      renderFleet()
    } else {
      evaluate()
    }
  }
  renderLogs()
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
  let smallestVel = Infinity
  for (let i = 0; i < ships.length; i++) {
    let lastVel = ships[i].velHistory.slice(ships[i].velHistory.length - 55, ships[i].velHistory.length)
    let avgVel = lastVel.reduce((acc, v) => {
      acc += v
      acc /= 2
      return acc
    }, 1)
    if (avgVel < smallestVel) {
      smallestVel = avgVel
      bestShip = ships[i]
    }
  }

  state.logs.push(smallestVel)
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
    this.ships.push(new Ship(actions))
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
    return this.allShipsCrashed() || this.iteration > 75
  }

  allShipsCrashed() {
    return this.ships.filter(s => s.landed).length == this.fleetSize
  }
}

class Ship {
  constructor(actions) {
    this.actions = actions ? actions : generateActions();
    this.pos = createVector(width / 2, height / 20)
    this.vel = createVector(0, 0);
    this.rotation = p5.Vector.fromAngle(radians(90), 1);
    this.size = createVector(10, 20);
    this.thrust = 0;
    this.landed = false;
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
        this.particles.push(new Particle(this.pos.copy(), 50*this.thrust, this.rotation.copy().mult(-this.thrust)))
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