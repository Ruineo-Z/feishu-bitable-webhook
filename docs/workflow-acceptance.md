# Workflow-only 验收记录

## 验收范围

- 字段映射 registry
- workflow-only 运行时
- workflow bitable 动作插件
- 映射 API 与文档

## 自动化验证

- [x] `npx tsc --noEmit`
- [x] `npx tsx tests/workflow/bitable-plugins.test.ts`

## 手工验证

- [ ] 真实飞书事件触发 workflow 执行（预发布）
- [ ] 真实多维表数据联动验证（创建/删除/查询）
- [ ] `/api/mappings` 与 `/api/mappings/refresh` 在线验证

## 结论

- 代码层核心能力已落地。
- 仍需在真实预发布环境完成联调项后再执行最终切换确认。
