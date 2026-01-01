---
title: Android机型性能分级方案
date: 2025-12-11 11:13:50
published: true
tags:
---

在 Android 生态中，由于设备碎片化极其严重（成千上万种机型，涵盖高通、联发科、三星、紫光展锐等不同芯片），仅通过“机型白名单”是不现实的。

目前业界主流的方案通常采用 **“分级策略” (Tiering Strategy)**，结合 **静态检测**（硬件规格）和 **动态调整**（运行时监控）。

以下是具体的分级方案和实施步骤：

---

### 一、 核心分级策略（静态检测）

这一步通常在 App 启动时完成，计算出一个 `DeviceScore` 或者 `Level`，决定默认帧率（60/90/120）和画质。

#### 1. 利用官方 API: Performance Class (Android 12+)
Google 在 Android 12 引入了 `Performance Class` 标准。这是最官方、最准确的方法，但仅适用于较新的旗舰/次旗舰设备。

*   **原理**：厂商在出厂时写入设备的性能等级。
*   **代码**：
    ```java
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        int pc = Build.VERSION.MEDIA_PERFORMANCE_CLASS;
        if (pc >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13 级别的高性能设备 -> 开放 120 FPS + 高画质
        } else if (pc >= Build.VERSION_CODES.S) {
            // Android 12 级别 -> 开放 60/90 FPS
        }
    }
    ```

#### 2. Device Year Class 算法 (Facebook/Meta 方案)
这是业界最通用的“降级”方案。其核心思想不是判断“多强”，而是判断“相当于哪一年的旗舰机”。
例如：一台 2024 年的低端机，性能可能只相当于 2018 年的旗舰机（Year Class 2018）。

*   **判定维度**：
    *   **RAM 大小** (最强相关性)：>8GB, >6GB, >4GB, <3GB。
    *   **CPU 核心数**：是否为 8 核。
    *   **CPU 频率**：(Android 10+ 很难获取，权重降低)。
*   **开源库**：虽然 Facebook 的 `device-year-class` 库更新较慢，但你可以参考其逻辑自己封装。
*   **策略示例**：
    *   `Year >= 2022` && `RAM >= 8GB`: **极高 (Extreme)** -> 120 FPS
    *   `Year >= 2020` && `RAM >= 6GB`: **高 (High)** -> 60 FPS
    *   `Year >= 2017`: **中 (Medium)** -> 30/60 FPS (动态)
    *   `Year < 2017` || `RAM < 4GB`: **低 (Low)** -> 30 FPS + 关闭后处理

#### 3. GPU 型号嗅探 (针对游戏/重图形应用)
对于图形渲染应用，CPU 强不代表 GPU 强。读取 OpenGL/Vulkan 的 `GL_RENDERER` 字符串是最直接的。

*   **获取方式**：在 OpenGL 上下文初始化时获取 `glGetString(GL_RENDERER)`。
*   **解析逻辑**：
    *   **Adreno (高通)**: 解析数字。
        *   `Adreno 7xx` (如 740, 750): 顶级 -> 120 FPS
        *   `Adreno 660/650/642`: 高端 -> 60/90 FPS
        *   `Adreno 610/5xx`: 低端 -> 30 FPS
    *   **Mali (联发科/麒麟/Exynos)**: 命名规则较乱（G710, G78, G57），通常需要维护一个简单的映射表，或者看核心数（MPx）。

---

### 二、 动态调整策略（运行时监控）

静态分级只能猜测性能，无法应对 **发热降频** 或 **后台抢占** 的情况。必须结合动态降级。

#### 1. 监控热状态 (Thermal Status)
Android 10 (API 29) 引入了热状态监听。当设备过热时，强制降帧是保护体验的唯一办法（否则会卡顿掉帧）。

```java
PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
pm.addThermalStatusListener(new PowerManager.OnThermalStatusChangedListener() {
    @Override
    public void onThermalStatusChanged(int status) {
        switch (status) {
            case PowerManager.THERMAL_STATUS_NONE:
            case PowerManager.THERMAL_STATUS_LIGHT:
                // 恢复目标帧率 (e.g., 60/120)
                break;
            case PowerManager.THERMAL_STATUS_MODERATE:
                // 降级策略：锁定 60 FPS，降低分辨率
                break;
            case PowerManager.THERMAL_STATUS_SEVERE:
            case PowerManager.THERMAL_STATUS_CRITICAL:
                // 救命策略：锁定 30 FPS，关闭特效
                break;
        }
    }
});
```

#### 2. FrameMetrics / JankStats (帧耗时监控)
如果在设定为 60 FPS 的情况下，连续 N 帧的渲染耗时超过 16ms（比如都在 25ms 左右），说明 GPU/CPU 撑不住了。

*   **策略**：
    *   使用 Jetpack 的 `JankStats` 库。
    *   如果 **Jank Rate (卡顿率)** > 10% 持续 5 秒 -> 触发自动降级（Auto-Downgrade）。
    *   **Action**: 60 FPS -> 45 FPS 或 30 FPS。

---

### 三、 屏幕刷新率适配 (Display Modes)

Android 手机现在的屏幕刷新率五花八门（60, 90, 120, 144, LTPO 动态）。
仅仅在代码里 `setTargetFPS(60)` 是不够的，必须告诉系统你需要的高刷模式。

```java
// 在 Activity 或 Window 中设置
// Android 11+
Surface surface = ...;
surface.setFrameRate(120.f, Surface.FRAME_RATE_COMPATIBILITY_FIXED_SOURCE);

// 或者设置 LayoutParams
WindowManager.LayoutParams params = window.getAttributes();
params.preferredDisplayModeId = ...; // 遍历 Display.Mode 找到匹配 120Hz 的 ID
```

**注意**：对于低端机，即便屏幕支持 90Hz，如果 GPU 跑不动，强制切回 60Hz 模式反而更流畅，更省电。

---

### 四、 综合分级方案表 (推荐)

建议将机型分为 4 档：

| 档位 | 判定标准示例 (逻辑或) | 帧率策略 | 画质/LOD策略 |
| :--- | :--- | :--- | :--- |
| **Tier 1 (旗舰)** | Android 12+ Performance Class >= S <br> OR RAM >= 12GB <br> OR Adreno 7xx / Mali G710+ | **Target 120/90 FPS**<br>(允许动态切换) | LOD 0 (最高)<br>开启实时阴影<br>开启后处理 |
| **Tier 2 (高端)** | RAM >= 8GB <br> OR Adreno 640+ / Mali G77+ | **Target 60 FPS**<br>(很稳) | LOD 1<br>标准阴影 |
| **Tier 3 (中端)** | RAM >= 6GB <br> OR Adreno 610+ | **Target 30 FPS**<br>(可选 60 但可能不稳) | LOD 2<br>关闭复杂特效 |
| **Tier 4 (低端)** | RAM < 4GB <br> OR OpenGL ES 3.0 以下 | **Locked 30 FPS**<br>(强制) | LOD 3 (最低)<br>降低分辨率 (0.8x) |

### 五、 总结实施步骤

1.  **启动阶段**：
    *   优先读取 `PerformanceClass`。
    *   如果没有，读取 `TotalMem` (RAM) 和 `GL_RENDERER` (GPU)。
    *   根据上述表格定出 `Tier` 等级。
2.  **配置应用**：
    *   根据 Tier 设置 `TargetFPS`。
    *   根据 Tier 设置 `LOD Bias` 和渲染分辨率。
3.  **运行阶段**：
    *   监听 `ThermalStatus`，过热直接降 Tier。
    *   (可选) 统计丢帧率，严重卡顿自动降 Tier。
