# iOS 与 Android 平台能力对照矩阵

> 证据等级：**S（静态检查）**。数据由脚本对源码做符号级比对得出，未执行构建，未在设备验证。

## 0. 复跑方式

本文数字可用脚本随时复核，不要手工维护：

```bash
node scripts/ios-capability-matrix.mjs            # 打印 Markdown 矩阵
node scripts/ios-capability-matrix.mjs --check    # 回归判定, 有未登记缺口则退出码 1
node scripts/ios-capability-matrix.test.mjs       # 守卫脚本自测(自带断言, 退出码 0/1)
```

两个 `--check` 与自测都已接入 `.github/workflows/ios.yml`，位于构建最前
（`Check iOS capability parity` / `Test parity guard`）；iOS 相对 Android 的完整性缺口一旦扩大，
构建会在烧 macOS runner 之前直接失败。

自测不用 `node --test`：iOS 沙盒的 node 不支持该选项，而本仓库的 iOS 维护场景要在手机上也能跑一次，
所以脚本自带极简断言。

脚本覆盖**两个平台接口面**：

- `PlatformCapabilities`（能力开关与入口）→ 白名单 `KNOWN_CAPABILITY_LIMITS`，对应本文第 3 节；
- `PlatformServices`（文件/分享/窗口/媒体/通知/权限等服务）→ 白名单 `KNOWN_SERVICE_DEFAULTS`，对应本文第 4 节。

两份白名单里的每一项都必须在本文有对应的判定理由，否则 `--check` 失败。

## 1. 比对方法

脚本按两个接口面分别做符号级比对。

**接口面一：`PlatformCapabilities`**（第 3 节）

以 `ui/src/commonMain/kotlin/io/legado/app/ui/root/PlatformCapabilities.kt` 的接口成员为全集，比对三个实现文件的 `override` 集合：

| 实现链路 | 文件 |
| --- | --- |
| Android | `app/src/main/java/io/legado/app/ui/main/AndroidPlatformCapabilities.kt` |
| iOS | `ui/src/iosMain/.../IosPlatformCapabilities.kt` + `ui/src/iosAndOhosUiMain/.../NativePlatformCapabilities.kt` + `ui/src/sharedUiMain/.../SharedPlatformCapabilities.kt` |

**接口面二：`PlatformServices`**（第 4 节）

以 `ui/src/commonMain/kotlin/io/legado/app/ui/root/PlatformServices.kt` 里**带默认实现**的接口成员为全集（不带默认实现的成员两端必须实现，否则编译失败，不可能缺失），比对：

| 实现链路 | 文件 |
| --- | --- |
| Android | `app/src/main/java/io/legado/app/ui/main/AndroidPlatformServices.kt` |
| iOS | `ui/src/iosMain/kotlin/io/legado/app/ui/IosPlatformServices.kt` |

## 2. 总量结论

| 指标 | 数值 |
| --- | --- |
| `PlatformCapabilities` 接口成员（fun/val/var） | 137 |
| 其中带 `= unsupported(...)` 默认降级的 fun | 49 |
| 其中默认 `false` 的布尔能力开关 | 13 |
| Android 侧 override 数 | 107 |
| iOS 侧 override 数（三段链路合计） | 97 |
| iOS / Android override 覆盖率 | 90.7% |
| 真实缺口（Android 有 / iOS 无） | 14 |

判定口径：

- **fun 型**：`commonMain` 里默认 `= unsupported(...)` 的成员，Android 覆盖而 iOS 未覆盖 → 缺口。
- **val 型**：`commonMain` 里默认 `get() = false` 的布尔开关（"默认不具备"），Android 覆盖而 iOS 未覆盖 → 缺口。
  默认 `true` 的项不计入：Android 的 override 多为按系统版本降级（如 `drawBlurSupported` 在 API 31 以下无效），iOS 用默认 `true` 属于"有该能力"，不是缺口。

## 3. 真实缺口——共 14 项，全部为平台固有限制

