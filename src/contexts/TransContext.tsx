import {
	PropsWithChildren,
	createContext,
	useContext,
	useEffect,
	useMemo,
} from 'react'

import { TransEngine } from '../core/transformations/trans-engine'

export type TransContextType = {
	getTransEngine: () => Promise<TransEngine>
}

const TransContext = createContext<TransContextType | null>(null)

export function TransProvider({
	getTransEngine,
	children,
}: PropsWithChildren<{ getTransEngine: () => Promise<TransEngine> }>) {
	useEffect(() => {
		// start initialization of transEngine in the background
		void getTransEngine()
	}, [getTransEngine])

	const value = useMemo(() => {
		return { getTransEngine }
	}, [getTransEngine])

	return <TransContext.Provider value={value}>{children}</TransContext.Provider>
}

export function useTrans() {
	const context = useContext(TransContext)
	if (!context) {
		throw new Error('useTrans must be used within a TransProvider')
	}
	return context
} 
