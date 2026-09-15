from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('parsers', '0008_popup_handle_records_method'),
    ]

    operations = [
        migrations.AddField(
            model_name='taf',
            name='taf_elements',
            field=models.JSONField(blank=True, null=True, verbose_name='TAF最小单元要素'),
        ),
    ]
