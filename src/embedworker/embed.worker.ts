// 完整的嵌入 Worker，使用 Transformers.js
console.log('Embedding worker loaded');

// 类型定义
interface EmbedInput {
    embed_input: string;
}

interface EmbedResult {
    vec: number[];
    tokens: number;
    embed_input?: string;
}

interface WorkerMessage {
    method: string;
    params: any;
    id: number;
    worker_id?: string;
}

interface WorkerResponse {
    id: number;
    result?: any;
    error?: string;
    worker_id?: string;
}

// 全局变量
let model: any = null;
let pipeline: any = null;
let tokenizer: any = null;
let processing_message = false;
let transformersLoaded = false;

// 动态导入 Transformers.js
async function loadTransformers() {
    if (transformersLoaded) return;
    
    try {
        console.log('Loading Transformers.js...');
        
        // 尝试使用旧版本的 Transformers.js，它在 Worker 中更稳定
        const { pipeline: pipelineFactory, env, AutoTokenizer } = await import('@xenova/transformers');
        
        // 配置环境以适应浏览器 Worker
        env.allowLocalModels = false;
        env.allowRemoteModels = true;
        
        // 配置 WASM 后端
        env.backends.onnx.wasm.numThreads = 2; // 在 Worker 中使用单线程
        env.backends.onnx.wasm.simd = true;
        
        // 禁用 Node.js 特定功能
        env.useFS = false;
        env.useBrowserCache = true;
        
        // 存储导入的函数
        (globalThis as any).pipelineFactory = pipelineFactory;
        (globalThis as any).AutoTokenizer = AutoTokenizer;
        (globalThis as any).env = env;
        
        transformersLoaded = true;
        console.log('Transformers.js loaded successfully');
    } catch (error) {
        console.error('Failed to load Transformers.js:', error);
        throw new Error(`Failed to load Transformers.js: ${error}`);
    }
}

// 加载模型
async function loadModel(modelKey: string, useGpu: boolean = false) {
    try {
        console.log(`Loading model: ${modelKey}, GPU: ${useGpu}`);
        
        // 确保 Transformers.js 已加载
        await loadTransformers();
        
        const pipelineFactory = (globalThis as any).pipelineFactory;
        const AutoTokenizer = (globalThis as any).AutoTokenizer;
        const env = (globalThis as any).env;
        
        // 配置管道选项
        const pipelineOpts: any = {
            quantized: true,
            progress_callback: (progress: any) => {
                console.log('Model loading progress:', progress);
            }
        };
        
        if (useGpu && typeof navigator !== 'undefined' && 'gpu' in navigator) {
            console.log('[Transformers] Attempting to use GPU');
            try {
                pipelineOpts.device = 'webgpu';
                pipelineOpts.dtype = 'fp32';
            } catch (error) {
                console.warn('[Transformers] GPU not available, falling back to CPU');
            }
        } else {
            console.log('[Transformers] Using CPU');
        }
        
        // 创建嵌入管道
        pipeline = await pipelineFactory('feature-extraction', modelKey, pipelineOpts);
        
        // 创建分词器
        tokenizer = await AutoTokenizer.from_pretrained(modelKey);
        
        model = {
            loaded: true,
            model_key: modelKey,
            use_gpu: useGpu
        };
        
        console.log(`Model ${modelKey} loaded successfully`);
        return { model_loaded: true };
        
    } catch (error) {
        console.error('Error loading model:', error);
        throw new Error(`Failed to load model: ${error}`);
    }
}

// 卸载模型
async function unloadModel() {
    try {
        console.log('Unloading model...');
        
        if (pipeline) {
            if (pipeline.destroy) {
                pipeline.destroy();
            }
            pipeline = null;
        }
        
        if (tokenizer) {
            tokenizer = null;
        }
        
        model = null;
        
        console.log('Model unloaded successfully');
        return { model_unloaded: true };
        
    } catch (error) {
        console.error('Error unloading model:', error);
        throw new Error(`Failed to unload model: ${error}`);
    }
}

// 计算 token 数量
async function countTokens(input: string) {
    try {
        if (!tokenizer) {
            throw new Error('Tokenizer not loaded');
        }
        
        const { input_ids } = await tokenizer(input);
        return { tokens: input_ids.data.length };
        
    } catch (error) {
        console.error('Error counting tokens:', error);
        throw new Error(`Failed to count tokens: ${error}`);
    }
}

