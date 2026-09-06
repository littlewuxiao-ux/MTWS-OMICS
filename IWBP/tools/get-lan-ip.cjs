/** 输出第一个非回环、非 169.254 的 IPv4 地址 */
const os = require("os");

const ifaces = os.networkInterfaces();
for (const name of Object.keys(ifaces)) {
  for (const iface of ifaces[name] || []) {
    if (iface.family !== "IPv4" && iface.family !== 4) continue;
    if (iface.internal) continue;
    if (String(iface.address).startsWith("169.254.")) continue;
    console.log(iface.address);
    process.exit(0);
  }
}

process.exit(1);
