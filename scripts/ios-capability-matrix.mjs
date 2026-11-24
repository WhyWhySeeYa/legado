#!/usr/bin/env node
/**
 * iOS 平台完整性守卫。
 *
 * 目的：让"iOS 相对 Android 少实现了哪些平台能力"成为可复跑、可进 CI 的机器判定，
 * 而不是靠人肉对比两份上千行的实现文件。iOS 完整性一旦在后续开发中静默退化
 * （新增 Android 能力但忘了 iOS），本脚本会直接报出来。
 *
 * 覆盖两个平台接口面：
 *   1. PlatformCapabilities —— 能力开关与入口（fun + 布尔 val）
 *   2. PlatformServices    —— 平台服务（文件/分享/窗口/媒体/通知/权限…），
 *      重点抓"接口带默认实现、Android 覆盖了、iOS 没覆盖"的静默降级
 *
 * 用法（仓库根执行）：
 *   node scripts/ios-capability-matrix.mjs            # 打印 Markdown 矩阵
 *   node scripts/ios-capability-matrix.mjs --check    # 只判定回归, 有意外缺口则退出码 1
 *   node scripts/ios-capability-matrix.mjs --out FILE # 写入文件
 *
 * 判定口径见各 KNOWN_* 白名单注释与 Docs/optimization/ios-android-capability-matrix.md。
 * 无第三方依赖, 只用 node 内置模块。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv.includes('--root')
  ? process.argv[process.argv.indexOf('--root') + 1]
  : process.cwd();

const PATHS = {
  capabilitiesCommon: 'ui/src/commonMain/kotlin/io/legado/app/ui/root/PlatformCapabilities.kt',
  capabilitiesAndroid: 'app/src/main/java/io/legado/app/ui/main/AndroidPlatformCapabilities.kt',
  capabilitiesIos: [
    'ui/src/iosMain/kotlin/io/legado/app/ui/IosPlatformCapabilities.kt',
    'ui/src/iosAndOhosUiMain/kotlin/io/legado/app/ui/NativePlatformCapabilities.kt',
    'ui/src/sharedUiMain/kotlin/io/legado/app/ui/root/SharedPlatformCapabilities.kt',
  ],
  servicesCommon: 'ui/src/commonMain/kotlin/io/legado/app/ui/root/PlatformServices.kt',
  servicesAndroid: 'app/src/main/java/io/legado/app/ui/main/AndroidPlatformServices.kt',
  servicesIos: [
    'ui/src/iosMain/kotlin/io/legado/app/ui/IosPlatformServices.kt',
  ],
};

/**
 * PlatformCapabilities：已判定为"平台固有限制、不应对齐"的缺口。
 * 新增条目必须同时给出理由，并在能力矩阵文档留档。
 */
const KNOWN_CAPABILITY_LIMITS = {
  // ---- fun 型能力 ----
  applyAppLanguage:
    'iOS 无进程内 locale 重载, AppleLanguages 方案需经系统语言设置, 自实现要改造 Compose Resources 字符串解析',
  applyMonetColorFromWallpaper:
    'iOS 无 Monet 动态取色框架',
  createHeapDump:
    'iOS 无 JVM 堆概念, NativePlatformCapabilities 已显式 createHeapDumpSupported=false 隐藏入口',
  openTtsSettings:
    'iOS 无独立 TTS 设置页, 系统语音在「设置→辅助功能→朗读内容」, 无法深链',
  setProcessTextEnabled:
    'iOS 无 PROCESS_TEXT 等价系统集成',
  // ---- val 型能力开关 ----
  wakeLockSupported:
    'Android 由前台 Service 持唤醒锁(WebService/AudioPlayService); iOS 无 Service 模型, 屏幕常亮已由 UIApplication.isIdleTimerDisabled 在阅读/音频路由内直接控制, 无需用户开关',
  audioEnergyGlowSupported:
    '辉光需要播放侧 PCM 能量拦截; Android 有 DSP offload 例外通道, iOS 播放器无等价的能量采样接口',
  cronetSupported:
    'iOS 网络栈为 URLSession/ktor-darwin, 不需要 Cronet',
  languageSwitchSupported:
    '同 applyAppLanguage, iOS 无进程内语言热切换',
  mediaButtonSupported:
    'iOS 无 MediaButtonReceiver 等价物; 锁屏/耳机控制需新增 MPRemoteCommandCenter 实现, 属新能力而非补齐既有实现',
  predictiveBackSupported:
    'Android 14+ 系统级跟手返回通道, iOS 无对应机制',
  processTextSupported:
    'iOS 无 PROCESS_TEXT 系统集成',
  heapDumpRecordSupported:
    'iOS 无 JVM 堆转储',
  monetColorExtractSupported:
    'iOS 无 Monet 取色框架',
};

/**
 * PlatformServices：接口带默认实现、Android 覆盖而 iOS 未覆盖的成员。
 * 这类成员不会编译报错，只会静默走默认值 —— 是最隐蔽的完整性退化面。
 */