// 生成嵌入向量
async function embedBatch(inputs: EmbedInput[]): Promise<EmbedResult[]> {
    try {
        if (!pipeline || !tokenizer) {
            throw new Error('Model not loaded');
        }
        
        console.log(`Processing ${inputs.length} inputs`);
        
        // 过滤空输入
        const filteredInputs = inputs.filter(item => item.embed_input && item.embed_input.length > 0);
        
        if (filteredInputs.length === 0) {
            return [];
        }
        
        // 批处理大小（可以根据需要调整）
        const batchSize = 1;
        
        if (filteredInputs.length > batchSize) {
            console.log(`Processing ${filteredInputs.length} inputs in batches of ${batchSize}`);
            const results: EmbedResult[] = [];
            
            for (let i = 0; i < filteredInputs.length; i += batchSize) {
                const batch = filteredInputs.slice(i, i + batchSize);
                const batchResults = await processBatch(batch);
                results.push(...batchResults);
            }
            
            return results;
        }
        
        return await processBatch(filteredInputs);
        
    } catch (error) {
        console.error('Error in embed batch:', error);
        throw new Error(`Failed to generate embeddings: ${error}`);
    }
}

// 处理单个批次
async function processBatch(batchInputs: EmbedInput[]): Promise<EmbedResult[]> {
    try {
        // 计算每个输入的 token 数量
        const tokens = await Promise.all(
            batchInputs.map(item => countTokens(item.embed_input))
        );
        
        // 准备嵌入输入（处理超长文本）
        const maxTokens = 512; // 大多数模型的最大 token 限制
        const embedInputs = await Promise.all(
            batchInputs.map(async (item, i) => {
                if (tokens[i].tokens < maxTokens) {
                    return item.embed_input;
                }
                
                // 截断超长文本
                let tokenCt = tokens[i].tokens;
                let truncatedInput = item.embed_input;
                
                while (tokenCt > maxTokens) {
                    const pct = maxTokens / tokenCt;
                    const maxChars = Math.floor(truncatedInput.length * pct * 0.9);
                    truncatedInput = truncatedInput.substring(0, maxChars) + '...';
                    tokenCt = (await countTokens(truncatedInput)).tokens;
                }
                
                tokens[i].tokens = tokenCt;
                return truncatedInput;
            })
        );
        
        // 生成嵌入向量
        const resp = await pipeline(embedInputs, { pooling: 'mean', normalize: true });
        
        // 处理结果
        return batchInputs.map((item, i) => ({
            vec: Array.from(resp[i].data).map((val: number) => Math.round(val * 1e8) / 1e8),
            tokens: tokens[i].tokens,
            embed_input: item.embed_input
        }));
        
    } catch (error) {
        console.error('Error processing batch:', error);
        
        // 如果批处理失败，尝试逐个处理
        return Promise.all(
            batchInputs.map(async (item) => {
                try {
                    const result = await pipeline(item.embed_input, { pooling: 'mean', normalize: true });
                    const tokenCount = await countTokens(item.embed_input);
                    
                    return {
                        vec: Array.from(result[0].data).map((val: number) => Math.round(val * 1e8) / 1e8),
                        tokens: tokenCount.tokens,
                        embed_input: item.embed_input
                    };
                } catch (singleError) {
                    console.error('Error processing single item:', singleError);
                    return {
                        vec: [],
                        tokens: 0,
                        embed_input: item.embed_input,
                        error: (singleError as Error).message
                    } as any;
                }
            })
        );
    }
}

// 处理消息
async function processMessage(data: WorkerMessage): Promise<WorkerResponse> {
    const { method, params, id, worker_id } = data;
    
    try {
        let result: any;
        
        switch (method) {
            case 'load':
                console.log('Load method called with params:', params);
                result = await loadModel(params.model_key, params.use_gpu || false);
                break;
                
            case 'unload':
                console.log('Unload method called');
                result = await unloadModel();
                break;
                
            case 'embed_batch':
                console.log('Embed batch method called');
                if (!model) {
                    throw new Error('Model not loaded');
                }
                
                // 等待之前的处理完成
                if (processing_message) {
                    while (processing_message) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                
                processing_message = true;
                result = await embedBatch(params.inputs);
                processing_message = false;
                break;
                
            case 'count_tokens':
                console.log('Count tokens method called');
                if (!model) {
                    throw new Error('Model not loaded');
                }
                
                // 等待之前的处理完成
                if (processing_message) {
                    while (processing_message) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                
                processing_message = true;
                result = await countTokens(params);
                processing_message = false;
                break;
                
            default:
                throw new Error(`Unknown method: ${method}`);
        }
        
        return { id, result, worker_id };
        
    } catch (error) {
        console.error('Error processing message:', error);
        processing_message = false;
        return { id, error: (error as Error).message, worker_id };
    }
}

// 监听消息
self.addEventListener('message', async (event) => {
    console.log('Worker received message:', event.data);
    const response = await processMessage(event.data);
    console.log('Worker sending response:', response);
    self.postMessage(response);
});

console.log('Embedding worker ready'); 
