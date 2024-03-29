// When starting this project by using `npm run dev`, this server script
// will be compiled using tsc and will be running concurrently along side webpack-dev-server
// visit http://127.0.0.1:8080

// In the production environment we don't use the webpack-dev-server, so instead type,
// `npm run build`        (this creates the production version of bundle.js and places it in ./dist/client/)
// `tsc -p ./src/server`  (this compiles ./src/server/server.ts into ./dist/server/server.js)
// `npm start            (this starts nodejs with express and serves the ./dist/client folder)
// visit http://127.0.0.1:3000

import express from 'express'
import path from 'path'
import http from 'http'

const port: number = 3000
const privateHost: boolean = false

class App {
	private server: http.Server
	private port: number

	constructor(port: number) {
		this.port = port
		const app = express()
		app.use(express.static(path.join(__dirname, '../client')))

		this.server = new http.Server(app)
	}

	public Start() {
		this.server.listen(this.port, (privateHost ? "127.0.0.1" : "0.0.0.0"), () => {
			console.log(`Server listening on port ${this.port}.`)
		})
	}
}

new App(port).Start()