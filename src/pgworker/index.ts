// @ts-nocheck

import { live } from '@electric-sql/pglite/live';
import { PGliteWorker } from '@electric-sql/pglite/worker';

import PGWorker from './pglite.worker';

export const createAndInitDb = async (filesystem: string) => {
	const worker = new PGWorker();

	const pg = await PGliteWorker.create(
		worker,
		{
			extensions: {
				live,
			},
		},
		filesystem, 
	)
	console.log(`PGlite DB created in ${filesystem}://infio-db`)
	return pg
}
