// 导入完整的嵌入 Worker
// @ts-nocheck
import EmbedWorker from './embed.worker';

// 类型定义
export interface EmbedResult {
    vec: number[];
    tokens: number;
    embed_input?: string;
}

export interface ModelLoadResult {
    model_loaded: boolean;
}

export interface ModelUnloadResult {
    model_unloaded: boolean;
}

export interface TokenCountResult {
    tokens: number;
}

export class EmbeddingManager {
    private worker: Worker;
    private requests = new Map<number, { resolve: (value: any) => void; reject: (reason?: any) => void }>();
    private nextRequestId = 0;
    private isModelLoaded = false;
    private currentModelId: string | null = null;

    constructor() {
        // 创建 Worker，使用与 pgworker 相同的模式
        this.worker = new EmbedWorker();

        // 统一监听来自 Worker 的所有消息
        this.worker.onmessage = (event) => {
            try {
                const { id, result, error } = event.data;

                // 根据返回的 id 找到对应的 Promise 回调
                const request = this.requests.get(id);

                if (request) {
                    if (error) {
                        request.reject(new Error(error));
                    } else {
                        request.resolve(result);
                    }
                    // 完成后从 Map 中删除
                    this.requests.delete(id);
                }
            } catch (err) {
                console.error("Error processing worker message:", err);
                // 拒绝所有待处理的请求
                this.requests.forEach(request => {
                    request.reject(new Error(`Worker message processing error: ${err.message}`));
                });
                this.requests.clear();
            }
        };

        this.worker.onerror = (error) => {
            console.error("EmbeddingWorker error:", error);
            // 拒绝所有待处理的请求
            this.requests.forEach(request => {
                request.reject(new Error(`Worker error: ${error.message || 'Unknown worker error'}`));
            });
            this.requests.clear();
            
            // 重置状态
            this.isModelLoaded = false;
            this.currentModelId = null;
        };
    }



