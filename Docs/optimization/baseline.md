# M0 基线：源码与环境

> 证据等级：**S（静态检查）**。本文所有结论来自读取仓库文件，未执行任何构建、未在模拟器或真机运行。

## 1. 仓库关系

| 项 | 值 |
| --- | --- |
| 上游分支仓库 | `huajideshutiao/legado`（`gedoor/legado` 的 fork，非官方改名） |
| 本次工作仓库 | `WhyWhySeeYa/legado`（用户 fork，默认分支 `master`） |
| 许可证 | GPL-3.0 |
| 基线 commit | `52519722d2ae5877012219ec43d6c115062bfd4f` |
| 基线 commit 标题 | `fix(cache): 仅在文本书籍更新后自动缓存章节` |
| 工作分支 | `optimize/ios-completeness-m0` |

## 2. 工具链版本（读取 `gradle/libs.versions.toml` 与 wrapper 配置）

| 组件 | 版本 | 来源 |
| --- | --- | --- |
| Kotlin | 2.3.20 | `libs.versions.toml` `kotlin` |
| KSP | 2.3.11 | `ksp` |
| Compose Multiplatform | 1.11.1 | `cmp` / `composeMultiplatform-jvm` |
| AGP | 9.4.1 | `agp` |
| Gradle | 9.6.0 | `gradle/wrapper/gradle-wrapper.properties` |
| JDK | 21 | `.github/workflows/ios.yml` `Set up JDK 21` |
| Xcode / macOS runner | `macos-latest`（浮动） | `ios.yml` `runs-on` |

**注意**：Xcode 版本未在 CI 中固定，`macos-latest` 会随时间漂移；工具链版本只能靠 `Environment diagnostics` 步骤的运行日志事后确认，属 PRD 10.2 指出的"依赖 macos-latest 永远一致"风险。

## 3. 模块结构（`settings.gradle.kts`）

```
:app            Android 应用（原生层）
:benchmark      Android Baseline Profile
:modules:quickjs / quickjs-test / quickjs-android-native / quickjs-processor
:modules:js-api / rjpath / treeview
:foundation  <-  :data  <-  :core  <-  :ui     （单向依赖）
:desktop        桌面端
:modules:charset-native                      （iOS/鸿蒙目标启用时参与）
```

`:ui` 是 iOS 导出模块，产出 `shared` framework（`OTHER_LDFLAGS: -framework shared`）。

## 4. 源码集规模（按 `*.kt` 文件数统计）

| 源码集 | 文件数 | 说明 |
| --- | --- | --- |
| `ui/src/sharedUiMain` | 416 | Android/iOS 共享的 Compose UI（完整性主要来源） |
| `ui/src/commonMain` | 118 | 跨端公共接口与模型 |
| `ui/src/androidMain` | 36 | Android 平台适配 |
| `ui/src/iosMain` | 32 | iOS 平台适配 |
| `ui/src/jvmMain` | 28 | 桌面平台适配 |
| `ui/src/iosAndOhosUiMain` | 20 | iOS 与鸿蒙共用实现 |
| `ui/src/skikoUiMain` | 12 | Skiko 渲染共用（字体/动图/图片/文本操作菜单） |
| `ui/src/nativeMain` | 8 | Native 通用 |
| `ui/src/jvmAndAndroidMain` | 9 | 桌面与 Android 共用 |
| `core/src/iosMain` | 16 | iOS 通知/后台任务/iCloud/崩溃/日志 |
| `core/src/androidMain` | 5 | Android 对应实现 |
| `data/src/nativeMain` | 74 | Native 规则/脚本核心 |

关键结论：**iOS 的界面完整度来自 `sharedUiMain` 的 416 个共享 Compose 文件**，不是 SwiftUI 重写；`androidMain` 的 36 个文件几乎每一项在 `iosMain` / `iosAndOhosUiMain` / `skikoUiMain` 都有对应实现（详见能力矩阵文档）。

