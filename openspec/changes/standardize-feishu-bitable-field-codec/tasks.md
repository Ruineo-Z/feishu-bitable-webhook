## 1. Codec 基础能力与类型注册

- [x] 1.1 新建字段 codec 模块结构（接口、类型定义、注册表）
- [x] 1.2 实现 `decodeFromEvent` / `encodeForWrite` / `encodeForFilter` 三段式基础接口
- [x] 1.3 落地 Text/RichText codec（富文本数组到字符串的稳定转换）
- [x] 1.4 落地 User codec（人员字段标准化为 Feishu 兼容结构）

## 2. 字段 schema 解析与缓存接入

- [x] 2.1 在字段映射读取层补充字段类型元信息获取策略（含缺失降级）
- [x] 2.2 增加 table 级 schema 缓存与失效策略，避免插件重复解析
- [x] 2.3 提供按 `app_token + table_id + field_name/field_id` 的字段类型查询接口

## 3. Workflow 插件接入与行为统一

- [x] 3.1 在 `action.bitable.create` 中接入 write codec，对 `fields` 进行类型感知编码
- [x] 3.2 在 `action.bitable.delete` 中接入 filter codec，统一条件值编码
- [x] 3.3 在 `action.bitable.query` 中接入 filter codec 与字段名解析一致性逻辑
- [x] 3.4 清理插件内重复的临时值转换逻辑，统一复用 codec 层

## 4. 错误模型与日志可诊断性

- [x] 4.1 定义并接入统一 codec 错误码（含字段级上下文）
- [x] 4.2 在 step output 中补充 `field`, `expected_shape`, `input_summary` 等诊断信息
- [x] 4.3 保留并透传 Feishu SDK `code/msg/log_id` 到执行日志
- [x] 4.4 完善运行时告警：未知字段类型走 fallback 并记录 warning

## 5. 测试、文档与验收

- [x] 5.1 补充 codec 单测（Text/User/空值/数组值/未知类型 fallback）
- [x] 5.2 补充插件集成测试（create/delete/query 的类型编码路径）
- [x] 5.3 更新 API 文档与 Swagger 示例（字段值模板与转换规则）
- [ ] 5.4 运行真实 A->B 链路联调并验证不再出现 `TextFieldConvFail/InvalidFilter`
- [x] 5.5 更新验收记录并给出回退策略核验结论
