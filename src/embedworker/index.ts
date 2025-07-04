import { EmbeddingManager } from "./EmbeddingManager";

// 创建一个单例的 Manager，以便在整个应用中共享同一个 Worker
export const embeddingManager = new EmbeddingManager();

// 导出 EmbeddingManager 类以便其他地方使用
export { EmbeddingManager };

// 导出类型定义
export type {
    EmbedResult,
    ModelLoadResult,
    ModelUnloadResult,
    TokenCountResult
} from './EmbeddingManager';