## 5. iOS 宿主工程（`iosApp/`）

| 文件 | 作用 |
| --- | --- |
| `iOSApp.swift` | SwiftUI `@main` 入口 + `AppDelegate`（`UIApplicationDelegateAdaptor`） |
| `ContentView.swift` | `UIViewControllerRepresentable` 包装 Kotlin `MainViewController()` |
| `project.yml` | XcodeGen 定义，`deploymentTarget.iOS = "14.0"` |
| `Info.plist` | 由 `project.yml` 重写（双写，改一处需同步另一处） |
| `ShareExtension/` | 分享扩展（依赖 App Group entitlement） |
| `iosApp.entitlements` | 主 App 签名能力 |

## 6. CI 现状（`.github/workflows/ios.yml`，基线 364 行 / 本轮改动后 539 行）

- 唯一 iOS 编译入口，手动 `workflow_dispatch`，`stage` 四档：`klib` / `link` / `ipa` / `simulator`。
- 各构建步骤 `continue-on-error: true`，由末尾 `Summarize result` 汇总判定成败（`FAILED=1` 时 `exit 1`）。
- 产物：`ios-ipa-unsigned`（IPA）、`ios-simulator`（zip）、`ios-build-logs`（日志）。
- `publish-multiplatform-test` job 调用 `_publish.yml` 发布到 `multiplatform-test` Release。

已识别的静态缺口（详见能力矩阵文档第 5 节）：

1. 无 build-info 产物：产物里没有 commit、工具链版本、最低系统、架构、签名状态的机器可读记录（PRD 10.4 要求）。
2. 无 IPA 结构校验：不检查 `MinimumOSVersion`、Mach-O 架构、内嵌 framework、版本号一致性（PRD 10.4 要求）。
3. 静态库缓存 key 缺工具链维度：`ios-native-${{ runner.os }}-${{ hashFiles(...) }}` 不含 Xcode/SDK/clang 版本（PRD 10.2 点名的核查项）。
4. `Set version` 步骤引用 `${{ inputs.version }}`，但 `workflow_dispatch.inputs` 未声明该参数，恒为空串后走时间生成（死代码，无害但易误读）。

## 7. 仓库规范

**本仓库没有 `AGENTS.md`、`CONTRIBUTING.md` 或根级 `.editorconfig`**（仅 `modules/web/.editorconfig` 一个子模块有自己的配置）。规范以既有代码与提交历史为准，可归纳为三条：

1. **提交信息**：`type(scope): 中文标题` + 中文正文要点列表。实测最近 20 条提交全部使用 `fix` / `feat` / `perf` / `test` 前缀，正文用「- 」列举具体行为变化与理由。
2. **注释风格**：中文、解释"为什么"而非"是什么"，涉及平台差异时写清对照关系（如"对照 app 端 IntentHelp.openTTSSetting"）、硬约束来源（如"Apple 硬要求：didFinishLaunching 返回前装好 delegate"）与历史教训（如"2026-08-15 教训"）。
3. **改动纪律**：小步、单一主题；`project.yml` 与 `Info.plist` 双写需同步；`deploymentTarget` 四处一致（见 `ios15-compatibility.md`）。

本轮改动遵循以上三条：提交信息用 `docs(ios):` / `feat(ios):` / `fix(ios):` / `test(ios):` 前缀 + 中文正文；新增注释说明平台依据；每个提交单一主题、可独立回滚。

## 8. 证据边界

- 本轮**没有**克隆完整 git 历史、**没有**执行 `./gradlew`、**没有**运行 `xcodebuild`、**没有**在设备上安装。
- 因此"原版能否编译/安装/阅读"这一 M0 门槛**尚未取得 B/I/D 证据**，仅有 S 级静态结论。
- 需要 macOS 环境补齐的最小取证集：`stage=klib` 一次、`stage=ipa` 一次、产物结构检查、真机安装。
