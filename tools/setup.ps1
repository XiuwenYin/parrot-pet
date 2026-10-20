# Windows 版：准备"真实形象"自动抠图需要的东西（只需一次，约 150MB）
#   1. 下载独立的 Python（官方"嵌入版"，放在桌宠自己的数据目录里，不影响电脑上别的 Python）
#   2. 装 onnxruntime、PyAV（自带 ffmpeg，用来抽帧）等依赖
#   3. 下载 MobileSAM 抠图模型和找鸟用的分类模型
# 以 ">> " 开头的行会显示在桌宠气泡里。
# 用法：powershell -ExecutionPolicy Bypass -File setup.ps1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'          # 不关的话 Invoke-WebRequest 慢几十倍
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Support = if ($env:PARROT_SUPPORT) { $env:PARROT_SUPPORT } else { Join-Path $env:APPDATA 'parrot-pet' }
$PyDir = Join-Path $Support 'python'
$Python = Join-Path $PyDir 'python.exe'
$Models = Join-Path $Support 'models'
New-Item -ItemType Directory -Force -Path $Support, $Models | Out-Null

function Get-File([string[]]$Urls, [string]$Out) {
  foreach ($u in $Urls) {
    try {
      Invoke-WebRequest -Uri $u -OutFile "$Out.part" -UseBasicParsing -TimeoutSec 900
      Move-Item -Force "$Out.part" $Out
      return
    } catch {
      Write-Output "下载失败，换个地址：$u"
    }
  }
  throw "下载失败：$(Split-Path -Leaf $Out)"
}

Write-Output '>> 下载 Python（约 10MB）…'
if (-not (Test-Path $Python)) {
  $ver = '3.12.10'
  $zip = Join-Path $Support 'python-embed.zip'
  Get-File @(
    "https://registry.npmmirror.com/-/binary/python/$ver/python-$ver-embed-amd64.zip",
    "https://www.python.org/ftp/python/$ver/python-$ver-embed-amd64.zip"
  ) $zip
  Expand-Archive -Force -Path $zip -DestinationPath $PyDir
  Remove-Item $zip
  # 嵌入版默认不加载 site-packages，打开它 pip 装的包才能用
  $pth = Get-ChildItem -Path $PyDir -Filter 'python*._pth' | Select-Object -First 1
  (Get-Content $pth.FullName) -replace '^#\s*import site', 'import site' | Set-Content -Encoding ASCII $pth.FullName
}

Write-Output '>> 准备 Python 环境…'
# 不用 2>$null：Windows PowerShell 5.1 在 Stop 模式下重定向原生命令的 stderr 会直接报错退出
& $Python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('pip') else 1)"
if ($LASTEXITCODE -ne 0) {
  $gp = Join-Path $Support 'get-pip.py'
  Get-File @('https://bootstrap.pypa.io/get-pip.py', 'https://mirrors.aliyun.com/pypi/get-pip.py') $gp
  & $Python $gp --no-warn-script-location -q -i https://pypi.tuna.tsinghua.edu.cn/simple
  if ($LASTEXITCODE -ne 0) { & $Python $gp --no-warn-script-location -q }
  if ($LASTEXITCODE -ne 0) { throw 'pip 安装失败' }
  Remove-Item $gp
}
$pkgs = @('onnxruntime', 'numpy', 'pillow', 'scipy', 'av', 'pillow-heif')
$index = if ($env:PIP_INDEX) { $env:PIP_INDEX } else { 'https://pypi.tuna.tsinghua.edu.cn/simple' }
& $Python -m pip install -q --no-warn-script-location -i $index @pkgs
if ($LASTEXITCODE -ne 0) {
  Write-Output '>> 镜像不行，换官方源…'
  & $Python -m pip install -q --no-warn-script-location @pkgs
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败' }
}

Write-Output '>> 下载抠图模型（约 60MB）…'
foreach ($f in @('mobile_sam_image_encoder.onnx', 'sam_mask_decoder_single.onnx', 'sam_mask_decoder_multi.onnx')) {
  $out = Join-Path $Models $f
  if (-not (Test-Path $out) -or (Get-Item $out).Length -eq 0) {
    Get-File @("https://huggingface.co/Acly/MobileSAM/resolve/main/$f", "https://hf-mirror.com/Acly/MobileSAM/resolve/main/$f") $out
  }
}

Write-Output '>> 下载找鸟模型（约 40MB）…'
# MobileNetV3（ImageNet-21k 预训练，认得各种鹦鹉，也认得人、笼子）。注意要 fp16 版，int8 版输出是乱的
$repo = 'onnx-community/mobilenetv3_large_100.miil_in21k/resolve/main'
foreach ($pair in @(@('onnx/model_fp16.onnx', 'bird_classifier.onnx'), @('config.json', 'bird_classifier.json'))) {
  $out = Join-Path $Models $pair[1]
  if (-not (Test-Path $out) -or (Get-Item $out).Length -eq 0) {
    Get-File @("https://huggingface.co/$repo/$($pair[0])", "https://hf-mirror.com/$repo/$($pair[0])") $out
  }
}

& $Python -c "import onnxruntime, av, numpy, PIL, scipy"
if ($LASTEXITCODE -ne 0) { throw 'Python 依赖加载失败（可能缺少 VC++ 运行库）' }
Write-Output '>> 准备好了'