### 3.1 fun 型能力（5 项）

| # | 能力 | Android 实现 | iOS 现状 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `applyAppLanguage` | `App.instance.restart()` 重启进程 | 未 override，走 `unsupported("切换语言")` | **平台机制不同**：iOS 无进程内 locale 重载，`AppleLanguages` UserDefaults 方案在 iOS 13+ 需经系统语言设置或 App Store 语言项，自实现需改造 Compose Resources 的字符串解析路径 |
| 2 | `applyMonetColorFromWallpaper` | Android 12+ Monet 取色 | 未 override | **平台不存在**：iOS 无 Monet 动态取色框架 |
| 3 | `createHeapDump` | `Debug.dumpHprofData` | 未 override | **平台不存在**：iOS 无 JVM 堆概念；`NativePlatformCapabilities` 已显式声明 `createHeapDumpSupported = false` 隐藏入口 |
| 4 | `openTtsSettings` | `IntentHelp.openTTSSetting()` 跳系统 TTS 设置页 | 未 override | **平台不存在**：iOS 无独立 TTS 设置页；系统语音在「设置 → 辅助功能 → 朗读内容」，无法深链。App 内 TTS 引擎已由 `showHttpTtsEditDialog` 覆盖 |
| 5 | `setProcessTextEnabled` | Android `PROCESS_TEXT` 组件启停 | 未 override | **平台不存在**：iOS 无 `PROCESS_TEXT` 等价系统集成 |

### 3.2 val 型能力开关（9 项）

| # | 开关 | Android 依据 | iOS 现状 | 判定 |
| --- | --- | --- | --- | --- |
| 6 | `wakeLockSupported` | 前台 Service（WebService / AudioPlayService）真持唤醒锁 | 未 override | **语义不同**：iOS 无 Service 模型；屏幕常亮已由 `UIApplication.isIdleTimerDisabled` 在阅读/音频路由内直接控制（`IosPlatformServices.kt` `IosWindowController.setKeepScreenOn`），不需要用户开关 |
| 7 | `audioEnergyGlowSupported` | 播放侧 PCM 能量拦截（DSP offload 例外通道） | 未 override | **无等价接口**：iOS 播放器无对应的能量采样通道 |
| 8 | `cronetSupported` | 注册了 CronetProvider | 未 override | **不需要**：iOS 网络栈为 URLSession / ktor-darwin |
| 9 | `languageSwitchSupported` | `AppContextWrapper.wrap` + 重启 | 未 override | **平台机制不同**，同 `applyAppLanguage` |
| 10 | `mediaButtonSupported` | `MediaButtonReceiver` 读媒体按键 pref | 未 override | **属新能力**：iOS 锁屏/耳机控制需新增 `MPRemoteCommandCenter` 实现，不是补齐既有实现 |
| 11 | `predictiveBackSupported` | Android 14+ 系统级跟手返回通道 | 未 override | **平台专属** |
| 12 | `processTextSupported` | `PROCESS_TEXT` 组件 | 未 override | **平台不存在** |
| 13 | `heapDumpRecordSupported` | `CrashHandler` 在 OOM 时 dump | 未 override | **平台不存在**：iOS 无 JVM 堆转储 |
| 14 | `monetColorExtractSupported` | Android 12+ 取色 | 未 override | **平台不存在**：iOS 无 Monet |

**结论：14 项缺口全部为平台固有限制或"属新能力"，不存在"照抄 Android 即可补齐"的遗漏项。**
其中唯一在技术上可另行立项的是 `mediaButtonSupported`（锁屏/耳机控制），但它是**新增功能**，需真机验证，不属于"补齐既有实现"。

## 4. PlatformServices 默认实现对照（静默降级面）

`ui/src/commonMain/.../PlatformServices.kt` 的子接口里有一批**带默认实现**的成员：不 override 不会编译报错，只会静默走默认值。这是比能力开关更隐蔽的完整性缺口面，脚本单列一节检出。