    /**
     * 向 Worker 发送一个请求，并返回一个 Promise，该 Promise 将在收到响应时解析。
     * @param method 要调用的方法 (e.g., 'load', 'embed_batch')
     * @param params 方法所需的参数
     */
    private postRequest<T>(method: string, params: any): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const id = this.nextRequestId++;
            this.requests.set(id, { resolve, reject });
            this.worker.postMessage({ method, params, id });
        });
    }

    /**
     * 加载指定的嵌入模型到 Worker 中。
     * @param modelId 模型ID, 例如 'TaylorAI/bge-micro-v2'
     * @param useGpu 是否使用GPU加速，默认为false
     */
    public async loadModel(modelId: string, useGpu: boolean = false): Promise<ModelLoadResult> {
        console.log(`Loading embedding model: ${modelId}, GPU: ${useGpu}`);
        
        try {
            // 如果已经加载了相同的模型，直接返回
            if (this.isModelLoaded && this.currentModelId === modelId) {
                console.log(`Model ${modelId} already loaded`);
                return { model_loaded: true };
            }
            
            // 如果加载了不同的模型，先卸载
            if (this.isModelLoaded && this.currentModelId !== modelId) {
                console.log(`Unloading previous model: ${this.currentModelId}`);
                await this.unloadModel();
            }
            
            const result = await this.postRequest<ModelLoadResult>('load', { 
                model_key: modelId, 
                use_gpu: useGpu 
            });
            
            this.isModelLoaded = result.model_loaded;
            this.currentModelId = result.model_loaded ? modelId : null;
            
            if (result.model_loaded) {
                console.log(`Model ${modelId} loaded successfully`);
            }
            
            return result;
        } catch (error) {
            console.error(`Failed to load model ${modelId}:`, error);
            this.isModelLoaded = false;
            this.currentModelId = null;
            throw error;
        }
    }

    /**
     * 为一批文本生成嵌入向量。
     * @param texts 要处理的文本数组
     * @returns 返回一个包含向量和 token 信息的对象数组
     */
    public async embedBatch(texts: string[]): Promise<EmbedResult[]> {
        if (!this.isModelLoaded) {
            throw new Error('Model not loaded. Please call loadModel() first.');
        }
        
        if (!texts || texts.length === 0) {
            return [];
        }
        
        console.log(`Generating embeddings for ${texts.length} texts`);
        
        try {
            const inputs = texts.map(text => ({ embed_input: text }));
            const results = await this.postRequest<EmbedResult[]>('embed_batch', { inputs });
            
            console.log(`Generated ${results.length} embeddings`);
            return results;
        } catch (error) {
            console.error('Failed to generate embeddings:', error);
            throw error;
        }
    }

    /**
     * 为单个文本生成嵌入向量。
     * @param text 要处理的文本
     * @returns 返回包含向量和 token 信息的对象
     */
    public async embed(text: string): Promise<EmbedResult> {
        if (!text || text.trim().length === 0) {
            throw new Error('Text cannot be empty');
        }
        
        const results = await this.embedBatch([text]);
        if (results.length === 0) {
            throw new Error('Failed to generate embedding');
        }
        
        return results[0];
    }

    /**
     * 计算文本的 token 数量。
     * @param text 要计算的文本
     */
    public async countTokens(text: string): Promise<TokenCountResult> {
        if (!this.isModelLoaded) {
            throw new Error('Model not loaded. Please call loadModel() first.');
        }
        
        if (!text) {
            return { tokens: 0 };
        }
        
        try {
            return await this.postRequest<TokenCountResult>('count_tokens', text);
        } catch (error) {
            console.error('Failed to count tokens:', error);
            throw error;
        }
    }

    /**
     * 卸载模型，释放内存。
     */
    public async unloadModel(): Promise<ModelUnloadResult> {
        if (!this.isModelLoaded) {
            console.log('No model to unload');
            return { model_unloaded: true };
        }
        
        try {
            console.log(`Unloading model: ${this.currentModelId}`);
            const result = await this.postRequest<ModelUnloadResult>('unload', {});
            
            this.isModelLoaded = false;
            this.currentModelId = null;
            
            console.log('Model unloaded successfully');
            return result;
        } catch (error) {
            console.error('Failed to unload model:', error);
            // 即使卸载失败，也重置状态
            this.isModelLoaded = false;
            this.currentModelId = null;
            throw error;
        }
    }

    /**
     * 检查模型是否已加载。
     */
    public get modelLoaded(): boolean {
        return this.isModelLoaded;
    }

    /**
     * 获取当前加载的模型ID。
     */
    public get currentModel(): string | null {
        return this.currentModelId;
    }

    /**
     * 获取支持的模型列表。
     */
    public getSupportedModels(): string[] {
        return [
            'Xenova/all-MiniLM-L6-v2',
            'Xenova/bge-small-en-v1.5',
            'Xenova/bge-base-en-v1.5',
            'Xenova/jina-embeddings-v2-base-zh',
            'Xenova/jina-embeddings-v2-small-en',
            'Xenova/multilingual-e5-small',
            'Xenova/multilingual-e5-base',
            'Xenova/gte-small',
            'Xenova/e5-small-v2',
            'Xenova/e5-base-v2'
        ];
    }

    /**
     * 获取模型信息。
     */
    public getModelInfo(modelId: string): { dims: number; maxTokens: number; description: string } | null {
        const modelInfoMap: Record<string, { dims: number; maxTokens: number; description: string }> = {
            'Xenova/all-MiniLM-L6-v2': { dims: 384, maxTokens: 512, description: 'All-MiniLM-L6-v2 (推荐，轻量级)' },
            'Xenova/bge-small-en-v1.5': { dims: 384, maxTokens: 512, description: 'BGE-small-en-v1.5' },
            'Xenova/bge-base-en-v1.5': { dims: 768, maxTokens: 512, description: 'BGE-base-en-v1.5 (更高质量)' },
            'Xenova/jina-embeddings-v2-base-zh': { dims: 768, maxTokens: 8192, description: 'Jina-v2-base-zh (中英双语)' },
            'Xenova/jina-embeddings-v2-small-en': { dims: 512, maxTokens: 8192, description: 'Jina-v2-small-en' },
            'Xenova/multilingual-e5-small': { dims: 384, maxTokens: 512, description: 'E5-small (多语言)' },
            'Xenova/multilingual-e5-base': { dims: 768, maxTokens: 512, description: 'E5-base (多语言，更高质量)' },
            'Xenova/gte-small': { dims: 384, maxTokens: 512, description: 'GTE-small' },
            'Xenova/e5-small-v2': { dims: 384, maxTokens: 512, description: 'E5-small-v2' },
            'Xenova/e5-base-v2': { dims: 768, maxTokens: 512, description: 'E5-base-v2 (更高质量)' }
        };

        return modelInfoMap[modelId] || null;
    }

    /**
     * 终止 Worker，释放资源。
     */
    public terminate() {
        this.worker.terminate();
        this.requests.clear();
        this.isModelLoaded = false;
    }
} 
