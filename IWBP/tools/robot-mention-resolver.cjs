/**
 * 根据 data/robot-publish-config.json 解析发布存档条目的 @ 对象
 */
function entryIsTropicalCyclone(entry) {
  return entry?.type === "alert" && Array.isArray(entry.phenomena) && entry.phenomena.includes("热带气旋");
}

function uniqueRoleKeys(keys) {
  return [...new Set(keys.filter(Boolean))];
}

function resolveMentionRoleKeys(entry, config) {
  if (!entry || !config?.contentTypes) return [];
  const type = String(entry.type || "");
  const station = String(entry.station || "").trim().toUpperCase();
  const phenomena = Array.isArray(entry.phenomena) ? entry.phenomena : [];

  if (type === "period") {
    return uniqueRoleKeys(config.contentTypes.period?.mentionRoles || ["aoc-dispatch"]);
  }

  if (type === "brush") {
    return uniqueRoleKeys(config.contentTypes.brush?.mentionRoles || ["aoc-dispatch"]);
  }

  if (type === "alert" && entryIsTropicalCyclone(entry)) {
    return uniqueRoleKeys(config.contentTypes.tc?.mentionRoles || ["aoc-dispatch"]);
  }

  if (type === "alert") {
    const alertCfg = config.contentTypes.alert || {};
    const keys = [...(alertCfg.mentionRolesAlways || ["aoc-dispatch"])];

    const byPhen = alertCfg.mentionRolesByPhenomena || {};
    for (const [roleKey, phenList] of Object.entries(byPhen)) {
      if (phenList.some((p) => phenomena.includes(p))) keys.push(roleKey);
    }

    const byStation = alertCfg.mentionRolesByStation || {};
    if (station && byStation[station]) {
      keys.push(...byStation[station]);
    }

    for (const rule of alertCfg.mentionRolesByPhenomenaAndStation || []) {
      const ruleStation = String(rule.station || "").trim().toUpperCase();
      const rulePhen = Array.isArray(rule.phenomena) ? rule.phenomena : [];
      if (station === ruleStation && rulePhen.some((p) => phenomena.includes(p))) {
        keys.push(...(rule.roles || []));
      }
    }

    return uniqueRoleKeys(keys);
  }

  return [];
}

function resolveContentKind(entry) {
  if (!entry) return "other";
  if (entry.type === "period") return "period";
  if (entry.type === "brush") return "brush";
  if (entry.type === "alert" && entryIsTropicalCyclone(entry)) return "tc";
  if (entry.type === "alert") return "alert";
  return entry.type || "other";
}

function resolveMentions(entry, config) {
  const roleKeys = resolveMentionRoleKeys(entry, config);
  const roles = config?.roles || {};
  return roleKeys.map((key) => {
    const role = roles[key] || {};
    return {
      roleKey: key,
      label: role.label || key,
      nextUserId: role.nextUserId || "",
      nextUserIds: Array.isArray(role.nextUserIds) ? role.nextUserIds : [],
    };
  });
}

function collectAtUserIds(mentions) {
  const ids = [];
  for (const m of mentions || []) {
    const one = String(m.nextUserId || "").trim();
    if (one) ids.push(one);
    for (const x of m.nextUserIds || []) {
      const v = String(x || "").trim();
      if (v) ids.push(v);
    }
  }
  return [...new Set(ids)];
}

function buildBodyWithAtPrefix(text, atUserIds) {
  const body = String(text || "").trim();
  const ids = atUserIds || [];
  if (!ids.length) return body;
  return `${ids.map((id) => `@${id}`).join(" ")}\n${body}`;
}

/** 自定义机器人 fallback：正文 @ 用席位名称（label），便于阅读 */
function buildBodyWithAtLabels(text, mentions) {
  const body = String(text || "").trim();
  const tagged = (mentions || [])
    .filter((m) => String(m.nextUserId || "").trim() && String(m.label || "").trim())
    .map((m) => `@${String(m.label).trim()}`);
  if (!tagged.length) return buildBodyWithAtPrefix(text, collectAtUserIds(mentions));
  return `${tagged.join(" ")}\n${body}`;
}