脚本检出 10 个默认实现成员，其中 Android 覆盖而 iOS 未覆盖的 5 项：

| 成员 | 所属接口 | 判定 |
| --- | --- | --- |
| `discardPickedFile` | `FilePickerService` | **原为真实缺陷，本轮已修复**（见 4.1） |
| `writeImageToDir` | `FilePickerService` | 接口设计如此：仅 `supportsDirWrite=true` 的端走该路径，iOS 的 `supportsDirWrite` 为默认 `false`，分支不可达 |
| `checkWrite` | `FilePickerService` | 默认视为可写：iOS 沙盒内写入无需预检，备份前恒 `true`；真正写失败由写入侧如实返回 |
| `importBackgroundImage` | `FilePickerService` | 接口自带共享默认实现（`ScreenInfoProviders` + `bakeCoverImageFile`），iOS 不覆盖即可正常工作 |
| `processWelcomeImage` | `FilePickerService` | **待办**：见 4.3 |

### 4.1 已修复：`discardPickedFile` 临时副本泄漏

**现象（S 级证据）**

- `IosFilePickerService.pickFiles` 用 `UIDocumentPickerModeImport`：系统把选中文件**复制**进沙盒临时目录后回传路径（`IosPlatformServices.kt` 注释原文）。
- `IosPlatformCapabilities.importPickedBookFiles` 的 `onRelease` 明确调用 `files.discardPickedFile(it.ref)`，注释写"无论成功/取消/失败都只清本次交付的临时副本"。
- 但 `IosFilePickerService` **从未 override `discardPickedFile`**，走接口默认 `= Unit`（no-op）。

**影响**：每次经"选文件导入"添加书籍，临时目录都留一份原文件副本；书籍动辄数 MB，占用随导入次数累积。协程取消路径（`pickDocuments` 的 `resume` 取消回调）已有清理，只有**正常完成**路径泄漏。

**修复**：在 `IosFilePickerService` 实现 `discardPickedFile`——只删本应用临时目录（`NSTemporaryDirectory()`）内的路径，含 `..` 的路径直接放弃，不做任何越界删除，符合接口"只允许删自己物化的临时文件"的约定。

**证据等级**：S（静态）。未编译、未真机验证；修复后 `--check` 不再报该项。

### 4.2 其余项判定依据

- `writeImageToDir` / `checkWrite` / `importBackgroundImage`：默认值即该端的正确语义，见上表。
- `reapplyPageSystemBarAppearance`：默认空实现是给"无需重应用"的端用的。iOS 状态栏外观经 `NSNotificationCenter` 桥到 SwiftUI 根视图**即时生效**（`IosWindowController.setSystemBars`），不存在 Android 那种需要重应用窗口标志的时机；唯一调用点 `BaseComposeActivity` 也是 Android 专用类。

### 4.3 待办：`processWelcomeImage`（启动闪屏背景图）

iOS 未实现"原图复制进图集目录 + 按本端启动界面尺寸烘焙"。现状是调用方回落原路径，**功能可用**，但有两个后果：

1. 启动图**不进备份 zip**（原图未入图集目录）；
2. 启动时直接解码原图，而非按屏幕尺寸烘焙的小图。

属性能与备份完整性问题，不是功能缺失。实现需要对齐 `importBackgroundImage` 的烘焙链路（`bakeCoverImageFile` + 启动界面尺寸），建议在有 macOS 构建环境、能实测启动耗时时再做，避免无测量依据的改动。

## 5. iOS 独有实现（Android 侧走默认或另有实现）——共 12 项

`addBookSource`、`showBookSourceVariableDialog`、`showBookshelfLayoutDialog`、`showBottomNavConfigDialog`、`showCrashLogs`、`showDefaultCoverGallery`、`showDirectLinkUploadConfigDialog`、`showThemeListDialog`、`startCheckBookSource`、`toggleCustomExport`、`toggleExportUseReplace`、`toggleExportWebDav`

