/**
 * 生成 data/weather-alert-thresholds-template.xlsx（多 Sheet 空表）
 * 依赖：npm 已安装 xlsx（项目根目录 node_modules/xlsx）
 */
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const outPath = path.join(__dirname, "..", "data", "weather-alert-thresholds-template.xlsx");

const wb = XLSX.utils.book_new();

function addSheet(name, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name);
}

addSheet("METAR-风(M-A)", [
  ["规则编号", "适用范围（ICAO 或 *）", "平均风阈值 (m/s)", "阵风阈值 (m/s)", "逻辑（仅平均风/仅阵风/平均或阵风）", "严重度"],
  ["", "全局默认", "", "", "", ""],
  ["", "机场覆盖：________", "", "", "", ""],
  ["", "机场覆盖：________", "", "", "", ""],
]);

addSheet("METAR-组合(M-B)", [
  ["规则编号", "阵风阈值 (m/s)", "主导能见度阈值 (m)", "现象匹配（TS/FG/FZRA/FZFG/其他）", "严重度"],
  ["", "", "", "", ""],
  ["", "", "", "", ""],
]);

addSheet("METAR-其他(M-C)", [
  ["规则编号", "要素", "阈值", "条件说明", "严重度"],
  ["", "RVR (m)", "", "≤ / ≥ ________", ""],
  ["", "云底高", "", "单位：ft / m", ""],
  ["", "气温/露点", "", "", ""],
]);

addSheet("TAF-风(T-A)", [
  ["规则编号", "适用范围", "平均风阈值 (m/s)", "阵风阈值 (m/s)", "逻辑（仅平均/仅阵风/平均或阵风）", "评估对象（整份最差/TEMPO/PROB）", "严重度"],
  ["", "全局默认", "", "", "", "", ""],
  ["", "机场：________", "", "", "", "", ""],
]);

addSheet("TAF-组合(T-B)", [
  ["规则编号", "阵风阈值 (m/s)", "能见度阈值 (m)", "现象（TS/FG/FZ…）", "评估对象（整份最差/仅短时段）", "严重度"],
  ["", "", "", "", "", ""],
  ["", "", "", "", "", ""],
]);

addSheet("TAF-其他(T-C)", [
  ["规则编号", "要素", "阈值", "条件说明", "评估对象", "严重度"],
  ["", "", "", "", "", ""],
  ["", "", "", "", "", ""],
]);

addSheet("使用说明", [
  ["气象告警阈值空表模板"],
  [""],
  ["单位：风 m/s；主导能见度 m；与运行规范一致。"],
  ["METAR：对当前观测；TAF：须先约定取整份最差或是否单独评估 TEMPO/PROB。"],
  ["国内/国际可用不同 profile 各填一套，或在适用范围列注明。"],
  ["现象码以公司解析字典与运规为准。"],
  [""],
  ["配套：docs/weather-alert-thresholds-template.md、data/weather-alert-thresholds-template.csv"],
]);

XLSX.writeFile(wb, outPath);
if (!fs.existsSync(outPath)) {
  process.exit(1);
}
console.log("Written:", outPath);
