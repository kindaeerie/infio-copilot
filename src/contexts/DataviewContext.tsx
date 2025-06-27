import {
	PropsWithChildren,
	createContext,
	useContext,
	useMemo
} from 'react'

import { DataviewManager } from '../utils/dataview'

const DataviewContext = createContext<DataviewManager | null>(null)

export function DataviewProvider({
	dataviewManager,
	children,
}: PropsWithChildren<{ dataviewManager: DataviewManager | null }>) {
	const value = useMemo(() => {
		return dataviewManager
	}, [dataviewManager])

	return <DataviewContext.Provider value={value}>{children}</DataviewContext.Provider>
}

export function useDataview(): DataviewManager | null {
	const context = useContext(DataviewContext)
	// 注意：这里不抛出错误，允许返回 null
	// 调用者需要自己检查 context 是否为 null
	return context
} 
