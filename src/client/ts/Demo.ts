import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import Stats from 'three/examples/jsm/libs/stats.module'
import * as dat from 'dat.gui'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { SmoothieChart, TimeSeries } from './smoothie'
import { addTitle, addSourceButton } from './dom-utils'
import { bodyToMesh } from './three-conversion-utils'

/**
 * Demo utility class. If you want to learn how to connect cannon.js with three.js, please look at the examples/threejs_* instead.
 */
class Demo extends CANNON.EventTarget {
	private settings: { [id: string]: any }
	private world: CANNON.World
	private camera: THREE.PerspectiveCamera | undefined
	private scene: THREE.Scene | undefined
	private renderer: THREE.WebGLRenderer | undefined
	private ambientLight: THREE.AmbientLight | undefined
	private spotLight: THREE.SpotLight | undefined
	private directionalLight: THREE.DirectionalLight | undefined
	private controls: OrbitControls | undefined
	private stats: Stats | undefined
	private gui: dat.GUI | undefined
	private smoothie: SmoothieChart | undefined
	private smoothieCanvas: HTMLCanvasElement | undefined

	private materialColor: number | undefined
	private solidMaterial: THREE.MeshLambertMaterial | undefined
	private wireframeMaterial: THREE.MeshBasicMaterial | undefined
	private currentMaterial: any
	private particleMaterial: THREE.MeshLambertMaterial | undefined
	private triggerMaterial: THREE.MeshBasicMaterial | undefined
	private contactMeshCache: GeometryCache | undefined
	private cm2contactMeshCache: GeometryCache | undefined
	private bboxMeshCache: GeometryCache | undefined
	private distanceConstraintMeshCache: GeometryCache | undefined
	private p2pConstraintMeshCache: GeometryCache | undefined
	private normalMeshCache: GeometryCache | undefined
	private axesMeshCache: GeometryCache | undefined

	///
	private sceneFolder: any
	private scenes: any = []
	private listeners: any = {}

	// array used to keep in sync the visuals with the bodies
	// they will have always the same length
	private bodies: any[] = []
	private visuals: any[] = []

	private renderModes: any = ['solid', 'wireframe']

	private dummy: any = new THREE.Object3D()

	private lastCallTime: any = 0
	private resetCallTime: any = false

	constructor() {
		super()

		// Global settings
		this.settings = {
			stepFrequency: 60,
			quatNormalizeSkip: 2,
			quatNormalizeFast: true,
			gx: 0,
			gy: 0,
			gz: 0,
			iterations: 3,
			tolerance: 0.0001,
			k: 1e6,
			d: 3,
			scene: 0,
			paused: false,
			rendermode: 'solid',
			constraints: false,
			contacts: false, // Contact points
			cm2contact: false, // center of mass to contact points
			normals: false, // contact normals
			axes: false, // "local" frame axes
			shadows: false,
			aabbs: false,
			profiling: false,
			maxSubSteps: 20,
		}

		if (this.settings.stepFrequency % 60 !== 0) {
			throw new Error('stepFrequency must be a multiple of 60.')
		}

		// Init cannon.js
		this.world = new CANNON.World();

		// Init three.js
		(() => { this.initThree() })();

		// Init the geometry caches
		(() => { this.initGeometryCaches() })();

		// Init stats.js
		(() => { this.initStats() })();

		// Init smoothie.js
		(() => { this.initSmoothie() })();

		// Init dat.gui
		(() => { this.initGui() })();

		// Add title info
		(() => { addTitle() })();

		// Add view-source button
		(() => { addSourceButton() })();

		// Start the loop!
		(() => { this.animate() })();

		// Attach listeners
		window.addEventListener('resize', this.resize)
		document.addEventListener('keypress', this.onKeyPress)
	}

