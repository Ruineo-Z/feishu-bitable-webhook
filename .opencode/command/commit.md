---
description: 创建符合 Conventional Commits 规范的 git commit
---

我需要你帮我创建一个规范的 git commit。请按照以下步骤操作：

## 0. 检查 .gitignore
在开始之前，必须执行以下检查：
```bash
# 检查项目是否存在 .gitignore 文件
if [ ! -f ".gitignore" ]; then
    echo "⚠️ 警告：项目根目录不存在 .gitignore 文件"
    echo "建议创建一个 .gitignore 文件来管理需要忽略的文件和目录"
    echo "是否继续创建 commit？(继续/取消)"
    exit 1
fi
```

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

## 5. 禁止自动推送和合并
**重要约束**（绝对禁止）：
- ❌ 禁止自动执行 `git push`
- ❌ 禁止自动执行 `git pull`
- ❌ 禁止自动执行 `git merge`
- ❌ 禁止自动执行 `git rebase`
- ❌ 禁止自动执行任何分支操作

仅当我明确要求推送时，才可以执行 `git push`。

## 6. 暂存规则
根据 `.gitignore` 文件判断哪些文件需要忽略：
- 使用 `git add -A` 或 `git add <文件>` 暂存时，git 会自动忽略 `.gitignore` 中指定的文件和目录
- 不要手动排除以 `.` 开头的目录或文件，让 git 根据 `.gitignore` 自动判断
- 如果项目没有 `.gitignore`，在步骤 0 中已经警告并停止

## 重要
- 如果暂存区为空，请先询问我需要暂存哪些文件
- 如果没有变更，告诉我当前没有需要提交的内容
- 始终等待我的确认后再执行 commit 操作
- 如果我不确认，不要执行任何 git 操作
- **绝对禁止**自动推送或合并分支
