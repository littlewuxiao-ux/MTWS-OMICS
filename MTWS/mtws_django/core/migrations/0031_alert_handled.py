from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0030_trend_bar_color'),
    ]

    operations = [
        migrations.AddField(
            model_name='airportradaralert',
            name='handled',
            field=models.BooleanField(default=False, verbose_name='已处理'),
        ),
        migrations.AddField(
            model_name='airportradaralert',
            name='handled_signature',
            field=models.CharField(blank=True, default='', max_length=16, verbose_name='已处理时的告警特征'),
        ),
        migrations.AddField(
            model_name='airporttrendalert',
            name='handled',
            field=models.BooleanField(default=False, verbose_name='已处理'),
        ),
        migrations.AddField(
            model_name='airporttrendalert',
            name='handled_signature',
            field=models.CharField(blank=True, default='', max_length=8, verbose_name='已处理时的告警颜色'),
        ),
    ]