	private initGui = () => {
		// DAT GUI
		this.gui = new dat.GUI();
		(this.gui.domElement.parentNode! as HTMLElement).style.zIndex = '3'

		// Render mode
		const renderFolder = this.gui.addFolder('Rendering')
		renderFolder.add(this.settings, 'rendermode', { Solid: 'solid', Wireframe: 'wireframe' }).onChange((mode) => {
			this.setRenderMode(mode)
		})
		renderFolder.add(this.settings, 'contacts')
		renderFolder.add(this.settings, 'cm2contact')
		renderFolder.add(this.settings, 'normals')
		renderFolder.add(this.settings, 'constraints')
		renderFolder.add(this.settings, 'axes')
		renderFolder
			.add(this.settings, 'shadows')
			.onChange((shadows) => {
				if (shadows) {
					this.spotLight!.castShadow = true
					this.renderer!.shadowMap.autoUpdate = true
				} else {
					this.spotLight!.castShadow = false
					this.renderer!.shadowMap.autoUpdate = false
				}
			})
			.setValue(true)
		renderFolder.add(this.settings, 'aabbs')
		renderFolder.add(this.settings, 'profiling').onChange((profiling) => {
			if (profiling) {
				this.world.doProfiling = true
				this.smoothie!.start()
				this.smoothieCanvas!.style.display = 'block'
			} else {
				this.world.doProfiling = false
				this.smoothie!.stop()
				this.smoothieCanvas!.style.display = 'none'
			}
		})

		// World folder
		const worldFolder = this.gui.addFolder('World')
		// Pause
		worldFolder.add(this.settings, 'paused').onChange((paused) => {
			if (paused) {
				this.smoothie!.stop()
			} else {
				this.smoothie!.start()
			}
			this.resetCallTime = true
		})
		worldFolder.add(this.settings, 'stepFrequency', 10, 60 * 10, 10)
		worldFolder.add(this.settings, 'maxSubSteps', 1, 50, 1)
		const maxg = 100
		worldFolder.add(this.settings, 'gx', -maxg, maxg).onChange((gx) => {
			if (isNaN(gx)) {
				return
			}

			this.world.gravity.set(gx, this.settings.gy, this.settings.gz)
		})
		worldFolder.add(this.settings, 'gy', -maxg, maxg).onChange((gy) => {
			if (isNaN(gy)) {
				return
			}

			this.world.gravity.set(this.settings.gx, gy, this.settings.gz)
		})
		worldFolder.add(this.settings, 'gz', -maxg, maxg).onChange((gz) => {
			if (isNaN(gz)) {
				return
			}

			this.world.gravity.set(this.settings.gx, this.settings.gy, gz)
		})
		worldFolder.add(this.settings, 'quatNormalizeSkip', 0, 50, 1).onChange((skip) => {
			if (isNaN(skip)) {
				return
			}

			this.world.quatNormalizeSkip = skip
		})
		worldFolder.add(this.settings, 'quatNormalizeFast').onChange((fast) => {
			this.world.quatNormalizeFast = !!fast
		})

		// Solver folder
		const solverFolder = this.gui.addFolder('Solver')
		solverFolder
			.add(this.settings, 'iterations', 1, 50, 1)
			.onChange((it) => { (this.world.solver as CANNON.GSSolver).iterations = it })
		solverFolder.add(this.settings, 'k', 10, 10000000).onChange((k) => {
			this.setGlobalSpookParams(this.settings.k, this.settings.d, 1 / this.settings.stepFrequency)
		})
		solverFolder.add(this.settings, 'd', 0, 20, 0.1).onChange((d) => {
			this.setGlobalSpookParams(this.settings.k, this.settings.d, 1 / this.settings.stepFrequency)
		})
		solverFolder
			.add(this.settings, 'tolerance', 0.0, 10.0, 0.01)
			.onChange((t) => { (this.world.solver as CANNON.GSSolver).tolerance = t })

		// Scene picker folder
		this.sceneFolder = this.gui.addFolder('Scenes')
		this.sceneFolder.open()
	}

	private updateGui = () => {
		// First level
		this.gui!.__controllers.forEach((controller) => {
			controller.updateDisplay()
		})

		// Second level
		Object.values(this.gui!.__folders).forEach((folder) => {
			folder.__controllers.forEach((controller) => {
				controller.updateDisplay()
			})
		})
	}

	private setRenderMode = (mode: string) => {
		if (!this.renderModes.includes(mode)) {
			throw new Error(`Render mode ${mode} not found!`)
		}

		switch (mode) {
			case 'solid':
				this.currentMaterial = this.solidMaterial
				this.spotLight!.intensity = 1
				this.ambientLight!.color.setHex(0x222222)
				break
			case 'wireframe':
				this.currentMaterial = this.wireframeMaterial
				this.spotLight!.intensity = 0
				this.ambientLight!.color.setHex(0xffffff)
				break
		}

		// set the materials
		this.visuals.forEach((visual: any) => {
			if (visual.material) {
				visual.material = this.currentMaterial
			}
			visual.traverse((child: any) => {
				if (child.material) {
					child.material = this.currentMaterial
				}
			})
		})

		this.settings.rendermode = mode
	}

	private initStats = () => {
		this.stats = new Stats()
		document.body.appendChild(this.stats.dom)
	}

