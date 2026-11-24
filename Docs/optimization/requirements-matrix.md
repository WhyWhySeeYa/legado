# iOS 需求覆盖矩阵（PRD FR ↔ 代码落点）

> 证据等级：**S（静态检查）**。本表只做"需求 → 代码落点"的静态映射，**不代表该需求已通过验收**。
> 每一项的验收状态列写的是"有无运行证据"，不是"能不能用"。

## 0. 读法

- **落点**：iOS 走到的实际代码路径（共享层优先，平台层次之）。
- **证据**：`S` 静态检查 / `B` 实际构建 / `I` 模拟器 / `D` 真机 / `U` 未验证。本表全部为 `S`。
- **验收**：`U` = 未取得运行证据；只有真机跑过才算 `D`。

PRD 的 AT01–AT20 验收用例均未执行，故本表**没有任何一项**达到"通过"。

## 1. P0 需求覆盖

| 需求 | iOS 落点 | 证据 | 验收 | 备注 |
| --- | --- | --- | --- | --- |
| FR-01 启动与空状态 | `ui/src/iosMain/.../MainViewController.kt` → `sharedUiMain/.../ui/root/LegadoApp.kt` | S | U | 启动链：SwiftUI `AppDelegate` → `registerIosProviders()` → `MainViewController()` → `LegadoApp` |
| FR-02 iOS15 兼容 | `iosApp/project.yml`、`scripts/build-ios-native.sh` | S | U | 四处 `deploymentTarget=14.0`；依赖最低系统未核实，详见 [ios15-compatibility.md](ios15-compatibility.md) |
| FR-03 书架与书籍状态 | `ui/src/sharedUiMain/.../ui/bookshelf/` | S | U | 与 Android 共享 Compose 实现，无 iOS 专属分支 |
| FR-04 本地 TXT | `data/src/commonMain/.../model/`、`foundation/.../CharsetDetectorPlatform.kt` | S | U | 编码识别经 `detectCharsetName`；各编码样本未跑 |
| FR-05 本地 EPUB | `data`（epub4kmp 3.0.0 依赖） | S | U | 路径穿越/压缩炸弹防护未做专项静态核查 |
| FR-06 阅读器 | `ui/src/sharedUiMain/.../book/read/ReaderScreen.kt` | S | U | 翻页/排版设置与 Android 同源 |
| FR-07 阅读进度与书签 | `data/src/commonMain`（ReadRecord 模型） | S | U | 进度 flush 时机未实测 |
| FR-08 书源导入与管理 | `ui/src/sharedUiMain/.../book/source/` | S | U | JSON/URL/深链接三入口共享 |
| FR-09 搜索→详情→目录→正文 | `data/src/commonMain/.../model/analyzeRule/` | S | U | 规则引擎与 Android 同源；QuickJS 差异见 FR-10 |
| FR-10 QuickJS 与书源兼容 | `modules/quickjs`、`data/src/nativeMain/.../model/script/` | S | U | iOS 用 Native QuickJS，Android 用 Rhino；**引擎差异是兼容性风险点**，需真实书源实测 |
| FR-11 网络/Cookie/权限 | `data/src/commonMain/.../help/http/`、`iosApp/project.yml`（ATS） | S | U | `NSAllowsArbitraryLoads: true` 已开，未做分级策略 |
| FR-12 离线缓存 | `data/src/commonMain/.../model/CacheBookShared.kt`、`core/iosMain/.../service/IosCacheBookNotifications.kt` | S | U | iOS 无 Service，通知态由 `IosBackgroundTasks` 调度驱动 |
| FR-13 文件/分享/深链接 | `ui/src/iosMain/.../ui/IosShareInbox.kt`、`.../LegadoDeepLinkIos.kt`、`iosApp/ShareExtension/` | S | U | 分享扩展依赖 App Group entitlement，未签名 IPA 下不生效（有回退说明） |
| FR-14 通知与快捷入口 | `core/src/iosMain/.../help/notification/`、`IosPlatformServices.kt` `IosNotificationPublisher` | S | U | delegate 唯一所有者为 Kotlin 侧，冲突已解决（见能力矩阵第 8 节） |
| FR-15 生命周期与 TTS | `core/src/iosMain/.../service/IosBackgroundTasks.kt`、`ui/src/iosMain/.../model/IosReadBookPlatform.kt` | S | U | 后台为 BGProcessingTask best effort，不承诺持续 |
| FR-16 备份/恢复/升级 | `ui/src/iosMain/.../help/storage/NativeBackupRestoreHook.ios.kt` + `ui/src/nativeMain/.../NativeBackupRestoreHook.kt` | S | U | 备份格式与 Android 同源，跨端往返未测 |
| FR-17 iCloud | `core/src/iosMain/.../help/sync/IosICloud.kt`、`IosICloudBackupSync.kt`、`IosICloudProgressSync.kt` | S | U | 需付费账号 + entitlement + `IosICloud.enable()`；未签名包不可用，属 P2 |
| FR-18 错误诊断与隐私 | `core/src/iosMain/.../crash/IosCrashHandler.kt`、`.../log/IosConsoleLog.kt` | S | U | 诊断包脱敏未做专项核查 |
| FR-19 无障碍与语言 | `sharedUiMain` 共享语义；语言切换见能力矩阵第 3 节 | S | U | `languageSwitchSupported` 为已登记平台限制（iOS 无进程内语言热切换） |

