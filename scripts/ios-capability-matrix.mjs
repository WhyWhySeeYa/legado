#!/usr/bin/env node
/**
 * iOS 平台能力完整性守卫。
 *
 * 目的：让"iOS 相对 Android 少实现了哪些平台能力"成为可复跑、可进 CI 的机器判定，
 * 而不是靠人肉对比两份上千行的实现文件。iOS 完整性一旦在后续开发中静默退化
 * （新增 Android 能力但忘了 iOS），本脚本会直接报出来。
 *
 * 用法（仓库根执行）：
 *   node scripts/ios-capability-matrix.mjs            # 打印 Markdown 矩阵
 *   node scripts/ios-capability-matrix.mjs --check    # 只判定回归, 有意外缺口则退出码 1
 *   node scripts/ios-capability-matrix.mjs --out FILE # 写入文件
 *
 * 判定口径：
 *   - 全集 = commonMain PlatformCapabilities 的接口成员
 *   - "Android 已实现" = AndroidPlatformCapabilities 有 override
 *   - "iOS 已实现" = Ios + Native(iosAndOhos) + Shared 三段链路任一处有 override
 *   - 缺口 = Android 有 override 且 iOS 三段都没有 → 默认视为回归
 *   - 白名单 = 已判定为平台固有限制的项, 不算回归（新增白名单必须写理由）
 *
 * 无第三方依赖, 只用 node 内置模块。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv.includes('--root')
  ? process.argv[process.argv.indexOf('--root') + 1]
  : process.cwd();

const PATHS = {
  common: 'ui/src/commonMain/kotlin/io/legado/app/ui/root/PlatformCapabilities.kt',
  android: 'app/src/main/java/io/legado/app/ui/main/AndroidPlatformCapabilities.kt',
  ios: [
    'ui/src/iosMain/kotlin/io/legado/app/ui/IosPlatformCapabilities.kt',
    'ui/src/iosAndOhosUiMain/kotlin/io/legado/app/ui/NativePlatformCapabilities.kt',
    'ui/src/sharedUiMain/kotlin/io/legado/app/ui/root/SharedPlatformCapabilities.kt',
  ],
};

/**
 * 已判定为"平台固有限制、不应对齐"的缺口。
 * 新增条目必须同时给出理由，并在 Docs/optimization/ios-android-capability-matrix.md 留档。
 */
