// @ts-nocheck

import { live } from '@electric-sql/pglite/live';
import { PGliteWorker } from '@electric-sql/pglite/worker';

import PGWorker from './pglite.worker';

export const createAndInitDb = async () => {
	const worker = new PGWorker();

	const pg = await PGliteWorker.create(
		worker,
		{
			extensions: {
				live,
			},
		},
	)
	console.log('PGlite DB created in opfs-ahp://infio-db')
	return pg
}