这些在 iOS 侧有具体实现（多数下沉到 `sharedUiMain` 的 `SharedPlatformCapabilities`），说明两端实现路径已经分叉到"各自最合适"的形态，而非简单镜像。

## 6. 平台适配文件对照（`ui/src/androidMain` 36 项 ↔ iOS 侧）

| Android 文件 | iOS 对应 | 状态 |
| --- | --- | --- |
| `AnimatedImageFrames.android.kt` | `skikoUiMain/AnimatedImageFrames.skiko.kt` | 有 |
| `BodyImageStore.android.kt` | `iosMain/BodyImageStore.ios.kt` | 有 |
| `BookImageLoader.android.kt` | `iosMain/BookImageLoader.ios.kt` | 有 |
| `CoverReuseOwner.android.kt` | `iosMain/CoverReuseOwner.ios.kt` | 有 |
| `ImageBitmapIdentity.android.kt` | `iosMain/ImageBitmapIdentity.ios.kt` | 有 |
| `ImageBitmapLoader.android.kt` | `iosMain/ImageBitmapLoader.ios.kt` | 有 |
| `DefaultCoverBaker.android.kt` | `skikoUiMain/DefaultCoverBaker.skiko.kt` | 有 |
| `WallpaperBaker.android.kt` | `skikoUiMain` + `iosAndOhosUiMain/WallpaperBaker.native.kt` | 有 |
| `BookmarkCardBaker.android.kt` | `skikoUiMain/BookmarkCardBaker.skiko.kt` | 有 |
| `MangaPageSource.android.kt` | `iosMain/MangaPageSource.ios.kt` | 有 |
| `MangaCoilImage.kt` | `skikoUiMain/MangaAnimatedImage.kt` | 有（不同实现路径） |
| `AndroidMangaPrefTextEditor.kt` | 无 | **Android 扩展加载专用**，iOS 无扩展机制 |
| `AndroidReaderFont.android.kt` | `skikoUiMain/ReaderFontSource.kt` | 有 |
| `AndroidTextMeasurer.android.kt` | `iosMain/SkiaTextMeasurer.ios.kt` | 有 |
| `ReaderFontLoader.android.kt` | `iosAndOhosUiMain/ReaderFontLoader.native.kt` | 有 |
| `AndroidWebView.kt` | `iosMain/IosWebViewSlot.kt` | 有（WKWebView） |
| `FastScrollPlatform.android.kt` | `iosAndOhosUiMain/FastScrollPlatform.native.kt` | 有 |
| `HtmlAnnotatedString.kt` | `iosAndOhosUiMain/HtmlAnnotatedString.native.kt` | 有 |
| `AppShortcuts.android.kt` | `iosMain/AppShortcuts.ios.kt` | 有 |
| `CustomPageKeys.android.kt` | `iosMain/CustomPageKeys.ios.kt` | 有 |
| `DialogWindow.android.kt` | 无独立文件 | Android 窗口层专用（iOS 走 Compose 层对话框） |
| `ImeEditCommands.android.kt` | `skikoUiMain/ImeEditCommands.skiko.kt` | 有 |
| `ImeInsets.android.kt` | `iosAndOhosUiMain/ImeInsets.native.kt` + `iosMain/ImeInsets.ios.kt` | 有 |
| `MandatoryGestureInsets.android.kt` | `iosAndOhosUiMain/MandatoryGestureInsets.native.kt` | 有 |
| `PlatformBackHandler.android.kt` | `iosMain/PlatformBackHandler.ios.kt` | 有 |
| `PlatformDialogDim.android.kt` | `iosAndOhosUiMain/PlatformDialogDim.native.kt` | 有 |
| `PlatformDialogProperties.android.kt` | `iosAndOhosUiMain/PlatformDialogProperties.native.kt` | 有 |
| `PlatformSheetSystemBarIcons.android.kt` | `iosAndOhosUiMain/...native.kt` | 有 |
| `PlatformSheetWindowStyle.android.kt` | `iosAndOhosUiMain/...native.kt` | 有 |
| `PlatformTextStyleFactory.android.kt` | `iosAndOhosUiMain/...native.kt` | 有 |
| `ResourceProvider.android.kt` | `iosMain/ResourceProvider.ios.kt` | 有 |
| `StatusBarsPadding.android.kt` | `iosAndOhosUiMain/StatusBarsPadding.native.kt` | 有 |
| `AppTextToolbar.android.kt` | `skikoUiMain/AppTextToolbar.skiko.kt` | 有 |
| `StringRes.android.kt` | `nativeMain/StringRes.native.kt` | 有 |
| `ReaderTextActionMenu.android.kt` | `skikoUiMain/ReaderTextActionMenu.skiko.kt` | 有 |
| `PhotoOverlayDialog.android.kt` | `skikoUiMain/PhotoOverlayDialog.skiko.kt` | 有 |

