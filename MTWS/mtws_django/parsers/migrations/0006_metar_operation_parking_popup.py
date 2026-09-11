from django.db import migrations, models
from django.db.models import Case, CharField, Value, When


def copy_popup_flags(apps, schema_editor):
    Metar = apps.get_model('parsers', 'Metar')
    Metar.objects.update(
        operation_popup=Case(
            When(popup='Y', then=Value('Y')),
            When(popup='I', then=Value('I')),
            default=Value('N'),
            output_field=CharField(max_length=1),
        ),
        parking_popup=Case(
            When(popup='Y', then=Value('Y')),
            When(popup='I', then=Value('I')),
            default=Value('N'),
            output_field=CharField(max_length=1),
        ),
    )


class Migration(migrations.Migration):

    dependencies = [
        ('parsers', '0005_flight_detail_json'),
    ]

    operations = [
        migrations.AddField(
            model_name='metar',
            name='operation_popup',
            field=models.CharField(blank=True, max_length=1, null=True, verbose_name='运行类弹窗标记'),
        ),
        migrations.AddField(
            model_name='metar',
            name='parking_popup',
            field=models.CharField(blank=True, max_length=1, null=True, verbose_name='停场类弹窗标记'),
        ),
        migrations.RunPython(copy_popup_flags, migrations.RunPython.noop),
        migrations.RemoveField(model_name='metar', name='popup'),
        migrations.RemoveField(model_name='metar', name='intercept'),
        migrations.RemoveField(model_name='metar', name='operation_metar_popup'),
        migrations.RemoveField(model_name='metar', name='parking_metar_popup'),
    ]