	/**
	 * Add a scene to the demo app
	 * @method addScene
	 * @param {String} title Title of the scene
	 * @param {Function} initfunc A function this takes one argument, app, and initializes a physics scene. The function runs app.setWorld(body), app.addVisual(body), app.removeVisual(body) etc.
	 */
	public addScene = (title: string, initfunc: Function) => {
		this.scenes.push(initfunc)
		const index = this.scenes.length - 1

		this.sceneFolder.add({ [title]: () => this.changeScene(index) }, title)
	}

	/**
	 * Restarts the current scene
	 * @method restartCurrentScene
	 */
	private restartCurrentScene = () => {
		this.bodies.forEach((body: any) => {
			body.position.copy(body.initPosition)
			body.velocity.copy(body.initVelocity)
			if (body.initAngularVelocity) {
				body.angularVelocity.copy(body.initAngularVelocity)
				body.quaternion.copy(body.initQuaternion)
			}
		})
	}

	private updateVisuals = () => {
		// Copy position data into visuals
		for (let i = 0; i < this.bodies.length; i++) {
			const body = this.bodies[i]
			const visual = this.visuals[i]

			// Interpolated or not?
			let position = body.interpolatedPosition
			let quaternion = body.interpolatedQuaternion
			if (this.settings.paused) {
				position = body.position
				quaternion = body.quaternion
			}

			if (visual.isInstancedMesh) {
				this.dummy.position.copy(position)
				this.dummy.quaternion.copy(quaternion)

				this.dummy.updateMatrix()

				visual.setMatrixAt(body.instanceIndex, this.dummy.matrix)
				visual.instanceMatrix.needsUpdate = true
			} else {
				visual.position.copy(position)
				visual.quaternion.copy(quaternion)
			}
		}

		// Render contacts
		this.contactMeshCache!.restart()
		if (this.settings.contacts) {
			// if ci is even - use body i, else j
			for (let i = 0; i < this.world.contacts.length; i++) {
				const contact = this.world.contacts[i]

				for (let ij = 0; ij < 2; ij++) {
					const mesh = this.contactMeshCache!.request()
					const b = ij === 0 ? contact.bi : contact.bj
					const r = ij === 0 ? contact.ri : contact.rj
					mesh.position.set(b.position.x + r.x, b.position.y + r.y, b.position.z + r.z)
				}
			}
		}
		this.contactMeshCache!.hideCached()

		// Lines from center of mass to contact point
		this.cm2contactMeshCache!.restart()
		if (this.settings.cm2contact) {
			for (let i = 0; i < this.world.contacts.length; i++) {
				const contact = this.world.contacts[i]

				for (let ij = 0; ij < 2; ij++) {
					const line = this.cm2contactMeshCache!.request()
					const b = ij === 0 ? contact.bi : contact.bj
					const r = ij === 0 ? contact.ri : contact.rj
					line.scale.set(r.x, r.y, r.z)
					makeSureNotZero(line.scale)
					line.position.copy(b.position)
				}
			}
		}
		this.cm2contactMeshCache!.hideCached()

		this.distanceConstraintMeshCache!.restart()
		this.p2pConstraintMeshCache!.restart()
		if (this.settings.constraints) {
			this.world.constraints.forEach((constraint) => {
				switch (true) {
					// Lines for distance constraints
					case constraint instanceof CANNON.DistanceConstraint: {
						constraint.equations.forEach((equation) => {
							const { bi, bj } = equation

							const line = this.distanceConstraintMeshCache!.request()

							// Remember, bj is either a Vec3 or a Body.
							const vector = bj.position || bj

							line.scale.set(vector.x - bi.position.x, vector.y - bi.position.y, vector.z - bi.position.z)
							makeSureNotZero(line.scale)
							line.position.copy(bi.position)
						})

						break
					}

					// Lines for point to point constraints
					case constraint instanceof CANNON.PointToPointConstraint: {
						constraint.equations.forEach((equation) => {
							const { bi, bj } = equation

							const relLine1 = this.p2pConstraintMeshCache!.request()
							const relLine2 = this.p2pConstraintMeshCache!.request()
							const diffLine = this.p2pConstraintMeshCache!.request()
							if ((equation as CANNON.ContactEquation).ri) {
								relLine1.scale.set((equation as CANNON.ContactEquation).ri.x, (equation as CANNON.ContactEquation).ri.y, (equation as CANNON.ContactEquation).ri.z)
							}
							if ((equation as CANNON.ContactEquation).rj) {
								relLine2.scale.set((equation as CANNON.ContactEquation).rj.x, (equation as CANNON.ContactEquation).rj.y, (equation as CANNON.ContactEquation).rj.z)
							}
							// BUG this is not exposed anymore in the ContactEquation, this sections needs to be updated
							/* if (equation.penetrationVec) {
								diffLine.scale.set(-equation.penetrationVec.x, -equation.penetrationVec.y, -equation.penetrationVec.z)
							} */
							makeSureNotZero(relLine1.scale)
							makeSureNotZero(relLine2.scale)
							makeSureNotZero(diffLine.scale)
							relLine1.position.copy(bi.position)
							relLine2.position.copy(bj.position)

							if (equation.bj && (equation as CANNON.ContactEquation).rj) {
								equation.bj.position.vadd((equation as CANNON.ContactEquation).rj, diffLine.position)
							}
						})
						break
					}
				}
			})
		}
		this.p2pConstraintMeshCache!.hideCached()
		this.distanceConstraintMeshCache!.hideCached()

		// Normal lines
		this.normalMeshCache!.restart()
		if (this.settings.normals) {
			for (let i = 0; i < this.world.contacts.length; i++) {
				const constraint = this.world.contacts[i]

				const bi = constraint.bi
				const bj = constraint.bj
				const line = this.normalMeshCache!.request()

				const constraintNormal = constraint.ni
				const body = bi
				line.scale.set(constraintNormal.x, constraintNormal.y, constraintNormal.z)
				makeSureNotZero(line.scale)
				line.position.copy(body.position)
				constraint.ri.vadd(line.position, line.position)
			}
		}
		this.normalMeshCache!.hideCached()

		// Frame axes for each body
		this.axesMeshCache!.restart()
		if (this.settings.axes) {
			for (let i = 0; i < this.bodies.length; i++) {
				const body = this.bodies[i]

				const mesh = this.axesMeshCache!.request()
				mesh.position.copy(body.position)
				mesh.quaternion.copy(body.quaternion)
			}
		}
		this.axesMeshCache!.hideCached()

		// AABBs
		this.bboxMeshCache!.restart()
		if (this.settings.aabbs) {
			for (let i = 0; i < this.bodies.length; i++) {
				const body = this.bodies[i]
				if (body.updateAABB) {
					if (body.aabbNeedsUpdate) {
						body.updateAABB()
					}

					// Todo: cap the infinite AABB to scene AABB, for now just dont render
					if (
						isFinite(body.aabb.lowerBound.x) &&
						isFinite(body.aabb.lowerBound.y) &&
						isFinite(body.aabb.lowerBound.z) &&
						isFinite(body.aabb.upperBound.x) &&
						isFinite(body.aabb.upperBound.y) &&
						isFinite(body.aabb.upperBound.z) &&
						body.aabb.lowerBound.x - body.aabb.upperBound.x != 0 &&
						body.aabb.lowerBound.y - body.aabb.upperBound.y != 0 &&
						body.aabb.lowerBound.z - body.aabb.upperBound.z != 0
					) {
						const mesh = this.bboxMeshCache!.request()
						mesh.scale.set(
							body.aabb.lowerBound.x - body.aabb.upperBound.x,
							body.aabb.lowerBound.y - body.aabb.upperBound.y,
							body.aabb.lowerBound.z - body.aabb.upperBound.z
						)
						mesh.position.set(
							(body.aabb.lowerBound.x + body.aabb.upperBound.x) * 0.5,
							(body.aabb.lowerBound.y + body.aabb.upperBound.y) * 0.5,
							(body.aabb.lowerBound.z + body.aabb.upperBound.z) * 0.5
						)
					}
				}
			}
		}
		this.bboxMeshCache!.hideCached()
	}

