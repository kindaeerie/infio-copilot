import { InfioSettings } from '../../types/settings';

import {
	TransformationType,
	getAvailableTransformations,
	runBatchTransformations,
	runTransformation,
} from './run_trans';

/**
 * 使用示例：单个转换
 */
export async function exampleSingleTransformation(settings: InfioSettings) {
    const sampleContent = `
    人工智能技术正在快速发展，特别是大型语言模型的出现，彻底改变了我们与计算机交互的方式。
    这些模型能够理解和生成人类语言，在多个领域展现出令人印象深刻的能力。

    然而，随着AI技术的普及，我们也面临着新的挑战，包括伦理问题、隐私保护、
    以及如何确保AI技术的安全和可控发展。这些问题需要全社会的共同关注和努力。

    未来，人工智能将继续在教育、医疗、商业等领域发挥重要作用，
    但我们必须在推进技术发展的同时，确保技术服务于人类的福祉。
    `;

    try {
        // 执行简单摘要转换
        const result = await runTransformation({
            content: sampleContent,
            transformationType: TransformationType.SIMPLE_SUMMARY,
            settings: settings
        });

        if (result.success) {
            console.log('转换成功！');
            console.log('结果:', result.result);
            
            if (result.truncated) {
                console.log(`注意：内容被截断 (${result.originalLength} -> ${result.processedLength} 字符)`);
            }
        } else {
            console.error('转换失败:', result.error);
        }

        return result;
    } catch (error) {
        console.error('执行转换时出错:', error);
        throw error;
    }
}

/**
 * 使用示例：批量转换
 */
export async function exampleBatchTransformations(settings: InfioSettings) {
    const sampleContent = `
    区块链技术作为一种分布式账本技术，具有去中心化、不可篡改、透明公开等特点。
    它最初是为比特币而设计的底层技术，但现在已经扩展到各个行业和应用场景。

    在金融领域，区块链可以用于跨境支付、供应链金融、数字货币等；
    在供应链管理中，它能够提供产品溯源和防伪验证；
    在数字身份认证方面，区块链可以建立更安全可靠的身份管理系统。

    尽管区块链技术有很多优势，但它也面临着可扩展性、能耗、监管等挑战。
    随着技术的不断成熟和完善，相信这些问题会逐步得到解决。
    区块链技术的未来发展值得期待，它将为数字经济的发展提供重要的技术支撑。
    `;

    try {
        // 同时执行多种转换
        const transformationTypes = [
            TransformationType.SIMPLE_SUMMARY,
            TransformationType.KEY_INSIGHTS,
            TransformationType.TABLE_OF_CONTENTS
        ];

        const results = await runBatchTransformations(
            sampleContent,
            transformationTypes,
            settings
        );

        console.log('批量转换完成！');
        
        for (const [type, result] of Object.entries(results)) {
            console.log(`\n=== ${type.toUpperCase()} ===`);
            if (result.success) {
                console.log(result.result);
            } else {
                console.error('失败:', result.error);
            }
        }

        return results;
    } catch (error) {
        console.error('执行批量转换时出错:', error);
        throw error;
    }
}

/**
 * 使用示例：处理长文档（会被截断）
 */
export async function exampleLongDocumentProcessing(settings: InfioSettings) {
    // 模拟一个很长的文档
    const longContent = '这是一个很长的文档内容。'.repeat(10000); // 约50万字符

    try {
        const result = await runTransformation({
            content: longContent,
            transformationType: TransformationType.DENSE_SUMMARY,
            settings: settings,
            maxContentLength: 30000 // 设置最大内容长度
        });

        if (result.success) {
            console.log('长文档转换成功！');
            console.log('原始长度:', result.originalLength);
            console.log('处理后长度:', result.processedLength);
            console.log('是否被截断:', result.truncated);
            console.log('结果长度:', result.result?.length);
        } else {
            console.error('转换失败:', result.error);
        }

        return result;
    } catch (error) {
        console.error('处理长文档时出错:', error);
        throw error;
    }
}

/**
 * 使用示例：获取所有可用的转换类型
 */
export function exampleGetAvailableTransformations() {
    const availableTransformations = getAvailableTransformations();
    
    console.log('可用的转换类型:');
    availableTransformations.forEach((transformation, index) => {
        console.log(`${index + 1}. ${transformation.type}: ${transformation.description}`);
    });

    return availableTransformations;
}

/**
 * 使用示例：错误处理
 */
export async function exampleErrorHandling(settings: InfioSettings) {
    try {
        // 测试空内容
        const emptyResult = await runTransformation({
            content: '',
            transformationType: TransformationType.SIMPLE_SUMMARY,
            settings: settings
        });

        console.log('空内容测试:', emptyResult);

        // 测试太短的内容
        const shortResult = await runTransformation({
            content: '太短',
            transformationType: TransformationType.SIMPLE_SUMMARY,
            settings: settings
        });

        console.log('短内容测试:', shortResult);

        // 测试无效的转换类型（需要类型断言来测试）
        const invalidResult = await runTransformation({
            content: '这是一些测试内容，用于测试无效的转换类型处理。',
            transformationType: 'invalid-type' as TransformationType,
            settings: settings
        });

        console.log('无效类型测试:', invalidResult);

    } catch (error) {
        console.error('错误处理测试时出错:', error);
    }
} 
