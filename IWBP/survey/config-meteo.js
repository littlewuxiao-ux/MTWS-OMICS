/**
 * 气象人员问卷 — 题目配置
 * 修改本文件后刷新 form.html?survey=meteo 即可
 *
 * 题型 type：
 *   - likert：1~5 或 1~7 量表（scale: 5 默认，可选 7；labels 可选长度与 scale 一致）
 *   - single：单选（options 为字符串数组，或 { value, label }）
 *   - multi：多选
 *   - text：开放题
 *
 * 每题需唯一 id（英文/数字/下划线）
 */
window.SURVEY_CONFIG = {
  id: "meteo",
  title: "气象人员问卷（模板）",
  description: "请在 config-meteo.js 中修改标题、说明与题目。\n下方为示例题，可全部删除后自行添加。",
  sections: [
    {
      id: "demo",
      title: "示例（可删）",
      questions: [
        {
          id: "demo_likert",
          type: "likert",
          text: "示例：我认为当前预警触发标准清晰、可执行。",
          required: true,
          scale: 5,
          labels: ["非常不同意", "不同意", "一般", "同意", "非常同意"],
        },
        {
          id: "demo_single",
          type: "single",
          text: "示例：我最希望优先改进的环节是？",
          required: true,
          options: ["触发标准", "预警文案/模板", "发布与触达", "与签派协同节拍", "复盘闭环"],
        },
        {
          id: "demo_text",
          type: "text",
          text: "示例：请补充你认为当前预警机制最大的一个痛点（可匿名描述场景）。",
          required: false,
          rows: 5,
          placeholder: "时间、天气类型、现象即可，避免写真实航班号如需脱敏。",
        },
      ],
    },
  ],
};