const KNOWN_PLATFORM_LIMITS = {
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

function readOrDie(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[ios-matrix] 缺少文件: ${rel}`);
    console.error(`[ios-matrix] 请在仓库根执行, 或用 --root 指定根目录`);
    process.exit(2);
  }
  return fs.readFileSync(abs, 'utf8');
}

/** 收集 override 的成员名 */
function collectOverrides(files) {
  const set = new Map(); // name -> 首个出现文件
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

/** 收集 commonMain 接口成员与默认 unsupported 成员 */
function collectCommon() {
  const txt = readOrDie(PATHS.common);
  const members = new Set();
  const defaultUnsupported = new Set();
  const booleanFlags = new Set();
  for (const line of txt.split('\n')) {
    const m = line.match(/^ {4}(?:open |abstract |suspend |inline )*(?:fun|val|var) ([A-Za-z0-9_]+)/);
    if (m) members.add(m[1]);
    const u = line.match(/^ {4}(?:open |suspend )*fun ([A-Za-z0-9_]+)\([^)]*\)\s*=\s*unsupported\(/);
    if (u) defaultUnsupported.add(u[1]);
    // 布尔能力开关: 平台差异集中在这里, 必须与 fun 型能力同等对待。
    // 只收默认 false 的项 —— 默认 true 表示"各端都有该能力", Android 的 override 往往是
    // 按系统版本降级(如 drawBlur 在 API31 以下无效), iOS 用默认 true 不是缺口。
    const f = line.match(/^ {4}(?:open )?val ([A-Za-z0-9_]+): Boolean get\(\) = (true|false)/);
    if (f && f[2] === 'false') booleanFlags.add(f[1]);
  }
  return { members, defaultUnsupported, booleanFlags };
}

const { members, defaultUnsupported, booleanFlags } = collectCommon();
const androidSet = collectOverrides([PATHS.android]);
const iosSet = collectOverrides(PATHS.ios);

// 缺口 = 平台差异项中, Android 覆盖了而 iOS 三段链路都没有的
const gapKeys = new Set([...defaultUnsupported, ...booleanFlags]);
const gaps = [...gapKeys]
  .filter(k => androidSet.has(k) && !iosSet.has(k))
  .sort();

const unexpected = gaps.filter(k => !(k in KNOWN_PLATFORM_LIMITS));
const known = gaps.filter(k => k in KNOWN_PLATFORM_LIMITS);

const coverage = androidSet.size === 0
  ? 0
  : (iosSet.size / androidSet.size) * 100;

const lines = [];
const P = s => lines.push(s);

P('# iOS ↔ Android 平台能力矩阵（自动生成）');
P('');
P(`> 由 \`scripts/ios-capability-matrix.mjs\` 生成于 ${new Date().toISOString()}。`);
P('> 证据等级 **S（静态检查）**：只比对源码符号，不执行构建，不代表运行期行为。');
P('');
P('## 总量');
P('');
P('| 指标 | 数值 |');
P('| --- | --- |');
P(`| \`PlatformCapabilities\` 接口成员 | ${members.size} |`);
P(`| 默认 \`unsupported(...)\` 成员 | ${defaultUnsupported.size} |`);
P(`| Android override 数 | ${androidSet.size} |`);
P(`| iOS override 数（三段链路） | ${iosSet.size} |`);
P(`| iOS/Android 覆盖率 | ${coverage.toFixed(1)}% |`);
P(`| 真实缺口（Android 有 / iOS 无） | ${gaps.length} |`);
P('');

P('## 真实缺口');
P('');
if (gaps.length === 0) {
  P('无。');
} else {
  P('| 能力 | 判定 |');
  P('| --- | --- |');
  for (const k of gaps) {
    const reason = KNOWN_PLATFORM_LIMITS[k];
    P(`| \`${k}\` | ${reason ? '平台固有限制：' + reason : '**未登记缺口（疑似回归）**'} |`);
  }
}
P('');

if (unexpected.length > 0) {
  P('## ⚠️ 未登记的缺口');
  P('');
  P('以下能力 Android 已实现、iOS 尚未实现，且未在 `KNOWN_PLATFORM_LIMITS` 登记理由：');
  P('');
  for (const k of unexpected) P(`- \`${k}\``);
  P('');
}

const markdown = lines.join('\n') + '\n';

const checkMode = process.argv.includes('--check');
const outIdx = process.argv.indexOf('--out');

if (outIdx !== -1) {
  const outPath = process.argv[outIdx + 1];
  if (!outPath) { console.error('[ios-matrix] --out 需要一个文件路径'); process.exit(2); }
  fs.writeFileSync(outPath, markdown);
  console.error(`[ios-matrix] 已写入 ${outPath}`);
} else if (!checkMode) {
  process.stdout.write(markdown);
}

if (checkMode) {
  console.error(`[ios-matrix] Android override=${androidSet.size} iOS override=${iosSet.size} 覆盖 ${coverage.toFixed(1)}%`);
  if (unexpected.length > 0) {
    console.error(`[ios-matrix] FAIL: 发现 ${unexpected.length} 项未登记缺口: ${unexpected.join(', ')}`);
    console.error('[ios-matrix] 若确属平台固有限制, 请写入 KNOWN_PLATFORM_LIMITS 并在能力矩阵文档留档。');
    process.exit(1);
  }
  console.error(`[ios-matrix] OK: 缺口 ${known.length} 项均为已登记平台限制。`);
  process.exit(0);
}
