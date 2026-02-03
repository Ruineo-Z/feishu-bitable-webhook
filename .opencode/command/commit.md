---
description: 创建符合 Conventional Commits 规范的 git commit
---

我需要你帮我创建一个规范的 git commit。请按照以下步骤操作：

## 1. 分析变更
运行以下命令获取当前状态和变更信息：
- `git status` - 查看暂存区和未暂存的文件
- `git diff --cached` - 查看已暂存的变更
- `git diff` - 查看未暂存的变更
- `git log --oneline -5` - 查看最近的提交记录

## 2. 生成 Commit Message
根据变更内容，生成符合 [Conventional Commits](https://www.conventionalcommits.org/) 规范的 commit message：

```
<type>[可选作用域]: <描述>

[可选的正文]

[可选的脚注]
```

**Type 类型**（选择其中一个）：
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构（既不是新功能也不是修复 bug）
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建工具或辅助工具的更改
- `ci`: CI 配置相关

**格式要求**：
- 使用中文描述（因为用户使用中文）
- 描述使用祈使语气（如 "add" 而不是 "added"）
- 开头小写字母
- 简洁明了，不超过 72 字符

## 3. 展示并确认
向我展示生成的 commit message，包括：
- 变更的文件列表
- commit message 完整内容
- 询问是否确认提交

## 4. 提交（仅当我确认后）
如果我确认，请执行：
```bash
git commit -m "生成的 commit message"
```

**重要**：
- 如果暂存区为空，请先询问我需要暂存哪些文件
- 如果没有变更，告诉我当前没有需要提交的内容
- 始终等待我的确认后再执行 commit 操作
- 如果我不确认，不要执行任何 git 操作
