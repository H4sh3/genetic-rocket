state = {}

const THRUST_CHANGE = "thrust change"
const ROTATION_CHANGE = "rotation change"

function setup() {
    const canvas = createCanvas(700, 700)
    canvas.parent("p5Div");
    angleMode(DEGREES)
    frameRate(60)
    state.settings = {
        thrustRange: 1, // range a thrust action can change the current thrust
        rotationRange: 15, // rotation range that a rotation action can change the rockets rotation
        mutationRate: 0.9, // how likely it is to change a action or a actions value, see mutateActions function
        gravitation: 0.5, // gravitational constant
        pretrainGenerations: 250, // first n training generations that are not rendered results in faster training
        populationSize: 1000, // population size
        initialBlock: 15 // number of iterations till the rocket can perform actions
    }
    state.ground = new Ground()
    state.center = createVector(width / 2, state.ground.pos.y)
    state.landingSpot = createVector(width / 2, height - 50)
    state.fleet = new Fleet()
    state.fleet.initFleet()
    state.showAll = false
    state.logs = []
    state.generation = 100
    state.maxIter = 100
    renderEnvironment()
}

function reset() {
    state.logs = []
    state.generation = 0
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
        const best10PercentNN = getBestNeuralNetworks(ships)
        state.fleet = new Fleet()
        state.fleet.createNextGeneration(best10PercentNN)
    } else { // all ships crashed; generate new batch
        state.fleet = new Fleet()
        state.fleet.initFleet()
    }
    state.generation += 1
    if (state.generation % 100 === 0) {
        renderEnvironment()
        text(state.generation, width / 2, height / 2)
    }
}

function calculateAvgVel(ship) {
    const n = 80
    let lastVel = ship.velHistory.slice(ship.velHistory.length - n, ship.velHistory.length)
    let avgVel = lastVel.reduce((acc, v) => {
        acc += v
        acc /= 2
        return acc
    }, 0)
    return avgVel
}

function getBestNeuralNetworks(ships) {
    ships.sort((a, b) => calculateAvgVel(a) < calculateAvgVel(b) ? -1 : 0)
    state.logs.push(calculateAvgVel(ships[0]))
    const best10perc = ships.slice(0, int(state.settings.populationSize * 0.1))
    return best10perc.map(ship => { return ship.nn })
}

class Fleet {
    constructor() {
        this.ships = []
        this.populationSize = state.settings.populationSize
        this.iteration = 0
    }

    createNextGeneration(best10PercentNeuralNetwork) {
        best10PercentNeuralNetwork.forEach(n => {
            this.ships.push(new Ship(n.copy()))
        })
        while (this.ships.length < this.populationSize) {
            const randomNN = random(best10PercentNeuralNetwork).copy()
            randomNN.mutate(0.9)
            this.ships.push(new Ship(randomNN))
        }
    }

    initFleet() {
        while (this.ships.length < this.populationSize) {
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
        return this.allShipsCrashed() || this.iteration > state.maxIter
    }

    allShipsCrashed() {
        return this.ships.filter(s => s.landed).length == this.populationSize
    }
}

class Ship {
    constructor(nn) {
        if (nn) {
            this.nn = nn
        } else {
            // inputs
            // dist to ground
            // rotation
            // velocity ? 
            this.nn = new NeuralNetwork(2, 3, 3)
            // outputs
            // 0 rotate clockwise
            // 1 rotate counterclockwise
            // 2 thrust change
        }
        this.pos = createVector(width / 2, height / 20)
        this.vel = createVector(0, 0);
        this.rotation = p5.Vector.fromAngle(radians(90), 1);
        this.size = createVector(10, 20);
        this.thrust = 0;
        this.landed = false;
        this.velHistory = []
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
            const i1 = map(height - this.pos.y, 0, height, 0, 1)
            const i2 = map(this.rotation.heading(), -PI, +PI, 0, 1)

            const output = this.nn.predict([i1, i2])

            if (output[0] > output[1]) {
                // clockwise
                if (output[0] > 0.5) {
                    const mappedRotation = map(output[0], 0, 1, 0, 10)
                    this.rotation.rotate(radians(mappedRotation))
                }
            } else {
                // counterclockwise
                if (output[1] > 0.5) {
                    const mappedRotation = map(output[1], 0, 1, 0, 10)
                    this.rotation.rotate(radians(-mappedRotation))
                }
            }

            this.changeThrust(map(output[2], 0, 1, -1, 0.1))

            acc.add(this.rotation.copy().mult(this.thrust).rotate(radians(90)))
        }

        this.vel.add(acc)
        this.pos.add(this.vel)
        this.velHistory.push(this.vel.mag())

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