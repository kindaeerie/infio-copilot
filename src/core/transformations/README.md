# 文档转换功能 (Document Transformation)

这个模块提供了使用 LLM 对文档进行各种预处理转换的功能。

## 功能特性

- 🔄 **多种转换类型**：支持 6 种不同的文档转换
- 📏 **智能截断**：自动处理过长的文档，在合适的位置截断
- 🚀 **批量处理**：支持同时执行多种转换
- 🛡️ **错误处理**：完善的错误处理和验证机制
- ⚡ **异步处理**：基于 Promise 的异步 API

## 支持的转换类型

| 转换类型 | 描述 | 适用场景 |
|---------|------|----------|
| `SIMPLE_SUMMARY` | 生成简单摘要 | 快速了解文档主要内容 |
| `DENSE_SUMMARY` | 生成深度摘要 | 保留更多细节的密集摘要 |
| `ANALYZE_PAPER` | 分析技术论文 | 学术论文的结构化分析 |
| `KEY_INSIGHTS` | 提取关键洞察 | 发现文档中的重要观点 |
| `TABLE_OF_CONTENTS` | 生成目录 | 了解文档结构和主要话题 |
| `REFLECTIONS` | 生成反思问题 | 促进深度思考的问题 |

## 基本使用方法

### 1. 单个转换

```typescript
import { runTransformation, TransformationType } from './transformations';

async function performTransformation() {
    const result = await runTransformation({
        content: "你的文档内容...",
        transformationType: TransformationType.SIMPLE_SUMMARY,
        settings: yourInfioSettings
    });

    if (result.success) {
        console.log('转换结果:', result.result);
    } else {
        console.error('转换失败:', result.error);
    }
}
```

### 2. 批量转换

```typescript
import { runBatchTransformations, TransformationType } from './transformations';

async function performBatchTransformations() {
    const results = await runBatchTransformations(
        "你的文档内容...",
        [
            TransformationType.SIMPLE_SUMMARY,
            TransformationType.KEY_INSIGHTS,
            TransformationType.TABLE_OF_CONTENTS
        ],
        yourInfioSettings
    );

    // 处理每个转换的结果
    Object.entries(results).forEach(([type, result]) => {
        if (result.success) {
            console.log(`${type}:`, result.result);
        } else {
            console.error(`${type} 失败:`, result.error);
        }
    });
}
```

### 3. 处理长文档

```typescript
const result = await runTransformation({
    content: veryLongDocument,
    transformationType: TransformationType.DENSE_SUMMARY,
    settings: yourInfioSettings,
    maxContentLength: 30000 // 限制最大处理长度
});

if (result.truncated) {
    console.log(`文档被截断: ${result.originalLength} -> ${result.processedLength} 字符`);
}
```

## API 参考

### TransformationParams

```typescript
interface TransformationParams {
    content: string;                    // 要转换的文档内容
    transformationType: TransformationType; // 转换类型
    settings: InfioSettings;           // 应用设置
    model?: LLMModel;                  // 可选：指定使用的模型
    maxContentLength?: number;         // 可选：最大内容长度限制
}
```

### TransformationResult

```typescript
interface TransformationResult {
    success: boolean;           // 转换是否成功
    result?: string;           // 转换结果（成功时）
    error?: string;            // 错误信息（失败时）
    truncated?: boolean;       // 内容是否被截断
    originalLength?: number;   // 原始内容长度
    processedLength?: number;  // 处理后内容长度
}
```

## 文档大小处理

系统会自动处理过长的文档：

- **默认限制**：50,000 字符
- **最小长度**：100 字符
- **智能截断**：尝试在句子或段落边界处截断
- **保护机制**：确保截断后不会丢失过多内容

## 错误处理

常见的错误情况及处理：

- **空内容**：返回错误信息 "内容不能为空"
- **内容过短**：内容少于 100 字符时返回错误
- **不支持的转换类型**：返回相应错误信息
- **LLM 调用失败**：返回具体的调用错误信息

## 最佳实践

1. **内容验证**：在调用前确保内容不为空且长度适当
2. **错误处理**：始终检查 `result.success` 状态
3. **截断提示**：检查 `result.truncated` 以了解是否有内容被截断
4. **批量处理**：对于多种转换，使用 `runBatchTransformations` 提高效率
5. **模型选择**：根据需要选择合适的 LLM 模型

## 集成示例

```typescript
// 在你的组件或服务中
import { 
    runTransformation, 
    TransformationType, 
    getAvailableTransformations 
} from './core/prompts/transformations';

class DocumentProcessor {
    constructor(private settings: InfioSettings) {}

    async processDocument(content: string, type: TransformationType) {
        try {
            const result = await runTransformation({
                content,
                transformationType: type,
                settings: this.settings
            });

            if (result.success) {
                return result.result;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('文档处理失败:', error);
            throw error;
        }
    }

    getAvailableTransformations() {
        return getAvailableTransformations();
    }
}
```

## 注意事项

- 确保已正确配置 LLM 提供商的 API 密钥
- 转换质量依赖于所选择的 LLM 模型
- 处理大文档时可能需要较长时间
- 某些转换类型对特定类型的内容效果更好（如 `ANALYZE_PAPER` 适用于学术论文）

## 故障排除

1. **LLM 调用失败**：检查 API 密钥和网络连接
2. **转换结果为空**：可能是内容过短或模型无法理解内容
3. **内容被意外截断**：调整 `maxContentLength` 参数
4. **特定转换效果不佳**：尝试其他转换类型或检查内容是否适合该转换 
