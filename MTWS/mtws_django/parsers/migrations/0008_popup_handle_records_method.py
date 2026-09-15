# 将 popup_handle_records 从 {user_id: 时间戳} 升级为
# {user_id: {handling_method, popup_handle_time}}。不重建 metar 表。

import json

from django.db import migrations


def _table_columns(cursor):
    cursor.execute('PRAGMA table_info(metar)')
    return {row[1] for row in cursor.fetchall()}


def _as_dict(rec):
    if isinstance(rec, (bytes, bytearray)):
        rec = rec.decode('utf-8', errors='replace')
    if isinstance(rec, str) and rec.strip():
        try:
            rec = json.loads(rec)
        except Exception:
            return {}
    return dict(rec) if isinstance(rec, dict) else {}


def upgrade_handle_records(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cols = _table_columns(cursor)
        if 'popup_handle_records' not in cols:
            return
        has_old_method = 'handling_method' in cols
        has_old_user = 'handling_user_code' in cols
        extra = ''
        if has_old_method:
            extra += ', handling_method'
        if has_old_user:
            extra += ', handling_user_code'
        cursor.execute(f'SELECT rowid, popup_handle_records{extra} FROM metar')
        rows = cursor.fetchall()
        for row in rows:
            rowid = row[0]
            rec = _as_dict(row[1])
            old_method = row[2] if has_old_method else None
            old_user = None
            if has_old_method and has_old_user:
                old_user = row[3]
            elif has_old_user:
                old_user = row[2]
            changed = False
            upgraded = {}
            for uid, val in rec.items():
                uid = str(uid or '').strip()
                if not uid:
                    continue
                if isinstance(val, dict) and 'popup_handle_time' in val:
                    upgraded[uid] = {
                        'handling_method': val.get('handling_method'),
                        'popup_handle_time': val.get('popup_handle_time'),
                    }
                    continue
                ts = val
                try:
                    ts = int(ts)
                except (TypeError, ValueError):
                    continue
                method = None
                if old_user and str(old_user).strip() == uid and old_method:
                    method = str(old_method).strip() or None
                upgraded[uid] = {
                    'handling_method': method,
                    'popup_handle_time': ts,
                }
                changed = True
            if not changed and upgraded == rec:
                continue
            if upgraded != rec:
                changed = True
            if changed:
                cursor.execute(
                    'UPDATE metar SET popup_handle_records = %s WHERE rowid = %s',
                    [json.dumps(upgraded, ensure_ascii=False), rowid],
                )


class Migration(migrations.Migration):

    dependencies = [
        ('parsers', '0007_metar_popup_handle_records'),
    ]

    operations = [
        migrations.RunPython(upgrade_handle_records, migrations.RunPython.noop),
    ]