**35/36 有对应实现，唯一无对应的是 Android 漫画扩展文本编辑器（依赖 iOS 不存在的 APK 扩展加载）。**

## 7. 平台固有差异（不可对齐，非缺陷）

以下差异源于操作系统模型，不属"iOS 未做"，PRD 也不应作为对齐目标：

| 差异 | Android | iOS |
| --- | --- | --- |
| 后台常驻服务 | `CacheBookService` / `AudioPlayService` 前台 Service | 无 Service 模型；由 `IosBackgroundTasks`（BGProcessingTask）与进程内编排替代，后台执行 best effort |
| 内置 Web 服务 | 可在后台常驻 | 仅前台存活，`IosPlatformCapabilities` 按能力门禁隐藏开关 |
| 文件目录授权 | SAF `ACTION_OPEN_DOCUMENT_TREE` | 沙盒 + 文档选择器；无 SAF 等价，`LocalDirAccess.ios.kt` 单独实现 |
| 应用包信息 | `PackageManager` | 无，版本号由 `MainViewController` 的 provider 提供 |
| 运行时权限 | 多类危险权限 | 仅通知/相册/相机/麦克风；沙盒内文件与网络视为已授予 |
| 通知进度条 | `setProgress` 横条 | 不支持，仅文本 `(progress/max)` |
| 构建类型感知 | `BuildConfig.DEBUG` | 无，`isDebug` 恒 false |
| webp 编码 | 支持 | 不支持（仅 png/jpg） |

## 8. 已修复的上游线索（PRD FR-14 通知 delegate）

`iosApp/README.md` 曾记录"Swift 与 Kotlin 侧通知 delegate 覆盖冲突，待拍板"。**代码现状已解决**：

- `iosApp/iOSApp.swift:249` 明确注释"本类**不**实现 `UNUserNotificationCenterDelegate`"；
- 宿主在 `didFinishLaunching` 内调用 `IosPlatformServicesKt.installIosNotificationDelegate()`，把 Kotlin 的 delegate 提前装上；
- `ui/src/iosMain/.../MainViewController.kt:87` 的 `IosNotificationPublisher.installDelegate()` 为同槽位保底赋值，注释标注"无副作用"。

即 delegate 唯一所有者为 Kotlin 侧。**遗留问题只是 `iosApp/README.md` 的说明文字过时**，本轮已同步修正。

## 9. 后续可推进项（非本轮范围，按 PRD 优先级）

| 项 | 优先级 | 说明 |
| --- | --- | --- |
| iPad 分栏/多窗口适配 | P1（PRD FR-06 P1） | 当前 `isTablet` 已实现，布局策略未专项验证 |
| 媒体按键/锁屏控制 | P1（PRD FR-15） | iOS 需 `MPRemoteCommandCenter`，属新增能力而非补齐 |
| 应用内语言切换 | P2 | 需改造 Compose Resources 字符串解析 |
| 大章节/图片性能专项 | P1（PRD 8.3） | 需真机基线与测量数据，当前无 B/D 级证据 |
