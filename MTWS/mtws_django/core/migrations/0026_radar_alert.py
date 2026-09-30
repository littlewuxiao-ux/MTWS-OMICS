# Generated manually for radar alert feature

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0025_flight_marks_perm'),
    ]

    operations = [
        migrations.CreateModel(
            name='RadarAlertConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('config', models.JSONField(default=dict, verbose_name='配置JSON')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'verbose_name': '雷达告警配置',
                'verbose_name_plural': '雷达告警配置',
                'db_table': 'radar_alert_config',
            },
        ),
        migrations.CreateModel(
            name='RadarTileIndex',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('index_data', models.JSONField(default=dict, verbose_name='索引数据')),
                ('fingerprint', models.JSONField(default=dict, verbose_name='指纹')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'verbose_name': '雷达瓦片索引',
                'verbose_name_plural': '雷达瓦片索引',
                'db_table': 'radar_tile_index',
            },
        ),
        migrations.CreateModel(
            name='AirportRadarAlert',
            fields=[
                ('airport_4code', models.CharField(max_length=4, primary_key=True, serialize=False, verbose_name='机场四字代码')),
                ('frame_time', models.BigIntegerField(blank=True, null=True, verbose_name='RainViewer帧Unix时间')),
                ('alert_33', models.CharField(choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')], default='N', max_length=1, verbose_name='33dBZ告警')),
                ('alert_41', models.CharField(choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')], default='N', max_length=1, verbose_name='41dBZ告警')),
                ('alert_highest', models.CharField(choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')], default='N', max_length=1, verbose_name='综合最高')),
                ('detail_33', models.JSONField(blank=True, null=True, verbose_name='33dBZ明细')),
                ('detail_41', models.JSONField(blank=True, null=True, verbose_name='41dBZ明细')),
                ('sector_stats', models.JSONField(blank=True, null=True, verbose_name='方位扇区统计')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '机场雷达告警',
                'verbose_name_plural': '机场雷达告警',
                'db_table': 'airport_radar_alert',
            },
        ),
        migrations.CreateModel(
            name='RadarJobRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('frame_time', models.BigIntegerField(verbose_name='帧时间')),
                ('host', models.CharField(blank=True, max_length=255, null=True)),
                ('path', models.CharField(blank=True, max_length=255, null=True)),
                ('airport_count', models.IntegerField(default=0)),
                ('status', models.CharField(default='done', max_length=20)),
                ('message', models.TextField(blank=True, null=True)),
                ('finished_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': '雷达任务记录',
                'verbose_name_plural': '雷达任务记录',
                'db_table': 'radar_job_run',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='airportradaralert',
            index=models.Index(fields=['alert_highest'], name='airport_rad_alert_h_0a1b2c_idx'),
        ),
        migrations.AddIndex(
            model_name='airportradaralert',
            index=models.Index(fields=['updated_at'], name='airport_rad_updated_1d2e3f_idx'),
        ),
    ]
