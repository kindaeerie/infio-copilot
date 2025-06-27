# Dataview 集成使用指南

本插件已成功集成 Dataview 功能，让你可以在插件中执行 Dataview 查询。

## 功能特性

### 1. DataviewManager 类
- 检查 Dataview 插件是否可用
- 执行各种类型的 Dataview 查询（LIST、TABLE、TASK、CALENDAR）
- 获取页面数据和任务信息
- 搜索和过滤功能

### 2. DataviewQueryBuilder 类
- 链式查询构建器
- 支持复杂查询的构建
- 类型安全的查询构建

### 3. 命令面板集成
- 新增"执行 Dataview 查询"命令
- 可通过命令面板快速访问

## 使用方法

### 通过命令面板使用

1. 打开命令面板（Ctrl/Cmd + P）
2. 输入"执行 Dataview 查询"
3. 在弹出的对话框中输入你的查询
4. 查询结果将保存到新的笔记中

### 编程方式使用

```typescript
// 在插件代码中使用
import { createDataviewManager } from './utils/dataview';

// 创建 DataviewManager 实例
const dataviewManager = createDataviewManager(this.app);

// 检查 Dataview 是否可用
if (dataviewManager.isDataviewAvailable()) {
    // 执行查询
    const result = await dataviewManager.executeQuery('LIST FROM #项目');
    
    if (result.success) {
        console.log('查询结果:', result.data);
    } else {
        console.error('查询失败:', result.error);
    }
}

// 使用查询构建器
const queryBuilder = dataviewManager.createQueryBuilder();
const result = await queryBuilder
    .type('table')
    .select('file.name', 'file.mtime')
    .from('#项目')
    .where('file.mtime >= date(today) - dur(7 days)')
    .sort('file.mtime', 'DESC')
    .limit(10)
    .execute();
```

## 常用查询示例

### 1. 列出所有笔记
```dataview
LIST FROM ""
```

### 2. 今天创建的笔记
```dataview
LIST WHERE file.cday = date(today)
```

### 3. 最近7天修改的笔记
```dataview
LIST WHERE file.mtime >= date(today) - dur(7 days) SORT file.mtime DESC
```

### 4. 带有特定标签的笔记
```dataview
LIST FROM #项目
```

### 5. 未完成的任务
```dataview
TASK WHERE !completed
```

### 6. 今天到期的任务
```dataview
TASK WHERE due = date(today)
```

### 7. 文件夹中的笔记表格
```dataview
TABLE file.name, file.mtime, file.size
FROM "项目文件夹"
SORT file.mtime DESC
```

## API 参考

### DataviewManager

#### 方法

- `isDataviewAvailable(): boolean` - 检查 Dataview 插件是否可用
- `executeQuery(query: string): Promise<DataviewQueryResult>` - 执行查询
- `getPage(path: string): unknown` - 获取页面数据
- `getPages(source?: string): unknown[]` - 获取所有页面
- `searchPages(query: string): unknown[]` - 搜索页面
- `getPagesByTag(tag: string): unknown[]` - 获取带有特定标签的页面
- `getPagesByFolder(folder: string): unknown[]` - 获取文件夹中的页面
- `getTasks(source?: string): unknown[]` - 获取任务
- `getIncompleteTasks(source?: string): unknown[]` - 获取未完成的任务
- `getCompletedTasks(source?: string): unknown[]` - 获取已完成的任务

### DataviewQueryBuilder

#### 方法

- `type(type: 'table' | 'list' | 'task' | 'calendar'): this` - 设置查询类型
- `select(...fields: string[]): this` - 添加字段选择（用于 table 查询）
- `from(source: string): this` - 添加数据源
- `where(condition: string): this` - 添加 WHERE 条件
- `sort(field: string, direction: 'ASC' | 'DESC'): this` - 添加排序
- `limit(count: number): this` - 添加限制
- `groupBy(field: string): this` - 添加分组
- `build(): string` - 构建查询字符串
- `execute(): Promise<DataviewQueryResult>` - 执行查询

### DataviewQueryResult

```typescript
interface DataviewQueryResult {
    success: boolean;
    data?: unknown;
    error?: string;
}
```

## 注意事项

1. 确保已安装并启用 Dataview 插件
2. 查询语法遵循 Dataview 的标准语法
3. 查询结果会自动保存到新的笔记中
4. 支持所有 Dataview 的查询类型：LIST、TABLE、TASK、CALENDAR

## 故障排除

### Dataview 插件未安装或未启用
- 确保在 Obsidian 中安装了 Dataview 插件
- 确保 Dataview 插件已启用

### 查询语法错误
- 检查查询语法是否符合 Dataview 标准
- 参考 Dataview 官方文档：https://blacksmithgu.github.io/obsidian-dataview/

### 查询结果为空
- 检查查询条件是否正确
- 确保有符合条件的文件存在

## 扩展功能

你可以通过以下方式扩展 Dataview 集成：

1. 添加自定义查询模板
2. 集成到聊天界面中
3. 添加查询历史记录
4. 实现查询结果的可视化展示

## 更多资源

- [Dataview 官方文档](https://blacksmithgu.github.io/obsidian-dataview/)
- [Dataview 查询语法](https://blacksmithgu.github.io/obsidian-dataview/queries/structure/)
- [Dataview API 文档](https://blacksmithgu.github.io/obsidian-dataview/api/intro/)
