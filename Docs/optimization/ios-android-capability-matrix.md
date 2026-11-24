# iOS 与 Android 平台能力对照矩阵

> 证据等级：**S（静态检查）**。数据由脚本对源码做符号级比对得出，未执行构建，未在设备验证。

## 1. 比对方法

以 `ui/src/commonMain/kotlin/io/legado/app/ui/root/PlatformCapabilities.kt` 的接口成员为全集，比对三个实现文件的 `override` 集合：

| 实现链路 | 文件 |
| --- | --- |
| Android | `app/src/main/java/io/legado/app/ui/main/AndroidPlatformCapabilities.kt` |
| iOS | `ui/src/iosMain/.../IosPlatformCapabilities.kt` + `ui/src/iosAndOhosUiMain/.../NativePlatformCapabilities.kt` + `ui/src/sharedUiMain/.../SharedPlatformCapabilities.kt` |

## 2. 总量结论

| 指标 | 数值 |
| --- | --- |
| `PlatformCapabilities` 接口成员（fun/val/var） | 137 |
| 其中带 `= unsupported(...)` 默认降级的成员 | 49 |
| Android 侧 override 数 | 107 |
| iOS 侧 override 数（三段链路合计） | 97 |

即：**iOS 平台能力层覆盖 Android 的约 91%（97/107），缺口 10 项，其中真正"Android 已实现而 iOS 仍走默认降级"的只有 5 项。**

## 3. 真实缺口（Android 已实现 / iOS 仍 unsupported）——共 5 项

| # | 能力 | Android 实现 | iOS 现状 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `applyAppLanguage` | `App.instance.restart()` 重启进程 | 未 override，走 `unsupported("切换语言")` | **平台机制不同**：iOS 无进程内 locale 重载，`AppleLanguages` UserDefaults 方案在 iOS 13+ 需经系统语言设置或 App Store 语言项，自实现需改造 Compose Resources 的字符串解析路径，属独立立项 |
| 2 | `applyMonetColorFromWallpaper` | Android 12+ Monet 取色 | 未 override | **平台不存在**：iOS 无 Monet 动态取色框架；自实现需读取壁纸并提取主色，涉及相册权限与主题体系改造 |
| 3 | `createHeapDump` | `Debug.dumpHprofData` | 未 override | **平台不存在**：iOS 无 JVM 堆概念；`NativePlatformCapabilities` 已显式声明 `createHeapDumpSupported = false` 隐藏入口 |
| 4 | `openTtsSettings` | `IntentHelp.openTTSSetting()` 跳系统 TTS 设置页 | 未 override | **平台不存在**：iOS 无独立 TTS 设置页；系统语音在「设置 → 辅助功能 → 朗读内容」，无法深链。App 内 TTS 引擎已由 `showHttpTtsEditDialog` 覆盖 |
| 5 | `setProcessTextEnabled` | Android `PROCESS_TEXT` 组件启停 | 未 override | **平台不存在**：iOS 无 `PROCESS_TEXT` 等价系统集成 |

**结论：5 项缺口全部为平台固有限制，不存在"照抄 Android 即可补齐"的遗漏项。**

## 4. iOS 独有实现（Android 侧走默认或另有实现）——共 12 项

`addBookSource`、`showBookSourceVariableDialog`、`showBookshelfLayoutDialog`、`showBottomNavConfigDialog`、`showCrashLogs`、`showDefaultCoverGallery`、`showDirectLinkUploadConfigDialog`、`showThemeListDialog`、`startCheckBookSource`、`toggleCustomExport`、`toggleExportUseReplace`、`toggleExportWebDav`

这些在 iOS 侧有具体实现（多数下沉到 `sharedUiMain` 的 `SharedPlatformCapabilities`），说明两端实现路径已经分叉到"各自最合适"的形态，而非简单镜像。

## 5. 平台适配文件对照（`ui/src/androidMain` 36 项 ↔ iOS 侧）

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

## 6. 平台固有差异（不可对齐，非缺陷）

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

## 7. 已修复的上游线索（PRD FR-14 通知 delegate）

`iosApp/README.md` 曾记录"Swift 与 Kotlin 侧通知 delegate 覆盖冲突，待拍板"。**代码现状已解决**：

- `iosApp/iOSApp.swift:249` 明确注释"本类**不**实现 `UNUserNotificationCenterDelegate`"；
- 宿主在 `didFinishLaunching` 内调用 `IosPlatformServicesKt.installIosNotificationDelegate()`，把 Kotlin 的 delegate 提前装上；
- `ui/src/iosMain/.../MainViewController.kt:87` 的 `IosNotificationPublisher.installDelegate()` 为同槽位保底赋值，注释标注"无副作用"。

即 delegate 唯一所有者为 Kotlin 侧。**遗留问题只是 `iosApp/README.md` 的说明文字过时**，本轮已同步修正。

## 8. 后续可推进项（非本轮范围，按 PRD 优先级）

| 项 | 优先级 | 说明 |
| --- | --- | --- |
| iPad 分栏/多窗口适配 | P1（PRD FR-06 P1） | 当前 `isTablet` 已实现，布局策略未专项验证 |
| 媒体按键/锁屏控制 | P1（PRD FR-15） | iOS 需 `MPRemoteCommandCenter`，属新增能力而非补齐 |
| 应用内语言切换 | P2 | 需改造 Compose Resources 字符串解析 |
| 大章节/图片性能专项 | P1（PRD 8.3） | 需真机基线与测量数据，当前无 B/D 级证据 |
