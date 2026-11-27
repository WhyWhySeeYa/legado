# 测试执行报告

> 本文件只记录**实际执行过**的测试。未执行的一律不写"通过"。

## 0. 真机验证（D 级）— 唯一一项达到 D 的证据

| 项 | 值 |
| --- | --- |
| 产物 | `legado-3.26.11260612-ios-unsigned.ipa`（35.30 MB） |
| 构建 commit | `7f1a3f9064986f1cd4878dfbbaf8b957fe7502ba` |
| 构建来源 | GitHub Actions run #4（`ios.yml`，stage=ipa），Xcode 26.6 / iOS SDK 26.5 |
| 分发 | Release `multiplatform-test`，`prerelease: true` |
| SHA-256 | `a34f7e05c346fa3fe018b0f31dd9c348574f51b3a028856b4bc301eede58a14b` |
| 安装结果 | **用户真机安装成功，初步使用无问题** |
| 证据等级 | **D（真机）** |
| 待补 | 具体系统版本、逐项 AT 用例走查结果（用户尚未提供，本文不代填） |

**注意**：这一项证明的是"该 IPA 能在用户设备上安装并初步运行"。它**不等于** PRD 的 AT01–AT20 全部通过，也不等于 iOS 15 兼容已验证——PRD 要求的首验设备是 iPhone 14 Pro Max / iOS 16.6，iOS 15 真机仍未测。

## 1. 执行环境（静态审计阶段）

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

## 3. 已执行：CI 构建与产物校验（B 级）

run #4（`ios.yml`，stage=ipa，commit `7f1a3f90`）在 GitHub Actions 的 macOS runner 上实际跑完：

| 步骤 | 结果 |
| --- | --- |
| Compile shared iOS klib | success |
| Link shared framework | success |
| Archive (unsigned) | success |
| Package unsigned IPA | success |
| Verify IPA structure | success（7 项全过，见 3.1） |
| Upload IPA artifact | success |

总耗时 40.1 分钟，产物 `ios-ipa-unsigned` 34.60 MB。

### 3.1 产物结构校验输出（CI 实测原文）

```
OK - MinimumOSVersion 存在 (14.0)
OK - MinimumOSVersion <= 15 (14.0)
OK - 主二进制存在 (legado)
OK - 主二进制含 arm64
OK - 内嵌 shared.framework
OK - IPA 文件名版本与 Info.plist 一致 (legado-3.26.11260612-ios-unsigned.ipa)
OK - ShareExtension 已嵌入
```

**这条证据回答了两件事**：iOS 目标链路能编能链能出包（B）；产物最低系统声明是 14.0，不高于 iOS 15（B）。仍不回答"iOS 15 真机能否运行"。

## 4. 未执行（不得声称通过）

| 项 | 原因 | 需要的环境 |
| --- | --- | --- |
| 模拟器安装启动（`stage=simulator`） | 无模拟器 | macOS |
| 核心链路逐项走查（AT01/AT02/AT03 等） | 用户仅报告"安装测试无问题"，未逐项走查 | 真机 |
| iOS 15 真机 | 无 iOS 15 设备 | iOS 15 真机 |
| 备份/恢复跨端往返 | 未测 | 双端设备 |
| 书源兼容实测 | 未建本地 fixture | macOS + 真机 |
| 依赖 `LC_BUILD_VERSION` 逐项核实 | 未做 | macOS |

## 5. 证据等级汇总

| 类别 | 等级 |
| --- | --- |
| 守卫脚本自测（2.1） | **P**（实际执行） |
| 守卫回归判定（2.2） | **P**（实际执行） |
| CI 构建与产物校验（3） | **B**（实际构建） |
| 真机安装与初步使用（0） | **D**（真机） |
| 所有代码审计结论 | **S**（静态检查） |
| 核心链路逐项验收 / iOS 15 真机 | **U**（未验证） |
