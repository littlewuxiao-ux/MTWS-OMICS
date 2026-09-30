# Generated manually for MapStyleConfig

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0026_radar_alert'),
    ]

    operations = [
        migrations.CreateModel(
            name='MapStyleConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('config', models.JSONField(default=dict, verbose_name='配置JSON')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'verbose_name': '地图样式配置',
                'verbose_name_plural': '地图样式配置',
                'db_table': 'map_style_config',
            },
        ),
    ]
