/** 是否已有 robot-outbox-send --watch 在跑（exit 0 = 是） */
const { spawnSync } = require("child_process");

const ps = spawnSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    "$n=@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*robot-outbox-send*' }); if($n.Count -gt 0){ exit 0 } exit 1",
  ],
  { stdio: "ignore", windowsHide: true, timeout: 8000 },
);

process.exit(typeof ps.status === "number" ? ps.status : 1);
