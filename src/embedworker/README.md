# 本地嵌入功能

这个模块提供了在 Web Worker 中运行的本地嵌入功能，使用 Transformers.js 库来生成文本的向量表示。

## 功能特性

- 🚀 **高性能**: 在 Web Worker 中运行，不阻塞主线程
- 🔒 **隐私保护**: 完全本地运行，数据不离开设备
- 🎯 **多模型支持**: 支持多种预训练的嵌入模型
- 💾 **内存管理**: 自动管理模型加载和卸载
- 🔧 **类型安全**: 完整的 TypeScript 类型支持

## 快速开始

### 基本使用

```typescript
import { embeddingManager } from './embedworker';

// 加载模型
await embeddingManager.loadModel('Xenova/all-MiniLM-L6-v2');

// 生成单个文本的嵌入向量
const result = await embeddingManager.embed('Hello, world!');
console.log(result.vec); // [0.1234, -0.5678, ...]
console.log(result.tokens); // 3

// 批量生成嵌入向量
const texts = ['Hello', 'World', 'AI is amazing'];
const results = await embeddingManager.embedBatch(texts);

// 计算 token 数量
const tokenCount = await embeddingManager.countTokens('How many tokens?');
console.log(tokenCount.tokens); // 4
```

### 高级使用

```typescript
import { EmbeddingManager } from './embedworker';

// 创建自定义实例
const customEmbedding = new EmbeddingManager();

// 使用 GPU 加速（如果支持）
await customEmbedding.loadModel('Xenova/all-MiniLM-L6-v2', true);

// 检查模型状态
console.log(customEmbedding.modelLoaded); // true
console.log(customEmbedding.currentModel); // 'TaylorAI/bge-micro-v2'

// 获取支持的模型列表
const models = customEmbedding.getSupportedModels();
console.log(models);

// 获取模型信息
const modelInfo = customEmbedding.getModelInfo('Xenova/all-MiniLM-L6-v2');
console.log(modelInfo); // { dims: 384, maxTokens: 512, description: '...' }

// 切换模型
await customEmbedding.loadModel('Snowflake/snowflake-arctic-embed-xs');

// 清理资源
await customEmbedding.unloadModel();
customEmbedding.terminate();
```

## 支持的模型

| 模型 | 维度 | 最大Token | 描述 |
|------|------|-----------|------|
| Xenova/all-MiniLM-L6-v2 | 384 | 512 | All-MiniLM-L6-v2 (推荐，轻量级) |
| Xenova/bge-small-en-v1.5 | 384 | 512 | BGE-small-en-v1.5 |
| Xenova/bge-base-en-v1.5 | 768 | 512 | BGE-base-en-v1.5 (更高质量) |
| Xenova/jina-embeddings-v2-base-zh | 768 | 8192 | Jina-v2-base-zh (中英双语) |
| Xenova/jina-embeddings-v2-small-en | 512 | 8192 | Jina-v2-small-en |
| Xenova/multilingual-e5-small | 384 | 512 | E5-small (多语言) |
| Xenova/multilingual-e5-base | 768 | 512 | E5-base (多语言，更高质量) |
| Xenova/gte-small | 384 | 512 | GTE-small |
| Xenova/e5-small-v2 | 384 | 512 | E5-small-v2 |
| Xenova/e5-base-v2 | 768 | 512 | E5-base-v2 (更高质量) |

## API 参考

### EmbeddingManager

#### 方法

- `loadModel(modelId: string, useGpu?: boolean): Promise<ModelLoadResult>`
  - 加载指定的嵌入模型
  - `modelId`: 模型标识符
  - `useGpu`: 是否使用 GPU 加速（默认 false）

- `embed(text: string): Promise<EmbedResult>`
  - 为单个文本生成嵌入向量
  - 返回包含向量和 token 数量的结果

- `embedBatch(texts: string[]): Promise<EmbedResult[]>`
  - 为多个文本批量生成嵌入向量
  - 更高效的批处理方式

- `countTokens(text: string): Promise<TokenCountResult>`
  - 计算文本的 token 数量

- `unloadModel(): Promise<ModelUnloadResult>`
  - 卸载当前模型，释放内存

- `terminate(): void`
  - 终止 Worker，释放所有资源

#### 属性

- `modelLoaded: boolean` - 模型是否已加载
- `currentModel: string | null` - 当前加载的模型ID

#### 工具方法

- `getSupportedModels(): string[]` - 获取支持的模型列表
- `getModelInfo(modelId: string)` - 获取模型详细信息

### 类型定义

```typescript
interface EmbedResult {
    vec: number[];           // 嵌入向量
    tokens: number;          // token 数量
    embed_input?: string;    // 原始输入文本
}

interface ModelLoadResult {
    model_loaded: boolean;   // 是否加载成功
}

interface ModelUnloadResult {
    model_unloaded: boolean; // 是否卸载成功
}

interface TokenCountResult {
    tokens: number;          // token 数量
}
```

## 错误处理

```typescript
try {
    await embeddingManager.loadModel('invalid-model');
} catch (error) {
    console.error('加载模型失败:', error.message);
}

try {
    const result = await embeddingManager.embed('');
} catch (error) {
    console.error('文本不能为空:', error.message);
}
```

## 性能考虑

1. **模型加载**: 首次加载模型需要下载和初始化，可能需要几秒到几分钟
2. **批处理**: 使用 `embedBatch` 比多次调用 `embed` 更高效
3. **内存使用**: 大模型需要更多内存，注意设备限制
4. **GPU 加速**: 在支持 WebGPU 的浏览器中可以启用 GPU 加速

## 注意事项

- 首次使用某个模型时需要从 Hugging Face 下载，请确保网络连接正常
- 模型文件会被浏览器缓存，后续使用会更快
- 在移动设备上使用大模型可能会遇到内存限制
- Worker 在后台运行，不会阻塞 UI 线程 
