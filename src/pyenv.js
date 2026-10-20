// 自动抠图用的 Python 环境在哪、怎么启动（Mac 和 Windows 不一样）。importer 和 videogen 共用。
//   Mac：<数据目录>/venv/bin/python（setup.sh 建的虚拟环境）
//   Windows：<数据目录>/python/python.exe（setup.ps1 下载的官方嵌入版 Python）
const path = require('path');
const fs = require('fs');
const os = require('os');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

function pyEnv(supportDir, toolsRoot) {
  const python = IS_WIN ? path.join(supportDir, 'python', 'python.exe') : path.join(supportDir, 'venv', 'bin', 'python');
  const models = path.join(supportDir, 'models');
  const birdcut = path.join(toolsRoot, 'tools', '.bin', 'birdcut');
  // macOS 14（Darwin 23）起才有系统"抠主体"，更早的系统和 Windows 用分类模型找鸟
  const visionOk = IS_MAC && Number(os.release().split('.')[0]) >= 23;
  return {
    python,
    // 依赖、模型都准备好了没有
    ready: () => fs.existsSync(python) && fs.existsSync(path.join(models, 'mobile_sam_image_encoder.onnx'))
      && (fs.existsSync(path.join(models, 'bird_classifier.onnx')) || (visionOk && fs.existsSync(birdcut))),
    // 子进程环境：告诉 Python 数据目录在哪；Windows 默认 GBK 输出，统一成 UTF-8
    env: { ...process.env, PARROT_SUPPORT: supportDir, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    // 一键准备环境的命令
    setupCmd: IS_WIN
      ? ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(toolsRoot, 'tools', 'setup.ps1')]]
      : ['/bin/zsh', [path.join(toolsRoot, 'tools', 'setup.sh')]],
    // 下载量大概多少（菜单上显示）
    setupSize: IS_WIN ? '约 150MB' : '约 60MB',
  };
}

module.exports = { pyEnv };
