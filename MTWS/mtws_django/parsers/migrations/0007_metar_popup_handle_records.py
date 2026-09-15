# SQLite 上 Django AddField/RemoveField 会整表重建；现网 metar 有重复 sqc，重建会失败。
# 只做 ADD COLUMN（不重建），旧列留在库中但移出 Django 模型。

import json

from django.db import migrations, models


def cleanup_failed_remake(apps, schema_editor):
    if schema_editor.connection.vendor != 'sqlite':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'new__metar%'"
        )
        for (name,) in cursor.fetchall():
            cursor.execute(f'DROP TABLE IF EXISTS "{name}"')


def _table_columns(cursor):
    cursor.execute('PRAGMA table_info(metar)')
    return {row[1] for row in cursor.fetchall()}


def add_json_column(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        if 'popup_handle_records' in _table_columns(cursor):
            return
        cursor.execute('ALTER TABLE metar ADD COLUMN popup_handle_records TEXT NULL')


def copy_old_handle_fields(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cols = _table_columns(cursor)
        if 'popup_handle_records' not in cols:
            return
        if 'handling_user_code' not in cols:
            return
        cursor.execute(
            """
            SELECT rowid, handling_user_code, popup_handle_time, popup_handle_records
            FROM metar
            WHERE handling_user_code IS NOT NULL AND TRIM(handling_user_code) != ''
            """
        )
        rows = cursor.fetchall()
        for rowid, uid, ts, rec in rows:
            uid = str(uid or '').strip()
            if not uid or ts is None:
                continue
            if isinstance(rec, (bytes, bytearray)):
                rec = rec.decode('utf-8', errors='replace')
            if isinstance(rec, str) and rec.strip():
                try:
                    rec = json.loads(rec)
                except Exception:
                    rec = {}
            if not isinstance(rec, dict):
                rec = {}
            else:
                rec = dict(rec)
            if uid in rec:
                continue
            rec[uid] = {
                'handling_method': None,
                'popup_handle_time': int(ts),
            }
            cursor.execute(
                'UPDATE metar SET popup_handle_records = %s WHERE rowid = %s',
                [json.dumps(rec, ensure_ascii=False), rowid],
            )


class Migration(migrations.Migration):

    dependencies = [
        ('parsers', '0006_metar_operation_parking_popup'),
    ]

    operations = [
        migrations.RunPython(cleanup_failed_remake, migrations.RunPython.noop),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='metar',
                    name='popup_handle_records',
                    field=models.JSONField(
                        blank=True, default=dict, null=True, verbose_name='弹窗处理记录'
                    ),
                ),
            ],
            database_operations=[
                migrations.RunPython(add_json_column, migrations.RunPython.noop),
            ],
        ),
        migrations.RunPython(copy_old_handle_fields, migrations.RunPython.noop),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(model_name='metar', name='popup_handle_time'),
                migrations.RemoveField(model_name='metar', name='handling_user_code'),
                migrations.RemoveField(model_name='metar', name='handling_method'),
            ],
            database_operations=[],
        ),
    ]