	private changeScene = (n: number) => {
		this.dispatchEvent({ type: 'destroy' })

		// unbind all listeners
		Object.keys(this.listeners).forEach((event) => {
			this.listeners[event].forEach((callback: Function) => {
				this.removeEventListener(event, callback)
			})
		})
		this.listeners = {}

		// clear any previous logs
		console.clear()

		this.settings.paused = false
		this.updateGui()
		this.buildScene(n)
	}

	public start = () => {
		this.buildScene(0)
	}

	private buildScene = (n: number) => {
		// Remove current bodies
		this.bodies.forEach((body: any) => this.world.removeBody(body))

		// Remove all visuals
		this.removeAllVisuals()

		// Remove all constraints
		while (this.world.constraints.length) {
			this.world.removeConstraint(this.world.constraints[0])
		}

		// Run the user defined "build scene" function
		this.scenes[n]()

		// Read the newly set data to the gui
		this.settings.iterations = (this.world.solver as CANNON.GSSolver).iterations
		this.settings.gx = this.world.gravity.x + 0.0
		this.settings.gy = this.world.gravity.y + 0.0
		this.settings.gz = this.world.gravity.z + 0.0
		this.settings.quatNormalizeSkip = this.world.quatNormalizeSkip
		this.settings.quatNormalizeFast = this.world.quatNormalizeFast
		this.updateGui()

		this.restartGeometryCaches()
	}

