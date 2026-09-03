from django.db import migrations, models


def copy_time_slots_into_flight_detail(apps, schema_editor):
    Flight = apps.get_model('parsers', 'Flight')
    slot_fields = [f'time_{i}_flight' for i in range(48)]
    for row in Flight.objects.values_list('id', *slot_fields).iterator():
        pk = row[0]
        slots = ['' if value is None else value for value in row[1:]]
        Flight.objects.filter(pk=pk).update(flight_detail=slots)


class Migration(migrations.Migration):

    dependencies = [
        ('parsers', '0004_fix_taf_import_alert_handle_time_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='flight',
            name='flight_detail',
            field=models.JSONField(blank=True, null=True, verbose_name='航班时段明细'),
        ),
        migrations.RunPython(copy_time_slots_into_flight_detail, migrations.RunPython.noop),
        *[
            migrations.RemoveField(model_name='flight', name=f'time_{i}_flight')
            for i in range(48)
        ],
    ]