const KNOWN_SERVICE_DEFAULTS = {
  writeImageToDir:
    '默认返回 false 是接口设计的一部分: 仅当 supportsDirWrite=true 的端才走该路径, iOS 的 supportsDirWrite 为默认 false, 该分支不可达',
  checkWrite:
    '默认视为可写: iOS 沙盒内写入无需预检, 备份前恒 true; 真正的写失败由写入侧如实返回',
  processWelcomeImage:
    '待办(S 级): 启动闪屏背景图在 iOS 未做"原图入库 + 按屏幕尺寸烘焙", 现走调用方回落原路径, 功能可用但不进备份且启动解码原图; 属性能与备份完整性问题, 非功能缺失',
  importBackgroundImage:
    '接口自带共享默认实现(用 ScreenInfoProviders + bakeCoverImageFile), iOS 不覆盖即可正常工作, 不需要平台实现',
  reapplyPageSystemBarAppearance:
    '默认空实现是给"无需重应用"的端用的: iOS 的状态栏外观经 NSNotificationCenter 桥到 SwiftUI 根视图即时生效(见 IosWindowController.setSystemBars), 不存在 Android 那种需要重应用窗口标志的时机; 调用点 BaseComposeActivity 也是 Android 专用类',
};

function readOrDie(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[ios-parity] 缺少文件: ${rel}`);
    console.error('[ios-parity] 请在仓库根执行, 或用 --root 指定根目录');
    process.exit(2);
  }
  return fs.readFileSync(abs, 'utf8');
}

/** 收集 override 的成员名 -> 首次出现的文件 */
function collectOverrides(files) {
  const set = new Map();
  for (const rel of files) {
    const txt = readOrDie(rel);
    const re = /override\s+(?:suspend\s+)?(?:val|var|fun)\s+([A-Za-z0-9_]+)/g;
    let m;
    while ((m = re.exec(txt)) !== null) {
      if (!set.has(m[1])) set.set(m[1], rel);
    }
  }
  return set;
}

/** PlatformCapabilities 的接口成员与平台差异项 */
function collectCapabilities() {
  const txt = readOrDie(PATHS.capabilitiesCommon);
  const members = new Set();
  const defaultUnsupported = new Set();
  const booleanFlags = new Set();
  for (const line of txt.split('\n')) {
    const m = line.match(/^ {4}(?:open |abstract |suspend |inline )*(?:fun|val|var) ([A-Za-z0-9_]+)/);
    if (m) members.add(m[1]);
    const u = line.match(/^ {4}(?:open |suspend )*fun ([A-Za-z0-9_]+)\([^)]*\)\s*=\s*unsupported\(/);
    if (u) defaultUnsupported.add(u[1]);
    // 布尔能力开关: 只收默认 false 的项 —— 默认 true 表示"各端都有该能力",
    // Android 的 override 往往是按系统版本降级(如 drawBlur 在 API31 以下无效),
    // iOS 用默认 true 不是缺口。
    const f = line.match(/^ {4}(?:open )?val ([A-Za-z0-9_]+): Boolean get\(\) = (true|false)/);
    if (f && f[2] === 'false') booleanFlags.add(f[1]);
  }
  return { members, defaultUnsupported, booleanFlags };
}

/**
 * PlatformServices 里"带默认实现"的接口成员。
 *
 * 只认接口体内的成员: 用简单的花括号深度跟踪, 顶格的 `interface X {` 进入, 顶格 `}` 退出,
 * 顺带跳过 `object PlatformServiceProviders` 这类实现块 —— 它们的方法不是接口契约。
 */
function collectServiceDefaults() {
  const txt = readOrDie(PATHS.servicesCommon);
  const lines = txt.split('\n');
  const defaults = new Map(); // name -> interface 名
  let depth = 0;
  let inInterface = false;
  let currentInterface = '';
  for (const line of lines) {
    const iface = line.match(/^interface ([A-Za-z0-9_]+)/);
    if (iface) {
      inInterface = true;
      currentInterface = iface[1];
      depth = 0;
    }
    if (inInterface) {
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
      // 接口体内的成员行: 4 空格缩进的 fun
      const mem = line.match(/^ {4}(?:suspend )?fun ([A-Za-z0-9_]+)\s*\(/);
      if (mem) {
        // 带默认实现 = 行内有 " = " 或该行以 "{" / "{}" 结尾(块体/空块体)
        const hasBody = /\)\s*(?::\s*[^=]+)?=\s*\S/.test(line) || /\{\s*\}?\s*$/.test(line);
        if (hasBody) defaults.set(mem[1], currentInterface);
      }
      if (depth <= 0 && /^\}/.test(line)) {
        inInterface = false;
        currentInterface = '';
      }
    }
  }
  return defaults;
}

const { members, defaultUnsupported, booleanFlags } = collectCapabilities();
const capAndroid = collectOverrides([PATHS.capabilitiesAndroid]);
const capIos = collectOverrides(PATHS.capabilitiesIos);

const capGapKeys = new Set([...defaultUnsupported, ...booleanFlags]);
const capGaps = [...capGapKeys]
  .filter(k => capAndroid.has(k) && !capIos.has(k))
  .sort();

const serviceDefaults = collectServiceDefaults();
const svcAndroid = collectOverrides([PATHS.servicesAndroid]);
const svcIos = collectOverrides(PATHS.servicesIos);

// 服务缺口 = 接口带默认实现 && Android 覆盖 && iOS 未覆盖
const svcGaps = [...serviceDefaults.keys()]
  .filter(k => svcAndroid.has(k) && !svcIos.has(k))
  .sort();

const unexpectedCap = capGaps.filter(k => !(k in KNOWN_CAPABILITY_LIMITS));
const knownCap = capGaps.filter(k => k in KNOWN_CAPABILITY_LIMITS);
const unexpectedSvc = svcGaps.filter(k => !(k in KNOWN_SERVICE_DEFAULTS));
const knownSvc = svcGaps.filter(k => k in KNOWN_SERVICE_DEFAULTS);

const coverage = capAndroid.size === 0
  ? 0
  : (capIos.size / capAndroid.size) * 100;

const lines = [];
const P = s => lines.push(s);

P('# iOS ↔ Android 平台完整性矩阵（自动生成）');
P('');
P(`> 由 \`scripts/ios-capability-matrix.mjs\` 生成于 ${new Date().toISOString()}。`);
P('> 证据等级 **S（静态检查）**：只比对源码符号，不执行构建，不代表运行期行为。');
P('');

