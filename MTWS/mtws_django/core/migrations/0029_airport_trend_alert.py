from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0028_trend_alert'),
    ]

    operations = [
        migrations.CreateModel(
            name='AirportTrendAlert',
            fields=[
                ('airport_4code', models.CharField(max_length=4, primary_key=True, serialize=False, verbose_name='机场四字代码')),
                ('color', models.CharField(max_length=1, verbose_name='告警颜色')),
                ('score', models.FloatField(default=0, verbose_name='总分')),
                ('labels', models.JSONField(default=list, verbose_name='描述词')),
                ('series', models.JSONField(default=list, verbose_name='要素序列')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '机场实况趋势告警',
                'verbose_name_plural': '机场实况趋势告警',
                'db_table': 'airport_trend_alert',
            },
        ),
    ]
