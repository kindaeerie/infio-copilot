// @ts-nocheck
import { PGlite } from '@electric-sql/pglite'
import { PGliteWorkerOptions, worker } from '@electric-sql/pglite/worker'

import { pgliteResources } from '../database/pglite-resources'
import { migrations } from '../database/sql'

export { }

const loadPGliteResources = async (): Promise<{
	fsBundle: Blob
	wasmModule: WebAssembly.Module
	vectorExtensionBundlePath: URL
}> => {
	try {
		// Convert base64 to binary data
		const wasmBinary = Buffer.from(pgliteResources.wasmBase64, 'base64')
		const dataBinary = Buffer.from(pgliteResources.dataBase64, 'base64')
		const vectorBinary = Buffer.from(pgliteResources.vectorBase64, 'base64')

		// Create blobs from binary data
		const fsBundle = new Blob([dataBinary], {
			type: 'application/octet-stream',
		})
		const wasmModule = await WebAssembly.compile(wasmBinary)

		// Create a blob URL for the vector extension
		const vectorBlob = new Blob([vectorBinary], {
			type: 'application/gzip',
		})
		const vectorExtensionBundlePath = URL.createObjectURL(vectorBlob)

		return {
			fsBundle,
			wasmModule,
			vectorExtensionBundlePath: new URL(vectorExtensionBundlePath),
		}
	} catch (error) {
		console.error('Error loading PGlite resources:', error)
		throw error
	}
}

worker({
	async init(options: PGliteWorkerOptions, filesystem: string) {
		let db: PGlite;
		try {
			const { fsBundle, wasmModule, vectorExtensionBundlePath } =
				await loadPGliteResources()
			if (filesystem === 'idb') {
				db = await PGlite.create('idb://infio-db', {
					relaxedDurability: true,
					fsBundle: fsBundle,
					wasmModule: wasmModule,
					...options,
					extensions: {
						...options.extensions,
						vector: vectorExtensionBundlePath,
					},
				})
			} else {
				db = await PGlite.create('opfs-ahp://infio-db', {
					relaxedDurability: true,
					fsBundle: fsBundle,
					wasmModule: wasmModule,
					...options,
					extensions: {
						...options.extensions,
						vector: vectorExtensionBundlePath,
					},
				})
			}
		} catch (error) {
			console.error('Error creating PGlite instance:', error)
			throw error
		}

		// Execute SQL migrations
		for (const [_key, migration] of Object.entries(migrations)) {
			// Split SQL into individual commands and execute them one by one
			console.log("migration: ", migration.description)
			const commands = migration.sql.split('\n\n').filter(cmd => cmd.trim());
			for (const command of commands) {
				await db.exec(command);
			}
		}

		return db
	},
})