P('## 一、PlatformCapabilities（能力开关与入口）');
P('');
P('| 指标 | 数值 |');
P('| --- | --- |');
P(`| 接口成员 | ${members.size} |`);
P(`| 默认 \`unsupported(...)\` 的 fun | ${defaultUnsupported.size} |`);
P(`| 默认 \`false\` 的布尔开关 | ${booleanFlags.size} |`);
P(`| Android override | ${capAndroid.size} |`);
P(`| iOS override（三段链路） | ${capIos.size} |`);
P(`| iOS/Android 覆盖率 | ${coverage.toFixed(1)}% |`);
P(`| 真实缺口 | ${capGaps.length} |`);
P('');
if (capGaps.length === 0) {
  P('无缺口。');
} else {
  P('| 能力 | 判定 |');
  P('| --- | --- |');
  for (const k of capGaps) {
    const reason = KNOWN_CAPABILITY_LIMITS[k];
    P(`| \`${k}\` | ${reason ? '平台固有限制：' + reason : '**未登记缺口（疑似回归）**'} |`);
  }
}
P('');

P('## 二、PlatformServices（平台服务默认实现覆盖）');
P('');
P(`| 指标 | 数值 |`);
P(`| --- | --- |`);
P(`| 接口中带默认实现的成员 | ${serviceDefaults.size} |`);
P(`| Android override | ${svcAndroid.size} |`);
P(`| iOS override | ${svcIos.size} |`);
P(`| 静默降级缺口 | ${svcGaps.length} |`);
P('');
if (svcGaps.length === 0) {
  P('无缺口。');
} else {
  P('| 成员 | 所属接口 | 判定 |');
  P('| --- | --- | --- |');
  for (const k of svcGaps) {
    const reason = KNOWN_SERVICE_DEFAULTS[k];
    P(`| \`${k}\` | \`${serviceDefaults.get(k)}\` | ${reason ? '已登记：' + reason : '**未登记缺口（疑似回归）**'} |`);
  }
}
P('');

if (unexpectedCap.length > 0 || unexpectedSvc.length > 0) {
  P('## ⚠️ 未登记的缺口');
  P('');
  for (const k of unexpectedCap) P(`- PlatformCapabilities: \`${k}\``);
  for (const k of unexpectedSvc) P(`- PlatformServices: \`${k}\`（默认实现未覆盖）`);
  P('');
}

const markdown = lines.join('\n') + '\n';

const checkMode = process.argv.includes('--check');
const outIdx = process.argv.indexOf('--out');

if (outIdx !== -1) {
  const outPath = process.argv[outIdx + 1];
  if (!outPath) { console.error('[ios-parity] --out 需要一个文件路径'); process.exit(2); }
  fs.writeFileSync(outPath, markdown);
  console.error(`[ios-parity] 已写入 ${outPath}`);
} else if (!checkMode) {
  process.stdout.write(markdown);
}

if (checkMode) {
  console.error(`[ios-parity] Capabilities: Android=${capAndroid.size} iOS=${capIos.size} 覆盖 ${coverage.toFixed(1)}%, 缺口 ${knownCap.length}`);
  console.error(`[ios-parity] Services: 默认实现成员 ${serviceDefaults.size}, 缺口 ${knownSvc.length}`);
  const bad = [...unexpectedCap, ...unexpectedSvc];
  if (bad.length > 0) {
    console.error(`[ios-parity] FAIL: 发现 ${bad.length} 项未登记缺口: ${bad.join(', ')}`);
    console.error('[ios-parity] 若确属平台固有限制, 请写入对应白名单并在能力矩阵文档留档。');
    process.exit(1);
  }
  console.error('[ios-parity] OK: 全部缺口均为已登记项。');
  process.exit(0);
}
