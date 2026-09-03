"""parsers 迁移确认工具：默认选中最新文件，确认后执行 migrate。"""

import re
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

SCRIPT_DIR = Path(__file__).resolve().parent
DJANGO_DIR = SCRIPT_DIR / "mtws_django"
MANAGE_PY = DJANGO_DIR / "manage.py"
MIGRATIONS_DIR = DJANGO_DIR / "parsers" / "migrations"
APP_LABEL = "parsers"
FILE_RE = re.compile(r"^(\d{4})_.+\.py$")


def list_migration_files():
    if not MIGRATIONS_DIR.is_dir():
        return []
    names = []
    for path in MIGRATIONS_DIR.iterdir():
        if FILE_RE.match(path.name):
            names.append(path.stem)
    names.sort()
    return names


def parse_showmigrations(text):
    applied = set()
    pending = set()
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("[X]"):
            applied.add(line[3:].strip())
        elif line.startswith("[ ]"):
            pending.add(line[3:].strip())
    return applied, pending


def migration_number(name):
    match = FILE_RE.match(f"{name}.py")
    return int(match.group(1)) if match else -1


class MigrateApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("parsers 数据库迁移")
        self.geometry("560x380")
        self.minsize(480, 320)
        self.resizable(True, True)

        self.migrations = []
        self.applied = set()
        self.pending = set()
        self._busy = False

        self.selected = tk.StringVar()
        self.status = tk.StringVar(value="准备就绪")

        self._build()
        self.refresh()

    def _build(self):
        pad = {"padx": 10, "pady": 6}

        hint = tk.Label(
            self,
            text="默认选中 parsers/migrations 中编号最大的文件。可改选后点确认。",
            anchor="w",
            justify="left",
        )
        hint.pack(fill="x", **pad)

        row = tk.Frame(self)
        row.pack(fill="x", **pad)
        tk.Label(row, text="目标迁移").pack(side="left")
        self.combo = ttk.Combobox(row, textvariable=self.selected, state="normal")
        self.combo.pack(side="left", fill="x", expand=True, padx=8)
        ttk.Button(row, text="刷新", command=self.refresh).pack(side="left")

        btn_row = tk.Frame(self)
        btn_row.pack(fill="x", **pad)
        self.ok_btn = ttk.Button(btn_row, text="确认执行", command=self.confirm)
        self.ok_btn.pack(side="left")
        ttk.Button(btn_row, text="关闭", command=self.destroy).pack(side="left", padx=8)
        tk.Label(btn_row, textvariable=self.status, anchor="w").pack(
            side="left", fill="x", expand=True
        )

        self.log = tk.Text(self, height=14, wrap="word", font=("Consolas", 9))
        self.log.pack(fill="both", expand=True, padx=10, pady=(0, 10))

    def append_log(self, text):
        def _write():
            self.log.insert("end", text)
            self.log.see("end")

        if threading.current_thread() is threading.main_thread():
            _write()
        else:
            self.after(0, _write)

    def refresh(self):
        self.migrations = list_migration_files()
        self.combo["values"] = self.migrations
        self.applied, self.pending = set(), set()

        if not self.migrations:
            self.selected.set("")
            self.status.set("未找到迁移文件")
            self.append_log(f"目录不存在或为空：{MIGRATIONS_DIR}\n")
            return

        self.selected.set(self.migrations[-1])
        self.status.set(f"已选最新：{self.migrations[-1]}")
        self._load_django_status()

    def _load_django_status(self, replace=True):
        if not MANAGE_PY.is_file():
            self.append_log(f"未找到 {MANAGE_PY}\n")
            return
        code, out = self._run_manage(["showmigrations", APP_LABEL])
        if code != 0:
            self.append_log(out + "\n")
            return
        self.applied, self.pending = parse_showmigrations(out)
        lines = ["当前 parsers 迁移状态："]
        for name in self.migrations:
            if name in self.applied:
                mark = "[已应用]"
            elif name in self.pending:
                mark = "[待应用]"
            else:
                mark = "[未知]"
            suffix = "  ← 默认" if name == self.migrations[-1] else ""
            lines.append(f"  {mark}  {name}{suffix}")
        if replace:
            self.log.delete("1.0", "end")
        elif self.log.get("1.0", "end").strip():
            self.append_log("\n")
        self.append_log("\n".join(lines) + "\n")

    def confirm(self):
        if self._busy:
            return
        name = self.selected.get().strip()
        if name.endswith(".py"):
            name = name[:-3]
        if not name:
            messagebox.showwarning("提示", "请选择迁移文件。")
            return
        if name not in self.migrations:
            if not messagebox.askyesno("确认", f"{name} 不在 migrations 目录列表中，仍要执行吗？"):
                return

        current_max = max((migration_number(n) for n in self.applied), default=-1)
        target_num = migration_number(name)
        if current_max >= 0 and target_num >= 0 and target_num < current_max:
            if not messagebox.askyesno(
                "将回退迁移",
                f"当前已应用到编号 {current_max:04d}，目标是 {name}。\n"
                "这会撤销其后的迁移，可能改表或丢数据。确定继续？",
            ):
                return
        else:
            if not messagebox.askyesno("确认执行", f"执行：\npython manage.py migrate {APP_LABEL} {name}"):
                return

        self._busy = True
        self.ok_btn.state(["disabled"])
        self.status.set("正在迁移…")
        threading.Thread(target=self._migrate, args=(name,), daemon=True).start()

    def _migrate(self, name):
        self.append_log(f"\n>>> migrate {APP_LABEL} {name}\n")
        code, out = self._run_manage(["migrate", APP_LABEL, name])
        self.append_log(out if out.endswith("\n") else out + "\n")

        def done():
            self._busy = False
            self.ok_btn.state(["!disabled"])
            self.status.set("完成" if code == 0 else f"失败（退出码 {code}）")
            if code == 0:
                messagebox.showinfo("完成", "迁移已执行。")
            else:
                messagebox.showerror("失败", "迁移未成功，请看下方日志。")
            self._load_django_status(replace=False)

        self.after(0, done)

    def _run_manage(self, args):
        cmd = [sys.executable, str(MANAGE_PY), *args]
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(DJANGO_DIR),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
        except OSError as exc:
            return 1, str(exc)
        return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


if __name__ == "__main__":
    MigrateApp().mainloop()
