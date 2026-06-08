from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_rename_aircraft_at_airport_to_aircraft_parking_info'),
    ]

    operations = [
        # 清理重复的 user_code 行，每个 user_code 只保留 id 最小的一行
        migrations.RunSQL(
            sql="""
                DELETE FROM popup_settings
                WHERE id NOT IN (
                    SELECT MIN(id) FROM popup_settings GROUP BY user_code
                );
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
        # 为 user_code 添加唯一索引（SQLite 不支持 ALTER TABLE ADD CONSTRAINT，用唯一索引代替）
        migrations.RunSQL(
            sql="CREATE UNIQUE INDEX IF NOT EXISTS popup_settings_user_code_uniq ON popup_settings (user_code);",
            reverse_sql="DROP INDEX IF EXISTS popup_settings_user_code_uniq;",
        ),
    ]
