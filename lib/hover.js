state = {}

const THRUST_CHANGE = "thrust change"
const ROTATION_CHANGE = "rotation change"

function setup() {
  createCanvas(700, 700)
  angleMode(DEGREES)
  frameRate(45)
  state.settings = {
    // min,max range a thrust action can change the current thrust
    thrustRange: 1,
    // min,max range a rotation action can change the rockets rotation
    rotationRange: 15,
    // how likely it is to change a action or a actions value, see mutateActions function
    mutationRate: 0.9,
    // gravitational constant
    gravitation: 0.5,
    // first n training generations that are not rendered: much faster training
    pretrainGenerations: 10,
    fleetSize: 1000,
    // number of iterations till the rocket can perform actions
    initialBlock: 15
  }
  state.ground = new Ground()
  state.center = createVector(width / 2, state.ground.pos.y)
  state.landingSpot = createVector(width / 2, height - 50)
  state.fleet = new Fleet()
  state.fleet.initFleet()
  state.showAll = false
  state.logs = []
  state.generation = 0
}

function keyPressed() {
  if (keyCode === 32) {
    state.showAll = !state.showAll
  }
}

function preTraining() {
  return state.generation < state.settings.pretrainGenerations
}

function draw() {
  if (preTraining()) {
    while (!state.fleet.done()) {
      state.fleet.update()
    }
    evaluate()
  } else {
    if (!state.fleet.done()) {
      // update ships
      state.fleet.update()
      renderEnvironment()
    } else {
      evaluate()
    }
  }
  renderLogs()
}

function renderEnvironment() {
  b1 = color(52, 168, 235)
  b2 = color(3, 63, 161)
  setGradient(0, 0, width, height, b2, b1, 1);
  stroke(0)
  state.fleet.ships.forEach((s, i) => renderShip(s, i))
  renderGround(state.ground)
  renderLandingSpot(state.landingSpot)
}

function evaluate() {
  const ships = state.fleet.ships.filter(s => !s.crashed)
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
  let smallestDist = Infinity
  for (let i = 0; i < ships.length; i++) {
    if (ships[i].sumDistCenter < smallestDist) {
      smallestDist = ships[i].sumDistCenter
      bestShip = ships[i]
    }
  }

  state.logs.push(smallestDist)
  return bestShip.actions
}

function rotationAction() {
  return { actionType: ROTATION_CHANGE, value: random(-state.settings.rotationRange, state.settings.rotationRange) }
}

function thrustAction() {
  return { actionType: THRUST_CHANGE, value: random(-state.settings.thrustRange, state.settings.thrustRange) }
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
    if (random() > state.settings.mutationRate) {
      if (a.actionType === ROTATION_CHANGE) {
        newActions.push(rotationAction())
      } else {
        newActions.push(thrustAction())
      }
    } else {
      newActions.push({ actionType: a.actionType, value: a.value })
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
    this.ships.filter(s => !s.crashed).forEach(s => {
      s.update(this.iteration)
    })

    this.iteration += 1
  }

  done() {
    return this.allShipsCrashed() || this.iteration > 150
  }

  allShipsCrashed() {
    return this.ships.filter(s => s.crashed).length == this.fleetSize
  }
}

class Ship {
  constructor(actions) {
    this.actions = actions ? actions : generateActions();
    this.pos = createVector(width / 2, height / 20)
    this.vel = createVector(0, 0);
    this.rotation = p5.Vector.fromAngle(radians(90), 1);
    this.size = createVector(10, 20);
    this.thrust = -1;
    this.crashed = false;
    this.actionIndex = 0
    this.velHistory = []
    this.reward = 0
    this.sumDistCenter = 0
  }

  changeRotation(value) { // value in degrees
    this.rotation.normalize().rotate(radians(value))
  }

  changeThrust(value) {
    this.thrust += value
    this.thrust = this.thrust < 0 ? 0 : this.thrust
  }

  update(i) {
    const acc = createVector(0, state.settings.gravitation)
    if (this.pos.y >= state.ground.pos.y) {
      this.crashed = true
    }

    if (i > state.settings.initialBlock) {
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
  }
}