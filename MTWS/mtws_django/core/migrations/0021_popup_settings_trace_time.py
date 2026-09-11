from django.db import migrations, models


def add_trace_time_column(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute('PRAGMA table_info(popup_settings)')
        cols = {row[1] for row in cursor.fetchall()}
        if 'trace_time' in cols:
            return
        cursor.execute(
            'ALTER TABLE popup_settings ADD COLUMN trace_time INTEGER NOT NULL DEFAULT 6'
        )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_access_control'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='popupsettings',
                    name='trace_time',
                    field=models.PositiveSmallIntegerField(
                        default=6, verbose_name='弹窗追溯时间（小时）'
                    ),
                ),
            ],
            database_operations=[
                migrations.RunPython(add_trace_time_column, migrations.RunPython.noop),
            ],
        ),
    ]