/** 本地 Webhook 小助手：@ 紧接在正文最后一行末尾（同一行，无空行） */
function buildBodyWithAtLabelsSuffix(text, mentions) {
  const body = String(text || "").trim();
  const tagged = (mentions || [])
    .filter((m) => String(m.label || "").trim())
    .map((m) => `@${String(m.label).trim()}`);
  if (!tagged.length) {
    const ids = collectAtUserIds(mentions);
    if (!ids.length) return body;
    return `${body} ${ids.map((id) => `@${id}`).join(" ")}`;
  }
  return `${body} ${tagged.join(" ")}`;
}

/** 待发池去重：统一换行与首尾空白 */
function normalizePublishTextForDedup(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function periodPublishDedupKey(entry) {
  if (!entry || entry.type !== "period") return "";
  return [
    entry.type,
    String(entry.periodSlotId || "").trim(),
    String(entry.anchorYmd || "").trim().slice(0, 10),
    normalizePublishTextForDedup(entry.text),
  ].join("\x1e");
}

/** 时段预报发群正文：CRLF（部分 text 通道可用） */
function formatPeriodForecastForGroupSend(text) {
  return normalizePublishTextForDedup(text).replace(/\n/g, "\r\n");
}

/**
 * 时段预报 Markdown/HTML 发群：丰声 Next 会把 \\n 压成空格，须用 <br/> 逐行换行
 * 空行 → 额外 <br/>（段间空一行）；同段内 1.2.3. 各行单独一行
 */
function formatPeriodForecastMarkdown(text) {
  const lines = normalizePublishTextForDedup(text).split("\n");
  let result = "";
  for (const line of lines) {
    if (line.trim() === "") {
      result += "<br/>";
    } else {
      if (result) result += "<br/>";
      result += line.trimEnd();
    }
  }
  return result;
}

function enrichOutboxEntry(entry, config) {
  const kind = resolveContentKind(entry);
  const kindCfg = config?.contentTypes?.[kind] || {};
  const mentions = resolveMentions(entry, config);
  const atUserIds = collectAtUserIds(mentions);
  const sendMethod = config?.sendMethod || {};
  const base = {
    ...entry,
    contentKind: kind,
    contentLabel: kindCfg.label || kind,
    targetGroup: kindCfg.targetGroup || config?.targetGroup?.name || "",
    mentions,
    atUserIds,
    bodyWithAtPrefix: buildBodyWithAtPrefix(entry.text, atUserIds),
    bodyWithAtLabels: buildBodyWithAtLabels(entry.text, mentions),
    bodyWithAtLabelsSuffix: buildBodyWithAtLabelsSuffix(entry.text, mentions),
    sendMethod: sendMethod.method || "application_robot",
    sendHint:
      atUserIds.length > 0
        ? "丰声Next应用机器人：atUserIds 参数 + 正文开头 @userId（两者缺一不可）"
        : "丰声Next应用机器人：仅发群，无需 @",
  };
  if (kind === "period") {
    base.sendText = formatPeriodForecastForGroupSend(entry.text);
    base.sendMarkdown = formatPeriodForecastMarkdown(entry.text);
    base.sendMsgType = "markdown";
    base.sendHint =
      "时段预报：markdown 消息类型，正文必须用 item.sendMarkdown（含 <br/> 换行，禁止改写成一行）；不要用 item.text";
  }
  return base;
}

module.exports = {
  entryIsTropicalCyclone,
  resolveMentionRoleKeys,
  resolveContentKind,
  resolveMentions,
  collectAtUserIds,
  buildBodyWithAtPrefix,
  buildBodyWithAtLabels,
  buildBodyWithAtLabelsSuffix,
  normalizePublishTextForDedup,
  periodPublishDedupKey,
  formatPeriodForecastForGroupSend,
  formatPeriodForecastMarkdown,
  enrichOutboxEntry,
};
