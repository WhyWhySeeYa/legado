# iOS 优化基线文档索引

本目录是 iOS 端优化工作的证据落点，对应 PRD 第 12 节建议的 `Docs/optimization/`。

| 文档 | 内容 |
| --- | --- |
| [baseline.md](baseline.md) | 实际 commit、工具链版本、模块与源码集结构、CI 现状、证据等级 |
| [ios-android-capability-matrix.md](ios-android-capability-matrix.md) | iOS 与 Android 的平台能力逐项对照、真实缺口与判定 |
| [ios15-compatibility.md](ios15-compatibility.md) | 最低系统配置、依赖兼容核查、待真机验证项 |

## 证据等级约定

沿用 PRD 9.3：**S** 静态检查 / **B** 实际构建 / **I** 模拟器集成 / **D** 真机 / **U** 未验证。

本轮审计在无 macOS、无 JDK/Gradle、无 iOS 设备的受限环境中完成，因此：

- 全部结论为 **S（静态检查）**，没有 B/I/D 级证据；
- 任何"可用/通过"的表述都不代表构建或真机验证通过；
- 标注 **U** 的条目必须在有 macOS 构建环境后重新取证。

## 本轮不改动的范围

按 PRD 第 3.2 节与第 6 节，本轮不涉及：Rust/Tauri/Theos 迁移、SwiftUI 整体重写、书源协议/备份格式/数据库结构变更、依赖大版本升级、默认遥测。