## 2. 与 Android 的差异风险（按 PRD 风险清单）

| 风险 | 本轮静态发现 | 影响 |
| --- | --- | --- |
| R1 依赖实际不支持 iOS15 | 依赖最低系统**未核实**（需 macOS 读 `LC_BUILD_VERSION`） | 可能推翻 iOS15 目标，须先取证 |
| R2 上游已有修复 | 已核对 master 最近提交，未见与本次改动重复的补丁 | 低 |
| R3 无 Mac/无 iOS15 设备 | 全部结论仅 S 级 | 所有验收项为 U |
| R4 分享/iCloud 受签名限制 | `project.yml` 注释已说明未签名包取不到 entitlement | 分享面板链路在未签名包下不生效，有回退 |
| R5 书源变化掩盖回归 | 未建本地 fixture | 书源兼容性无法判定 |
| R6 安全策略破坏自建源 | 未改网络策略 | 低 |
| R7 迁移丢数据 | 未改数据库/序列化 | 低 |
| R8 多端共享改动回归 | 本轮唯一 Kotlin 改动在 `iosMain`（`discardPickedFile`），不触及共享层 | 低 |
| R9 GPL 与第三方资产 | 未改许可与资产 | 低 |

## 3. 本轮实际改动的需求归属

| 改动 | 归属需求 | 说明 |
| --- | --- | --- |
| `discardPickedFile` 实现 | FR-13（文件导入）/ FR-04（TXT 导入） | 止住"选文件导入"的临时副本泄漏 |
| IPA 结构校验 | FR-02 / PRD 10.4 | 校验最低系统、架构、内嵌 framework、版本一致 |
| build-info 产物 | PRD 10.4 | commit/工具链/最低系统/架构/签名状态 |
| 缓存 key 工具链维度 | PRD 10.2 | 防 macos-latest 换代后复用旧静态库 |
| 能力完整性守卫 | 跨需求（防退化） | 两个平台接口面的缺口不可静默扩大 |
| `publish` 开关 | PRD 10.3 | 可不触碰公开 Release 只出 artifact |

## 4. 结论

iOS 的 FR 落点在**代码层面齐全**（19 项 P0 均能找到 iOS 路径，且多数落在共享层），
但**没有一项取得运行证据**。下一步的唯一高价值动作是有 macOS 环境后补 B/I/D：

1. `stage=klib` 与 `stage=ipa` 各跑一次（B）；
2. 读产物 `MinimumOSVersion` 与依赖 `LC_BUILD_VERSION`，确认 iOS15 目标成立（B）；
3. 模拟器安装启动（I）；
4. iOS15 真机走 AT01/AT02/AT03（D）。

在这之前，任何"iOS 已支持某功能"的表述都只能写作：**代码落点齐全，未经真机验证**。
