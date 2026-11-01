# The JavaScript bridge is called from the WebView; nothing here is reflected on.
-keepclassmembers class app.azan.global.AzanBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class app.azan.global.AzanBridge { *; }

# Keep data models used by the bridge and alarm scheduler
-keepclassmembers class app.azan.global.AlarmSpec { *; }
-keepclassmembers class app.azan.global.SchedulePayload { *; }
-keepclassmembers class app.azan.global.FireRecord { *; }
-keepclassmembers class app.azan.global.ArmResult { *; }
-keepclassmembers class app.azan.global.CustomSounds$ImportResult { *; }
