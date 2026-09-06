const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "index.html.reconstructed");
let h = fs.readFileSync(file, "utf8");

const startMarker = "        function matchPhenomenaInRaw(raw) {";
const endMarker = "        function evaluateMetarSeverityLegacy(m) {";
const si = h.indexOf(startMarker);
const ei = h.indexOf(endMarker);
if (si < 0 || ei < 0 || ei <= si) {
  console.error("markers not found", si, ei);
  process.exit(1);
}

const replacement = `        function matchPhenomenaInRaw(raw) {
          const blob = String(raw || "").toUpperCase();
          const found = [];
          const used = new Array(blob.length).fill(false);
          for (const p of PHENOMENON_LEXICON_SORTED) {
            const code = String(p.match || "").toUpperCase();
            if (!code) continue;
            const escaped = code.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
            const re = new RegExp(\`(^|[^A-Z])\${escaped}(?=[^A-Z]|$)\`, "g");
            let m;
            while ((m = re.exec(blob))) {
              const start = m.index + m[1].length;
              const end = start + code.length;
              if (used.slice(start, end).some(Boolean)) continue;
              for (let i = start; i < end; i++) used[i] = true;
              found.push(p);
              break;
            }
          }
          return found;
        }

        /** 单 token 精确匹配现象码（含 -SHRA / +RA，不做强度前缀剥离） */
        function lookupWeatherPhenomenonCode(token) {
          const t = String(token || "").trim().toUpperCase();
          if (!t) return null;
          for (const p of PHENOMENON_LEXICON_SORTED) {
            if (String(p.match || "").toUpperCase() === t) return p;
          }
          const reStripped = t.replace(/^(RE|RECENT)/, "");
          if (reStripped !== t) {
            for (const p of PHENOMENON_LEXICON_SORTED) {
              if (String(p.match || "").toUpperCase() === reStripped) return p;
            }
          }
          return null;
        }

`;

h = h.slice(0, si) + replacement + h.slice(ei);
fs.writeFileSync(file, h);
console.log("Fixed corruption block, lines:", h.split("\n").length);
