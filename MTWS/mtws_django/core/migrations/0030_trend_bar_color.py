from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0029_airport_trend_alert'),
    ]

    operations = [
        migrations.AddField(
            model_name='airporttrendalert',
            name='bar_color',
            field=models.CharField(blank=True, default='', max_length=1, verbose_name='分数色条颜色'),
        ),
    ]
