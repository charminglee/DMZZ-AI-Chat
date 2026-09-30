/**
 * 主题同步端到端验证（临时脚本，验证后删除）：
 * 1. 以生产构建启动窗口，确认 preload 桥接与 nativeTheme 跟随
 * 2. 分别切到深色/浅色，各截一张含原生标题栏的窗口截图
 * 用法: npx electron electron/theme-test.cjs
 */
const { app, BrowserWindow, nativeTheme } = require("electron")
const { execSync } = require("node:child_process")
const { writeFileSync } = require("node:fs")
const path = require("node:path")
const { currentBackground, registerThemeSync } = require("./theme.cjs")

// 独立 userData，避免污染真实应用的存储目录
app.setPath("userData", path.join(app.getPath("temp"), "dmzz-theme-test"))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const root = path.join(__dirname, "..")
const shot = async (win, name) => {
  const ps1 = path.join(root, "build", `_capture-${name}.ps1`)
  const out = path.join(root, "build", `theme-${name}.png`)
  writeFileSync(ps1, `
param([string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
[Win32]::SetProcessDPIAware() | Out-Null
$proc = Get-Process -Name "electron" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Error "window not found"; exit 1 }
[Win32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 800
$r = New-Object Win32+RECT
[Win32]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "captured $($w)x$($h)"
`)
  try {
    const res = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}" -Out "${out}"`, { encoding: "utf8" })
    console.log(`[capture:${name}]`, res.trim())
  } catch (e) {
    console.log(`[capture:${name}] 失败:`, String(e.message).slice(0, 200))
  }
}

app.whenReady().then(async () => {
  registerThemeSync()
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: true,
    autoHideMenuBar: true,
    title: "DMZZ AI Chat",
    backgroundColor: currentBackground(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  await win.loadFile(path.join(root, "dist", "index.html"))
  await sleep(1500)

  const bridge = await win.webContents.executeJavaScript("typeof window.desktop")
  console.log("[1] preload 桥接:", bridge)
  console.log("[1] themeSource（渲染进程启动后应为 system）:", nativeTheme.themeSource)

  // 切深色
  await win.webContents.executeJavaScript("localStorage.setItem('dmzz-theme','dark')")
  await win.webContents.executeJavaScript("location.reload()")
  await sleep(2500)
  const darkState = {
    themeSource: nativeTheme.themeSource,
    bg: win.getBackgroundColor(),
    htmlDark: await win.webContents.executeJavaScript("document.documentElement.classList.contains('dark')"),
  }
  console.log("[2] 深色模式:", JSON.stringify(darkState))
  await shot(win, "dark")

  // 切浅色
  await win.webContents.executeJavaScript("localStorage.setItem('dmzz-theme','light')")
  await win.webContents.executeJavaScript("location.reload()")
  await sleep(2500)
  const lightState = {
    themeSource: nativeTheme.themeSource,
    bg: win.getBackgroundColor(),
    htmlDark: await win.webContents.executeJavaScript("document.documentElement.classList.contains('dark')"),
  }
  console.log("[3] 浅色模式:", JSON.stringify(lightState))
  await shot(win, "light")

  // 恢复默认：跟随系统
  await win.webContents.executeJavaScript("localStorage.setItem('dmzz-theme','system')")
  await sleep(300)
  console.log("[4] 已恢复为跟随系统")

  app.quit()
})
