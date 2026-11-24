# 测试执行报告

> 本文件只记录**实际执行过**的测试。未执行的一律不写"通过"。

## 1. 执行环境

| 项 | 值 |
| --- | --- |
| 环境 | iOS App 内 Node（受限沙盒） |
| 能力限制 | 无 macOS、无 JDK/Gradle、无 Xcode、无模拟器、无真机；子进程 spawn 不可用 |
| 基线 commit | `52519722d2ae5877012219ec43d6c115062bfd4f` |

## 2. 已执行

### 2.1 平台完整性守卫自测

```bash
node scripts/ios-capability-matrix.test.mjs
```

**结果：8/8 通过，退出码 0。**

| # | 用例 | 结果 |
| --- | --- | --- |
| 1 | 源码路径齐全：两个接口面与两端实现都能读到 | ok |
| 2 | `collectOverrides` 能抓到 override 成员 | ok |
| 3 | `collectCapabilities` 区分 unsupported fun 与默认 false 的布尔开关（默认 true 的 `drawBlurSupported` 不得计入） | ok |
| 4 | `collectServiceDefaults` 只收接口体内带默认实现的成员（`=` 值 / 块体 / 空块体三种，且不混入 object 方法） | ok |
| 5 | 白名单没有过期条目 | ok |
| 6 | `analyze` 判定自洽（缺口必须来自平台差异面且两端确实不同） | ok |
| 7 | 当前仓库状态：所有缺口都已登记 | ok |
| 8 | `renderMarkdown` 输出两节与证据等级 | ok |

### 2.2 守卫回归判定

```bash
node scripts/ios-capability-matrix.mjs --check
```

**结果：退出码 0。**

```
Capabilities: Android=107 iOS=97 覆盖 90.7%, 缺口 14
Services: 默认实现成员 10, 缺口 5
OK: 全部缺口均为已登记项。
```

### 2.3 CI 工作流结构校验（脚本辅助，非 GitHub 解析）

对 `.github/workflows/ios.yml` 做的静态校验：

- 全部 step 缩进一致（6 空格）：0 异常；
- 提取 16 个 `run: |` 块，`if/fi`、`case/esac`、花括号全部配对；
- 新增步骤与既有步骤（`Package unsigned IPA` 等）结构同构。

**注意**：这是本地结构校验，**不等于 GitHub 能成功解析 YAML**。fork 的 Actions 当前未启用
（`/actions/workflows` 返回 `total_count: 0`），首次启用后建议先跑 `stage=klib` 验证解析。

### 2.4 Kotlin 改动结构校验

`ui/src/iosMain/.../IosPlatformServices.kt` 的 `discardPickedFile` 新增：

- 与原版文件比对：原版花括号 101/101 平衡，修改后 103/103 平衡，增量 +2/+2 对称；
- 行数增量 21（2 行 import + 19 行实现），与改动内容一致。

**这不是编译验证**：未运行 `kotlinc`，未链接 klib。

## 3. 未执行（不得声称通过）

| 项 | 原因 | 需要的环境 |
| --- | --- | --- |
| Kotlin 编译（`stage=klib`） | 无 JDK/Gradle | macOS + Xcode |
| framework 链接（`stage=link`） | 同上 | 同上 |
| IPA 产出（`stage=ipa`） | 同上 | 同上 |
| 产物 `MinimumOSVersion` 实测 | 无产物 | macOS |
| 模拟器安装启动（`stage=simulator`） | 无模拟器 | macOS |
| 真机安装与核心链路（AT01/AT02/AT03） | 无 iOS 设备 | iOS15 真机 |
| 备份/恢复跨端往返 | 无设备 | 双端设备 |
| 书源兼容实测 | 无本地 fixture 与设备 | macOS + 真机 |

## 4. 证据等级汇总

| 类别 | 等级 |
| --- | --- |
| 守卫脚本自测（2.1） | **P**（实际执行） |
| 守卫回归判定（2.2） | **P**（实际执行） |
| 所有代码审计结论 | **S**（静态检查） |
| 构建 / 模拟器 / 真机 | **U**（未验证） |
