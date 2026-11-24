# iOS 15 兼容性核查

> 证据等级：**S（静态检查）**。本文不含任何构建或真机结论；标注 **U** 的项必须在有 macOS 环境后取证。

## 1. 配置层的三个最低系统声明

| 位置 | 值 | 作用 |
| --- | --- | --- |
| `iosApp/project.yml` → `options.deploymentTarget.iOS` | `"14.0"` | 全局默认 |
| `iosApp/project.yml` → `targets.iosApp.deploymentTarget` | `"14.0"` | 主 App |
| `iosApp/project.yml` → `targets.ShareExtension.deploymentTarget` | `"14.0"` | 分享扩展 |
| `scripts/build-ios-native.sh` → `IOS_MIN_VERSION` | `"14.0"` | quickjs-ng 静态库编译目标 |

四处一致，均为 14.0。**配置声明 ≠ 实际产物最低系统**，实际值由链接时的 SDK 与依赖决定，必须从产物 `Info.plist` 的 `MinimumOSVersion` 读取（本轮已把该校验加进 CI，见第 5 节）。

## 2. 依赖的最低系统要求（未核实项）

以下依赖为 iOS 产物提供原生代码或 klib，其自身最低系统要求**尚未逐一核实**（需要 macOS + Xcode 读取各 `.a`/klib 的 `LC_BUILD_VERSION`）：

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Compose Multiplatform | 1.11.1 | skiko 原生渲染 |
| Kotlin/Native | 2.3.20 | `iosArm64` / `iosSimulatorArm64` |
| quickjs-ng（仓库内 C 源） | 随仓库 | 由 `build-ios-native.sh` 按 14.0 编译 |
| coil3 | 3.4.0 | 图片加载（iOS klib） |
| ktor | 3.5.2 | `ktor-client-darwin` |
| okio | 3.18.1 | IO |
| room3 / androidx.sqlite | 3.0.1 / 2.7.0 | 数据库 |
| epub4kmp / kmp-zip | 0.3.0 / 0.12.1 | EPUB/压缩 |

**风险判定（S）**：`libs.versions.toml` 的注释已记录"coil 3.5.0+ 的 iOS klib 为 Kotlin 2.4 ABI"，说明该项目对 klib ABI 与工具链匹配有明确约束；但**没有任何仓库内证据表明这些依赖的 iOS 变体支持 iOS 14/15**。这是 PRD FR-02 与 R1 的核心待验证项。

## 3. 已知的兼容性风险点

| # | 风险 | 依据 | 处置 |
| --- | --- | --- | --- |
| 1 | `macos-latest` 浮动导致 Xcode/SDK 漂移 | `.github/workflows/ios.yml` `runs-on: macos-latest` | 本轮在文档记录；建议基线通过后固定 runner 版本 |
| 2 | Compose Multiplatform 1.11+ 启动强校验 | `project.yml` 注释："缺失或为 false 会直接抛异常终止进程"（`CADisableMinimumFrameDurationOnPhone`） | 已配置 `true`，配置正确 |
| 3 | iOS 14 配置但目标是 iOS 15 | `project.yml` 14.0 vs PRD 要求 15.0+ | 14.0 ≤ 15.0，方向正确；不为凑数字提高配置 |
| 4 | 分享扩展依赖 App Group entitlement | `project.yml` 注释："CI 用 `CODE_SIGNING_ALLOWED=NO` 归档，拿不到任何 entitlement" | 未签名 IPA 下分享面板链路不生效，宿主有回退说明；属已知限制 |
| 5 | iCloud 容器需付费账号 + entitlement | `project.yml` `NSUbiquitousContainers` 段注释"只加本键打不开 iCloud" | 按 PRD FR-17 列为 P2，不承诺可用 |

## 4. 代码层的可用性判断

- `MainViewController.kt:156/198` 注释："iOS 无构建类型感知，isDebug 恒 false（对齐 release 行为）" —— 不影响最低系统。
- 未发现仓库内使用高于 iOS 14 的系统 API 且缺少 `#available` / `@available` 守卫的**显式证据**（本轮为符号级扫描，非完整 API 审计，证据等级仍为 S）。

## 5. 本轮新增的产物侧校验（CI）

`ios.yml` 新增 `Verify IPA structure` 步骤，对未签名 IPA 做机器校验：

- `MinimumOSVersion` 是否存在，且 ≤ 15.0（超出即失败）；
- 主二进制与内嵌 `Frameworks/*.framework` 是否齐全；
- Mach-O 架构是否包含 `arm64`；
- `CFBundleShortVersionString` 是否与 IPA 文件名版本一致；
- 结果写入 `ci-logs/verify-ipa.log` 并随日志 artifact 上传。

该校验把"配置声明"与"实际产物"对上，是 PRD 9.2 AT18 的静态可自动化部分。**它不替代真机安装验证。**

## 6. 待取证清单（有 macOS 环境后）

| 项 | 方法 | 目标证据等级 |
| --- | --- | --- |
| 原版能否编译 | `stage=klib` 手动触发 | B |
| 能否产出 IPA | `stage=ipa` 手动触发 | B |
| 产物最低系统 | 读 IPA 内 `MinimumOSVersion` | B |
| 模拟器能否启动 | `stage=simulator` + 安装 .app | I |
| iOS 15 真机核心链路 | 真机安装 + 走 AT01/AT02/AT03 | D |
| 依赖最低系统 | 对各 `.a` 执行 `otool -l` 看 `LC_BUILD_VERSION` | B |

在取得上述证据前，任何"iOS 15 支持"的表述只能写为：**目标支持，未真机验证**。
