from django.db import migrations, models


class Migration(migrations.Migration):
    """
    添加 WxmsgImportAlert 模型的迁移文件。
    注意：若数据库中已手动建表，请运行：
        python manage.py migrate core 0013 --fake
    """

    dependencies = [
        ('core', '0012_add_unique_to_popup_settings_user_code'),
    ]

    operations = [
        migrations.CreateModel(
            name='WxmsgImportAlert',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('airport_4code', models.CharField(max_length=4, verbose_name='机场四字代码')),
                ('msg_type', models.CharField(max_length=10, verbose_name='报文类型')),
                ('alert_time', models.BigIntegerField(verbose_name='告警时间戳(毫秒)')),
                ('handle_status', models.CharField(blank=True, max_length=50, null=True, verbose_name='处理状态')),
                ('last_created_at', models.BigIntegerField(blank=True, null=True, verbose_name='上一份报文创建时间戳(毫秒)')),
                ('last_metar_observation_time', models.BigIntegerField(blank=True, null=True, verbose_name='上一份报文观测时间戳(毫秒)')),
                ('handle_time', models.BigIntegerField(blank=True, null=True, verbose_name='处理时间戳(毫秒)')),
            ],
            options={
                'verbose_name': '气象报文入库告警',
                'verbose_name_plural': '气象报文入库告警',
                'db_table': 'wxmsg_import_alert',
                'ordering': ['-alert_time'],
            },
        ),
    ]
