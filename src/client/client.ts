import * as CANNON from 'cannon-es'
import { Demo } from './ts/Demo'

/**
 * Demo of different bounciness.
 */

const demo = new Demo()

demo.addScene('Bounce', () => {
	const world = setupWorld(demo)

	// Static ground plane
	const groundMaterial = new CANNON.Material('ground')
	const groundShape = new CANNON.Plane()
	const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial })
	groundBody.addShape(groundShape)
	groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
	world.addBody(groundBody)
	demo.addVisual(groundBody)

	const mass = 10
	const size = 1
	const height = 5
	const damping = 0.01

	const sphereShape = new CANNON.Sphere(size)

	// Shape on plane
	const mat1 = new CANNON.Material()
	const shapeBody1 = new CANNON.Body({
		mass,
		material: mat1,
		position: new CANNON.Vec3(-size * 3, height, size),
	})
	shapeBody1.addShape(sphereShape)
	shapeBody1.linearDamping = damping
	world.addBody(shapeBody1)
	demo.addVisual(shapeBody1)

	const mat2 = new CANNON.Material()
	const shapeBody2 = new CANNON.Body({
		mass,
		material: mat2,
		position: new CANNON.Vec3(0, height, size),
	})
	shapeBody2.addShape(sphereShape)
	shapeBody2.linearDamping = damping
	world.addBody(shapeBody2)
	demo.addVisual(shapeBody2)

	const mat3 = new CANNON.Material()
	const shapeBody3 = new CANNON.Body({
		mass,
		material: mat3,
		position: new CANNON.Vec3(size * 3, height, size),
	})
	shapeBody3.addShape(sphereShape)
	shapeBody3.linearDamping = damping
	world.addBody(shapeBody3)
	demo.addVisual(shapeBody3)

	// Create contact material behaviour
	const mat1_ground = new CANNON.ContactMaterial(groundMaterial, mat1, { friction: 0.0, restitution: 0.0 })
	const mat2_ground = new CANNON.ContactMaterial(groundMaterial, mat2, { friction: 0.0, restitution: 0.7 })
	const mat3_ground = new CANNON.ContactMaterial(groundMaterial, mat3, { friction: 0.0, restitution: 0.9 })

	world.addContactMaterial(mat1_ground)
	world.addContactMaterial(mat2_ground)
	world.addContactMaterial(mat3_ground)
})

demo.start()

function setupWorld(demo: Demo) {
	const world = demo.getWorld()
	world.gravity.set(0, -10, 0)

	return world
}