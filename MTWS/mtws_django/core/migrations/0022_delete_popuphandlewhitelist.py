from django.db import migrations


def drop_whitelist_table(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute('DROP TABLE IF EXISTS popup_handle_whitelist')


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_popup_settings_trace_time'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(name='PopupHandleWhitelist'),
            ],
            database_operations=[
                migrations.RunPython(drop_whitelist_table, migrations.RunPython.noop),
            ],
        ),
    ]
