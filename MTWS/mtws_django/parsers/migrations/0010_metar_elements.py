from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('parsers', '0009_taf_elements'),
    ]

    operations = [
        migrations.AddField(
            model_name='metar',
            name='metar_elements',
            field=models.JSONField(blank=True, null=True, verbose_name='METAR最小单元要素'),
        ),
    ]
