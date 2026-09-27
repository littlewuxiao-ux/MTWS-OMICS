from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('parsers', '0011_flight_time_slots_events'),
    ]

    operations = [
        migrations.AddField(
            model_name='flight',
            name='metar_highest_alert',
            field=models.JSONField(blank=True, null=True, verbose_name='机场实况最高告警五档'),
        ),
        migrations.AddField(
            model_name='flight',
            name='taf_highest_alert',
            field=models.JSONField(blank=True, null=True, verbose_name='机场预报最高告警五档'),
        ),
        migrations.AddField(
            model_name='flight',
            name='airport_highest_alert',
            field=models.JSONField(blank=True, null=True, verbose_name='机场综合最高告警五档'),
        ),
    ]