	private initGeometryCaches = () => {
		// Material
		this.materialColor = 0xdddddd
		this.solidMaterial = new THREE.MeshLambertMaterial({ color: this.materialColor })
		this.wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })
		this.currentMaterial = this.solidMaterial

		const contactDotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
		this.particleMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 })
		this.triggerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true })

		const contactPointGeometry = new THREE.SphereGeometry(0.1, 6, 6)
		this.contactMeshCache = new GeometryCache(this.scene!, () => {
			return new THREE.Mesh(contactPointGeometry, contactDotMaterial)
		})

		this.cm2contactMeshCache = new GeometryCache(this.scene!, () => {
			/* const geometry = new THREE.Geometry()
			geometry.vertices.push(new THREE.Vector3(0, 0, 0))
			geometry.vertices.push(new THREE.Vector3(1, 1, 1)) */
			const points = []
			points.push(new THREE.Vector3(0, 0, 0))
			points.push(new THREE.Vector3(1, 1, 1))
			const geometry = new THREE.BufferGeometry().setFromPoints(points)
			return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff0000 }))
		})

		const bboxGeometry = new THREE.BoxGeometry(1, 1, 1)
		const bboxMaterial = new THREE.MeshBasicMaterial({ color: this.materialColor, wireframe: true, })
		this.bboxMeshCache = new GeometryCache(this.scene!, () => {
			return new THREE.Mesh(bboxGeometry, bboxMaterial)
		})

		this.distanceConstraintMeshCache = new GeometryCache(this.scene!, () => {
			/* const geometry = new THREE.Geometry()
			geometry.vertices.push(new THREE.Vector3(0, 0, 0))
			geometry.vertices.push(new THREE.Vector3(1, 1, 1)) */
			const points = []
			points.push(new THREE.Vector3(0, 0, 0))
			points.push(new THREE.Vector3(1, 1, 1))
			const geometry = new THREE.BufferGeometry().setFromPoints(points)
			return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff0000 }))
		})

		this.p2pConstraintMeshCache = new GeometryCache(this.scene!, () => {
			/* const geometry = new THREE.Geometry()
			geometry.vertices.push(new THREE.Vector3(0, 0, 0))
			geometry.vertices.push(new THREE.Vector3(1, 1, 1)) */
			const points = []
			points.push(new THREE.Vector3(0, 0, 0))
			points.push(new THREE.Vector3(1, 1, 1))
			const geometry = new THREE.BufferGeometry().setFromPoints(points)
			return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff0000 }))
		})

		this.normalMeshCache = new GeometryCache(this.scene!, () => {
			/* const geometry = new THREE.Geometry()
			geometry.vertices.push(new THREE.Vector3(0, 0, 0))
			geometry.vertices.push(new THREE.Vector3(1, 1, 1)) */
			const points = []
			points.push(new THREE.Vector3(0, 0, 0))
			points.push(new THREE.Vector3(1, 1, 1))
			const geometry = new THREE.BufferGeometry().setFromPoints(points)
			return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }))
		})

		this.axesMeshCache = new GeometryCache(this.scene!, () => {
			/* const gX = new THREE.Geometry()
			const gY = new THREE.Geometry()
			const gZ = new THREE.Geometry()
			gX.vertices.push(origin)
			gY.vertices.push(origin)
			gZ.vertices.push(origin)
			gX.vertices.push(new THREE.Vector3(1, 0, 0))
			gY.vertices.push(new THREE.Vector3(0, 1, 0))
			gZ.vertices.push(new THREE.Vector3(0, 0, 1)) */
			const mesh = new THREE.Object3D()
			const origin = new THREE.Vector3(0, 0, 0)
			const pointsX = []
			const pointsY = []
			const pointsZ = []
			pointsX.push(origin)
			pointsY.push(origin)
			pointsZ.push(origin)
			pointsX.push(new THREE.Vector3(1, 0, 0))
			pointsY.push(new THREE.Vector3(0, 1, 0))
			pointsZ.push(new THREE.Vector3(0, 0, 1))
			const gX = new THREE.BufferGeometry().setFromPoints(pointsX)
			const gY = new THREE.BufferGeometry().setFromPoints(pointsY)
			const gZ = new THREE.BufferGeometry().setFromPoints(pointsZ)
			const lineX = new THREE.Line(gX, new THREE.LineBasicMaterial({ color: 0xff0000 }))
			const lineY = new THREE.Line(gY, new THREE.LineBasicMaterial({ color: 0x00ff00 }))
			const lineZ = new THREE.Line(gZ, new THREE.LineBasicMaterial({ color: 0x0000ff }))
			mesh.add(lineX)
			mesh.add(lineY)
			mesh.add(lineZ)
			return mesh
		})
	}

	private restartGeometryCaches = () => {
		this.contactMeshCache!.restart()
		this.contactMeshCache!.hideCached()

		this.cm2contactMeshCache!.restart()
		this.cm2contactMeshCache!.hideCached()

		this.distanceConstraintMeshCache!.restart()
		this.distanceConstraintMeshCache!.hideCached()

		this.normalMeshCache!.restart()
		this.normalMeshCache!.hideCached()
	}

	private animate = () => {
		requestAnimationFrame(this.animate)
		if (!this.settings.paused) {
			this.updatePhysics()
			this.updateVisuals()
		}
		this.controls!.update()
		this.renderer!.render(this.scene!, this.camera!)
		this.stats!.update()
	}

	private updatePhysics = () => {
		// Step world
		const timeStep = 1 / this.settings.stepFrequency

		const now = performance.now() / 1000

		if (!this.lastCallTime) {
			// last call time not saved, cant guess elapsed time. Take a simple step.
			this.world.step(timeStep)
			this.lastCallTime = now
			return
		}

		let timeSinceLastCall = now - this.lastCallTime
		if (this.resetCallTime) {
			timeSinceLastCall = 0
			this.resetCallTime = false
		}

		this.world.step(timeStep, timeSinceLastCall, this.settings.maxSubSteps)

		this.lastCallTime = now
	}

	private resize = () => {
		this.camera!.aspect = window.innerWidth / window.innerHeight
		this.camera!.updateProjectionMatrix()
		this.renderer!.setSize(window.innerWidth, window.innerHeight)
	}

	private onKeyPress = (event: KeyboardEvent) => {
		switch (event.code) {
			case 'Space': // Space - restart
				this.restartCurrentScene()
				break

			case 'KeyH': // h - toggle widgets
				if (this.stats!.dom.style.display == 'none') {
					this.stats!.dom.style.display = 'block'
					// -> info.style.display = 'block'
				} else {
					this.stats!.dom.style.display = 'none'
					// -> info.style.display = 'none'
				}
				break

			case 'KeyA': // a - AABBs
				this.settings.aabbs = !this.settings.aabbs
				this.updateGui()
				break

			case 'KeyC': // c - constraints
				this.settings.constraints = !this.settings.constraints
				this.updateGui()
				break

			case 'KeyP': // p - pause
				this.settings.paused = !this.settings.paused
				this.resetCallTime = true
				this.updateGui()
				break

			case 'KeyS': // s - step
				const timeStep = 1 / this.settings.stepFrequency
				this.world.step(timeStep)
				this.updateVisuals()
				break

			case 'KeyM': // m - toggle materials
				let index = this.renderModes.indexOf(this.settings.rendermode)
				index++
				index = index % this.renderModes.length // begin at 0 if we exceeded number of modes
				this.setRenderMode(this.renderModes[index])
				this.updateGui()
				break

			case 'Digit1':
			case 'Digit2':
			case 'Digit3':
			case 'Digit4':
			case 'Digit5':
			case 'Digit6':
			case 'Digit7':
			case 'Digit8':
			case 'Digit9':
				// Change scene
				const digit = Number(event.code.slice(-1)) - 1
				// Only if scene is present and if no input field is active
				if (this.scenes.length > digit && !(document.activeElement as HTMLElement).localName.match(/input/)) {
					this.changeScene(digit)
				}
				break
		}
	}

	private initThree = () => {
		// Camera
		this.camera = new THREE.PerspectiveCamera(24, window.innerWidth / window.innerHeight, 5, 2000)

		this.camera.position.set(0, 20, 30)
		this.camera.lookAt(0, 0, 0)

		// Scene
		this.scene = new THREE.Scene()
		this.scene.fog = new THREE.Fog(0x222222, 1000, 2000)

		// Renderer
		this.renderer = new THREE.WebGLRenderer({ antialias: true })
		this.renderer.setSize(window.innerWidth, window.innerHeight)
		document.body.appendChild(this.renderer.domElement)

		this.renderer.setClearColor(this.scene.fog.color, 1)

		this.renderer.shadowMap.enabled = true
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

		// Lights
		this.ambientLight = new THREE.AmbientLight(0xffffff, 0.01)
		this.scene.add(this.ambientLight)

		this.spotLight = new THREE.SpotLight(0xffffff, 150, 0, Math.PI / 8, 1)
		this.spotLight.position.set(-30, 40, 30)
		this.spotLight.target.position.set(0, 0, 0)

		this.spotLight.castShadow = true

		this.spotLight.shadow.camera.near = 10
		this.spotLight.shadow.camera.far = 100
		this.spotLight.shadow.camera.fov = 30

		this.spotLight.shadow.bias = -0.0001
		this.spotLight.shadow.mapSize.width = 2048
		this.spotLight.shadow.mapSize.height = 2048

		this.scene.add(this.spotLight)

		this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.5 /*0.15*/)
		this.directionalLight.position.set(-30, 40, 30)
		this.directionalLight.target.position.set(0, 0, 0)
		this.directionalLight.castShadow = true
		this.scene.add(this.directionalLight)

		// Orbit controls
		this.controls = new OrbitControls(this.camera, this.renderer.domElement)
		this.controls.rotateSpeed = 1.0
		this.controls.zoomSpeed = 1.2
		this.controls.enableDamping = true
		this.controls.enablePan = false
		this.controls.dampingFactor = 0.2
		this.controls.minDistance = 10
		this.controls.maxDistance = 500
	}

	private initSmoothie = () => {
		this.smoothieCanvas = document.createElement('canvas')
		this.smoothieCanvas.width = window.innerWidth
		this.smoothieCanvas.height = window.innerHeight
		this.smoothieCanvas.style.opacity = '0.5'
		this.smoothieCanvas.style.position = 'absolute'
		this.smoothieCanvas.style.top = '0px'
		this.smoothieCanvas.style.zIndex = '1'
		document.body.appendChild(this.smoothieCanvas)

		this.smoothie = new SmoothieChart({
			labelOffsetY: 50,
			maxDataSetLength: 100,
			millisPerPixel: 2,
			grid: {
				strokeStyle: 'none',
				fillStyle: 'none',
				lineWidth: 1,
				millisPerLine: 250,
				verticalSections: 6,
			},
			labels: {
				fillStyle: 'rgb(180, 180, 180)',
			},
		})
		this.smoothie.streamTo(this.smoothieCanvas)

		// Create time series for each profile label
		const lines: { [id: string]: TimeSeries } = {}
		const colors: number[][] = [
			[255, 0, 0],
			[0, 255, 0],
			[0, 0, 255],
			[255, 255, 0],
			[255, 0, 255],
			[0, 255, 255],
		]

		Object.keys(this.world.profile).forEach((label: string, i) => {
			const color = colors[i % colors.length]
			lines[label] = new TimeSeries({
				label,
				fillStyle: `rgb(${color[0]},${color[1]},${color[2]})`,
				maxDataLength: 500,
			})
		})

		// Add a random value to each line every second
		this.world.addEventListener('postStep', () => {
			Object.keys(this.world.profile).forEach((label: string) => {
				lines[label].append(this.world.time * 1000, (this.world.profile as { [id: string]: number })[label])
			})
		})

		// Add to SmoothieChart
		Object.keys(this.world.profile).forEach((label, i) => {
			const color = colors[i % colors.length]
			this.smoothie!.addTimeSeries(lines[label], {
				strokeStyle: `rgb(${color[0]},${color[1]},${color[2]})`,
				lineWidth: 2,
			})
		})

		// Pause it
		this.world.doProfiling = false
		this.smoothie.stop()
		this.smoothieCanvas.style.display = 'none'
	}

	private setGlobalSpookParams(k: number, d: number, h: number) {
		// Set for all constraints
		for (let i = 0; i < this.world.constraints.length; i++) {
			const constraint = this.world.constraints[i]
			for (let j = 0; j < constraint.equations.length; j++) {
				const equation = constraint.equations[j]
				equation.setSpookParams(k, d, h)
			}
		}

		// Set for all contact materals
		for (let i = 0; i < this.world.contactmaterials.length; i++) {
			const contactMaterial = this.world.contactmaterials[i]
			contactMaterial.contactEquationStiffness = k
			contactMaterial.frictionEquationStiffness = k
			contactMaterial.contactEquationRelaxation = d
			contactMaterial.frictionEquationRelaxation = d
		}

		this.world.defaultContactMaterial.contactEquationStiffness = k
		this.world.defaultContactMaterial.frictionEquationStiffness = k
		this.world.defaultContactMaterial.contactEquationRelaxation = d
		this.world.defaultContactMaterial.frictionEquationRelaxation = d
	}

	public getWorld() {
		return this.world
	}

	public addVisual(body: any) {
		if (!(body instanceof CANNON.Body)) {
			throw new Error('The argument passed to addVisual() is not a body')
		}

		// if it's a particle paint it red, if it's a trigger paint it as green, otherwise just gray
		const isParticle = body.shapes.every((s) => s instanceof CANNON.Particle)
		const material = isParticle ? this.particleMaterial : body.isTrigger ? this.triggerMaterial : this.currentMaterial

		// get the correspondant three.js mesh
		const mesh = bodyToMesh(body, material)

		// enable shadows on every object
		mesh.traverse((child) => {
			child.castShadow = true
			child.receiveShadow = true
		})

		this.bodies.push(body)
		this.visuals.push(mesh)

		this.scene!.add(mesh)
	}

	public addVisuals(bodies: any[]) {
		bodies.forEach((body: any) => {
			this.addVisual(body)
		})
	}

	addVisualsInstanced(bodies: any) {
		if (
			!Array.isArray(bodies) ||
			!bodies.every((body) => body instanceof CANNON.Body && body.type === bodies[0].type)
		) {
			throw new Error('The argument passed to addVisualsInstanced() is not an array of bodies of the same type')
		}

		// all bodies are the same, so pick the first
		const body = bodies[0]

		// if it's a particle paint it red, otherwise just gray
		const material = body.shapes.every((s: any) => s instanceof CANNON.Particle)
			? this.particleMaterial
			: this.currentMaterial

		// get the three.js mesh correspondant of the first body since they're of the same type
		const meshGroup = bodyToMesh(body, material)

		// extract the mesh from the group
		let mesh
		meshGroup.traverse((child: any) => {
			if (child.isMesh) mesh = child
		})

		// the clone is there because of this issue
		// https://github.com/mrdoob/three.js/issues/17701
		const instancedMesh = new THREE.InstancedMesh(mesh!.geometry.clone(), mesh!.material.clone(), bodies.length)
		instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage) // will be updated every frame

		instancedMesh.receiveShadow = true
		instancedMesh.castShadow = true

		// Add bodies
		bodies.forEach((body, i) => {
			this.bodies.push(body)
			this.visuals.push(instancedMesh)
			body.instanceIndex = i
		})

		this.scene!.add(instancedMesh)
	}

	private removeVisual(body: any) {
		const index = this.bodies.findIndex((b) => b.id === body.id)

		if (index === -1) {
			return
		}

		const visual = this.visuals[index]

		this.bodies.splice(index, 1)
		this.visuals.splice(index, 1)

		this.scene!.remove(visual)
	}

	private removeAllVisuals() {
		while (this.bodies.length) {
			this.removeVisual(this.bodies[0])
		}
	}

	public addEventListener(event: string, callback: Function) {
		if (this.listeners[event]) {
			this.listeners[event].push(callback)
		} else {
			this.listeners[event] = [callback]
		}

		return super.addEventListener(event, callback)
	}
}

class GeometryCache {
	private scene: THREE.Scene
	private createFunc: Function
	private geometries: THREE.Mesh[] = []
	private gone: any = []

	constructor(scene: THREE.Scene, createFunc: Function) {
		this.scene = scene
		this.createFunc = createFunc
	}

	public request = () => {
		const geometry = this.geometries.length > 0 ? this.geometries.pop() : this.createFunc()

		this.scene.add(geometry)
		this.gone.push(geometry)
		return geometry
	}

	public restart = () => {
		while (this.gone.length) {
			this.geometries.push(this.gone.pop())
		}
	}

	public hideCached = () => {
		this.geometries.forEach((geometry: THREE.Mesh) => {
			this.scene.remove(geometry)
		})
	}
}

function makeSureNotZero(vector: CANNON.Vec3) {
	if (vector.x === 0) {
		vector.x = 1e-6
	}
	if (vector.y === 0) {
		vector.y = 1e-6
	}
	if (vector.z === 0) {
		vector.z = 1e-6
	}
}

export { Demo }
