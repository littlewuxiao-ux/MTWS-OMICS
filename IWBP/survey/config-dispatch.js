/**
 * 签派人员问卷 — 题目配置
 * 修改本文件后刷新 form.html?survey=dispatch 即可
 */
window.SURVEY_CONFIG = {
  id: "dispatch",
  title: "签派人员问卷（模板）",
  description: "请在 config-dispatch.js 中修改标题、说明与题目。\n下方为示例题，可全部删除后自行添加。",
  sections: [
    {
      id: "demo",
      title: "示例（可删）",
      questions: [
        {
          id: "demo_likert",
          type: "likert",
          text: "示例：气象预警信息整体上能及时支持我的放行与空中决策。",
          required: true,
          scale: 5,
        },
        {
          id: "demo_multi",
          type: "multi",
          text: "示例：我最常需要气象补充的信息是？（可多选）",
          required: false,
          options: ["影响时间窗", "不确定性/概率", "影响范围（终端区/航路）", "更新节奏说明", "备降场与绕飞建议边界", "其他"],
        },
        {
          id: "demo_text",
          type: "text",
          text: "示例：最近一次因天气导致运行被动时，气象侧最缺的一类信息是什么？",
          required: false,
          rows: 5,
        },
      ],
    },
  ],
};
