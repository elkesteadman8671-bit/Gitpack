#!/usr/bin/env python3
"""Deterministic personal patch for zfdang/Android-Touch-Helper (pinned upstream)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'upstream'

def edit(path, edits):
    p = ROOT / path
    content = p.read_text(encoding='utf-8')
    for old, new in edits:
        count = content.count(old)
        if count != 1:
            raise RuntimeError(f'{path}: expected one match but found {count}: {old[:100]!r}')
        content = content.replace(old, new)
    p.write_text(content, encoding='utf-8')

edit('app/build.gradle', [
    ('applicationId "com.zfdang.touchhelper"', 'applicationId "app.jingping.lite"'),
    ('versionCode 278', 'versionCode 279'),
    ('versionName appVersion', 'versionName "1.0.0-lite"'),
])

edit('app/src/main/java/com/zfdang/touchhelper/Settings.java', [
    ('mPreference.getBoolean(SKIP_AD_NOTIFICATION, true)', 'mPreference.getBoolean(SKIP_AD_NOTIFICATION, false)'),
    ('mPreference.getInt(SKIP_AD_DURATION, 4)', 'mPreference.getInt(SKIP_AD_DURATION, 5)'),
    ('mPreference.getString(KEY_WORDS_LIST, "[\\"跳过\\"]")',
     'mPreference.getString(KEY_WORDS_LIST, "[\\"跳过\\",\\"跳过广告\\",\\"Skip\\"]")'),
])

edit('app/src/main/java/com/zfdang/touchhelper/TouchHelperServiceImpl.java', [
    ('private static final String SelfPackageName = "开屏跳过";',
     'private static final String SelfPackageName = "净屏·轻跳";'),
    ('        setPackages.removeAll(setTemps);\n',
     '        setPackages.removeAll(setTemps);\n        // Block potentially sensitive foreground apps even if the user removes their whitelist entry.\n        setPackages.removeIf(TouchHelperServiceImpl::isSensitivePackage);\n'),
    ('    private void updatePackage() {',
     '''    private static boolean isSensitivePackage(String pkg) {
        if (pkg == null) return true;
        switch (pkg) {
            case "com.eg.android.AlipayGphone":
            case "com.tencent.mm":
            case "com.tencent.mobileqq":
            case "com.unionpay":
            case "com.chinamworld.main":
            case "com.icbc":
            case "com.android.settings":
            case "com.android.systemui":
                return true;
            default:
                return pkg.startsWith("com.android.permissioncontroller")
                        || pkg.startsWith("com.google.android.permissioncontroller");
        }
    }

    private void updatePackage() {''')
])

edit('app/src/main/java/com/zfdang/touchhelper/SkipAdRules.java', [
    ('        String cleanKeyword = stripInvisibleChars(keyword);\n',
     '        String cleanKeyword = stripInvisibleChars(keyword);\n        if (isSensitiveAction(cleanLabel)) return false;\n'),
    ('    static boolean containsIgnoreCase(String src, String what) {',
     '''    private static boolean isSensitiveAction(String text) {
        for (String blocked : new String[]{"支付", "付款", "转账", "验证码", "授权", "确认", "提交", "安装", "删除", "购买", "开通", "登录"}) {
            if (text.contains(blocked)) return true;
        }
        return false;
    }

    static boolean containsIgnoreCase(String src, String what) {''')
])

strings = ROOT / 'app/src/main/res/values/strings.xml'
s = strings.read_text(encoding='utf-8').replace('开屏跳过', '净屏·轻跳')
s = s.replace('开源不联网，绝对安全！', '开源、不联网，全部检测在本地完成。')
s = s.replace('已就绪，正在后台自动跳过开屏广告', '已就绪 · 本地运行 · 开屏自动跳过')
strings.write_text(s, encoding='utf-8')

edit('app/src/main/res/xml/touch_helper_preference.xml', [
    ('检测时长 (推荐值:4秒)', '检测时长 (推荐值:5秒)'),
    ('app:title="跳过广告时显示通知"', 'app:title="跳过时通知（默认关闭）"'),
    ('app:summary="设置不跳过广告的程序"', 'app:summary="建议保留支付与聊天类应用；敏感应用自动受保护"'),
])

test = ROOT / 'app/src/test/java/com/zfdang/touchhelper/JingPingRiskGuardTest.java'
test.parent.mkdir(parents=True, exist_ok=True)
test.write_text('''package com.zfdang.touchhelper;

import static org.junit.Assert.*;
import org.junit.Test;
import java.util.Arrays;

public final class JingPingRiskGuardTest {
    @Test public void ordinarySkipLabelMatches() {
        assertEquals("跳过", SkipAdRules.findKeyword("跳过 5s", null,
                Arrays.asList("跳过", "Skip"), "净屏·轻跳"));
    }
    @Test public void sensitiveActionDoesNotMatch() {
        assertNull(SkipAdRules.findKeyword("确认跳过付款", null,
                Arrays.asList("跳过"), "净屏·轻跳"));
        assertNull(SkipAdRules.findKeyword("跳过登录验证", null,
                Arrays.asList("跳过"), "净屏·轻跳"));
    }
}
''', encoding='utf-8')
print('Patched app config, default settings, risk guards, strings and unit tests')