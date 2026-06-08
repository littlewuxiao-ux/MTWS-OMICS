"""
迁移说明：
将 AirportInfo 模型的 taf_avg_delay 字段重命名为 import_check_interval。

数据库中存在大量未记录在迁移文件中的历史变更（CreateModel、AddField 等），
这些变更已在数据库中实际存在，因此使用 SeparateDatabaseAndState：
  - database_operations：仅执行列重命名这一个真实的 DB 操作。
  - state_operations：同步所有积累的模型状态变更，使 Django ORM 状态与数据库保持一致。
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_delete_useraccesslog'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            # 只有这一条会真正在数据库执行（SQLite RENAME COLUMN，不经过 ORM 状态检查）
            database_operations=[
                migrations.RunSQL(
                    sql='ALTER TABLE airport_info RENAME COLUMN taf_avg_delay TO import_check_interval',
                    reverse_sql='ALTER TABLE airport_info RENAME COLUMN import_check_interval TO taf_avg_delay',
                ),
            ],
            # 以下全部为状态同步——让 Django 内部状态与数据库现状一致
            state_operations=[
                # 1. 补录已存在的表
                migrations.CreateModel(
                    name='AircraftParkingInfo',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('airport_4code', models.JSONField(help_text='存储有飞机停场的机场代码列表', verbose_name='停场机场列表')),
                        ('parse_time', models.BigIntegerField(blank=True, null=True, verbose_name='解析时间戳')),
                    ],
                    options={
                        'verbose_name': '飞机停场信息',
                        'verbose_name_plural': '飞机停场信息',
                        'db_table': 'aircraft_parking_info',
                        'ordering': ['-parse_time'],
                    },
                ),
                migrations.CreateModel(
                    name='PopupSettings',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('user_code', models.CharField(max_length=12, unique=True, verbose_name='用户代码')),
                        ('operation_metar_popup', models.BooleanField(default=False, verbose_name='运行区METAR弹窗')),
                        ('operation_taf_popup', models.BooleanField(default=False, verbose_name='运行区TAF弹窗')),
                        ('operation_NWP_popup', models.BooleanField(default=False, verbose_name='运行区NWP弹窗')),
                        ('parking_metar_popup', models.BooleanField(default=False, verbose_name='停场METAR弹窗')),
                        ('parking_taf_popup_other', models.BooleanField(default=False, verbose_name='停场TAF弹窗其他')),
                        ('parking_NWP_popup', models.BooleanField(default=False, verbose_name='停场NWP弹窗')),
                        ('operation_metar_popup_leeway', models.IntegerField(blank=True, null=True, verbose_name='运行区METAR弹窗余量')),
                        ('operation_taf_popup_leeway', models.IntegerField(blank=True, null=True, verbose_name='运行区TAF弹窗余量')),
                        ('operation_NWP_popup_leeway', models.IntegerField(blank=True, null=True, verbose_name='运行区NWP弹窗余量')),
                        ('operation_metar_popup_level', models.CharField(blank=True, max_length=1, null=True, verbose_name='运行区METAR弹窗级别')),
                        ('operation_taf_popup_level', models.CharField(blank=True, max_length=1, null=True, verbose_name='运行区TAF弹窗级别')),
                        ('operation_NWP_popup_level', models.CharField(blank=True, max_length=1, null=True, verbose_name='运行区NWP弹窗级别')),
                        ('parking_metar_popup_level', models.CharField(blank=True, max_length=1, null=True, verbose_name='停场METAR弹窗级别')),
                        ('parking_taf_popup_level', models.CharField(blank=True, max_length=1, null=True, verbose_name='停场TAF弹窗级别')),
                        ('parking_NWP_popup_level', models.CharField(blank=True, max_length=1, null=True, verbose_name='停场NWP弹窗级别')),
                        ('intercept', models.CharField(blank=True, max_length=1, null=True, verbose_name='拦截标识')),
                    ],
                    options={
                        'verbose_name': '弹窗设置',
                        'verbose_name_plural': '弹窗设置',
                        'db_table': 'popup_settings',
                    },
                ),
                migrations.CreateModel(
                    name='WeatherTypeInfo',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('weather_type_code', models.CharField(max_length=1, verbose_name='天气类型代码')),
                        ('description_cn', models.CharField(blank=True, max_length=10, null=True, verbose_name='中文说明')),
                        ('description_en', models.CharField(blank=True, max_length=20, null=True, verbose_name='英文说明')),
                    ],
                    options={
                        'verbose_name': '天气类型信息',
                        'verbose_name_plural': '天气类型信息',
                        'db_table': 'weather_type_info',
                    },
                ),
                # 2. 补录已删除的模型（状态删除，DB 中本就不存在）
                migrations.DeleteModel(
                    name='AircraftAtAirport',
                ),
                # 3. 补录已从 AirportInfo 移除的字段（DB 中本就不存在）
                migrations.RemoveField(model_name='airportinfo', name='extraInfo1'),
                migrations.RemoveField(model_name='airportinfo', name='extraInfo2'),
                migrations.RemoveField(model_name='airportinfo', name='extraInfo3'),
                # 4. 补录已添加的字段（DB 中已存在）
                migrations.AddField(
                    model_name='airportalertthresholds',
                    name='rvr_m_green',
                    field=models.PositiveIntegerField(blank=True, null=True, verbose_name='RVR绿色告警值'),
                ),
                migrations.AddField(
                    model_name='airportalertthresholds',
                    name='rvr_m_red',
                    field=models.PositiveIntegerField(blank=True, null=True, verbose_name='RVR红色告警值'),
                ),
                migrations.AddField(
                    model_name='airportalertthresholds',
                    name='rvr_m_yellow',
                    field=models.PositiveIntegerField(blank=True, null=True, verbose_name='RVR黄色告警值'),
                ),
                migrations.AddField(
                    model_name='airportinfo',
                    name='taf_init_time',
                    field=models.SmallIntegerField(default=1, verbose_name='TAF初始时间'),
                ),
                # 先将旧名字段注册进状态（DB 中已存在该列），再执行重命名
                migrations.AddField(
                    model_name='airportinfo',
                    name='taf_avg_delay',
                    field=models.SmallIntegerField(default=20, verbose_name='TAF平均延迟'),
                ),
                migrations.AddField(
                    model_name='airportinfo',
                    name='taf_max_delay',
                    field=models.SmallIntegerField(blank=True, default=30, null=True, verbose_name='TAF最大延迟'),
                ),
                migrations.AddField(
                    model_name='weatheralertlevels',
                    name='type1',
                    field=models.CharField(blank=True, max_length=1, null=True, verbose_name='天气类型1'),
                ),
                migrations.AddField(
                    model_name='weatheralertlevels',
                    name='type2',
                    field=models.CharField(blank=True, max_length=1, null=True, verbose_name='天气类型2'),
                ),
                migrations.AddField(
                    model_name='weatheralertlevels',
                    name='type3',
                    field=models.CharField(blank=True, max_length=1, null=True, verbose_name='天气类型3'),
                ),
                migrations.AlterField(
                    model_name='wxmsgimportalert',
                    name='id',
                    field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
                ),
                # 5. 核心变更：字段重命名（状态同步）
                migrations.RenameField(
                    model_name='airportinfo',
                    old_name='taf_avg_delay',
                    new_name='import_check_interval',
                ),
                # 6. 补录 AircraftParkingInfo 的索引（DB 已存在，仅同步状态）
                migrations.AddIndex(
                    model_name='aircraftparkinginfo',
                    index=models.Index(fields=['airport_4code'], name='aircraft_pa_airport_69d024_idx'),
                ),
                migrations.AddIndex(
                    model_name='aircraftparkinginfo',
                    index=models.Index(fields=['parse_time'], name='aircraft_pa_parse_t_030956_idx'),
                ),
                migrations.AddIndex(
                    model_name='aircraftparkinginfo',
                    index=models.Index(fields=['airport_4code', 'parse_time'], name='aircraft_pa_airport_7ac2d6_idx'),
                ),
            ],
        ),
    ]
