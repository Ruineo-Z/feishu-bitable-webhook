## Why

当前 workflow 在飞书多维表格字段值处理上仍然是“透传优先”，导致同一业务在不同字段类型下容易出现参数格式错误（如 `TextFieldConvFail`、`InvalidFilter`）。在进入真实业务联调后，这已成为主要失败来源，需要通过统一字段编解码层来稳定运行时行为并降低配置复杂度。

## What Changes

- 新增统一字段编解码能力：对事件输入值进行标准化解析，对 SDK 写入值与过滤值进行按类型构建。
- 在 workflow 插件链路中接入字段编解码层，替代当前分散的临时转换逻辑。
- 为 create/query/delete 等核心 bitable 动作补充类型级校验与可诊断错误上下文。
- 统一维护字段 schema/映射读取与缓存策略，避免不同插件重复解析。
- 更新文档与示例，明确 DSL 中字段值模板在不同类型字段下的行为约定。

## Capabilities

### New Capabilities
- `workflow-field-codec`: 统一定义飞书字段值的 decode/encode/filter 编解码契约，并接入 workflow 运行时插件。

### Modified Capabilities
- `api-documentation`: 补充字段值模板、字段类型转换规则与常见错误排查示例。

## Impact

- Affected code: `src/parser/*`, `src/workflow/plugins/*`, `src/workflow/core/*`, `src/db/field-mappings.ts`
- Affected APIs: workflow 执行结果与错误细节（日志维度）将更稳定、更可诊断
- Dependencies: 继续依赖飞书 bitable SDK 与现有字段映射表，新增统一 codec 模块与测试覆盖
- Systems: 影响 workflow-only 运行时联调链路（A/B 表同步等真实业务场景）
