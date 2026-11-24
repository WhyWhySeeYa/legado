/**
 * ios-capability-matrix 守卫脚本的自测。
 *
 * 跑法（仓库根）：node scripts/ios-capability-matrix.test.mjs
 *
 * 不用 node:test / node --test —— iOS 沙盒的 node 不支持该选项，而本仓库的 iOS
 * 维护场景恰恰要在手机上也能跑一次。这里自带极简断言，退出码 0/1 供 CI 判定。
 *
 * 只测解析与判定逻辑（纯内存 + 读本仓库真实源码），不测 CLI 退出码：
 * 子进程 spawn 在 iOS 沙盒不可用，CLI 行为由 CI 的独立步骤覆盖。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PATHS,
  KNOWN_CAPABILITY_LIMITS,
  KNOWN_SERVICE_DEFAULTS,
  readSource,
  collectOverrides,
  collectCapabilities,
  collectServiceDefaults,
  analyze,
  renderMarkdown,
} from './ios-capability-matrix.mjs';

// 本文件在 <repo>/scripts/ 下, 仓库根是上一级
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

function fail(msg) { throw new Error(msg); }
function ok(cond, msg) { if (!cond) fail(msg); }
function eq(actual, expected, msg) {
  if (actual !== expected) fail(`${msg}: 期望 ${expected}, 实际 ${actual}`);
}
function deepEqArray(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) fail(`${msg}: 期望 ${b}, 实际 ${a}`);
}
function match(str, re, msg) { if (!re.test(str)) fail(msg); }

test('源码路径齐全：两个接口面与两端实现都能读到', () => {
  const all = [
    PATHS.capabilitiesCommon,
    PATHS.capabilitiesAndroid,
    ...PATHS.capabilitiesIos,
    PATHS.servicesCommon,
    PATHS.servicesAndroid,
    ...PATHS.servicesIos,
  ];
  for (const rel of all) {
    const txt = readSource(ROOT, rel);
    ok(txt.length > 0, `${rel} 内容为空`);
  }
});

test('collectOverrides 能抓到 override 成员', () => {
  const cap = collectOverrides(ROOT, [PATHS.capabilitiesAndroid]);
  ok(cap.size > 50, `Android capabilities override 数应 >50, 实际 ${cap.size}`);
  ok(cap.has('audioFocusSupported'), '应包含 audioFocusSupported');

  const ios = collectOverrides(ROOT, PATHS.capabilitiesIos);
  ok(ios.size > 50, `iOS override 数应 >50, 实际 ${ios.size}`);
});

test('collectCapabilities 区分 unsupported fun 与默认 false 的布尔开关', () => {
  const { members, defaultUnsupported, booleanFlags } = collectCapabilities(ROOT);
  ok(members.size > 100, `接口成员应 >100, 实际 ${members.size}`);
  ok(defaultUnsupported.has('applyAppLanguage'), '应把 applyAppLanguage 认成默认 unsupported');
  ok(booleanFlags.has('wakeLockSupported'), '应把默认 false 的 wakeLockSupported 计入');
  // 默认 true 的能力不该被当成平台差异项
  ok(!booleanFlags.has('drawBlurSupported'), 'drawBlurSupported 默认 true, 不应计入缺口面');
  ok(!booleanFlags.has('supportsSystemBack'), 'supportsSystemBack 默认 true, 不应计入缺口面');
});

test('collectServiceDefaults 只收接口体内带默认实现的成员', () => {
  const defaults = collectServiceDefaults(ROOT);
  ok(defaults.size >= 5, `默认实现成员应 >=5, 实际 ${defaults.size}`);
  ok(defaults.has('discardPickedFile'), '应包含 = Unit 的 discardPickedFile');
  ok(defaults.has('checkWrite'), '应包含 = true 的 checkWrite');
  ok(defaults.has('saveImageBytes'), '应包含 = false 的 saveImageBytes');
  ok(defaults.has('importBackgroundImage'), '应包含块体默认实现 importBackgroundImage');
  ok(defaults.has('setPageSystemBarAppearance'), '应包含空块体 setPageSystemBarAppearance');
  // PlatformServiceProviders 是 object 不是接口，它的方法不该混进来
  ok(!defaults.has('register'), 'object 的方法不应被当成接口成员');
  ok(!defaults.has('getOrNull'), 'object 的方法不应被当成接口成员');
  eq(defaults.get('discardPickedFile'), 'FilePickerService', '所属接口归属');
});

test('白名单没有过期条目（源码里已能覆盖的项不应还挂在白名单）', () => {
  const r = analyze(ROOT);
  const staleCap = Object.keys(KNOWN_CAPABILITY_LIMITS).filter(k => !r.capGaps.includes(k));
  const staleSvc = Object.keys(KNOWN_SERVICE_DEFAULTS).filter(k => !r.svcGaps.includes(k));
  deepEqArray(staleCap, [], '能力白名单存在已失效条目');
  deepEqArray(staleSvc, [], '服务白名单存在已失效条目');
});

test('analyze 的判定自洽：缺口都来自平台差异面且两端不同', () => {
  const r = analyze(ROOT);
  for (const k of r.capGaps) {
    ok(r.defaultUnsupported.has(k) || r.booleanFlags.has(k), `${k} 不在平台差异面内`);
    ok(r.capAndroid.has(k), `${k} Android 未覆盖, 不该是缺口`);
    ok(!r.capIos.has(k), `${k} iOS 已覆盖, 不该是缺口`);
  }
  for (const k of r.svcGaps) {
    ok(r.serviceDefaults.has(k), `${k} 不是带默认实现的成员`);
    ok(r.svcAndroid.has(k), `${k} Android 未覆盖`);
    ok(!r.svcIos.has(k), `${k} iOS 已覆盖`);
  }
  // discardPickedFile 本轮已修, 不应再出现在服务缺口里
  ok(!r.svcGaps.includes('discardPickedFile'), 'discardPickedFile 已实现, 不应是缺口');
  const expected = (r.capIos.size / r.capAndroid.size) * 100;
  ok(Math.abs(r.coverage - expected) < 1e-9, '覆盖率计算口径不对');
});

test('当前仓库状态：所有缺口都已登记（守卫应通过）', () => {
  const r = analyze(ROOT);
  deepEqArray(r.unexpectedCap, [], `未登记的能力缺口: ${r.unexpectedCap.join(', ')}`);
  deepEqArray(r.unexpectedSvc, [], `未登记的服务缺口: ${r.unexpectedSvc.join(', ')}`);
});

test('renderMarkdown 输出两节与关键数字', () => {
  const md = renderMarkdown(analyze(ROOT));
  match(md, /# iOS ↔ Android 平台完整性矩阵/, '缺少标题');
  match(md, /## 一、PlatformCapabilities/, '缺少能力面小节');
  match(md, /## 二、PlatformServices/, '缺少服务面小节');
  match(md, /证据等级 \*\*S（静态检查）\*\*/, '缺少证据等级声明');
  match(md, /iOS\/Android 覆盖率/, '缺少覆盖率行');
  ok(!md.includes('未登记缺口'), '当前状态不应出现未登记缺口字样');
});

let failed = 0;
for (const c of cases) {
  try {
    c.fn();
    console.log(`ok   ${c.name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${c.name}`);
    console.log(`     ${e.message}`);
  }
}
console.log('');
if (failed > 0) {
  console.log(`${failed}/${cases.length} 个用例失败`);
  process.exit(1);
} else {
  console.log(`${cases.length}/${cases.length} 个用例通过`);
  process.exit(0);
}
