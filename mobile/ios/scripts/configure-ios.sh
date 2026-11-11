#!/usr/bin/env bash
# يُشغَّل على جهاز ماك السحابي بعد `npx cap add ios`: يجهّز مشروع الآيفون لأكلات جدتنا.
set -euo pipefail
cd "$(dirname "$0")/.."
APP=ios/App/App
PLIST=$APP/Info.plist
PBX=ios/App/App.xcodeproj/project.pbxproj

# الاسم تحت الأيقونة، ونصوص الأذونات بالعربي، والتشفير القياسي فقط، والإشعارات في الخلفية.
plutil -replace CFBundleDisplayName -string "جدتنا" "$PLIST"
plutil -replace CFBundleDevelopmentRegion -string "ar" "$PLIST"
plutil -replace NSLocationWhenInUseUsageDescription -string "نستخدم موقعك لعرض أطباق منطقتك ومعرفة هل توصل الأسرة المنتجة إليك، ولا نحفظه." "$PLIST"
plutil -replace NSPhotoLibraryUsageDescription -string "لاختيار صور منتجاتك أو صورة أسرتك ورفعها." "$PLIST"
plutil -replace NSCameraUsageDescription -string "لتصوير منتجاتك ورفع صورها." "$PLIST"
plutil -replace ITSAppUsesNonExemptEncryption -bool NO "$PLIST"
plutil -replace UIBackgroundModes -json '["remote-notification"]' "$PLIST"
plutil -replace WKAppBoundDomains -json '["jdatna.com"]' "$PLIST"
plutil -replace UISupportedInterfaceOrientations -json '["UIInterfaceOrientationPortrait"]' "$PLIST"
plutil -remove "UISupportedInterfaceOrientations~ipad" "$PLIST" 2>/dev/null || true

# الإشعارات الأصلية وروابط jdatna.com تفتح التطبيق مباشرة.
cat > $APP/App.entitlements <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>aps-environment</key><string>production</string>
  <key>com.apple.developer.associated-domains</key>
  <array>
    <string>applinks:jdatna.com</string>
    <string>webcredentials:jdatna.com</string>
  </array>
</dict>
</plist>
XML

# لهدف التطبيق فقط: ملف الصلاحيات، والآيفون وحده (بلا آيباد).
perl -0pi -e 's/(PRODUCT_BUNDLE_IDENTIFIER = com\.jdatna\.app;)/$1\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App\/App.entitlements;/g' "$PBX"
perl -0pi -e 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/g' "$PBX"
grep -q "CODE_SIGN_ENTITLEMENTS = App/App.entitlements" "$PBX" || { echo "تعذر ربط ملف الصلاحيات بالمشروع"; exit 1; }

# أيقونة التطبيق 1024×1024 بلا شفافية.
ICON=../../store/assets/apple-icon-1024.png
for f in $APP/Assets.xcassets/AppIcon.appiconset/*.png; do cp "$ICON" "$f"; done

# تسليم رمز الإشعارات من نظام آبل إلى إضافة Capacitor.
DELEGATE=$APP/AppDelegate.swift
if ! grep -q "capacitorDidRegisterForRemoteNotifications" "$DELEGATE"; then
  perl -0pi -e 's/(class AppDelegate: UIResponder, UIApplicationDelegate \{\n)/$1\n    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {\n        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)\n    }\n\n    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {\n        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)\n    }\n/' "$DELEGATE"
fi
grep -q "capacitorDidRegisterForRemoteNotifications" "$DELEGATE" || { echo "تعذر إضافة استقبال رمز الإشعارات"; exit 1; }
echo "تم تجهيز مشروع الآيفون."
