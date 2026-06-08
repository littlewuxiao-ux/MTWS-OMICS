# Generated manually for aircraft_at_airport table

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_datarefreshtimer'),
    ]

    operations = [
        migrations.CreateModel(
            name='AircraftAtAirport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('airport_4code', models.CharField(max_length=4, verbose_name='机场四字代码')),
                ('AC_list', models.JSONField(help_text='存储航空器信息的JSON列表', verbose_name='航空器列表')),
                ('parse_time', models.DateTimeField(verbose_name='解析时间戳')),
            ],
            options={
                'verbose_name': '机场航空器信息',
                'verbose_name_plural': '机场航空器信息',
                'db_table': 'aircraft_at_airport',
                'ordering': ['-parse_time'],
            },
        ),
        migrations.RunSQL(
            "CREATE INDEX IF NOT EXISTS core_aircra_airport_4c_idx ON aircraft_at_airport (airport_4code);",
            reverse_sql="DROP INDEX IF EXISTS core_aircra_airport_4c_idx;",
        ),
        migrations.RunSQL(
            "CREATE INDEX IF NOT EXISTS core_aircra_parse_t_idx ON aircraft_at_airport (parse_time);",
            reverse_sql="DROP INDEX IF EXISTS core_aircra_parse_t_idx;",
        ),
        migrations.RunSQL(
            "CREATE INDEX IF NOT EXISTS core_aircra_airport_4c_parse_t_idx ON aircraft_at_airport (airport_4code, parse_time);",
            reverse_sql="DROP INDEX IF EXISTS core_aircra_airport_4c_parse_t_idx;",
        ),
    ]
